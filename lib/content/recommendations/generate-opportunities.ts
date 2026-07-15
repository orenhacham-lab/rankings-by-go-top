/**
 * PRODUCTION opportunity-first generation path (A).
 *
 *   load all project evidence → normalize ownership/coverage → build cross-source
 *   clusters → rank → select within the cost ceiling → ONE synthesis model call →
 *   deterministic worthiness/cannibalization validation → internal-link role mapping
 *   → return opportunities + a full safe diagnostics funnel.
 *
 * This REPLACES source-first fan-out as the primary architecture. Site entities are
 * ownership/coverage/link signals, not article seeds. Uses the existing shared
 * RunCostController + Flash generator — NO new model-call or cost ceilings.
 */

import type { createAdminClient } from '@/lib/supabase/admin'
import { getCachedIndex, reassembleReport } from '@/lib/content/wordpress-content-index'
import type { ScannedTarget } from '@/lib/content/wordpress-content-scan'
import { buildKeywordGuard } from './keyword-guard'
import { buildEvidenceClusters, rankClusters, selectClustersWithinBudget, type EvidenceInput, type EntityNode, type EvidenceCluster } from './evidence-cluster'
import { buildOpportunityPrompt, parseOpportunities } from './opportunity-synthesis'
import { evaluateArticleWorthiness, type ExistingPageSignal, type SearchIntent, type RejectionReason } from './opportunity'
import { mapLinkRoles, orderedLinksForOpportunity, type LinkCandidateEntity, type EntityPageType } from './link-role-mapper'
import { generateRecommendationJSON, outputBudgetFor } from './model'
import { deriveProjectFocus, type ProjectContext } from './prompt-guidance'
import { slugKey } from './dedupe'
import { normalizeText } from './topic-idea-store'
import type { RunCostController } from './run-cost-controller'
import type { TopicSuggestion } from './types'

type Admin = ReturnType<typeof createAdminClient>

export interface OpportunityDiagnostics {
  evidence_inventory: { keyword_research: number; tracked_keywords: number; entities: number; existing_coverage: number; pending: number }
  clusters_built: number
  clusters_by_source: Record<string, number>
  ranked_clusters: { id: string; theme: string; source_label: string; score: number; demand: number; missing_coverage: boolean }[]
  clusters_sent_to_model: number
  model_calls: number
  generated_opportunities: number
  rejected_by_reason: Record<string, number>
  persisted: number
  target_role_mappings: { keyword: string; primaryTarget: string | null; roles: { url: string; role: string; score: number }[] }[]
  cost: { estimatedRunCostUsd: number; totalCalls: number }
}

const PAGE_TYPE = (t: string | null | undefined): EntityPageType => {
  const s = (t || '').toLowerCase()
  return (['product', 'category', 'service', 'page', 'post', 'article'] as EntityPageType[]).includes(s as EntityPageType) ? (s as EntityPageType) : 'unknown'
}

/** Run the production opportunity path. Returns [] with diagnostics on a soft miss. */
export async function generateOpportunities(
  admin: Admin,
  input: { projectId: string; targetCount: number; maxClusters: number },
  controller: RunCostController,
): Promise<{ suggestions: TopicSuggestion[]; diagnostics: OpportunityDiagnostics }> {
  // 1) Load evidence.
  const { data: proj } = await admin.from('projects').select('business_name, target_domain, language, country').eq('id', input.projectId).maybeSingle()
  const p = (proj as { business_name: string | null; target_domain: string | null; language: string | null } | null) ?? { business_name: null, target_domain: null, language: null }
  const language: 'he' | 'en' = String(p.language || '').toLowerCase().startsWith('en') ? 'en' : 'he'
  const langLabel = language === 'he' ? 'Hebrew' : 'English'

  const guard = await buildKeywordGuard(admin, input.projectId)

  const tracked: string[] = []
  try { const { data } = await admin.from('tracking_targets').select('keyword').eq('project_id', input.projectId); for (const r of (data ?? []) as { keyword: string }[]) if (r.keyword) tracked.push(r.keyword) } catch { /* optional */ }

  const keywordResearch: { query: string; volume?: number | null }[] = []
  try {
    const { data } = await admin.from('keyword_research_cache').select('results_json').eq('project_id', input.projectId).limit(20)
    for (const row of (data ?? []) as { results_json: unknown }[]) {
      const arr = Array.isArray(row.results_json) ? row.results_json : []
      for (const kw of arr as { keyword?: string; avgMonthlySearches?: number | null }[]) if (kw?.keyword) keywordResearch.push({ query: kw.keyword, volume: kw.avgMonthlySearches ?? null })
    }
  } catch { /* optional */ }

  const entities: EntityNode[] = []
  try {
    const cacheRow = await getCachedIndex(admin, input.projectId)
    const targets = cacheRow ? ((reassembleReport(cacheRow).targets ?? []) as ScannedTarget[]) : []
    for (const t of targets) if (t.targetTitle) entities.push({ name: t.targetTitle, url: t.targetUrl, type: PAGE_TYPE(t.targetType) })
  } catch { /* optional */ }
  try {
    const { data } = await admin.from('shopify_entities').select('title, handle, entity_type, canonical_url').eq('project_id', input.projectId).eq('is_active', true)
    for (const e of (data ?? []) as { title: string | null; canonical_url: string | null; entity_type: string | null }[]) if (e.title) entities.push({ name: e.title, url: e.canonical_url, type: PAGE_TYPE(e.entity_type) })
  } catch { /* optional */ }

  const existingCoverage: { title: string; kind: 'article' | 'topic' | 'pending' }[] = []
  try { const { data } = await admin.from('generated_articles').select('title').eq('project_id', input.projectId); for (const r of (data ?? []) as { title: string | null }[]) if (r.title) existingCoverage.push({ title: r.title, kind: 'article' }) } catch { /* optional */ }
  try { const { data } = await admin.from('article_topics').select('topic').eq('project_id', input.projectId); for (const r of (data ?? []) as { topic: string | null }[]) if (r.topic) existingCoverage.push({ title: r.topic, kind: 'topic' }) } catch { /* optional */ }
  let pendingCount = 0
  try { const { data } = await admin.from('content_topic_ideas').select('title').eq('project_id', input.projectId).eq('status', 'pending'); for (const r of (data ?? []) as { title: string | null }[]) if (r.title) { existingCoverage.push({ title: r.title, kind: 'pending' }); pendingCount++ } } catch { /* optional */ }

  const focus = deriveProjectFocus({ projectName: p.business_name, domain: p.target_domain, ownedCategories: entities.map((e) => e.name), existingTopics: existingCoverage.map((c) => c.title) })
  const projectFocus = [focus.primaryProjectFocus, ...focus.secondaryProjectAreas].filter(Boolean)

  // 2) Build + rank clusters, select within budget.
  const evidence: EvidenceInput = { keywordResearch, trackedKeywords: tracked, projectFocus, entities, existingCoverage }
  const clusters = buildEvidenceClusters(evidence)
  const ranked = rankClusters(clusters)
  const selected = selectClustersWithinBudget(ranked, input.maxClusters)

  const clustersBySource: Record<string, number> = {}
  for (const c of clusters) clustersBySource[c.source_label] = (clustersBySource[c.source_label] ?? 0) + 1

  const rejected_by_reason: Record<string, number> = {}
  const bump = (r: string) => { rejected_by_reason[r] = (rejected_by_reason[r] ?? 0) + 1 }
  const existingPages: ExistingPageSignal[] = Array.from(guard.entityOwners).map((n) => ({ name: n, pageType: 'unknown' as const }))
  const coveredKeys = new Set<string>([...guard.keywords, ...guard.contentKeywords].map((k) => normalizeText(k)))
  const linkCandidates: LinkCandidateEntity[] = entities.filter((e) => e.url).map((e) => ({ url: e.url as string, title: e.name, type: e.type }))
  const target_role_mappings: OpportunityDiagnostics['target_role_mappings'] = []

  const baseDiag = (): OpportunityDiagnostics => ({
    evidence_inventory: { keyword_research: keywordResearch.length, tracked_keywords: tracked.length, entities: entities.length, existing_coverage: existingCoverage.length - pendingCount, pending: pendingCount },
    clusters_built: clusters.length, clusters_by_source: clustersBySource,
    ranked_clusters: ranked.slice(0, 20).map((c) => ({ id: c.cluster_id, theme: c.canonical_topic, source_label: c.source_label, score: c.score, demand: c.demand_volume, missing_coverage: c.missing_coverage })),
    clusters_sent_to_model: selected.length, model_calls: 0, generated_opportunities: 0,
    rejected_by_reason, persisted: 0, target_role_mappings, cost: { estimatedRunCostUsd: 0, totalCalls: 0 },
  })

  if (selected.length === 0) {
    const d = baseDiag(); const cs = controller.summary(); d.cost = { estimatedRunCostUsd: cs.estimatedRunCostUsd, totalCalls: cs.totalCalls }; d.model_calls = cs.totalCalls
    return { suggestions: [], diagnostics: d }
  }

  // 3) ONE cluster-first synthesis model call (Flash, cost-controlled).
  const ctx: ProjectContext = { projectName: p.business_name, domain: p.target_domain, language, primaryProjectFocus: focus.primaryProjectFocus, secondaryProjectAreas: focus.secondaryProjectAreas, ownedCategories: entities.map((e) => e.name).slice(0, 15), existingTopics: existingCoverage.map((c) => c.title).slice(0, 15) }
  const prompt = buildOpportunityPrompt(selected, ctx, langLabel, new Date().getFullYear(), input.targetCount)
  const res = await generateRecommendationJSON(prompt, { temperature: 0.85, maxOutputTokens: outputBudgetFor(input.targetCount) }, controller, { source: 'opportunity_synthesis', callPurpose: 'primary', requestedIdeaCount: input.targetCount })

  const opportunities = res.ok ? parseOpportunities(res.text) : []

  // 4) Deterministic worthiness/cannibalization + 5) link-role mapping.
  const suggestions: TopicSuggestion[] = []
  const seenKw = new Set<string>()
  for (const o of opportunities) {
    const nk = normalizeText(o.primaryKeyword)
    if (!nk || seenKw.has(nk)) { bump('duplicate_pending_topic'); continue }
    const w = evaluateArticleWorthiness({ primaryKeyword: o.primaryKeyword, title: o.title, secondaryKeywords: o.secondaryKeywords, intent: (o.intent as SearchIntent) || 'informational', existingPages, hasEvidence: true, businessRelevant: true, coveredKeys })
    if (!w.ok) { bump((w.rejection_reason as RejectionReason) || 'insufficient_independent_need'); continue }
    seenKw.add(nk)
    const mapped = mapLinkRoles(o.primaryKeyword, o.title, linkCandidates)
    const ordered = orderedLinksForOpportunity(mapped)
    if (target_role_mappings.length < 20) target_role_mappings.push({ keyword: o.primaryKeyword, primaryTarget: mapped.primaryTarget?.url ?? null, roles: mapped.assignments.slice(0, 5).map((a) => ({ url: a.url, role: a.role, score: a.score })) })
    suggestions.push({
      id: `opportunity:${slugKey(o.title)}`, title: o.title, primaryKeyword: o.primaryKeyword,
      secondaryKeywords: o.secondaryKeywords, searchIntent: o.intent || 'informational', recommendedWordCount: 1000, angle: '',
      suggestedInternalLinks: ordered.map((l) => ({ url: l.url, anchor: l.anchor })),
      moneyTargetUrl: mapped.primaryTarget?.url ?? null,
      source: 'hybrid', suggestionReason: o.reason || '', suggestionScore: Number((w.distinctiveness_score * 0.5 + 0.5).toFixed(2)),
    })
  }

  const d = baseDiag()
  d.generated_opportunities = opportunities.length
  d.persisted = suggestions.length
  const cs = controller.summary()
  d.model_calls = cs.totalCalls
  d.cost = { estimatedRunCostUsd: cs.estimatedRunCostUsd, totalCalls: cs.totalCalls }
  return { suggestions, diagnostics: d }
}
