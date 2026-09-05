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
import { buildOpportunityPrompt, buildDiscoveryPrompt, buildFamilyPrompt, parseOpportunities, parseOpportunitiesDetailed, type DiscoveryEvidence, type SynthOpportunity, type OpportunityFamily } from './opportunity-synthesis'
import { buildValidatorPrompt, parseValidatorResponse, validatorBatches, applyValidatorVerdicts, type ValidatorMetrics, type ValidatorVerdict } from './plan-validator'
import { evaluateArticleWorthiness, type ExistingPageSignal, type SearchIntent, type RejectionReason } from './opportunity'
import { mapLinkRoles, buildLinkPlan, linkPlanToOrdered, type LinkCandidateEntity, type EntityPageType } from './link-role-mapper'
import { validateIntentKeywordConsistency, validatePrimaryKeywordQuality, classifyRecommendedPageType, computeDemandEvidence, finalizeReason, filterSecondaryKeywords, assessBusinessRelevance, assessCommercialFit, assessExistingLocalOwnership, deriveCorpusTypeWords, deriveAttributeTokens, deriveIntent, type RecommendedPageType } from './opportunity-validation'
import { runRecoveryTiers, type TierPlan, type RecoveryTier, type ConfidenceLevel, type FallbackReason } from './recovery-tiers'
import { buildBrandSafety, classifyKeywordEntity, containsExternalBusiness, detectUnsafeNamedEntityMutation, scanSuggestionBrandSafety, type BrandSafety } from './brand-safety'
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

/** What became of one generated candidate. No title, no body. */
export interface CandidateLedgerEntry {
  /** Normalized primary keyword, or null when it normalizes to nothing. */
  key: string | null
  hasPrimaryKeyword: boolean
  family: string
  language: 'he' | 'en'
  disposition: 'accepted' | 'rejected' | 'duplicate'
  reason: string | null
  /** For a duplicate: the earlier key that already occupied the slot. */
  duplicateOf: string | null
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
    competitor_queries_filtered: number
  }
  clusters_built: number
  clusters_rejected_before_ranking: number
  entity_only_rejected: number
  clusters_by_source: Record<string, number>
  clusters_by_tier: { high: number; medium: number }
  ranked_clusters: { id: string; theme: string; source_label: string; tier: string; score: number; demand: number; missing_coverage: boolean }[]
  tiers: TierDiagnostics[]
  rejected_by_reason: Record<string, number>
  /** Phase 1 — what the DISABLED experimental gates (auto brand-safety, commercial
   *  fit, business relevance, local service-area) WOULD have rejected. Observability
   *  only; these did NOT remove any candidate. */
  shadow_rejected_by_reason: Record<string, number>
  persisted_by_confidence: Record<string, number>
  persisted_by_page_type: Record<string, number>
  secondary_keywords_filtered: number
  target_role_mappings: { keyword: string; primaryTarget: string | null; roles: { url: string; role: string; score: number }[]; trace?: { url: string; type: string; role: string; reason: string; score: number; distinctive: string[] }[] }[]
  // Real validator metrics (A) — 0 when the validator did not run (single-scan path).
  validator: ValidatorMetrics
  // B — per-stage candidate IDs (Preview-only trace; empty outside plan mode). Makes it
  // impossible for N>0 candidates to vanish without a typed reason at some stage.
  plan_stage_ids: { generated_candidates: number; deterministic_survivor_ids: string[]; validator_survivor_ids: string[] }
  /**
   * One entry per generated candidate, with EXACTLY ONE final disposition, so
   * `accepted + duplicate + rejected === generated` always holds. Carries no
   * title or body — only the normalized key and structural facts.
   */
  candidate_ledger: CandidateLedgerEntry[]
  /** Dedupe removals, kept SEPARATE from rejections so neither double-counts. */
  duplicates_by_reason: Record<string, number>
  /** Items the PARSER discarded before they were ever counted as candidates. */
  parser_dropped_items: number
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
/**
 * The ONE external dependency this module has. Injectable so the whole
 * downstream pipeline — parse, validate, dedupe, validator, diversity — can be
 * exercised against a deterministic batch without calling a model. Production
 * passes nothing and gets the real client.
 */
export interface OpportunityGenerationDeps {
  generateJson?: typeof generateRecommendationJSON
}

export async function generateOpportunities(
  admin: Admin,
  input: { projectId: string; targetCount: number; maxClusters: number; families?: OpportunityFamily[]; poolTarget?: number; validatorCalls?: number },
  controller: RunCostController,
  deps: OpportunityGenerationDeps = {},
): Promise<{ suggestions: TopicSuggestion[]; diagnostics: OpportunityDiagnostics }> {
  const generateJson = deps.generateJson ?? generateRecommendationJSON
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

  // Brand safety context (own brand + own vocabulary). Stabilization Phase 1: the
  // AUTOMATIC external-business classifier is DIAGNOSTICS-ONLY — it is proven unsafe
  // (rejected most legitimate fixture topics while allowing the real competitor), so it
  // never rejects a candidate and never removes keyword-research queries here. The only
  // brand protection that stays a HARD gate is the exact title→keyword named-entity
  // mutation guard (e.g. generic אביב mutating into a business name אביה).
  const brandSafety: BrandSafety = buildBrandSafety({
    businessName: p.business_name,
    entityNames: entities.map((e) => e.name),
    ownEvidence: [...existingCoverage.map((c) => c.title), ...projectFocus, ...tracked],
  })
  // DIAGNOSTICS-ONLY: how many KR queries the classifier WOULD flag — NONE are removed.
  let competitorQueriesFiltered = 0
  for (const kr of keywordResearch) if (classifyKeywordEntity(kr.query, brandSafety) === 'suspected_external_business') competitorQueriesFiltered++

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
  // Broader DOMAIN type/descriptor words (colours, sizes, ubiquitous flower/city/
  // delivery tokens) for link matching + demand alignment — derived across ALL project
  // documents so a shared colour/type/location token alone never qualifies a link or a
  // demand claim. Lower thresholds because the corpus is larger + more diverse.
  const domainTypeWords = deriveCorpusTypeWords(
    [...entities.map((e) => e.name), ...existingCoverage.map((c) => c.title), ...keywordResearch.map((k) => k.query), ...tracked, ...projectFocus],
    { minDocs: 6, minFraction: 0.3 },
  )
  for (const t of corpusTypeWords) domainTypeWords.add(t)
  // Descriptive-ATTRIBUTE tokens (colours/sizes/quantities/occasion modifiers) — a
  // token that modifies many different product heads. Folded in so a shared attribute
  // (e.g. a colour "לבן") is never a distinctive subject for a link or a keyword.
  for (const t of deriveAttributeTokens(entities.map((e) => e.name))) domainTypeWords.add(t)
  const commercialEntityTokens = new Set<string>()
  for (const e of entities) for (const t of contentTokens(e.name)) commercialEntityTokens.add(t)
  const projectFocusTokens = new Set<string>()
  for (const s of projectFocus) for (const t of contentTokens(s)) projectFocusTokens.add(t)
  const businessEvidenceTokens = new Set<string>(commercialEntityTokens)
  for (const s of [...projectFocus, ...tracked, ...keywordResearch.map((k) => k.query)]) for (const t of contentTokens(s)) businessEvidenceTokens.add(t)
  // Existing indexed page/coverage titles — for local-page ownership/cannibalization.
  const existingPageTitles = [...entities.map((e) => e.name), ...existingCoverage.map((c) => c.title)]
  const bump = (td: TierDiagnostics, r: string) => { td.rejected_by_reason[r] = (td.rejected_by_reason[r] ?? 0) + 1 }
  // Stabilization Phase 1 — experimental hard gates are DIAGNOSTICS-ONLY by default;
  // each is behind a server-side flag (default OFF). When off, the gate is evaluated
  // and recorded in shadow_rejected_by_reason but does NOT reject the candidate.
  const GATE_COMMERCIAL_FIT = process.env.RECO_GATE_COMMERCIAL_FIT === '1'
  const GATE_LOCAL_SERVICE_AREA = process.env.RECO_GATE_LOCAL_SERVICE_AREA === '1'
  const GATE_BUSINESS_RELEVANCE = process.env.RECO_GATE_BUSINESS_RELEVANCE === '1'
  const shadow_rejected_by_reason: Record<string, number> = {}
  // ONE entry per generated candidate, exactly one disposition each.
  const candidateLedger: CandidateLedgerEntry[] = []
  const duplicates_by_reason: Record<string, number> = {}
  let parserDroppedItems = 0
  const shadow = (r: string) => { shadow_rejected_by_reason[r] = (shadow_rejected_by_reason[r] ?? 0) + 1 }
  let secondaryKeywordsFiltered = 0
  const target_role_mappings: OpportunityDiagnostics['target_role_mappings'] = []
  const ctx: ProjectContext = { projectName: p.business_name, domain: p.target_domain, language, primaryProjectFocus: focus.primaryProjectFocus, secondaryProjectAreas: focus.secondaryProjectAreas, ownedCategories: entities.map((e) => e.name).slice(0, 15), existingTopics: existingCoverage.map((c) => c.title).slice(0, 15) }
  const year = new Date().getFullYear()
  const tierDiags: TierDiagnostics[] = []

  // Run the FULL deterministic gate pipeline on ONE candidate. Reused by synthesis AND
  // by the validator's repair path (a repair must pass every gate again). Returns a
  // built suggestion or a typed rejection reason — brand safety, business relevance,
  // ownership/cannibalization, commercial fit and page-type safety are ALWAYS enforced
  // here, so nothing downstream can override them.
  const validateOne = (o: { primaryKeyword: string; title: string; secondaryKeywords: string[]; intent?: string; reason?: string }, label: { confidenceLevel: ConfidenceLevel; discovery: boolean }): { suggestion?: TopicSuggestion; rejectionReason?: string } => {
    // DIAGNOSTICS-ONLY (Phase 1): the automatic external-business classifier NEVER
    // rejects — it only records what it would have flagged. It proved unsafe.
    if (classifyKeywordEntity(o.primaryKeyword, brandSafety) === 'suspected_external_business'
      || containsExternalBusiness(o.title, brandSafety)
      || containsExternalBusiness(o.reason || '', brandSafety)
      || (o.secondaryKeywords ?? []).some((k) => containsExternalBusiness(k, brandSafety))) {
      shadow('competitor_brand_leakage')
    }
    const intent = deriveIntent(o.primaryKeyword, o.title, (o.intent as SearchIntent) || 'informational')
    const w = evaluateArticleWorthiness({ primaryKeyword: o.primaryKeyword, title: o.title, secondaryKeywords: o.secondaryKeywords, intent, existingPages, hasEvidence: true, businessRelevant: true, coveredKeys })
    if (!w.ok) return { rejectionReason: (w.rejection_reason as RejectionReason) || 'insufficient_independent_need' }

    let primaryKeyword = o.primaryKeyword
    const consistency = validateIntentKeywordConsistency({ primaryKeyword, title: o.title, intent }, commercialEntityTokens)
    if (!consistency.ok) return { rejectionReason: 'intent_keyword_mismatch' }
    if (consistency.repairedKeyword) primaryKeyword = consistency.repairedKeyword

    const quality = validatePrimaryKeywordQuality(primaryKeyword, o.title, corpusTypeWords)
    if (!quality.ok) return { rejectionReason: 'invalid_primary_keyword' }
    if (quality.repairedKeyword) primaryKeyword = quality.repairedKeyword

    // SAFE brand protection kept: an exact title→keyword named-entity mutation (a
    // generic title word mutating into a business name) is still a HARD reject.
    if (detectUnsafeNamedEntityMutation(o.title, primaryKeyword, brandSafety)) return { rejectionReason: 'unsafe_named_entity_mutation' }

    // Experimental relevance gates — diagnostics-only unless their flag is on.
    const relevance = assessBusinessRelevance({ primaryKeyword, title: o.title }, businessEvidenceTokens, domainTypeWords, entities.map((e) => ({ name: e.name })), intent)
    if (!relevance.ok) {
      const rr = relevance.reason ?? 'low_business_relevance'
      const gated = rr === 'unsupported_local_service_area' ? GATE_LOCAL_SERVICE_AREA : GATE_BUSINESS_RELEVANCE
      if (gated) return { rejectionReason: rr }
      shadow(rr)
    }

    const fit = assessCommercialFit(primaryKeyword, o.title, commercialEntityTokens, projectFocusTokens, domainTypeWords)
    if (!fit.ok) { if (GATE_COMMERCIAL_FIT) return { rejectionReason: 'unsupported_commercial_fit' }; shadow('unsupported_commercial_fit') }

    let ownershipPageType: RecommendedPageType | null = null
    if (intent === 'local' || intent === 'transactional') {
      const own = assessExistingLocalOwnership(primaryKeyword, o.title, existingPageTitles, domainTypeWords)
      if (own.outcome === 'owns') return { rejectionReason: 'exact_existing_keyword_owner' }
      if (own.outcome === 'improve') ownershipPageType = 'existing_page_improvement'
    }

    const sec = filterSecondaryKeywords(primaryKeyword, o.title, o.secondaryKeywords, intent, domainTypeWords)
    secondaryKeywordsFiltered += sec.rejected.length

    const mapped = mapLinkRoles(primaryKeyword, o.title, linkCandidates, { corpusTypeWords: domainTypeWords, intent })
    const linkPlan = buildLinkPlan(mapped)
    const primaryTargetType = linkPlan.primaryCommercialTarget ? (urlTypeMap.get(linkPlan.primaryCommercialTarget.url.trim().toLowerCase().replace(/\/+$/, '')) ?? null) : null
    if (target_role_mappings.length < 25) target_role_mappings.push({
      keyword: primaryKeyword, primaryTarget: linkPlan.primaryCommercialTarget?.url ?? null,
      roles: mapped.assignments.slice(0, 7).map((a) => ({ url: a.url, role: a.role, score: a.score })),
      trace: mapped.debug.slice(0, 20).map((a) => ({ url: a.url, type: a.title, role: a.role, reason: a.reason, score: a.score, distinctive: a.distinctiveTokens })),
    })

    const keywordEqualsProduct = existingPages.some((pg) => normalizeText(pg.name) === normalizeText(primaryKeyword))
    const recommendedPageType = ownershipPageType ?? classifyRecommendedPageType({ intent }, { primaryTargetType, keywordEqualsProduct })
    const demandEvidence = computeDemandEvidence(primaryKeyword, sec.kept, keywordResearch, domainTypeWords)
    const suggestionReason = finalizeReason(o.reason || '', demandEvidence, language)

    const orderedLinks = linkPlanToOrdered(linkPlan)
    const targetTitles = [linkPlan.primaryCommercialTarget?.title, ...linkPlan.secondaryCommercialTargets.map((tt) => tt.title), ...linkPlan.supportingInformationalLinks.map((tt) => tt.title)].filter((x): x is string => !!x)
    // DIAGNOSTICS-ONLY final scan (Phase 1) — records, never rejects.
    const scan = scanSuggestionBrandSafety({ title: o.title, primaryKeyword, secondaryKeywords: sec.kept, suggestionReason, anchors: orderedLinks.map((l) => l.anchor), targetTitles }, brandSafety)
    if (!scan.safe) shadow('competitor_brand_leakage')

    return {
      suggestion: {
        id: `opportunity:${slugKey(o.title)}`, title: o.title, primaryKeyword,
        secondaryKeywords: sec.kept, searchIntent: intent, recommendedWordCount: 1000, angle: '',
        suggestedInternalLinks: orderedLinks.map((l) => ({ url: l.url, anchor: l.anchor })),
        moneyTargetUrl: linkPlan.primaryCommercialTarget?.url ?? null,
        source: 'hybrid', suggestionReason, suggestionScore: Number((w.distinctiveness_score * 0.5 + 0.5).toFixed(2)),
        confidenceLevel: label.confidenceLevel, discoveryGenerated: label.discovery,
        recommendedPageType, demandEvidence, businessRelevance: { score: relevance.score, relatedCommercialEntities: relevance.relatedCommercialEntities },
        linkPlan,
      },
    }
  }

  // Synthesize a batch of candidates then run each through validateOne (same gates for
  // every tier — only the prompt + confidence label differ).
  const synthAndValidate = async (prompt: string, plan: TierPlan, td: TierDiagnostics): Promise<TopicSuggestion[]> => {
    const res = await generateJson(prompt, { temperature: plan.discovery ? 0.95 : 0.85, maxOutputTokens: outputBudgetFor(input.targetCount) }, controller, { source: 'opportunity_synthesis', callPurpose: plan.tier === 1 ? 'primary' : 'salvage', requestedIdeaCount: input.targetCount })
    td.model_calls += 1
    // parseOpportunitiesDetailed reports what the PARSER discarded (an item with
    // no title or no primaryKeyword). Those never reach raw_candidates, so the
    // loss used to be invisible; it is surfaced now.
    const parsed = res.ok ? parseOpportunitiesDetailed(res.text) : { items: [], droppedItems: 0, parseFailed: true, emitted: 0 }
    const opportunities: SynthOpportunity[] = parsed.items
    parserDroppedItems += parsed.droppedItems
    td.parse_ok = res.ok
    td.raw_candidates += opportunities.length
    const out: TopicSuggestion[] = []
    for (const o of opportunities) {
      const r = validateOne({ primaryKeyword: o.primaryKeyword, title: o.title, secondaryKeywords: o.secondaryKeywords, intent: o.intent, reason: o.reason }, { confidenceLevel: plan.confidenceLevel, discovery: plan.discovery })
      const key = normalizeText(o.primaryKeyword) || null
      if (r.suggestion) {
        out.push(r.suggestion)
        // Provisionally accepted; the dedupe step below may reclassify it.
        candidateLedger.push({ key, hasPrimaryKeyword: !!o.primaryKeyword.trim(), family: plan.discovery ? 'discovery' : 'synthesis', language, disposition: 'accepted', reason: null, duplicateOf: null })
      } else {
        const reason = r.rejectionReason || 'insufficient_independent_need'
        bump(td, reason)
        candidateLedger.push({ key, hasPrimaryKeyword: !!o.primaryKeyword.trim(), family: plan.discovery ? 'discovery' : 'synthesis', language, disposition: 'rejected', reason, duplicateOf: null })
      }
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

  // PLAN mode (D) — over-generate a large candidate POOL via a few batched, family-
  // scoped synthesis calls (never one call per topic); evidence is built ONCE above and
  // reused across families. Otherwise the recovery-tier single-scan path.
  let outcome: Awaited<ReturnType<typeof runRecoveryTiers>>
  let validatorMetrics: ValidatorMetrics = { validator_call_count: 0, validator_accept_count: 0, validator_reject_count: 0, validator_repair_count: 0, validator_missing_verdict_count: 0, validator_parse_failure_count: 0, validator_degraded: false }
  const planStageIds = { generated_candidates: 0, deterministic_survivor_ids: [] as string[], validator_survivor_ids: [] as string[] }
  if (input.families && input.families.length > 0) {
    const familyClusters = selectClustersWithinBudget(rankClusters(clusters), input.maxClusters)
    const poolTarget = input.poolTarget ?? input.targetCount * 2
    const pool: TopicSuggestion[] = []
    const seen = new Set<string>()
    const familiesRun: RecoveryTier[] = []
    for (const family of input.families) {
      if (pool.length >= poolTarget || familyClusters.length === 0) break
      const td: TierDiagnostics = { tier: 1, confidence_level: 'high_confidence', clusters_available: familyClusters.length, clusters_sent_to_model: familyClusters.length, model_calls: 0, raw_candidates: 0, parse_ok: false, mapped_opportunities: 0, rejected_by_reason: {}, persisted: 0 }
      tierDiags.push(td)
      const produced = await synthAndValidate(buildFamilyPrompt(familyClusters, ctx, langLabel, year, input.targetCount, family), { tier: 1, confidenceLevel: 'high_confidence', discovery: false }, td)
      // EVERY exit from the funnel is TYPED AND COUNTED. This loop used to drop
      // candidates with a bare `continue` — after td.raw_candidates had already
      // counted them — so a run could report N candidates generated, zero
      // accepted, and an empty rejected_by_reason: the ledger said nothing had
      // been rejected while everything had been. Both causes are now named.
      // DEDUPE is not a rejection — it is a different disposition, tracked in
      // its own bucket so the two can never double-count. Each candidate's
      // ledger entry is reclassified in place, so it still has exactly one.
      for (const s of produced) {
        const k = normalizeText(s.primaryKeyword)
        const entry = candidateLedger.find((e) => e.disposition === 'accepted' && e.key === (k || null) && e.duplicateOf === null)
        if (!k) {
          duplicates_by_reason.empty_primary_keyword = (duplicates_by_reason.empty_primary_keyword ?? 0) + 1
          if (entry) { entry.disposition = 'duplicate'; entry.reason = 'empty_primary_keyword' }
          continue
        }
        if (seen.has(k)) {
          duplicates_by_reason.cross_family_duplicate = (duplicates_by_reason.cross_family_duplicate ?? 0) + 1
          if (entry) { entry.disposition = 'duplicate'; entry.reason = 'cross_family_duplicate'; entry.duplicateOf = k }
          continue
        }
        seen.add(k)
        if (entry) entry.family = family
        pool.push({ ...s, opportunityFamily: family })
      }
      familiesRun.push(1)
    }

    planStageIds.deterministic_survivor_ids = pool.map((s) => s.id)

    // A — the ACTUAL batched validator over the deterministic survivors, strictly
    // ADDITIVE: it may only remove a candidate via an explicit reject (repairs re-run
    // every gate; a failed repair keeps the original). A failed/unparsable call
    // degrades gracefully — it NEVER zeroes a non-empty safe set.
    let finalPool = pool
    if (input.validatorCalls && input.validatorCalls > 0 && pool.length > 0) {
      const batches = validatorBatches(pool).slice(0, input.validatorCalls)
      const batchedIds = new Set(batches.flat().map((s) => s.id))
      const unvalidated = pool.filter((s) => !batchedIds.has(s.id))
      const verdictsPerBatch: Map<string, ValidatorVerdict>[] = []
      for (const batch of batches) {
        const vres = await generateJson(buildValidatorPrompt(batch, langLabel), { temperature: 0.2, maxOutputTokens: outputBudgetFor(batch.length) }, controller, { source: 'plan_validator', callPurpose: 'validate', requestedIdeaCount: batch.length })
        verdictsPerBatch.push(vres.ok ? parseValidatorResponse(vres.text) : new Map())
      }
      // Repairs re-run EVERY deterministic gate via validateOne; a failed repair → reject.
      const applied = applyValidatorVerdicts(batches, verdictsPerBatch, (rep, src) => {
        const r = validateOne(rep, { confidenceLevel: (src.confidenceLevel as ConfidenceLevel) || 'high_confidence', discovery: !!src.discoveryGenerated })
        return r.suggestion ? { ...r.suggestion, opportunityFamily: src.opportunityFamily } : null
      }, unvalidated)
      validatorMetrics = applied.metrics
      finalPool = applied.accepted
    }
    planStageIds.validator_survivor_ids = finalPool.map((s) => s.id)
    outcome = { suggestions: finalPool, tiersRun: familiesRun, recoveryTierUsed: familiesRun.length ? 1 : null, discoveryUsed: false, fallbackReason: finalPool.length === 0 ? 'no_safe_opportunities' : null }
  } else {
    outcome = await runRecoveryTiers({ targetFloor: TARGET_FLOOR, keyKey: (s) => normalizeText(s.primaryKeyword), runTier })
  }

  // 3) Assemble diagnostics.
  const ranked = rankClusters(clusters)
  // FUNNEL COUNTERS, on every path. These were assigned only inside the family
  // branch, so a run that fell through to the tier-2/3 recovery path reported
  // `generated_candidates: 0` no matter how many candidates it actually
  // produced — and the reconciliation below then had nothing to reconcile.
  planStageIds.generated_candidates = tierDiags.reduce((a, t) => a + t.raw_candidates, 0)

  // RECONCILE THE LEDGER AGAINST THE AUTHORITATIVE OUTCOME.
  //
  // Dedupe happens in more than one place — the family loop above and, on the
  // recovery path, inside runRecoveryTiers — so instrumenting each site by hand
  // leaves whichever one is added next silently unaccounted. Instead, anything
  // still marked 'accepted' that is NOT in the final set is reclassified here
  // from what actually came out. That is path-independent and cannot be
  // outrun by a new removal site.
  {
    const survivingKeys = new Set(outcome.suggestions.map((x: TopicSuggestion) => normalizeText(x.primaryKeyword)))
    const keptOnce = new Set<string>()
    for (const entry of candidateLedger) {
      if (entry.disposition !== 'accepted') continue
      const k = entry.key ?? ''
      if (k && survivingKeys.has(k) && !keptOnce.has(k)) { keptOnce.add(k); continue }
      entry.disposition = 'duplicate'
      entry.reason = k ? 'cross_family_duplicate' : 'empty_primary_keyword'
      entry.duplicateOf = k || null
      duplicates_by_reason[entry.reason] = (duplicates_by_reason[entry.reason] ?? 0) + 1
    }
  }
  if (planStageIds.deterministic_survivor_ids.length === 0 && outcome.suggestions.length > 0) {
    planStageIds.deterministic_survivor_ids = outcome.suggestions.map((x: TopicSuggestion) => x.id)
  }
  if (planStageIds.validator_survivor_ids.length === 0 && outcome.suggestions.length > 0) {
    planStageIds.validator_survivor_ids = outcome.suggestions.map((x: TopicSuggestion) => x.id)
  }

  const rejected_by_reason: Record<string, number> = {}
  for (const td of tierDiags) for (const [r, n] of Object.entries(td.rejected_by_reason)) rejected_by_reason[r] = (rejected_by_reason[r] ?? 0) + n

  // SELF-ACCOUNTING LEDGER. Generated candidates either survive into the
  // deterministic pool or leave it for a named reason — there is no third
  // outcome. Any residual is a drop this code failed to name, and it is
  // surfaced as `unaccounted` rather than silently vanishing: a funnel that
  // reports "17 generated, 0 accepted, nothing rejected" is describing a bug,
  // and it must say so on the spot instead of looking like a quiet zero.
  // This never removes or adds a candidate; it only makes the numbers add up.
  const namedRejections = Object.values(rejected_by_reason).reduce((a, b) => a + b, 0)
  const namedDuplicates = Object.values(duplicates_by_reason).reduce((a, b) => a + b, 0)
  const unaccounted = planStageIds.generated_candidates - planStageIds.deterministic_survivor_ids.length - namedRejections - namedDuplicates
  if (unaccounted > 0) rejected_by_reason.unaccounted = (rejected_by_reason.unaccounted ?? 0) + unaccounted
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
      competitor_queries_filtered: competitorQueriesFiltered,
    },
    clusters_built: clusters.length,
    clusters_rejected_before_ranking: built.rejected_themes,
    entity_only_rejected: built.entity_only_rejected,
    clusters_by_source: clustersBySource,
    clusters_by_tier: clustersByTier,
    ranked_clusters: ranked.slice(0, 20).map((c) => ({ id: c.cluster_id, theme: c.canonical_topic, source_label: c.source_label, tier: c.tier_class, score: c.score, demand: c.demand_volume, missing_coverage: c.missing_coverage })),
    tiers: tierDiags,
    rejected_by_reason,
    shadow_rejected_by_reason,
    persisted_by_confidence,
    persisted_by_page_type,
    secondary_keywords_filtered: secondaryKeywordsFiltered,
    target_role_mappings,
    validator: validatorMetrics,
    plan_stage_ids: planStageIds,
    candidate_ledger: candidateLedger,
    duplicates_by_reason,
    parser_dropped_items: parserDroppedItems,
    model_calls: cs.totalCalls,
    generated_opportunities: tierDiags.reduce((s, t) => s + t.raw_candidates, 0),
    persisted: outcome.suggestions.length,
    cost: { estimatedRunCostUsd: cs.estimatedRunCostUsd, totalCalls: cs.totalCalls },
  }

  return { suggestions: outcome.suggestions, diagnostics }
}
