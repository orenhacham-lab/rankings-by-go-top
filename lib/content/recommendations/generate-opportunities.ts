/**
 * PRODUCTION opportunity-first generation path (P0) with quality-preserving
 * RECOVERY TIERS.
 *
 *   load all project evidence → normalize ownership/coverage → build cross-source
 *   clusters → rank globally → Tier 1 (strict, high confidence) → Tier 2 (broadened,
 *   medium confidence) → Tier 3 (controlled discovery) → deterministic worthiness/
 *   cannibalization on EVERY tier → internal-link role mapping → typed suggestions +
 *   a full safe diagnostics funnel that proves the exact path used.
 *
 * There is NO silent legacy fallback here: the route runs the legacy source-first
 * engine ONLY when RECO_LEGACY_PATH=1. Zero after a strict pass triggers the recovery
 * tiers, never the old product-derived generator. Site entities are ownership/coverage
 * /link-target signals, never article seeds. The same shared RunCostController +
 * Flash generator are used — NO new model-call or cost ceilings (≤3 tier calls, well
 * under the frozen 4-call / $0.15 ceiling).
 */

import type { createAdminClient } from '@/lib/supabase/admin'
import { getCachedIndex, reassembleReport } from '@/lib/content/wordpress-content-index'
import type { ScannedTarget } from '@/lib/content/wordpress-content-scan'
import { buildKeywordGuard } from './keyword-guard'
import { buildEvidenceClustersWithDiag, rankClusters, selectClustersWithinBudget, clustersForTier, flattenKeywordResearchCache, contentTokens, type EvidenceInput, type EntityNode } from './evidence-cluster'
import { buildOpportunityPrompt, buildDiscoveryPrompt, parseOpportunities, type DiscoveryEvidence, type SynthOpportunity } from './opportunity-synthesis'
import { evaluateArticleWorthiness, type ExistingPageSignal, type SearchIntent, type RejectionReason } from './opportunity'
import { mapLinkRoles, orderedLinksForOpportunity, type LinkCandidateEntity, type EntityPageType } from './link-role-mapper'
import { validateIntentKeywordConsistency, classifyRecommendedPageType, computeDemandEvidence, filterSecondaryKeywords, assessBusinessRelevance, deriveCorpusTypeWords } from './opportunity-validation'
import { runRecoveryTiers, type TierPlan, type RecoveryTier, type ConfidenceLevel, type FallbackReason } from './recovery-tiers'
import { generateRecommendationJSON, outputBudgetFor } from './model'
import { deriveProjectFocus, type ProjectContext } from './prompt-guidance'
import { slugKey } from './dedupe'
import { normalizeText } from './topic-idea-store'
import type { RunCostController } from './run-cost-controller'
import type { TopicSuggestion } from './types'

type Admin = ReturnType<typeof createAdminClient>

/** Defensible-suggestion floor: once this many accumulate across tiers, stop. Bottom
 *  of the 5–15 product target — enough to be useful without padding with weak ideas. */
const TARGET_FLOOR = 5

export interface TierDiagnostics {
  tier: RecoveryTier
  confidence_level: ConfidenceLevel
  clusters_available: number
  clusters_sent_to_model: number
  model_calls: number
  raw_candidates: number
  parse_ok: boolean
  mapped_opportunities: number
  rejected_by_reason: Record<string, number>
  persisted: number
}

export interface OpportunityDiagnostics {
  generationPath: 'opportunity_first'
  legacyUsed: false
  recoveryTierUsed: RecoveryTier | null
  discoveryUsed: boolean
  fallbackReason: FallbackReason
  finalCount: number
  evidence_inventory: {
    project_focus_terms: number
    tracked_keywords: number
    keyword_research_cache_rows: number
    keyword_research_queries: number
    search_volume_values: number
    site_scan_entities: number
    shopify_entities: number
    existing_informational_coverage: number
    existing_commercial_ownership: number
    pending_topics: number
    generated_articles: number
  }
  clusters_built: number
  clusters_rejected_before_ranking: number
  entity_only_rejected: number
  clusters_by_source: Record<string, number>
  clusters_by_tier: { high: number; medium: number }
  ranked_clusters: { id: string; theme: string; source_label: string; tier: string; score: number; demand: number; missing_coverage: boolean }[]
  tiers: TierDiagnostics[]
  rejected_by_reason: Record<string, number>
  persisted_by_confidence: Record<string, number>
  persisted_by_page_type: Record<string, number>
  secondary_keywords_filtered: number
  target_role_mappings: { keyword: string; primaryTarget: string | null; roles: { url: string; role: string; score: number }[] }[]
  // Rollups kept for the route's runtimeDiag.
  model_calls: number
  generated_opportunities: number
  persisted: number
  cost: { estimatedRunCostUsd: number; totalCalls: number }
}

// Map the source-specific entity-type vocabularies onto the mapper's page types.
// Shopify uses collection/blog; losing these to 'unknown' meant a commercial
// collection could never become a commercial link target (proven live defect).
const PAGE_TYPE_ALIASES: Record<string, EntityPageType> = { collection: 'category', blog: 'post', item: 'product' }
const PAGE_TYPE = (t: string | null | undefined): EntityPageType => {
  const s = (t || '').toLowerCase()
  if ((['product', 'category', 'service', 'page', 'post', 'article'] as EntityPageType[]).includes(s as EntityPageType)) return s as EntityPageType
  return PAGE_TYPE_ALIASES[s] ?? 'unknown'
}

/** Run the production opportunity path with recovery tiers. Returns [] with full
 *  diagnostics only when NO safe opportunity exists after all tiers. */
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
  let krCacheRows = 0
  try {
    const { data } = await admin.from('keyword_research_cache').select('results_json').eq('project_id', input.projectId).limit(20)
    const rows = (data ?? []) as { results_json: unknown }[]
    krCacheRows = rows.length
    keywordResearch.push(...flattenKeywordResearchCache(rows))
  } catch { /* optional */ }
  const searchVolumeValues = keywordResearch.filter((k) => (k.volume ?? 0) > 0).length

  const entities: EntityNode[] = []
  let siteScanEntities = 0
  try {
    const cacheRow = await getCachedIndex(admin, input.projectId)
    const targets = cacheRow ? ((reassembleReport(cacheRow).targets ?? []) as ScannedTarget[]) : []
    for (const t of targets) if (t.targetTitle) { entities.push({ name: t.targetTitle, url: t.targetUrl, type: PAGE_TYPE(t.targetType) }); siteScanEntities++ }
  } catch { /* optional */ }
  let shopifyEntities = 0
  try {
    const { data } = await admin.from('shopify_entities').select('title, handle, entity_type, canonical_url').eq('project_id', input.projectId).eq('is_active', true)
    for (const e of (data ?? []) as { title: string | null; canonical_url: string | null; entity_type: string | null }[]) if (e.title) { entities.push({ name: e.title, url: e.canonical_url, type: PAGE_TYPE(e.entity_type) }); shopifyEntities++ }
  } catch { /* optional */ }

  const existingCoverage: { title: string; kind: 'article' | 'topic' | 'pending' }[] = []
  let generatedArticles = 0
  try { const { data } = await admin.from('generated_articles').select('title').eq('project_id', input.projectId); for (const r of (data ?? []) as { title: string | null }[]) if (r.title) { existingCoverage.push({ title: r.title, kind: 'article' }); generatedArticles++ } } catch { /* optional */ }
  try { const { data } = await admin.from('article_topics').select('topic').eq('project_id', input.projectId); for (const r of (data ?? []) as { topic: string | null }[]) if (r.topic) existingCoverage.push({ title: r.topic, kind: 'topic' }) } catch { /* optional */ }
  let pendingCount = 0
  try { const { data } = await admin.from('content_topic_ideas').select('title').eq('project_id', input.projectId).eq('status', 'pending'); for (const r of (data ?? []) as { title: string | null }[]) if (r.title) { existingCoverage.push({ title: r.title, kind: 'pending' }); pendingCount++ } } catch { /* optional */ }

  const focus = deriveProjectFocus({ projectName: p.business_name, domain: p.target_domain, ownedCategories: entities.map((e) => e.name), existingTopics: existingCoverage.map((c) => c.title) })
  const projectFocus = [focus.primaryProjectFocus, ...focus.secondaryProjectAreas].filter(Boolean)

  // 2) Build + rank clusters ONCE (both cluster tiers reuse the graph).
  const evidence: EvidenceInput = { keywordResearch, trackedKeywords: tracked, projectFocus, entities, existingCoverage }
  const built = buildEvidenceClustersWithDiag(evidence)
  const clusters = built.clusters

  const clustersBySource: Record<string, number> = {}
  for (const c of clusters) clustersBySource[c.source_label] = (clustersBySource[c.source_label] ?? 0) + 1
  const clustersByTier = { high: clusters.filter((c) => c.tier_class === 'high').length, medium: clusters.filter((c) => c.tier_class === 'medium').length }

  // Shared safety context (identical HARD gates across ALL tiers).
  const existingPages: ExistingPageSignal[] = Array.from(guard.entityOwners).map((n) => ({ name: n, pageType: 'unknown' as const }))
  const coveredKeys = new Set<string>([...guard.keywords, ...guard.contentKeywords].map((k) => normalizeText(k)))
  const linkCandidates: LinkCandidateEntity[] = entities.filter((e) => e.url).map((e) => ({ url: e.url as string, title: e.name, type: e.type }))
  // Validation evidence sets (domain-neutral, derived from THIS project's data).
  const urlTypeMap = new Map<string, EntityPageType>(linkCandidates.map((c) => [c.url.trim().toLowerCase().replace(/\/+$/, ''), c.type ?? 'unknown']))
  const corpusTypeWords = deriveCorpusTypeWords(entities.map((e) => e.name))
  const commercialEntityTokens = new Set<string>()
  for (const e of entities) for (const t of contentTokens(e.name)) commercialEntityTokens.add(t)
  const businessEvidenceTokens = new Set<string>(commercialEntityTokens)
  for (const s of [...projectFocus, ...tracked, ...keywordResearch.map((k) => k.query)]) for (const t of contentTokens(s)) businessEvidenceTokens.add(t)
  const bump = (td: TierDiagnostics, r: string) => { td.rejected_by_reason[r] = (td.rejected_by_reason[r] ?? 0) + 1 }
  let secondaryKeywordsFiltered = 0
  const target_role_mappings: OpportunityDiagnostics['target_role_mappings'] = []
  const ctx: ProjectContext = { projectName: p.business_name, domain: p.target_domain, language, primaryProjectFocus: focus.primaryProjectFocus, secondaryProjectAreas: focus.secondaryProjectAreas, ownedCategories: entities.map((e) => e.name).slice(0, 15), existingTopics: existingCoverage.map((c) => c.title).slice(0, 15) }
  const year = new Date().getFullYear()
  const tierDiags: TierDiagnostics[] = []

  // Synthesize + deterministically validate one tier's candidates. IDENTICAL
  // worthiness + cannibalization + link-role gates for every tier — only the prompt
  // (which clusters/evidence) and the confidence label differ.
  const synthAndValidate = async (prompt: string, plan: TierPlan, td: TierDiagnostics): Promise<TopicSuggestion[]> => {
    const res = await generateRecommendationJSON(prompt, { temperature: plan.discovery ? 0.95 : 0.85, maxOutputTokens: outputBudgetFor(input.targetCount) }, controller, { source: 'opportunity_synthesis', callPurpose: plan.tier === 1 ? 'primary' : 'salvage', requestedIdeaCount: input.targetCount })
    td.model_calls += 1
    const opportunities: SynthOpportunity[] = res.ok ? parseOpportunities(res.text) : []
    td.parse_ok = res.ok
    td.raw_candidates += opportunities.length
    const out: TopicSuggestion[] = []
    for (const o of opportunities) {
      const intent = ((o.intent as SearchIntent) || 'informational')
      const w = evaluateArticleWorthiness({ primaryKeyword: o.primaryKeyword, title: o.title, secondaryKeywords: o.secondaryKeywords, intent, existingPages, hasEvidence: true, businessRelevant: true, coveredKeys })
      if (!w.ok) { bump(td, (w.rejection_reason as RejectionReason) || 'insufficient_independent_need'); continue }

      // C — title/keyword/intent consistency: repair a commercial-drifted keyword from
      // the title, else reject as intent_keyword_mismatch.
      let primaryKeyword = o.primaryKeyword
      const consistency = validateIntentKeywordConsistency({ primaryKeyword, title: o.title, intent }, commercialEntityTokens)
      if (!consistency.ok) { bump(td, 'intent_keyword_mismatch'); continue }
      if (consistency.repairedKeyword) primaryKeyword = consistency.repairedKeyword

      // G — business relevance: reject a topic fully disconnected from business evidence.
      const relevance = assessBusinessRelevance({ primaryKeyword, title: o.title }, businessEvidenceTokens, corpusTypeWords, entities.map((e) => ({ name: e.name })))
      if (!relevance.ok) { bump(td, 'low_business_relevance'); continue }

      // F — secondary-keyword quality.
      const sec = filterSecondaryKeywords(primaryKeyword, o.title, o.secondaryKeywords)
      secondaryKeywordsFiltered += sec.rejected.length

      // A/B — internal-link role mapping (specificity-weighted, Hebrew-aware).
      const mapped = mapLinkRoles(primaryKeyword, o.title, linkCandidates)
      const ordered = orderedLinksForOpportunity(mapped)
      const primaryTargetUrlKey = mapped.primaryTarget ? mapped.primaryTarget.url.trim().toLowerCase().replace(/\/+$/, '') : null
      const primaryTargetType = primaryTargetUrlKey ? (urlTypeMap.get(primaryTargetUrlKey) ?? null) : null
      if (target_role_mappings.length < 25) target_role_mappings.push({ keyword: primaryKeyword, primaryTarget: mapped.primaryTarget?.url ?? null, roles: mapped.assignments.slice(0, 5).map((a) => ({ url: a.url, role: a.role, score: a.score })) })

      // D — recommended page type (only 'article' is auto-enqueued downstream).
      const keywordEqualsProduct = existingPages.some((pg) => normalizeText(pg.name) === normalizeText(primaryKeyword))
      const recommendedPageType = classifyRecommendedPageType({ intent }, { primaryTargetType, keywordEqualsProduct })

      // E — verified demand evidence (never fabricated).
      const demandEvidence = computeDemandEvidence(primaryKeyword, sec.kept, keywordResearch)

      out.push({
        id: `opportunity:${slugKey(o.title)}`, title: o.title, primaryKeyword,
        secondaryKeywords: sec.kept, searchIntent: intent, recommendedWordCount: 1000, angle: '',
        suggestedInternalLinks: ordered.map((l) => ({ url: l.url, anchor: l.anchor })),
        moneyTargetUrl: mapped.primaryTarget?.url ?? null,
        source: 'hybrid', suggestionReason: o.reason || '', suggestionScore: Number((w.distinctiveness_score * 0.5 + 0.5).toFixed(2)),
        confidenceLevel: plan.confidenceLevel, discoveryGenerated: plan.discovery,
        recommendedPageType, demandEvidence, businessRelevance: { score: relevance.score, relatedCommercialEntities: relevance.relatedCommercialEntities },
      })
    }
    td.mapped_opportunities += out.length
    td.persisted += out.length
    return out
  }

  const runTier = async (plan: TierPlan): Promise<TopicSuggestion[]> => {
    const td: TierDiagnostics = { tier: plan.tier, confidence_level: plan.confidenceLevel, clusters_available: 0, clusters_sent_to_model: 0, model_calls: 0, raw_candidates: 0, parse_ok: false, mapped_opportunities: 0, rejected_by_reason: {}, persisted: 0 }
    tierDiags.push(td)

    if (plan.tier === 1 || plan.tier === 2) {
      const eligible = clustersForTier(clusters, plan.tier)
      td.clusters_available = eligible.length
      const selected = selectClustersWithinBudget(rankClusters(eligible), input.maxClusters)
      td.clusters_sent_to_model = selected.length
      if (selected.length === 0) return [] // no clusters → no model call; recover in the next tier
      return synthAndValidate(buildOpportunityPrompt(selected, ctx, langLabel, year, input.targetCount), plan, td)
    }

    // Tier 3 — controlled discovery from combined evidence (no clusters required).
    const ev: DiscoveryEvidence = {
      projectFocus, trackedKeywords: tracked,
      demandQueries: keywordResearch.map((k) => ({ q: k.query, v: k.volume ?? null })),
      commercialEntities: entities.map((e) => ({ name: e.name, type: e.type ?? 'unknown' })),
      existingCoverage: existingCoverage.map((c) => c.title),
    }
    const hasAnyEvidence = projectFocus.length + tracked.length + keywordResearch.length + entities.length > 0
    if (!hasAnyEvidence) return [] // truly nothing to synthesize from
    return synthAndValidate(buildDiscoveryPrompt(ev, ctx, langLabel, year, input.targetCount), plan, td)
  }

  const outcome = await runRecoveryTiers({ targetFloor: TARGET_FLOOR, keyKey: (s) => normalizeText(s.primaryKeyword), runTier })

  // 3) Assemble diagnostics.
  const ranked = rankClusters(clusters)
  const rejected_by_reason: Record<string, number> = {}
  for (const td of tierDiags) for (const [r, n] of Object.entries(td.rejected_by_reason)) rejected_by_reason[r] = (rejected_by_reason[r] ?? 0) + n
  const persisted_by_confidence: Record<string, number> = {}
  for (const s of outcome.suggestions) { const c = s.confidenceLevel ?? 'high_confidence'; persisted_by_confidence[c] = (persisted_by_confidence[c] ?? 0) + 1 }
  const persisted_by_page_type: Record<string, number> = {}
  for (const s of outcome.suggestions) { const t = s.recommendedPageType ?? 'article'; persisted_by_page_type[t] = (persisted_by_page_type[t] ?? 0) + 1 }
  const cs = controller.summary()

  const diagnostics: OpportunityDiagnostics = {
    generationPath: 'opportunity_first',
    legacyUsed: false,
    recoveryTierUsed: outcome.recoveryTierUsed,
    discoveryUsed: outcome.discoveryUsed,
    fallbackReason: outcome.fallbackReason,
    finalCount: outcome.suggestions.length,
    evidence_inventory: {
      project_focus_terms: projectFocus.length,
      tracked_keywords: tracked.length,
      keyword_research_cache_rows: krCacheRows,
      keyword_research_queries: keywordResearch.length,
      search_volume_values: searchVolumeValues,
      site_scan_entities: siteScanEntities,
      shopify_entities: shopifyEntities,
      existing_informational_coverage: existingCoverage.filter((c) => c.kind !== 'pending').length,
      existing_commercial_ownership: guard.entityOwners.size,
      pending_topics: pendingCount,
      generated_articles: generatedArticles,
    },
    clusters_built: clusters.length,
    clusters_rejected_before_ranking: built.rejected_themes,
    entity_only_rejected: built.entity_only_rejected,
    clusters_by_source: clustersBySource,
    clusters_by_tier: clustersByTier,
    ranked_clusters: ranked.slice(0, 20).map((c) => ({ id: c.cluster_id, theme: c.canonical_topic, source_label: c.source_label, tier: c.tier_class, score: c.score, demand: c.demand_volume, missing_coverage: c.missing_coverage })),
    tiers: tierDiags,
    rejected_by_reason,
    persisted_by_confidence,
    persisted_by_page_type,
    secondary_keywords_filtered: secondaryKeywordsFiltered,
    target_role_mappings,
    model_calls: cs.totalCalls,
    generated_opportunities: tierDiags.reduce((s, t) => s + t.raw_candidates, 0),
    persisted: outcome.suggestions.length,
    cost: { estimatedRunCostUsd: cs.estimatedRunCostUsd, totalCalls: cs.totalCalls },
  }

  return { suggestions: outcome.suggestions, diagnostics }
}
