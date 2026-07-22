/**
 * EVIDENCE-FIRST generation engine (Phase 4) — the production default.
 *
 *   evidence inventory → deterministic OpportunityBrief pool → pre-AI duplicate/
 *   coverage/ownership validation → rank → ONE batched synthesis (polish) call →
 *   deterministic validation + deterministic repair → persistence-ready topics →
 *   LinkPlan mapping (separate; never affects acceptance).
 *
 * Structural differences from the tiered generate-and-discard path it replaces:
 *   - the model POLISHES deterministic briefs (wording only) instead of inventing
 *     topics from single-token cluster buckets — so relevance is structural
 *     (a brief exists only when evidence supports it), not a post-hoc gate;
 *   - demand is per-brief (a topic may claim ONLY its own aligned query's volume);
 *   - user-visible reasons are COMPOSED deterministically from structured evidence
 *     (model prose never reaches the customer — malformed Hebrew and invented
 *     demand claims are eliminated by construction);
 *   - adaptive refill: a second call only ever sends UNCONSUMED briefs (never the
 *     same strategy twice), stops on zero marginal yield or an empty pool, and a
 *     small pool is a truthful insufficient_inventory — never filler;
 *   - EXACT accounting per round: briefs_sent = polished + skipped + missing;
 *     polished = accepted + repaired-then-accepted + rejected(by typed reason).
 *
 * Increment 3 (smart-controller prep, behavior-preserving) splits the run into two
 * phases WITHOUT changing the semantic execution order:
 *   - prepareBriefRun  → evidence inventory → deterministic pool → the SINGLE
 *     constrained-discovery call, in that exact order, returning an immutable
 *     BriefRunSnapshot. Discovery still runs immediately after pool construction,
 *     under the same deficit condition, using the same controller.
 *   - synthesizeFromSnapshot → rebuilds per-attempt state, runs the adaptive
 *     synthesis rounds, assembles diagnostics. It never mutates the snapshot, so a
 *     Flash attempt and a Pro attempt can synthesize from the identical pool/order.
 *   - generateFromBriefs → the unchanged public entry: prepare then synthesize with
 *     the same controller (behavior-identical to the pre-split single function).
 */

import type { createAdminClient } from '@/lib/supabase/admin'
import { getCachedIndex, reassembleReport } from '@/lib/content/wordpress-content-index'
import type { ScannedTarget } from '@/lib/content/wordpress-content-scan'
import { buildKeywordGuard, coveredByExistingContent, ownedByExistingEntity, normalizePhrase, titleMainPhrase, keywordOriginsOf, type KeywordOriginEntry } from './keyword-guard'
import { flattenKeywordResearchCacheDetailed, contentTokens, type EntityNode, type KeywordResearchIngestion } from './evidence-cluster'
import { getCachedKeywordResults, setCachedKeywordResults } from '@/lib/content/keyword-research-cache'
import { generateKeywordIdeas } from '@/lib/google-ads/keyword-ideas'
import { evaluateArticleWorthiness, type ExistingPageSignal } from './opportunity'
import { mapLinkRoles, buildLinkPlan, linkPlanToOrdered, isBoilerplatePage, type LinkCandidateEntity, type EntityPageType } from './link-role-mapper'
import { filterLinkPlan, sharesSubjectHead } from './link-relevance'
import { assessNeedCannibalization, isSameNeedDuplicate, isTitleKeywordAligned, hasIncompatibleSubtype, type ExistingCoverageDoc, type TopicNeed, type CoverageMatch } from './coverage'
import { validateIntentKeywordConsistency, validatePrimaryKeywordQuality, classifyRecommendedPageType, computeDemandEvidence, isMalformedReason, filterSecondaryKeywords, assessBusinessRelevance, assessExistingLocalOwnership, deriveCorpusTypeWords, deriveAttributeTokens, deriveIntent, desiredOpportunityRole, basisRoleOf, isImprovementBasisCompatible, type RecommendedPageType, type DemandEvidence } from './opportunity-validation'
import { buildBrandSafety, classifyKeywordEntity, hasNamedExternalBusiness, detectUnsafeNamedEntityMutation, scanSuggestionBrandSafety, type BrandSafety } from './brand-safety'
import { generateRecommendationJSON } from './model'
import { resolveRunModel, type ModelPath, type ModelTier } from './model-select'
import { deriveProjectFocus, type ProjectContext } from './prompt-guidance'
import { slugKey } from './dedupe'
import { normalizeText } from './topic-idea-store'
import { buildBriefPool, buildBusinessPillars, prioritizeBriefsForSynthesis, type OpportunityBrief, type BriefPoolDiagnostics } from './opportunity-brief'
import { integrateGscBriefs } from './gsc-briefs'
import { isGscAutoRecommendationsEnabled } from '@/lib/gsc/config'
import type { GscInputDiagnostics, SelectedGscBriefDetail, GscParticipation } from '@/lib/gsc/recommendations/types'
import { buildBriefSynthesisPrompt, reconcileSynthesis, synthesisOutputBudget, briefSynthesisResponseSchema, classifySynthesisFailure, type PolishedTopic, type SynthesisFailureType, type SynthesisResponseDiagnostics } from './brief-synthesis'
import { buildDiscoveryPrompt, discoveryResponseSchema, reconcileDiscovery, validateDiscoveredCandidates } from './constrained-discovery'
import { topicSignature, isHighConfidenceDuplicate, distinctiveTokensOf, canonicalVariants, type TopicSignature } from './semantic-dup'
import { dedupeMegaGuideTitle } from './title-diversity'
import { normalizeToSearchPhrase, isSearchPhraseQuality, keywordPreservesSubject, keywordHasRealSubject, conciseSubject } from './search-phrase'
import type { RunCostController } from './run-cost-controller'
import type { TopicSuggestion } from './types'

type Admin = ReturnType<typeof createAdminClient>

/** Per-synthesis-round exact accounting (E-reconciliation):
 *  briefs_sent = polished + skipped_by_model + missing_from_response
 *              + provider_failed_briefs, and
 *  polished    = accepted + Σrejected_by_reason + not_processed + dropped_items.
 *  Provider failures and target-reached-not-processed are NEVER quality rejections —
 *  each gets its own typed bucket, so no polished response is ever silently dropped. */
export interface BriefRoundDiagnostics {
  round: number
  model: string | null
  briefs_sent: number
  provider_ok: boolean
  /** Briefs whose synthesis the PROVIDER failed before returning content. */
  provider_failed_briefs: number
  providerStatus: string | null
  providerErrorType: string | null
  sanitizedProviderMessage: string | null
  finishReason: string | null
  textPresent: boolean
  textLength: number
  emitted: number
  polished: number
  skipped_by_model: number
  missing_from_response: number
  dropped_items: number
  /** Polished topics NOT validated because targetCount was reached mid-response —
   *  a typed NON-error bucket (never a quality rejection, never silently dropped). */
  not_processed: number
  accepted: number
  repaired: number
  rejected_by_reason: Record<string, number>
  marginal_yield: number
  /** RC1 — typed synthesis-contract failure on a provider-SUCCESSFUL response. */
  synthesis_failure: SynthesisFailureType | null
  /** RC1 — exact response diagnostics (Preview only; no prompt, no secrets). */
  synthesisResponse: SynthesisResponseDiagnostics | null
}

/**
 * Scope A — the concrete BLOCKER that stopped a rejected candidate (Preview/operator
 * only; SAFE — key names, statuses, titles/keywords/urls, never article bodies or
 * credentials). blockingSource is the guard-origin family or a resolved match source
 * (existing article/topic, product/category/page entity, pending/approved/rejected/
 * generated idea, same-run accepted). For a persisted idea it also carries the row
 * status, so an OLD status='rejected' idea blocking a new candidate is explicit.
 */
export interface CandidateBlocker {
  blockingSource:
    | 'tracking_keyword' | 'topic_keyword' | 'idea_keyword' | 'scan_focus_keyword'
    | 'existing_article' | 'existing_topic' | 'existing_content'
    | 'entity' | 'pending_idea' | 'intra_run_accepted' | null
  /** Persisted-idea rows: the row status (pending/approved/rejected/generated/…); else null. */
  blockingRecordStatus: string | null
  blockingTitle: string | null
  blockingPrimaryKeyword: string | null
  blockingUrl: string | null
  /** How the block matched: exact_keyword / entity_owner / content_phrase / owns_need /
   *  exact / improve / pending / pending_semantic / same_run / local_owner. */
  matchType: string | null
}

/**
 * Scope A — a complete per-candidate accounting record. EVERY polished candidate that
 * enters validation is recorded EXACTLY once, so the invariant
 * `generated = accepted + rejected (+ not_processed + dropped)` is provable. Additive
 * and observational — recording it never changes acceptance, order, or return values.
 */
export interface CandidateOutcome {
  briefId: string | null
  opportunityId: string | null
  /** brief.family — the source/opportunity family. */
  sourceFamily: string | null
  briefSubject: string | null
  alignedDemandQuery: string | null
  modelTitle: string | null
  modelPrimaryKeyword: string | null
  /** Final primary keyword after deterministic repair/normalization. */
  finalPrimaryKeyword: string | null
  keywordRepaired: boolean
  finalIntent: string | null
  outcome: 'accepted' | 'rejected' | 'not_processed' | 'dropped'
  rejectionReason: string | null
  /** The validation stage that produced the outcome (e.g. keyword_quality,
   *  cannibalization, entity_ownership, pending_exact, intra_run). */
  rejectionStage: string | null
  blocker: CandidateBlocker | null
  matchedExistingContentTitle: string | null
  matchedExistingContentUrl: string | null
  matchedCommercialEntity: string | null
  matchedPendingIdea: string | null
  matchedSameRunAccepted: string | null
  coverageMatchType: string | null
}

export interface BriefRunDiagnostics {
  engine: 'evidence_first_briefs'
  /** Stage E3A — additive GSC input summary (present even when disabled: {enabled:false}). */
  gscInput?: GscInputDiagnostics
  modelPath: ModelPath
  /** EXACT generation config of the synthesis calls (model-aware thinking). */
  modelConfig: { model: string; thinkingMode: string; thinkingBudget: number; maxOutputTokens: number } | null
  evidence_inventory: {
    project_focus_terms: number
    tracked_keywords: number
    keyword_research_cache_rows: number
    keyword_research_queries: number
    search_volume_values: number
    site_scan_entities: number
    shopify_entities: number
    existing_informational_coverage: number
    pending_topics: number
    generated_articles: number
    competitor_queries_filtered: number
    evidence_load_errors: string[]
    ineligible_pages_excluded: number
    stale_index_excluded: boolean
    /** RC2 — exact keyword-research ingestion accounting (rows→items) + the
     *  restored live cache-first URL-seed fetch count. */
    kr_rows_loaded: number
    kr_rows_parsed: number
    kr_rows_skipped: number
    kr_items_skipped: number
    kr_skipped_example_keys: string[]
    kr_live_fetched: number
  }
  brief_pool: BriefPoolDiagnostics
  /** SOFT synthesis-priority trace (Preview/operator-only, additive). One record per
   *  brief in the ordered working pool: its tier, final rank, and whether/where it was
   *  consumed. Proves admitted-count-in === admitted-count-out, one rank each, one
   *  round+position per consumed brief, and unconsumed briefs stay explicitly present.
   *  Additive + OPTIONAL (older hand-authored diagnostics omit it); always set by the run. */
  synthesis_brief_trace?: {
    opportunityId: string
    subject: string
    priorityTier: 0 | 1 | 2 | null
    finalSynthesisRank: number
    consumed: boolean
    consumedRound: number | null
    roundPosition: number | null
  }[]
  /** RC3 — constrained discovery accounting (ran only to fill a pool deficit). */
  discovery: {
    ran: boolean
    deficit: number
    provider_ok: boolean
    parse_failed: boolean
    emitted: number
    invalid_items: number
    unknown_anchors: string[]
    accepted: number
    rejected_by_reason: Record<string, number>
    rejected_examples: { subject: string; reason: string }[]
    candidates: { subject: string; anchor: string }[]
  } | null
  rounds: BriefRoundDiagnostics[]
  /** Scope A — one record per polished candidate (accepted OR rejected, plus
   *  not_processed/dropped edge buckets), bounded but ≥ the run target. */
  candidateOutcomes: CandidateOutcome[]
  /** Scope A — the provable accounting invariant. reconciles === true means every
   *  generated candidate appears exactly once in candidateOutcomes. */
  candidateAccounting: {
    generated: number
    accepted: number
    rejected: number
    not_processed: number
    dropped: number
    outcomesCapped: boolean
    reconciles: boolean
  }
  rejected_by_reason: Record<string, number>
  shadow_rejected_by_reason: Record<string, number>
  /** raw_generated = Σ rounds.polished (model output that entered validation). */
  generated_opportunities: number
  finalCount: number
  model_calls: number
  /** Truthful zero/low-yield classification. call_cap_reached ≠ true_pool_exhausted. */
  stop_reason: 'target_reached' | 'true_pool_exhausted' | 'call_cap_reached' | 'zero_marginal_yield' | 'insufficient_inventory' | 'provider_failed' | 'budget_stopped' | 'synthesis_failed'
  /** consumedBriefs + remainingBriefs = effectivePoolSize (stop-reason reconciliation). */
  brief_consumption: { effectivePoolSize: number; consumedBriefs: number; remainingBriefs: number; callsRemaining: number }
  insufficient_inventory: boolean
  secondary_keywords_filtered: number
  /** Per-project corpus-derived domain/type/container words (the DISCRIMINATIVE
   *  subject core) — surfaced so the acceptance runner can strip the SAME broad
   *  domain words a generic head ("כושר"/"משרד") can never own a subject with. */
  domainTypeWords: string[]
  target_role_mappings: { keyword: string; primaryTarget: string | null; roles: { url: string; role: string; score: number }[] }[]
  /** Competitor leakage grouped by location — rejected evidence vs accepted output. */
  competitorLeakage: {
    researchRejected: string[]; discoveryRejected: string[]; briefRejected: string[]
    acceptedTitle: string[]; acceptedPrimaryKeyword: string[]; acceptedSecondaryKeyword: string[]; acceptedLinkTarget: string[]
    acceptedMatches: { field: string; value: string; token: string | null; evidence: string }[]
  }
  cost: {
    estimatedRunCostUsd: number; totalCalls: number
    calls: { model: string; source: string; callPurpose: string; inputTokens: number; answerOutputTokens: number; thinkingTokens: number; totalBillableOutputTokens: number; estimatedCostUsd: number; success: boolean }[]
    totalPaidCalls: number; estimatedRunCostIls: number; costPerAcceptedTopic: number
    configuredCostCeilingUsd: number; remainingBudgetUsd: number; callsPreventedByBudget: number; configuredMaxCalls: number
  }
}

const MAX_ROUNDS = 2

/** A genuinely-new GSC-origin brief carries the `gsc:` opportunityId prefix (merged GSC evidence
 *  lives on a normal brief and is NOT one of these). */
export function isGscOriginBrief(b: { opportunityId: string }): boolean {
  return b.opportunityId.startsWith('gsc:')
}

export interface SynthesisBatchComposition {
  batch: OpportunityBrief[]
  /** Cursor position after this batch (natural progression only; appended briefs excluded). */
  nextCursor: number
  /** E3A path produced an empty batch (every remaining brief already consumed). */
  exhausted: boolean
  /** GSC-origin briefs naturally present in this batch (round-1 participation input). */
  naturalGscCount: number
  /** Bounded GSC trial briefs appended after the natural batch (round 1 only). */
  appendedIds: string[]
}

/**
 * Stage E3A FIX 1/2 — PURE synthesis-batch composition. Given the already-prioritized workingPool
 * and a cursor, returns the batch for this round.
 *
 * - E3A off / no new GSC brief (`e3aTrialActive === false`): the EXACT contiguous slice
 *   `workingPool.slice(cursor, cursor+batchSize)` and `nextCursor = cursor + batchSize` — the
 *   pre-existing behavior, byte-identical batch ids.
 * - E3A active: the natural batch takes only UNCONSUMED briefs from the cursor forward (so an
 *   appended GSC brief pulled from a later position is skipped when the cursor reaches it), and in
 *   round 1 appends up to `maxTrialGscBriefs − naturalGscCount` highest-ranked remaining unconsumed
 *   GSC briefs strictly AFTER the natural batch. No normal brief is removed, displaced or reordered;
 *   the batch grows by at most `maxTrialGscBriefs`.
 */
export function composeSynthesisBatch(params: {
  workingPool: OpportunityBrief[]
  cursor: number
  batchSize: number
  round: number
  consumedIds: Set<string>
  e3aTrialActive: boolean
  maxTrialGscBriefs: number
}): SynthesisBatchComposition {
  const { workingPool, cursor, batchSize, round, consumedIds, e3aTrialActive, maxTrialGscBriefs } = params
  if (!e3aTrialActive) {
    const batch = workingPool.slice(cursor, cursor + batchSize)
    return { batch, nextCursor: cursor + batchSize, exhausted: false, naturalGscCount: batch.filter(isGscOriginBrief).length, appendedIds: [] }
  }
  const naturalBatch: OpportunityBrief[] = []
  let i = cursor
  while (i < workingPool.length && naturalBatch.length < batchSize) {
    const b = workingPool[i]
    if (!consumedIds.has(b.opportunityId)) naturalBatch.push(b)
    i++
  }
  const naturalGscCount = naturalBatch.filter(isGscOriginBrief).length
  let appended: OpportunityBrief[] = []
  if (round === 1) {
    const inNatural = new Set(naturalBatch.map((b) => b.opportunityId))
    const need = Math.max(0, maxTrialGscBriefs - naturalGscCount)
    if (need > 0) appended = workingPool.filter((b) => isGscOriginBrief(b) && !consumedIds.has(b.opportunityId) && !inNatural.has(b.opportunityId)).slice(0, need)
  }
  const batch = [...naturalBatch, ...appended]
  return { batch, nextCursor: i, exhausted: batch.length === 0, naturalGscCount, appendedIds: appended.map((b) => b.opportunityId) }
}

/** Dedupe coverage docs by normalized title+focus (link candidates and entities
 *  overlap; pending/published may repeat) so the cannibalization corpus is unique. */
function dedupeCoverageDocs(docs: ExistingCoverageDoc[]): ExistingCoverageDoc[] {
  const seen = new Set<string>()
  const out: ExistingCoverageDoc[] = []
  for (const d of docs) {
    const key = normalizePhrase(`${d.title || ''} ${d.focusKeyword || ''} ${d.slug || ''}`)
    if (!key || seen.has(key)) continue
    seen.add(key)
    out.push(d)
  }
  return out
}

export type BriefRunInput = { projectId: string; targetCount: number; qualityMode?: ModelTier; userId?: string }

/**
 * Phase 1 (prepare) — evidence inventory → deterministic brief pool → the SINGLE
 * constrained-discovery call, in exactly that order. This is pure code motion out of
 * the pre-split generateFromBriefs: discovery still runs immediately after pool
 * construction, under the same `workingPool.length < targetCount && modelPath.model`
 * condition, accounting through the same controller, pushing into the same
 * workingPool. The per-attempt validation closures (which never executed during
 * preparation — they were only DEFINED here) moved into synthesizeFromSnapshot.
 *
 * Returns an immutable snapshot; synthesizeFromSnapshot never mutates it.
 */
export async function prepareBriefRun(
  admin: Admin,
  input: BriefRunInput,
  controller: RunCostController,
) {
  const loadErrors: string[] = []

  // ── 1) Evidence inventory (project-scoped; failures RECORDED, never silent) ──
  const { data: proj } = await admin.from('projects').select('business_name, target_domain, language, country').eq('id', input.projectId).maybeSingle()
  const p = (proj as { business_name: string | null; target_domain: string | null; language: string | null; country?: string | null } | null) ?? { business_name: null, target_domain: null, language: null, country: null }
  const language: 'he' | 'en' = String(p.language || '').toLowerCase().startsWith('en') ? 'en' : 'he'
  const langLabel = language === 'he' ? 'Hebrew' : 'English'

  const guard = await buildKeywordGuard(admin, input.projectId)

  const tracked: string[] = []
  try { const { data } = await admin.from('tracking_targets').select('keyword').eq('project_id', input.projectId); for (const r of (data ?? []) as { keyword: string }[]) if (r.keyword) tracked.push(r.keyword) } catch (e) { loadErrors.push(`tracking_targets:${(e as Error)?.message?.slice(0, 60) ?? 'error'}`) }

  const keywordResearch: { query: string; volume?: number | null }[] = []
  let krCacheRows = 0
  let krIngestion: KeywordResearchIngestion = { nodes: [], rows_loaded: 0, rows_parsed: 0, rows_skipped: 0, items_parsed: 0, items_skipped: 0, skipped_example_keys: [] }
  let krLiveFetched = 0
  try {
    // Ordered by the table's REAL timestamp column, fetched_at (the live defect:
    // ordering by a non-existent created_at made PostgREST return a RESPONSE
    // error object — not a throw — which read as "no keyword research exists").
    const { data, error } = await admin.from('keyword_research_cache').select('results_json, fetched_at').eq('project_id', input.projectId).order('fetched_at', { ascending: false }).limit(20)
    if (error) loadErrors.push(`keyword_research_cache:${String((error as { message?: string }).message ?? 'query_error').slice(0, 80)}`)
    const rows = (data ?? []) as { results_json: unknown }[]
    krCacheRows = rows.length
    krIngestion = flattenKeywordResearchCacheDetailed(rows)
    keywordResearch.push(...krIngestion.nodes)
    if (krIngestion.rows_skipped > 0 || krIngestion.items_skipped > 0) loadErrors.push(`keyword_research_cache:unparsed rows=${krIngestion.rows_skipped} items=${krIngestion.items_skipped} keys=[${krIngestion.skipped_example_keys.join(' | ')}]`)
  } catch (e) { loadErrors.push(`keyword_research_cache:${(e as Error)?.message?.slice(0, 60) ?? 'error'}`) }

  // RESTORED evidence source (lost in the rewrite): the previous live generator
  // fetched Google-Ads keyword ideas for the project URL (cache-first, 30-day
  // TTL). When the raw cache yields ZERO queries, do ONE bounded cache-first
  // URL-seed fetch — never per-topic, never per-round.
  if (keywordResearch.length === 0 && input.userId && p.target_domain) {
    const country = (p.country || 'IL').toUpperCase()
    const langCode = language
    const key = { projectId: input.projectId, seedType: 'url' as const, seedValue: p.target_domain, country, language: langCode }
    try {
      let results = await getCachedKeywordResults(admin, key)
      if (!results) {
        const resp = await generateKeywordIdeas({ researchType: 'url', keywords: [], url: p.target_domain, country, language: langCode, minMonthlySearches: 30, resultsLimit: 250 })
        results = resp.results
        await setCachedKeywordResults(admin, input.userId, key, results)
      }
      for (const r of results ?? []) if (r?.keyword?.trim()) { keywordResearch.push({ query: r.keyword, volume: r.avgMonthlySearches ?? null }); krLiveFetched++ }
    } catch (e) { loadErrors.push(`keyword_research_live:${((e as Error)?.message ?? 'error').slice(0, 80)}`) }
  }
  const searchVolumeValues = keywordResearch.filter((k) => (k.volume ?? 0) > 0).length

  const PAGE_TYPE_ALIASES: Record<string, EntityPageType> = { collection: 'category', blog: 'post', item: 'product' }
  const PAGE_TYPE = (t: string | null | undefined): EntityPageType => {
    const s = (t || '').toLowerCase()
    if ((['product', 'category', 'service', 'page', 'post', 'article'] as EntityPageType[]).includes(s as EntityPageType)) return s as EntityPageType
    return PAGE_TYPE_ALIASES[s] ?? 'unknown'
  }
  const entities: EntityNode[] = []
  const ineligiblePageTitles: string[] = []
  let siteScanEntities = 0
  let staleIndexExcluded = false
  try {
    const cacheRow = await getCachedIndex(admin, input.projectId)
    // D11 guard — a scan blob whose site host does not match the project's CURRENT
    // target domain is a previous site's content (the index is preserved across
    // re-points and write failures). Its pages/links must not enter this project's
    // evidence — the proven vector for "foreign" topics and links.
    const cachedHost = ((cacheRow as { site_host?: string | null } | null)?.site_host || '').toLowerCase().replace(/^www\./, '')
    const projectHost = (p.target_domain || '').toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, '').replace(/^www\./, '')
    if (cacheRow && cachedHost && projectHost && cachedHost !== projectHost) {
      staleIndexExcluded = true
      loadErrors.push(`site_scan_index:stale_host_mismatch:${cachedHost}`)
    } else {
      const targets = cacheRow ? ((reassembleReport(cacheRow).targets ?? []) as ScannedTarget[]) : []
      for (const t of targets) {
        if (!t.targetTitle) continue
        // The scanner ALREADY classifies utility/legal pages (privacy, תקנון,
        // checkout …) as eligibility='no' — the old engine ignored that field and
        // linked a privacy-policy page from an article (proven live defect). 'no'
        // targets keep OWNERSHIP power (their exact names stay guarded) but never
        // become entities, briefs, or link candidates.
        if (t.eligibility === 'no') { ineligiblePageTitles.push(t.targetTitle); continue }
        entities.push({ name: t.targetTitle, url: t.targetUrl, type: PAGE_TYPE(t.targetType) })
        siteScanEntities++
      }
    }
  } catch (e) { loadErrors.push(`site_scan_index:${(e as Error)?.message?.slice(0, 60) ?? 'error'}`) }
  let shopifyEntities = 0
  try {
    const { data } = await admin.from('shopify_entities').select('title, handle, entity_type, canonical_url').eq('project_id', input.projectId).eq('is_active', true)
    for (const e of (data ?? []) as { title: string | null; canonical_url: string | null; entity_type: string | null }[]) if (e.title) { entities.push({ name: e.title, url: e.canonical_url, type: PAGE_TYPE(e.entity_type) }); shopifyEntities++ }
  } catch (e) { loadErrors.push(`shopify_entities:${(e as Error)?.message?.slice(0, 60) ?? 'error'}`) }

  const publishedCoverage: string[] = []
  // Kept source-identified for the blog-article DUPLICATE corpus (Blocker 2) — a new blog
  // topic must dedupe against generated articles + article topics, not only pending ideas.
  const generatedArticleTitles: string[] = []
  const articleTopicTitles: string[] = []
  let generatedArticles = 0
  try { const { data } = await admin.from('generated_articles').select('title').eq('project_id', input.projectId); for (const r of (data ?? []) as { title: string | null }[]) if (r.title) { publishedCoverage.push(r.title); generatedArticleTitles.push(r.title); generatedArticles++ } } catch (e) { loadErrors.push(`generated_articles:${(e as Error)?.message?.slice(0, 60) ?? 'error'}`) }
  try { const { data } = await admin.from('article_topics').select('topic').eq('project_id', input.projectId); for (const r of (data ?? []) as { topic: string | null }[]) if (r.topic) { publishedCoverage.push(r.topic); articleTopicTitles.push(r.topic) } } catch (e) { loadErrors.push(`article_topics:${(e as Error)?.message?.slice(0, 60) ?? 'error'}`) }

  // PENDING ideas — exact keys + signatures for identity, AND need-aware coverage
  // docs so a synonym-equivalent pending idea (מזון≈תזונה) blocks/converts a new
  // topic (the exact/signature path does NOT fold synonyms — proven live miss).
  const pendingExactKeys = new Set<string>()
  const pendingSignatures: TopicSignature[] = []
  const pendingCoverageDocs: ExistingCoverageDoc[] = []
  let pendingCount = 0
  try {
    const { data } = await admin.from('content_topic_ideas').select('title, primary_keyword, search_intent').eq('project_id', input.projectId).eq('status', 'pending')
    for (const r of (data ?? []) as { title: string | null; primary_keyword: string | null; search_intent: string | null }[]) {
      pendingCount++
      const kw = r.primary_keyword || r.title || ''
      if (!kw) continue
      pendingExactKeys.add(normalizePhrase(kw))
      if (r.title) pendingExactKeys.add(normalizePhrase(r.title))
      pendingSignatures.push(topicSignature(kw, r.search_intent ?? undefined))
      pendingCoverageDocs.push({ title: r.title || kw, focusKeyword: r.primary_keyword ?? null })
    }
  } catch (e) { loadErrors.push(`content_topic_ideas:${(e as Error)?.message?.slice(0, 60) ?? 'error'}`) }

  const focus = deriveProjectFocus({ projectName: p.business_name, domain: p.target_domain, ownedCategories: entities.map((e) => e.name), existingTopics: publishedCoverage })
  const projectFocus = [focus.primaryProjectFocus, ...focus.secondaryProjectAreas].filter(Boolean)

  const brandSafety: BrandSafety = buildBrandSafety({
    businessName: p.business_name,
    entityNames: entities.map((e) => e.name),
    ownEvidence: [...publishedCoverage, ...projectFocus, ...tracked],
  })
  let competitorQueriesFiltered = 0
  for (const kr of keywordResearch) if (classifyKeywordEntity(kr.query, brandSafety) === 'suspected_external_business') competitorQueriesFiltered++

  // ── 2) Shared validation context (same proven derivations as the old engine) ──
  const existingPages: ExistingPageSignal[] = Array.from(guard.entityOwners).map((n) => ({ name: n, pageType: 'unknown' as const }))
  const coveredKeys = new Set<string>([...guard.keywords, ...guard.contentKeywords].map((k) => normalizeText(k)))
  const linkCandidates: LinkCandidateEntity[] = entities.filter((e) => e.url).map((e) => ({ url: e.url as string, title: e.name, type: e.type }))
  const urlTypeMap = new Map<string, EntityPageType>(linkCandidates.map((c) => [c.url.trim().toLowerCase().replace(/\/+$/, ''), c.type ?? 'unknown']))
  // Resolve a local-ownership matched TITLE back to its actionable entity (URL +
  // page type) so improvement basis-compatibility can be judged consistently.
  const entityByTitle = new Map<string, EntityNode>(entities.map((e) => [normalizeText(e.name), e]))
  const corpusTypeWords = deriveCorpusTypeWords(entities.map((e) => e.name))
  const domainTypeWords = deriveCorpusTypeWords(
    [...entities.map((e) => e.name), ...publishedCoverage, ...keywordResearch.map((k) => k.query), ...tracked, ...projectFocus],
    { minDocs: 6, minFraction: 0.3 },
  )
  for (const t of corpusTypeWords) domainTypeWords.add(t)
  const attributeTokens = deriveAttributeTokens(entities.map((e) => e.name))
  for (const t of attributeTokens) domainTypeWords.add(t)
  const commercialEntityTokens = new Set<string>()
  for (const e of entities) for (const t of contentTokens(e.name)) commercialEntityTokens.add(t)
  const businessEvidenceTokens = new Set<string>(commercialEntityTokens)
  for (const s of [...projectFocus, ...tracked, ...keywordResearch.map((k) => k.query)]) for (const t of contentTokens(s)) businessEvidenceTokens.add(t)
  // EXPLICIT owned business-model evidence — ONLY genuinely COMMERCIAL/OPERATIONAL owned
  // entity types that prove the business offers the model (product / category / service),
  // plus tracked keywords + a project focus DERIVED FROM COMMERCIAL ENTITIES ONLY. A post /
  // article / generic page / homepage / existing article title must NEVER authorize a
  // used-goods or specialist-legal expansion — neither directly nor by leaking through the
  // full project focus (which is derived from every owned category incl. article titles).
  // Keyword-research queries are excluded too (search volume is not business evidence).
  const OWNED_COMMERCIAL_TYPES = new Set<EntityPageType>(['product', 'category', 'service'])
  const commercialEntityNames = entities.filter((e) => e.type != null && OWNED_COMMERCIAL_TYPES.has(e.type)).map((e) => e.name)
  const commercialFocus = deriveProjectFocus({ projectName: p.business_name, domain: p.target_domain, ownedCategories: commercialEntityNames, existingTopics: [] })
  const explicitBusinessEvidenceTokens = new Set<string>()
  for (const name of commercialEntityNames) for (const t of contentTokens(name)) explicitBusinessEvidenceTokens.add(t)
  for (const s of [...tracked, commercialFocus.primaryProjectFocus, ...commercialFocus.secondaryProjectAreas].filter(Boolean)) for (const t of contentTokens(s)) explicitBusinessEvidenceTokens.add(t)
  // PROVENANCE — which INDEPENDENT source contributed each evidence token, so a
  // coverage document cannot corroborate its OWN unmatched entity (a horse article
  // placing "סוסים" in the vocab and then proving it is on-domain). Per-source keys
  // match the coverage docs' sourceKey below.
  const evidenceProvenance = new Map<string, Set<string>>()
  const addProvenance = (text: string, source: string) => { for (const t of contentTokens(text)) { let set = evidenceProvenance.get(t); if (!set) evidenceProvenance.set(t, set = new Set()); set.add(source) } }
  addProvenance(p.business_name ?? '', 'business')
  for (const e of entities) addProvenance(e.name, `entity:${normalizeText(e.name)}`)
  for (const s of projectFocus) addProvenance(s, 'focus')
  for (const k of tracked) addProvenance(k, 'tracked')
  for (const k of keywordResearch.map((kr) => kr.query)) addProvenance(k, 'kr')
  for (const c of publishedCoverage) addProvenance(c, `cov:${normalizeText(c)}`)
  const existingPageTitles = [...entities.map((e) => e.name), ...ineligiblePageTitles, ...publishedCoverage]
  // Existing-content docs for synonym-aware cannibalization (P0-2): EVERY exact
  // owner known to keyword-guard / pending / indexed content must ALSO participate
  // in synonym-aware need ownership — published article/topic titles + owned entity
  // pages + link candidates + pending ideas + guard keyword/entity owners. A
  // synonym owner ("תוספי תזונה" ⇄ "תוספי מזון") that the EXACT guard blocks must
  // still block the synonym topic here; an owner page can never be a mere support link.
  const existingCoverageDocs: ExistingCoverageDoc[] = dedupeCoverageDocs([
    ...publishedCoverage.map((title) => ({ title, type: 'article' as const, sourceKey: `cov:${normalizeText(title)}` })),
    ...entities.map((e) => ({ title: e.name, url: e.url ?? null, type: e.type, sourceKey: `entity:${normalizeText(e.name)}` })),
    ...linkCandidates.map((c) => ({ title: c.title, url: c.url, type: c.type, sourceKey: `entity:${normalizeText(c.title)}` })),
    ...pendingCoverageDocs,
    // Keyword-guard / entity owners are keyword STRINGS (no resolvable page) — they
    // may block a duplicate but are UNRESOLVED bases (type/url null).
    ...Array.from(guard.keywords).map((k) => ({ title: k, type: null, sourceKey: `guard:${normalizeText(k)}` })),
    ...Array.from(guard.entityOwners).map((k) => ({ title: k, type: null, sourceKey: `entity:${normalizeText(k)}` })),
  ])

  // Blog-article DUPLICATE corpus (Blocker 2) — TRUE informational article sources ONLY:
  // pending content_topic_ideas + generated_articles + article_topics + indexed pages whose
  // explicit scanner role is a real article/post. Generic 'page' (WordPress pages / service
  // pages / homepage), and product/category/service entities, are NEVER blog-article
  // duplicates (ownership / cannibalization handle those, unchanged). Article sources carry
  // the 'informational' cluster so the narrow head+need rule matches informational needs.
  const INDEXED_ARTICLE_TYPES = new Set<EntityPageType>(['post', 'article'])
  const blogDuplicateSignatures: { sig: TopicSignature; source: 'pending' | 'generated' | 'article_topic' | 'indexed_article' }[] = [
    ...pendingSignatures.map((sig) => ({ sig, source: 'pending' as const })),
    ...generatedArticleTitles.map((t) => ({ sig: topicSignature(t, 'informational'), source: 'generated' as const })),
    ...articleTopicTitles.map((t) => ({ sig: topicSignature(t, 'informational'), source: 'article_topic' as const })),
    ...entities.filter((e) => e.type != null && INDEXED_ARTICLE_TYPES.has(e.type)).map((e) => ({ sig: topicSignature(e.name, 'informational'), source: 'indexed_article' as const })),
  ]

  // ── 3) Deterministic brief pool (pre-AI validation inside) ──────────────────
  // Brief subjects must come from REAL evidence: category-derived focus areas
  // qualify, but the name+domain fallback label (used only when a project has no
  // entities) is an identifier, not a user need — it must never become a brief.
  const projectFocusForBriefs = entities.length > 0 ? projectFocus : []
  const { pool, diagnostics: briefPool } = buildBriefPool({
    language,
    keywordResearch,
    trackedKeywords: tracked,
    projectFocus: projectFocusForBriefs,
    entities,
    publishedCoverage,
    pendingExactKeys,
    pendingSignatures,
    isOwnedByEntity: (phrase) => ownedByExistingEntity(guard, phrase),
    isCoveredByContent: (title, keyword) => coveredByExistingContent(guard, title, keyword),
    domainTypeWords,
    attributeTokens,
  })

  // ── 4) Model path (explicit; downgrade always recorded, never silent) ────────
  const modelPath = await resolveRunModel(input.qualityMode ?? 'standard')
  const modelConfigHolder: { value: BriefRunDiagnostics['modelConfig'] } = { value: null }

  const ctx: ProjectContext = { projectName: p.business_name, domain: p.target_domain, language, primaryProjectFocus: focus.primaryProjectFocus, secondaryProjectAreas: focus.secondaryProjectAreas, ownedCategories: entities.map((e) => e.name).slice(0, 15), existingTopics: publishedCoverage.slice(0, 15) }
  const year = new Date().getFullYear()

  // Deterministic evidence-inventory diagnostics — fully determined by preparation
  // (no synthesis input), so it is computed ONCE here and reused verbatim by every
  // attempt's diagnostics.
  const evidenceInventory: BriefRunDiagnostics['evidence_inventory'] = {
    project_focus_terms: projectFocus.length,
    tracked_keywords: tracked.length,
    keyword_research_cache_rows: krCacheRows,
    keyword_research_queries: keywordResearch.length,
    search_volume_values: searchVolumeValues,
    site_scan_entities: siteScanEntities,
    shopify_entities: shopifyEntities,
    existing_informational_coverage: publishedCoverage.length,
    pending_topics: pendingCount,
    generated_articles: generatedArticles,
    competitor_queries_filtered: competitorQueriesFiltered,
    evidence_load_errors: loadErrors,
    ineligible_pages_excluded: ineligiblePageTitles.length,
    stale_index_excluded: staleIndexExcluded,
    kr_rows_loaded: krIngestion.rows_loaded,
    kr_rows_parsed: krIngestion.rows_parsed,
    kr_rows_skipped: krIngestion.rows_skipped,
    kr_items_skipped: krIngestion.items_skipped,
    kr_skipped_example_keys: krIngestion.skipped_example_keys,
    kr_live_fetched: krLiveFetched,
  }

  // ── 4a) Stage E3A — additive, flag-gated GSC evidence, BEFORE constrained discovery ──
  // Disabled → zero GSC reads, no mutation, and prioritizedPool = pool (byte-identical to
  // today). Enabled → eligible GSC content-gap opportunities are re-guarded, merged into an
  // existing normal brief (attaching provenance) or admitted as new GSC-origin briefs within
  // the accepted source budget, and the COMBINED normal+GSC pool passes through the SAME
  // priority + family-round-robin (no GSC-specific tier). This lets GSC fill a deficit so an
  // unnecessary constrained-discovery call is not spent, and lets a GSC brief reach a batch by
  // its own earned priority.
  const gscIntegration = await integrateGscBriefs({
    admin,
    projectId: input.projectId,
    userId: input.userId ?? '',
    enabled: isGscAutoRecommendationsEnabled(),
    targetCount: input.targetCount,
    existingPool: pool,
    isCoveredByContent: (subject) => coveredByExistingContent(guard, subject, subject),
    isOwnedByEntity: (subject) => ownedByExistingEntity(guard, subject),
    blogDuplicateSignatures,
  })
  const gscContributed = gscIntegration.gscBriefs.length > 0
  const prioritizedPool = gscContributed
    ? prioritizeBriefsForSynthesis([...pool, ...gscIntegration.gscBriefs], { pillars: buildBusinessPillars({ trackedKeywords: tracked, projectFocus: projectFocusForBriefs, entities }) })
    : pool

  // ── 4b) CONSTRAINED DISCOVERY (RC3) — ONE batched call, only for a deficit ──
  // Runs at the EXACT pre-split point: right after pool construction (now the COMBINED
  // normal+GSC pool), gated on the same deficit condition, accounted through the same
  // controller, augmenting the same workingPool. Discovery duplicate signatures are taken
  // from workingPool below, so they include admitted GSC briefs.
  let discovery: BriefRunDiagnostics['discovery'] = null
  const workingPool = [...prioritizedPool]
  const gscInput = gscIntegration.diagnostics
  gscInput.combinedPoolSizeBeforeDiscovery = workingPool.length
  gscInput.discoveryDeficitAfterGsc = Math.max(0, input.targetCount - workingPool.length)
  // Discovery is skipped-thanks-to-GSC when the normal pool alone was below target but the
  // combined normal+GSC pool reaches it.
  gscInput.discoverySkippedBecauseGscFilledDeficit = gscInput.enabled && pool.length < input.targetCount && workingPool.length >= input.targetCount
  if (workingPool.length < input.targetCount && modelPath.model) {
    const deficit = input.targetCount - workingPool.length
    // Owned anchors: category/service/product names + real focus areas (exact strings).
    const anchorList = Array.from(new Set([
      ...entities.filter((e) => ['category', 'service', 'product'].includes(e.type ?? '')).map((e) => e.name),
      ...(entities.length > 0 ? projectFocus : []),
      ...tracked,
    ].map((a) => a.trim()).filter(Boolean))).slice(0, 30)
    if (anchorList.length > 0) {
      const dPrompt = buildDiscoveryPrompt({ language, ctx, year, deficit, anchors: anchorList, publishedTitles: publishedCoverage, pendingTitles: Array.from(pendingExactKeys).slice(0, 25) })
      const dRes = await generateRecommendationJSON(
        dPrompt,
        { temperature: 0.6, maxOutputTokens: Math.max(1024, deficit * 120 + 600), ...(modelPath.model ? { model: modelPath.model } : {}), responseSchema: discoveryResponseSchema(anchorList) },
        controller,
        { source: 'brief_discovery', callPurpose: 'discovery', requestedIdeaCount: deficit },
      )
      if (modelConfigHolder.value === null && dRes.modelConfig) modelConfigHolder.value = { model: dRes.modelConfig.model, thinkingMode: dRes.modelConfig.thinkingMode, thinkingBudget: dRes.modelConfig.thinkingBudget, maxOutputTokens: dRes.modelConfig.maxOutputTokens }
      if (!dRes.ok) {
        discovery = { ran: true, deficit, provider_ok: false, parse_failed: false, emitted: 0, invalid_items: 0, unknown_anchors: [], accepted: 0, rejected_by_reason: {}, rejected_examples: [], candidates: [] }
      } else {
        const dRec = reconcileDiscovery(dRes.text, anchorList)
        const dVal = validateDiscoveredCandidates(dRec.candidates, {
          anchors: new Set(anchorList),
          attributeTokens,
          brandSafety,
          isOwnedByEntity: (phrase) => ownedByExistingEntity(guard, phrase),
          isCoveredByContent: (title, keyword) => coveredByExistingContent(guard, title, keyword),
          pendingExactKeys,
          pendingSignatures,
          existingPoolSignatures: workingPool.map((b) => topicSignature(b.subject, b.intendedIntent)),
          keywordResearch,
          relatedEntitiesFor: (subject) => {
            const subToks = new Set(contentTokens(subject))
            return entities.filter((e) => contentTokens(e.name).some((t) => subToks.has(t))).map((e) => ({ name: e.name, url: e.url ?? null, type: e.type }))
          },
        })
        workingPool.push(...dVal.accepted.slice(0, deficit))
        discovery = {
          ran: true, deficit, provider_ok: true, parse_failed: dRec.parseFailed, emitted: dRec.emitted,
          invalid_items: dRec.invalidItems, unknown_anchors: dRec.unknownAnchors,
          accepted: Math.min(dVal.accepted.length, deficit), rejected_by_reason: dVal.rejected_by_reason,
          rejected_examples: dVal.rejected_examples,
          candidates: dRec.candidates.map((c) => ({ subject: c.subject.slice(0, 100), anchor: c.anchor.slice(0, 60) })),
        }
      }
    }
  }

  // GSC was integrated BEFORE discovery (§4a); record the post-discovery combined size.
  gscInput.combinedPoolSizeAfterDiscovery = workingPool.length

  return {
    input,
    language,
    langLabel,
    guard,
    gscInput,
    existingPages,
    coveredKeys,
    entities,
    linkCandidates,
    urlTypeMap,
    entityByTitle,
    corpusTypeWords,
    domainTypeWords,
    commercialEntityTokens,
    businessEvidenceTokens,
    explicitBusinessEvidenceTokens,
    blogDuplicateSignatures,
    evidenceProvenance,
    existingPageTitles,
    existingCoverageDocs,
    pendingExactKeys,
    pendingSignatures,
    /** Scope A — pending idea docs (title + focus keyword) for blocker resolution. */
    pendingCoverageDocs,
    brandSafety,
    keywordResearch,
    ctx,
    year,
    modelPath,
    /** modelConfig captured by the discovery call (null when discovery did not run
     *  or did not report a config); the first synthesis round fills it if still null. */
    modelConfig: modelConfigHolder.value,
    pool,
    workingPool,
    briefPool,
    discovery,
    evidenceInventory,
  }
}

/** Immutable snapshot of everything a synthesis attempt needs — built ONCE by
 *  prepareBriefRun (including the single constrained-discovery call). A Flash attempt
 *  and a Pro attempt synthesize from the identical snapshot; synthesizeFromSnapshot
 *  never mutates it (per-attempt state is rebuilt fresh each call). */
export type BriefRunSnapshot = Awaited<ReturnType<typeof prepareBriefRun>>

/**
 * Phase 2 (synthesize) — rebuilds per-attempt validation state, runs the adaptive
 * synthesis rounds against the snapshot's frozen workingPool, and assembles
 * diagnostics. This is the exact post-pool logic of the pre-split function (the
 * validation closures, the round loop, the reconciliation, the diagnostics return),
 * unchanged. It reads the snapshot but never writes it.
 */
export async function synthesizeFromSnapshot(
  snapshot: BriefRunSnapshot,
  controller: RunCostController,
  opts?: { modelOverride?: string | null },
): Promise<{ suggestions: TopicSuggestion[]; diagnostics: BriefRunDiagnostics }> {
  const {
    input, language, langLabel, guard, existingPages, coveredKeys, entities,
    linkCandidates, urlTypeMap, entityByTitle, corpusTypeWords, domainTypeWords,
    commercialEntityTokens, businessEvidenceTokens, evidenceProvenance,
    existingPageTitles, existingCoverageDocs, pendingExactKeys, pendingSignatures,
    pendingCoverageDocs, brandSafety, keywordResearch, ctx, year, modelPath, workingPool, briefPool,
    discovery, evidenceInventory,
  } = snapshot
  // Synthesis model: the snapshot's resolved model by default. The QA/admin smart-run
  // harness (Increment 4) passes a modelOverride so a Flash attempt and a Pro attempt
  // synthesize the SAME snapshot with different models. Omitting opts is byte-identical
  // to the pre-split behavior (the deterministic identity gate proves this).
  const effectiveModel: string | null = (opts?.modelOverride ?? modelPath.model) ?? null
  // Discovery may have captured the model config; the first synthesis round fills it
  // when still null — a FRESH per-attempt holder so attempts never share the field.
  const modelConfigHolder: { value: BriefRunDiagnostics['modelConfig'] } = { value: snapshot.modelConfig }

  const shadow_rejected_by_reason: Record<string, number> = {}
  const shadow = (r: string) => { shadow_rejected_by_reason[r] = (shadow_rejected_by_reason[r] ?? 0) + 1 }

  const rejected_by_reason: Record<string, number> = {}
  const rejectTopic = (r: string) => { rejected_by_reason[r] = (rejected_by_reason[r] ?? 0) + 1 }
  let secondaryKeywordsFiltered = 0
  const target_role_mappings: BriefRunDiagnostics['target_role_mappings'] = []

  // Deterministic user-visible reason — composed from STRUCTURED brief evidence.
  // Model prose never reaches the customer (malformed Hebrew / invented demand are
  // impossible by construction). Templates are grammatical function frames.
  const composeReason = (brief: OpportunityBrief, demand: DemandEvidence): string => {
    const parts: string[] = []
    if (language === 'he') {
      if (brief.existingContentGap) parts.push('הנושא משלים פער תוכן בתחום שהעסק עוסק בו.')
      else parts.push('הנושא מוסיף זווית חדשה לצד תוכן קיים באתר.')
      if (brief.relatedEntities.length > 0) parts.push('הוא נתמך בעמודים ובמוצרים קיימים באתר.')
      if (demand.demandEvidenceAvailable && (demand.avgMonthlySearches ?? 0) > 0) parts.push(`לפי מחקר מילות מפתח, ל"${demand.demandQuery}" יש כ־${demand.avgMonthlySearches} חיפושים חודשיים.`)
    } else {
      if (brief.existingContentGap) parts.push('This topic fills a content gap in an area the business covers.')
      else parts.push('This topic adds a fresh angle alongside existing site content.')
      if (brief.relatedEntities.length > 0) parts.push('It is supported by existing site pages and products.')
      if (demand.demandEvidenceAvailable && (demand.avgMonthlySearches ?? 0) > 0) parts.push(`Keyword research shows ~${demand.avgMonthlySearches} monthly searches for "${demand.demandQuery}".`)
    }
    return parts.join(' ')
  }

  // ── Scope A — blocker resolution (Preview/operator diagnostics ONLY) ─────────
  // These helpers translate a rejection into the concrete record/page/idea that
  // blocked it, WITHOUT touching the acceptance decision. They read the SAME guard
  // origins / entities / pending docs / coverage matches the gates already used.
  // A secondary phrase→origins index recovers a keyword blocker even when the guard
  // key normalized differently (guard origins are keyed by normalizeText; the
  // worthiness gate matches via normalizePhrase).
  const originsByPhrase = new Map<string, KeywordOriginEntry[]>()
  for (const [k, list] of guard.origins) { const p = normalizePhrase(k); if (p && !originsByPhrase.has(p)) originsByPhrase.set(p, list) }
  const guardOriginsOf = (kw: string): KeywordOriginEntry[] => {
    const direct = keywordOriginsOf(guard, kw)
    return direct.length ? direct : (originsByPhrase.get(normalizePhrase(kw)) ?? [])
  }
  const blockerFromOrigin = (kw: string): CandidateBlocker | null => {
    const o = guardOriginsOf(kw)[0]
    if (!o) return null
    return { blockingSource: o.source, blockingRecordStatus: o.status, blockingTitle: o.detail || null, blockingPrimaryKeyword: o.original || kw, blockingUrl: null, matchType: 'exact_keyword' }
  }
  const entityBlocker = (kw: string): CandidateBlocker | null => {
    const nk = normalizePhrase(kw)
    const e = entities.find((en) => normalizePhrase(en.name) === nk)
    if (e) return { blockingSource: 'entity', blockingRecordStatus: e.type ?? null, blockingTitle: e.name, blockingPrimaryKeyword: e.name, blockingUrl: e.url ?? null, matchType: 'entity_owner' }
    return blockerFromOrigin(kw)
  }
  const contentBlocker = (title: string, kw: string): CandidateBlocker | null => {
    const main = titleMainPhrase(title); const nk = normalizePhrase(kw)
    const doc = existingCoverageDocs.find((d) => { const dp = normalizePhrase(d.title); return (!!main && (dp === main || titleMainPhrase(d.title) === main)) || (!!nk && dp === nk) })
    if (!doc) return blockerFromOrigin(kw)
    const isArticle = doc.sourceKey?.startsWith('cov:') || doc.type === 'article' || doc.type === 'post'
    return { blockingSource: isArticle ? 'existing_article' : 'existing_content', blockingRecordStatus: null, blockingTitle: doc.title, blockingPrimaryKeyword: doc.focusKeyword ?? null, blockingUrl: doc.url ?? null, matchType: 'content_phrase' }
  }
  const pendingDocFor = (title: string, kw: string) => {
    const nk = normalizePhrase(kw); const nt = normalizePhrase(title)
    return pendingCoverageDocs.find((d) => normalizePhrase(d.title) === nk || normalizePhrase(d.focusKeyword ?? '') === nk || normalizePhrase(d.title) === nt) ?? null
  }

  /** Preview/operator-only rejection detail (SAFE — never article bodies/credentials). */
  interface RejectionDetail {
    stage: string
    blocker: CandidateBlocker | null
    matchedExistingContentTitle?: string | null
    matchedExistingContentUrl?: string | null
    matchedCommercialEntity?: string | null
    matchedPendingIdea?: string | null
    matchedSameRunAccepted?: string | null
    coverageMatchType?: string | null
  }
  type ValidateResult = { suggestion?: TopicSuggestion; rejectionReason?: string; repaired?: boolean; finalPrimaryKeyword?: string; finalIntent?: string; detail?: RejectionDetail }

  // ── Per-topic deterministic validation (+ brief-anchored repair) ────────────
  const acceptedSignatures: TopicSignature[] = []
  const acceptedNeeds: TopicNeed[] = []
  const validatePolished = (t: PolishedTopic, brief: OpportunityBrief): ValidateResult => {
    // Scope A — a rejection helper that ATTACHES the current final keyword/intent +
    // stage + blocker to the SAME typed rejectionReason the loop already reads. It
    // never changes the reason string, the order, or the control flow.
    const rej = (reason: string, stage: string, detail?: Partial<RejectionDetail>): ValidateResult => ({
      rejectionReason: reason,
      repaired,
      finalPrimaryKeyword: primaryKeyword,
      finalIntent: intent,
      detail: { stage, blocker: detail?.blocker ?? null, ...detail },
    })
    let repaired = false
    let primaryKeyword = t.primaryKeyword

    // EVIDENCE-FIRST invariant (before any other gate): the polished keyword must
    // serve ITS brief's subject. A keyword sharing NO distinctive token with the
    // brief (the injected-defect class: an off-subject or foreign phrase) is
    // re-anchored to the brief's own aligned query/subject — a complete real
    // phrase by construction, never a mid-clause slice.
    const briefTokens = new Set(distinctiveTokensOf(brief.subject).flatMap((tok) => canonicalVariants(tok)))
    const kwTokens = distinctiveTokensOf(primaryKeyword)
    if (kwTokens.length === 0 || !kwTokens.some((tok) => canonicalVariants(tok).some((v) => briefTokens.has(v)))) {
      primaryKeyword = brief.alignedDemandQuery?.query ?? brief.subject
      repaired = true
    }
    let intent = deriveIntent(primaryKeyword, t.title, (t.intent as ReturnType<typeof deriveIntent>) || brief.intendedIntent)

    // Brief-anchored keyword repair chain — NEVER a mid-clause slice: the aligned
    // query, then the brief subject, are complete real phrases by construction.
    const repairCandidates = [brief.alignedDemandQuery?.query, brief.subject].filter((x): x is string => !!x)
    const tryRepair = (): boolean => {
      for (const rc of repairCandidates) {
        if (normalizePhrase(rc) === normalizePhrase(primaryKeyword)) continue
        const q = validatePrimaryKeywordQuality(rc, t.title, corpusTypeWords)
        if (q.ok && !q.repairedKeyword) { primaryKeyword = rc; repaired = true; return true }
      }
      return false
    }

    // (1) keyword quality (truncation/generic) — repair from the BRIEF, not the title.
    const quality = validatePrimaryKeywordQuality(primaryKeyword, t.title, corpusTypeWords)
    if (!quality.ok) { if (!tryRepair()) return rej('invalid_primary_keyword', 'keyword_quality') }
    else if (quality.repairedKeyword) { primaryKeyword = quality.repairedKeyword; repaired = true }

    // (2) title–keyword–intent consistency (incl. the subject-HEAD rule).
    const consistency = validateIntentKeywordConsistency({ primaryKeyword, title: t.title, intent }, commercialEntityTokens)
    if (!consistency.ok) { if (!tryRepair()) return rej('intent_keyword_mismatch', 'title_keyword_intent') }
    else if (consistency.repairedKeyword) { primaryKeyword = consistency.repairedKeyword; repaired = true }
    intent = deriveIntent(primaryKeyword, t.title, intent)

    // (2.5) SEARCH-PHRASE normalization (P0-3): a primary keyword must be a
    // concise target QUERY, not the article headline. Strips headline framing,
    // rewrites "כמה עולה X" → "מחיר X"; falls back to the brief's aligned query
    // or subject when the residue is still headline-shaped. Never mid-clause.
    const sp = normalizeToSearchPhrase(primaryKeyword, { subject: brief.subject, alignedQuery: brief.alignedDemandQuery?.query ?? null })
    if (sp.changed) { primaryKeyword = sp.keyword; repaired = true; intent = deriveIntent(primaryKeyword, t.title, intent) }

    // (2.6) RE-VALIDATE the NORMALIZED keyword through the general gates. The
    // normalization can change the phrase after the (1)/(2) gates already ran, and
    // stripping a headline/guide tail may leave an over-broad residue (e.g.
    // "ויטמין D"). Rerun keyword-quality + intent-consistency + title alignment on
    // the FINAL keyword; repair from the brief's aligned query/subject when they
    // fail (preserving the title need), else reject.
    if (sp.changed) {
      const q2 = validatePrimaryKeywordQuality(primaryKeyword, t.title, corpusTypeWords)
      if (!q2.ok) { if (!tryRepair()) return rej('invalid_primary_keyword', 'keyword_quality_revalidate') }
      else if (q2.repairedKeyword) { primaryKeyword = q2.repairedKeyword; repaired = true }
      const c2 = validateIntentKeywordConsistency({ primaryKeyword, title: t.title, intent }, commercialEntityTokens)
      if (!c2.ok) { if (!tryRepair()) return rej('intent_keyword_mismatch', 'intent_consistency_revalidate') }
      else if (c2.repairedKeyword) { primaryKeyword = c2.repairedKeyword; repaired = true }
      if (!isTitleKeywordAligned(primaryKeyword, t.title)) { if (!tryRepair()) return rej('intent_keyword_mismatch', 'title_alignment_revalidate') }
      intent = deriveIntent(primaryKeyword, t.title, intent)
    }

    // (2.7) SUBJECT-PRESERVATION invariant — the FINAL keyword must keep a real
    // subject/entity token from the brief. A normalization/repair that collapsed
    // it to a year/adjective/guide residue ("שנת 2026") is repaired from the
    // aligned query → brief subject → concise title subject, else rejected.
    const alignedQ = brief.alignedDemandQuery?.query ?? null
    if (!keywordPreservesSubject(primaryKeyword, brief.subject, alignedQ)) {
      const subjectRepairs = [alignedQ, brief.subject, conciseSubject(t.title)].filter((x): x is string => !!x)
      const fixedTo = subjectRepairs.find((c) => keywordHasRealSubject(c) && isSearchPhraseQuality(c) && keywordPreservesSubject(c, brief.subject, alignedQ))
      if (!fixedTo) return rej('final_keyword_lost_subject', 'subject_preservation')
      primaryKeyword = fixedTo
      repaired = true
      intent = deriveIntent(primaryKeyword, t.title, intent)
    }
    if (!isSearchPhraseQuality(primaryKeyword)) return rej('primary_keyword_not_search_phrase', 'search_phrase_quality')

    // (2.8) FINAL TITLE↔KEYWORD ALIGNMENT — UNCONDITIONAL. Even when nothing above
    // changed the model's keyword, it can be OFF-SUBJECT vs the title ("מזכירות
    // חברה" under an office-cleaning-company title). Run the discriminative-core
    // alignment on the FINAL keyword and FINAL title, before coverage/demand. Repair
    // ONLY to an evidence-backed candidate (the brief's aligned demand query or
    // subject) that ITSELF aligns with the title AND preserves the brief subject;
    // else reject — never attach the rejected off-subject keyword's demand to the title.
    if (!isTitleKeywordAligned(primaryKeyword, t.title)) {
      const alignQ = brief.alignedDemandQuery?.query ?? null
      const alignRepairs = [alignQ, brief.subject].filter((x): x is string => !!x)
      const fixedTo = alignRepairs.find((c) => isTitleKeywordAligned(c, t.title) && isSearchPhraseQuality(c) && keywordHasRealSubject(c) && keywordPreservesSubject(c, brief.subject, alignQ))
      if (!fixedTo) return rej('title_keyword_mismatch', 'final_title_keyword_alignment')
      primaryKeyword = fixedTo
      repaired = true
      intent = deriveIntent(primaryKeyword, t.title, intent)
    }

    // (3) SAFE brand gate — exact named-entity mutation only (hard, proven safe).
    if (detectUnsafeNamedEntityMutation(t.title, primaryKeyword, brandSafety)) return rej('unsafe_named_entity_mutation', 'brand_safety', { blocker: { blockingSource: null, blockingRecordStatus: null, blockingTitle: t.title, blockingPrimaryKeyword: primaryKeyword, blockingUrl: null, matchType: 'named_entity_mutation' } })
    if (classifyKeywordEntity(primaryKeyword, brandSafety) === 'suspected_external_business') shadow('competitor_brand_leakage')

    // (4) ownership / coverage / cannibalization — ALWAYS on the FINAL keyword
    // (the old engine validated the pre-repair keyword only — proven gap).
    const w = evaluateArticleWorthiness({ primaryKeyword, title: t.title, secondaryKeywords: t.secondaryKeywords, intent, existingPages, hasEvidence: true, businessRelevant: true, coveredKeys })
    if (!w.ok) {
      const reason = w.rejection_reason || 'already_covered'
      // 'already_covered' = the FINAL keyword collides with a guard key (project/topic/
      // idea/scan keyword). This is the path an OLD status='rejected' idea blocks
      // through — the blocker carries that row's source + status + title, so it is
      // explicit whether a rejected idea (not a live page) caused the rejection.
      const blk = reason === 'already_covered' ? blockerFromOrigin(primaryKeyword) : null
      return rej(reason, 'article_worthiness', { blocker: blk, matchedExistingContentTitle: blk?.blockingTitle ?? null, matchedPendingIdea: blk?.blockingSource === 'idea_keyword' ? blk.blockingTitle : null })
    }
    if (ownedByExistingEntity(guard, primaryKeyword)) { const blk = entityBlocker(primaryKeyword); return rej('exact_existing_keyword_owner', 'entity_ownership', { blocker: blk, matchedCommercialEntity: blk?.blockingSource === 'entity' ? blk.blockingTitle : null }) }
    if (coveredByExistingContent(guard, t.title, primaryKeyword)) { const blk = contentBlocker(t.title, primaryKeyword); return rej('covered_by_existing_content', 'existing_content', { blocker: blk, matchedExistingContentTitle: blk?.blockingTitle ?? null, matchedExistingContentUrl: blk?.blockingUrl ?? null }) }

    // (4.5) EXISTING-CONTENT cannibalization (P0-2, synonym + NEED aware): an
    // existing page that already owns the need is not a NEW separate page. exact
    // keyword owner → reject; owns_need / improve → CONVERT to an
    // existing_page_improvement recommendation (never a separate landing page),
    // carrying the existing URL — the underlying search need is compared, not
    // exact wording (wedding-floral pricing: סידור vs עיצוב פרחוני).
    const cann = assessNeedCannibalization({ primaryKeyword, title: t.title, intent }, existingCoverageDocs, businessEvidenceTokens, evidenceProvenance, domainTypeWords)
    const coverageMatches: CoverageMatch[] = [...cann.matches]
    if (cann.matchType === 'exact') {
      const m = cann.matches[0]
      return rej('existing_content_owns_need', 'cannibalization', { blocker: m ? { blockingSource: 'existing_content', blockingRecordStatus: null, blockingTitle: m.existingTitle, blockingPrimaryKeyword: null, blockingUrl: m.url ?? null, matchType: 'exact' } : null, matchedExistingContentTitle: m?.existingTitle ?? null, matchedExistingContentUrl: m?.url ?? null, coverageMatchType: 'exact' })
    }
    // PAGE-ROLE / INTENT compatibility (ONE shared helper for EVERY conversion
    // path): existing_page_improvement requires an EXISTING basis whose page role
    // matches the DESIRED role of the opportunity's real need (a buy/category need
    // → commercial page; a price-guide/how-to → informational article even when the
    // coarse intent is transactional; a local service → service/location) AND that
    // resolves to an actual page. A title-only owner (keyword guard) may block a
    // duplicate but is not an actionable improvement.
    const desiredRole = desiredOpportunityRole(primaryKeyword, t.title, intent)
    const basisTypeOf = (m: CoverageMatch): EntityPageType | null => (m.basisPageType as EntityPageType | undefined) ?? (m.url ? (urlTypeMap.get(m.url.trim().toLowerCase().replace(/\/+$/, '')) ?? null) : null)
    const basisRoleFor = (m: CoverageMatch) => basisRoleOf(basisTypeOf(m), !!m.url)
    const isActionableBasis = (m: CoverageMatch) => isImprovementBasisCompatible(desiredRole, basisRoleFor(m))
    const ownsMatches = coverageMatches.filter((m) => m.matchType === 'owns_need' || m.matchType === 'improve')
    const cannibalImprovement = ownsMatches.some(isActionableBasis)
    // A SYNONYM near-duplicate of a title-only owner (keyword-guard / pending, no
    // resolvable page) blocks the DUPLICATE new article — but ONLY a genuine
    // same-need synonym ("תוספי מזון" ⇄ "תוספי תזונה"), NOT any broad owns_need
    // overlap, and only when roles are compatible (an informational owner does not
    // own a commercial buy need). Narrow by design, so distinct topics are not
    // over-rejected against broad title-only owners.
    const synonymOwner = (!cannibalImprovement && isImprovementBasisCompatible(desiredRole, 'informational'))
      ? ownsMatches.find((m) => basisRoleFor(m) === 'unresolved' && isSameNeedDuplicate({ primaryKeyword, title: t.title, intent }, { primaryKeyword: m.existingTitle, title: m.existingTitle, intent }, domainTypeWords))
      : undefined
    if (synonymOwner) {
      return rej('existing_content_owns_need', 'cannibalization_synonym', { blocker: { blockingSource: 'existing_content', blockingRecordStatus: null, blockingTitle: synonymOwner.existingTitle, blockingPrimaryKeyword: null, blockingUrl: synonymOwner.url ?? null, matchType: 'owns_need' }, matchedExistingContentTitle: synonymOwner.existingTitle, matchedExistingContentUrl: synonymOwner.url ?? null, coverageMatchType: 'owns_need' })
    }

    // (5) pending-idea ownership: exact + PROVEN high-confidence semantic only.
    const sig = topicSignature(primaryKeyword, intent)
    if (pendingExactKeys.has(normalizePhrase(primaryKeyword)) || pendingExactKeys.has(normalizePhrase(t.title))) {
      const doc = pendingDocFor(t.title, primaryKeyword)
      return rej('primary_keyword_exists', 'pending_exact', { blocker: { blockingSource: 'pending_idea', blockingRecordStatus: 'pending', blockingTitle: doc?.title ?? null, blockingPrimaryKeyword: doc?.focusKeyword ?? null, blockingUrl: null, matchType: 'pending' }, matchedPendingIdea: doc?.title ?? null })
    }
    if (pendingSignatures.some((ps) => isHighConfidenceDuplicate(sig, ps))) {
      const doc = pendingDocFor(t.title, primaryKeyword)
      return rej('pending_semantic_duplicate', 'pending_semantic', { blocker: { blockingSource: 'pending_idea', blockingRecordStatus: 'pending', blockingTitle: doc?.title ?? null, blockingPrimaryKeyword: doc?.focusKeyword ?? null, blockingUrl: null, matchType: 'pending_semantic' }, matchedPendingIdea: doc?.title ?? null })
    }
    // (6) within-run NEED dedupe: strict semantic dup OR same subject-head + same
    // coarse search-need (catches the transactional/informational price-page pair).
    const thisNeed: TopicNeed = { primaryKeyword, title: t.title, intent }
    const sameRunDup = acceptedNeeds.find((a) => isSameNeedDuplicate(thisNeed, a, domainTypeWords))
    if (sameRunDup) return rej('intra_run_need_duplicate', 'intra_run', { blocker: { blockingSource: 'intra_run_accepted', blockingRecordStatus: 'accepted', blockingTitle: sameRunDup.title, blockingPrimaryKeyword: sameRunDup.primaryKeyword, blockingUrl: null, matchType: 'same_run' }, matchedSameRunAccepted: sameRunDup.title })

    // (7) local ownership (existing local/commercial page already owns the intent)
    // + the coverage owns_need/improve signal → recommend improving the existing
    // page (never a separate landing page for a need an existing page owns).
    let ownershipPageType: RecommendedPageType | null = cannibalImprovement ? 'existing_page_improvement' : null
    if (intent === 'local' || intent === 'transactional') {
      const own = assessExistingLocalOwnership(primaryKeyword, t.title, existingPageTitles, domainTypeWords)
      // DISCRIMINATIVE-SUBTYPE contract (P0) — SAME as assessNeedCannibalization:
      // local-ownership overlap can be carried entirely by domain/condition tokens
      // ("שמלות … יד שנייה"), so a broad parent ("שמלות יד שנייה") would falsely own a
      // specific subtype ("שמלות כלה …"). Ownership here holds ONLY when the topic and
      // the matched page share a real CONCRETE head (domain words stripped) AND are not
      // incompatible subtypes. This is the COMMERCIAL/local path, so a genuine parent
      // category MAY still own a narrower subcategory (isNarrowerThanBroadParent, the
      // broad-INFORMATIONAL-article rule, is applied only in assessNeedCannibalization).
      const localBasisOwns = (basis: string): boolean =>
        sharesSubjectHead(`${primaryKeyword} ${t.title}`, basis, domainTypeWords) &&
        !hasIncompatibleSubtype(`${primaryKeyword} ${t.title}`, basis, domainTypeWords)
      if (own.outcome === 'owns' && own.matchedTitle && localBasisOwns(own.matchedTitle)) {
        const ent = entityByTitle.get(normalizeText(own.matchedTitle))
        return rej('exact_existing_keyword_owner', 'local_ownership', { blocker: { blockingSource: 'entity', blockingRecordStatus: ent?.type ?? null, blockingTitle: own.matchedTitle, blockingPrimaryKeyword: own.matchedTitle, blockingUrl: ent?.url ?? null, matchType: 'local_owner' }, matchedCommercialEntity: own.matchedTitle })
      }
      if (own.outcome === 'improve' && own.matchedTitle && localBasisOwns(own.matchedTitle)) {
        // Route through the SAME basis-compatibility helper: resolve the matched
        // title to its actionable entity (URL + page type) and require a compatible
        // role before converting to an existing_page_improvement.
        const ent = entityByTitle.get(normalizeText(own.matchedTitle))
        const br = basisRoleOf(ent?.type ?? null, !!ent?.url)
        if (isImprovementBasisCompatible(desiredRole, br)) {
          ownershipPageType = 'existing_page_improvement'
          if (!coverageMatches.some((m) => m.existingTitle === own.matchedTitle)) {
            coverageMatches.push({ existingTitle: own.matchedTitle, url: ent?.url ?? null, matchType: 'improve', score: own.overlap, sharedNeed: [], basisPageType: ent?.type ?? null })
          }
        }
      }
    }

    // (8) relevance diagnostics (briefs are evidence-backed BY CONSTRUCTION; these
    // stay shadow-only observability, consistent with Stabilization Phase 1).
    const relevance = assessBusinessRelevance({ primaryKeyword, title: t.title }, businessEvidenceTokens, domainTypeWords, entities.map((e) => ({ name: e.name })), intent)
    if (!relevance.ok) shadow(relevance.reason ?? 'low_business_relevance')

    const sec = filterSecondaryKeywords(primaryKeyword, t.title, t.secondaryKeywords, intent, domainTypeWords)
    secondaryKeywordsFiltered += sec.rejected.length

    // (9) demand — ONLY the brief's own aligned query may back a claim, and only
    // when it is NOT broader than the (normalized) primary keyword. A head-term
    // breadth mismatch (a broad query subset-contained in a narrower keyword) is
    // downgraded to supporting_only: internal ranking signal, never shown as this
    // topic's monthly volume (P1 — broad-query overstatement).
    let demandEvidence = computeDemandEvidence(primaryKeyword, sec.kept, brief.alignedDemandQuery ? [brief.alignedDemandQuery] : [], domainTypeWords)
    if (demandEvidence.demandEvidenceAvailable && demandEvidence.demandQuery && demandEvidence.demandMatchType !== 'exact') {
      const qToks = distinctiveTokensOf(demandEvidence.demandQuery)
      const kSet = new Set(distinctiveTokensOf(primaryKeyword).flatMap((t) => canonicalVariants(t)))
      const querySubset = qToks.length > 0 && qToks.every((t) => canonicalVariants(t).some((v) => kSet.has(v)))
      if (querySubset && qToks.length < distinctiveTokensOf(primaryKeyword).length) {
        demandEvidence = { ...demandEvidence, demandEvidenceAvailable: false, demandConfidence: 'none', demandMatchType: 'supporting_only' }
      }
    }
    const suggestionReason = composeReason(brief, demandEvidence)

    // (10) LINKS — mapped AFTER acceptance is already decided; can never reject
    // or degrade the topic. Zero links is a valid outcome. The role mapper's
    // output is then RE-FILTERED by the strict subject-head relevance contract
    // (P0-1): colour/adjective/occasion/generic overlap never qualifies; a page
    // that owns the informational need becomes a coverage signal, not a link.
    const mapped = mapLinkRoles(primaryKeyword, t.title, linkCandidates, { corpusTypeWords: domainTypeWords, intent })
    const rawPlan = buildLinkPlan(mapped)
    const filtered = filterLinkPlan(rawPlan, { primaryKeyword, title: t.title, intent }, { typeWords: domainTypeWords, isBoilerplate: isBoilerplatePage })
    const linkPlan = filtered.plan
    const linkDiagnostics = filtered.diagnostics

    // (10.5) NEED-OWNERSHIP over SUPPORT links: an informational support/source
    // page that already OWNS this topic's need is coverage, not a link. Re-run the
    // SAME synonym/head cannibalization on each support target; if one owns the
    // need, convert the topic to existing_page_improvement (carry its URL) and drop
    // the link — an owning page must never remain "merely a supporting link".
    const owningUrls = new Set<string>()
    let owningPage: { title: string; url: string | null; type: EntityPageType | null } | null = null
    for (const tg of [...linkPlan.supportingInformationalLinks, ...linkPlan.sourceReferences]) {
      const mt = assessNeedCannibalization({ primaryKeyword, title: t.title, intent }, [{ title: tg.title, url: tg.url, sourceKey: `entity:${normalizeText(tg.title)}` }], businessEvidenceTokens, evidenceProvenance, domainTypeWords).matchType
      if (mt !== 'owns_need' && mt !== 'exact') continue
      // Convert ONLY when the owning support page is a role-COMPATIBLE, actionable
      // basis (the same shared helper) — an informational page that owns a
      // COMMERCIAL topic's need may still SUPPORT it as a link, but cannot own it.
      const tgType = urlTypeMap.get(tg.url.trim().toLowerCase().replace(/\/+$/, '')) ?? null
      if (!isImprovementBasisCompatible(desiredRole, basisRoleOf(tgType, !!tg.url))) continue
      owningUrls.add(tg.url); if (!owningPage) owningPage = { title: tg.title, url: tg.url, type: tgType }
    }
    if (owningPage) {
      if (!ownershipPageType) ownershipPageType = 'existing_page_improvement'
      if (!coverageMatches.some((m) => m.existingTitle === owningPage!.title)) coverageMatches.push({ existingTitle: owningPage.title, url: owningPage.url, matchType: 'owns_need', score: 1, sharedNeed: [], basisPageType: owningPage.type })
      linkPlan.supportingInformationalLinks = linkPlan.supportingInformationalLinks.filter((tg) => !owningUrls.has(tg.url))
      linkPlan.sourceReferences = linkPlan.sourceReferences.filter((tg) => !owningUrls.has(tg.url))
    }

    // (10.6) FINAL basis-link removal (applied AFTER every late conversion above):
    // any page used as an exact/owns_need/improve BASIS for this
    // existing_page_improvement must never ALSO be emitted as an internal link.
    // Remove by canonical URL when available, with normalized-title fallback.
    if (ownershipPageType === 'existing_page_improvement') {
      const bases = coverageMatches.filter((m) => m.matchType === 'exact' || m.matchType === 'owns_need' || m.matchType === 'improve')
      const canon = (u: string | null | undefined) => (u || '').trim().toLowerCase().replace(/\/+$/, '')
      const basisUrls = new Set(bases.map((m) => canon(m.url)).filter(Boolean))
      const basisTitles = new Set(bases.map((m) => normalizeText(m.existingTitle)).filter(Boolean))
      const isBasis = (tg: { url: string; title: string }) => (!!canon(tg.url) && basisUrls.has(canon(tg.url))) || basisTitles.has(normalizeText(tg.title))
      linkPlan.supportingInformationalLinks = linkPlan.supportingInformationalLinks.filter((tg) => !isBasis(tg))
      linkPlan.sourceReferences = linkPlan.sourceReferences.filter((tg) => !isBasis(tg))
      linkPlan.secondaryCommercialTargets = linkPlan.secondaryCommercialTargets.filter((tg) => !isBasis(tg))
      if (linkPlan.primaryCommercialTarget && isBasis(linkPlan.primaryCommercialTarget)) linkPlan.primaryCommercialTarget = null
    }

    const primaryTargetType = linkPlan.primaryCommercialTarget ? (urlTypeMap.get(linkPlan.primaryCommercialTarget.url.trim().toLowerCase().replace(/\/+$/, '')) ?? null) : null
    if (target_role_mappings.length < 25) target_role_mappings.push({ keyword: primaryKeyword, primaryTarget: linkPlan.primaryCommercialTarget?.url ?? null, roles: mapped.assignments.slice(0, 7).map((a) => ({ url: a.url, role: a.role, score: a.score })) })
    const keywordEqualsProduct = existingPages.some((pg) => normalizeText(pg.name) === normalizeText(primaryKeyword))
    const recommendedPageType = ownershipPageType ?? classifyRecommendedPageType({ intent }, { primaryTargetType, keywordEqualsProduct })
    const orderedLinks = linkPlanToOrdered(linkPlan)

    const scan = scanSuggestionBrandSafety({ title: t.title, primaryKeyword, secondaryKeywords: sec.kept, suggestionReason, anchors: orderedLinks.map((l) => l.anchor), targetTitles: [] }, brandSafety)
    if (!scan.safe) shadow('competitor_brand_leakage')

    // Reason safety net: the composed reason is deterministic, but assert anyway.
    const finalReason = isMalformedReason(suggestionReason)
      ? (language === 'he' ? 'הנושא רלוונטי לתחום הפעילות של העסק ולביטויי החיפוש שנמצאו במחקר.' : 'The topic is relevant to the business and to the search terms found in research.')
      : suggestionReason

    acceptedSignatures.push(sig)
    acceptedNeeds.push(thisNeed)
    return {
      repaired,
      suggestion: {
        id: `opportunity:${slugKey(t.title)}`,
        title: t.title, primaryKeyword,
        secondaryKeywords: sec.kept, searchIntent: intent, recommendedWordCount: 1000, angle: '',
        suggestedInternalLinks: orderedLinks.map((l) => ({ url: l.url, anchor: l.anchor })),
        moneyTargetUrl: linkPlan.primaryCommercialTarget?.url ?? null,
        source: 'hybrid', suggestionReason: finalReason,
        suggestionScore: Number(Math.min(1, 0.5 + brief.briefScore * 0.5).toFixed(2)),
        confidenceLevel: brief.alignedDemandQuery ? 'high_confidence' : 'medium_confidence',
        discoveryGenerated: false,
        recommendedPageType, demandEvidence,
        businessRelevance: { score: relevance.score, relatedCommercialEntities: relevance.relatedCommercialEntities },
        linkPlan,
        modelUsed: effectiveModel ?? undefined,
        opportunityFamily: brief.family,
        // Preview-only diagnostics for the acceptance runner.
        linkDiagnostics,
        coverageMatches,
        normalizedPrimaryKeyword: primaryKeyword,
      },
    }
  }

  // ── 5) Adaptive synthesis rounds ─────────────────────────────────────────────
  const rounds: BriefRoundDiagnostics[] = []
  const suggestions: TopicSuggestion[] = []
  // Scope A — one accounting record per polished candidate. Bounded well above the
  // run target (targetCount ≤ 12; generated ≤ ~2 batches) so all real candidates are
  // captured; `outcomesCapped` flags the (never-in-practice) overflow so the invariant
  // stays honest. Additive — building it never affects acceptance or order.
  const MAX_CANDIDATE_OUTCOMES = 200
  const candidateOutcomes: CandidateOutcome[] = []
  let outcomesCapped = false
  const recordOutcome = (o: CandidateOutcome) => { if (candidateOutcomes.length < MAX_CANDIDATE_OUTCOMES) candidateOutcomes.push(o); else outcomesCapped = true }
  const baseOutcome = (t: PolishedTopic, brief: OpportunityBrief | undefined): CandidateOutcome => ({
    briefId: t.briefId ?? null,
    opportunityId: brief?.opportunityId ?? null,
    sourceFamily: brief?.family ?? null,
    briefSubject: brief?.subject ?? null,
    alignedDemandQuery: brief?.alignedDemandQuery?.query ?? null,
    modelTitle: t.title ?? null,
    modelPrimaryKeyword: t.primaryKeyword ?? null,
    finalPrimaryKeyword: t.primaryKeyword ?? null,
    keywordRepaired: false,
    finalIntent: null,
    outcome: 'rejected',
    rejectionReason: null,
    rejectionStage: null,
    blocker: null,
    matchedExistingContentTitle: null,
    matchedExistingContentUrl: null,
    matchedCommercialEntity: null,
    matchedPendingIdea: null,
    matchedSameRunAccepted: null,
    coverageMatchType: null,
  })
  const briefById = new Map(workingPool.map((b) => [b.opportunityId, b]))
  let cursor = 0
  // SOFT-priority consumption trace: which round + position consumed each brief (additive).
  const consumptionByBriefId = new Map<string, { consumedRound: number; roundPosition: number }>()
  let stop: BriefRunDiagnostics['stop_reason'] | null = null

  // ── Stage E3A FIX 1/2 — bounded GSC synthesis participation ───────────────────
  // The prepared workingPool is already globally prioritized (no GSC-specific tier). When the
  // normal pool is larger than the target, admitted GSC briefs sit below the consumed prefix
  // and never reach a batch. This lane gives at most TWO genuinely-new GSC briefs a controlled
  // trial in the FIRST batch, WITHOUT displacing or reordering any normal brief. When E3A is
  // off or no new GSC brief exists, the exact contiguous cursor/slice behavior (and
  // byte-identical batch IDs/output) is preserved.
  const MAX_TRIAL_GSC_BRIEFS = 2
  const e3aTrialActive = snapshot.gscInput.enabled && workingPool.some(isGscOriginBrief)
  const consumedIds = new Set<string>() // FIX 2 — a brief is consumed at most once across rounds
  let participationNaturalGscInFirstBatch = 0
  let participationAppendedIds: string[] = []

  // Paid-call cap: discovery + synthesis together may never exceed TWO calls.
  const maxSynthesisRounds = discovery?.ran ? 1 : MAX_ROUNDS

  if (workingPool.length === 0) stop = 'insufficient_inventory'

  for (let round = 1; round <= maxSynthesisRounds && !stop; round++) {
    const deficit = input.targetCount - suggestions.length
    if (deficit <= 0) { stop = 'target_reached'; break }
    // Batch size: the deficit + a small validation allowance (bounded) — never
    // "ask for 15 when 1 is missing".
    const batchSize = Math.min(workingPool.length - cursor, Math.max(4, Math.ceil(deficit * 1.5)))
    if (batchSize <= 0) { stop = suggestions.length > 0 ? 'true_pool_exhausted' : 'insufficient_inventory'; break }

    // Compose the batch (pure): natural contiguous slice + a bounded, non-displacing GSC trial
    // append in round 1. E3A-off / no-GSC → byte-identical contiguous slice.
    const comp = composeSynthesisBatch({ workingPool, cursor, batchSize, round, consumedIds, e3aTrialActive, maxTrialGscBriefs: MAX_TRIAL_GSC_BRIEFS })
    if (comp.exhausted) { stop = suggestions.length > 0 ? 'true_pool_exhausted' : 'insufficient_inventory'; break }
    const batch = comp.batch
    cursor = comp.nextCursor
    if (round === 1 && e3aTrialActive) { participationNaturalGscInFirstBatch = comp.naturalGscCount; participationAppendedIds = comp.appendedIds }
    batch.forEach((bb, pos) => { if (!consumptionByBriefId.has(bb.opportunityId)) consumptionByBriefId.set(bb.opportunityId, { consumedRound: round, roundPosition: pos }) })
    batch.forEach((bb) => consumedIds.add(bb.opportunityId))

    const prompt = buildBriefSynthesisPrompt(batch, ctx, langLabel, year)
    const res = await generateRecommendationJSON(
      prompt,
      { temperature: 0.4, maxOutputTokens: synthesisOutputBudget(batch.length), ...(effectiveModel ? { model: effectiveModel } : {}), responseSchema: briefSynthesisResponseSchema(batch.map((b) => b.opportunityId)) },
      controller,
      { source: 'brief_synthesis', callPurpose: round === 1 ? 'primary' : 'refill', requestedIdeaCount: batch.length },
    )
    const rd: BriefRoundDiagnostics = { round, model: res.modelUsed ?? effectiveModel, briefs_sent: batch.length, provider_ok: res.ok, provider_failed_briefs: 0, providerStatus: res.providerStatus ?? null, providerErrorType: res.errorType ?? null, sanitizedProviderMessage: res.errorMessage ?? null, finishReason: res.finishReason ?? null, textPresent: res.textPresent ?? false, textLength: res.textLength ?? 0, emitted: 0, polished: 0, skipped_by_model: 0, missing_from_response: 0, dropped_items: 0, not_processed: 0, accepted: 0, repaired: 0, rejected_by_reason: {}, marginal_yield: 0, synthesis_failure: null, synthesisResponse: null }
    rounds.push(rd)
    if (modelConfigHolder.value === null && res.modelConfig) modelConfigHolder.value = { model: res.modelConfig.model, thinkingMode: res.modelConfig.thinkingMode, thinkingBudget: res.modelConfig.thinkingBudget, maxOutputTokens: res.modelConfig.maxOutputTokens }
    if (res.stopped) { stop = 'budget_stopped'; break }
    if (!res.ok) {
      // The provider rejected the request before returning content — EVERY brief
      // in this batch is a provider failure, not a quality rejection.
      rd.provider_failed_briefs = batch.length
      stop = 'provider_failed'
      break
    }

    const rec = reconcileSynthesis(res.text, batch)
    rd.emitted = rec.emitted
    rd.polished = rec.polished.length
    rd.skipped_by_model = rec.skipped.length
    rd.missing_from_response = rec.missing.length
    rd.dropped_items = rec.droppedItems
    rd.synthesisResponse = rec.response
    // RC1 — a provider-SUCCESSFUL response that cannot honor the contract is a
    // TYPED synthesis failure, never "zero marginal topic quality".
    rd.synthesis_failure = classifySynthesisFailure(rec, batch.length)
    if (rd.synthesis_failure) { stop = 'synthesis_failed'; break }

    for (let idx = 0; idx < rec.polished.length; idx++) {
      const t = rec.polished[idx]
      const brief = briefById.get(t.briefId)
      if (!brief) {
        rd.dropped_items++
        // Scope A — a polished item whose brief is unknown is 'dropped' (a data
        // reconciliation bucket, never a quality rejection). Recorded so the
        // accounting still sees every generated candidate exactly once.
        recordOutcome({ ...baseOutcome(t, undefined), outcome: 'dropped', rejectionStage: 'brief_not_found' })
        continue
      }
      // Title-pattern diversity (SAFE, never artificial): when one mega-guide
      // title is already accepted, a later "המדריך המלא: X" is reduced to its
      // standalone core X — subject and keyword alignment preserved; anything
      // not safely strippable stays untouched (the acceptance rule reports it).
      const dedupedTitle = dedupeMegaGuideTitle(t.title, suggestions.map((s) => s.title))
      const polishedT = dedupedTitle === t.title ? t : { ...t, title: dedupedTitle }
      const r = validatePolished(polishedT, brief)
      if (r.suggestion) {
        suggestions.push(r.suggestion)
        rd.accepted++
        if (r.repaired) rd.repaired++
        recordOutcome({ ...baseOutcome(polishedT, brief), outcome: 'accepted', finalPrimaryKeyword: r.suggestion.primaryKeyword, finalIntent: r.suggestion.searchIntent ?? null, keywordRepaired: !!r.repaired })
      } else {
        const reason = r.rejectionReason || 'insufficient_independent_need'
        rd.rejected_by_reason[reason] = (rd.rejected_by_reason[reason] ?? 0) + 1
        rejectTopic(reason)
        recordOutcome({
          ...baseOutcome(polishedT, brief),
          outcome: 'rejected',
          finalPrimaryKeyword: r.finalPrimaryKeyword ?? polishedT.primaryKeyword ?? null,
          finalIntent: r.finalIntent ?? null,
          keywordRepaired: !!r.repaired,
          rejectionReason: reason,
          rejectionStage: r.detail?.stage ?? null,
          blocker: r.detail?.blocker ?? null,
          matchedExistingContentTitle: r.detail?.matchedExistingContentTitle ?? null,
          matchedExistingContentUrl: r.detail?.matchedExistingContentUrl ?? null,
          matchedCommercialEntity: r.detail?.matchedCommercialEntity ?? null,
          matchedPendingIdea: r.detail?.matchedPendingIdea ?? null,
          matchedSameRunAccepted: r.detail?.matchedSameRunAccepted ?? null,
          coverageMatchType: r.detail?.coverageMatchType ?? null,
        })
      }
      if (suggestions.length >= input.targetCount) {
        rd.not_processed = rec.polished.length - idx - 1
        // Scope A — polished items NOT validated because the target was reached
        // mid-response are recorded as 'not_processed' (a typed non-rejection), so
        // the accounting reconciles to the full generated count.
        for (let j = idx + 1; j < rec.polished.length; j++) {
          const nt = rec.polished[j]
          recordOutcome({ ...baseOutcome(nt, briefById.get(nt.briefId)), outcome: 'not_processed', rejectionStage: 'target_reached' })
        }
        break
      }
    }
    rd.marginal_yield = rd.briefs_sent > 0 ? Number((rd.accepted / rd.briefs_sent).toFixed(3)) : 0

    if (suggestions.length >= input.targetCount) { stop = 'target_reached'; break }
    if (rd.accepted === 0) { stop = suggestions.length > 0 ? 'zero_marginal_yield' : (cursor >= workingPool.length ? 'insufficient_inventory' : 'zero_marginal_yield'); break }
    if (cursor >= workingPool.length) { stop = suggestions.length > 0 ? 'true_pool_exhausted' : 'insufficient_inventory'; break }
  }
  // The loop ended without an in-loop stop only because the CALL CAP was reached
  // (a paid-call limit, NOT an exhausted pool) — this was the false pool_exhausted.
  if (!stop) stop = suggestions.length >= input.targetCount ? 'target_reached' : (cursor >= workingPool.length ? 'true_pool_exhausted' : 'call_cap_reached')

  // Brief-consumption reconciliation: consumed + remaining = effective pool size.
  const effectivePoolSize = workingPool.length
  // Stage E3A — count UNIQUE consumed briefs. The bounded GSC append means the natural cursor may
  // be 18 while 20 distinct briefs were actually consumed; the cursor undercounts. consumedBriefs +
  // remainingBriefs === effectivePoolSize always holds. Flag-off: consumptionByBriefId.size equals
  // the old cursor count (contiguous slices, each brief consumed once) → byte-identical diagnostics.
  const consumedBriefs = consumptionByBriefId.size
  const remainingBriefs = Math.max(0, effectivePoolSize - consumedBriefs)
  const summary = controller.summary()
  const totalPaidCalls = rounds.length + (discovery?.ran ? 1 : 0)
  const costTelemetry = controller.costTelemetry(suggestions.length)

  // Competitor leakage — GROUPED by location (P1). Rejected research/discovery
  // are diagnostics; any external business name in ACCEPTED output is a hard fail.
  const acceptedMatches: { field: string; value: string; token: string | null; evidence: string }[] = []
  const namedHit = (field: string, value: string): boolean => {
    const r = hasNamedExternalBusiness(value, brandSafety)
    if (r.hit) acceptedMatches.push({ field, value, token: r.token, evidence: r.evidence })
    return r.hit
  }
  const competitorLeakage = {
    researchRejected: keywordResearch.filter((k) => classifyKeywordEntity(k.query, brandSafety) === 'suspected_external_business').slice(0, 10).map((k) => k.query),
    discoveryRejected: Object.entries(discovery?.rejected_by_reason ?? {}).filter(([r]) => r === 'discovery_external_business').map(([, n]) => `${n}`),
    briefRejected: [] as string[],
    acceptedTitle: suggestions.filter((s) => namedHit('title', s.title)).map((s) => s.title),
    acceptedPrimaryKeyword: suggestions.filter((s) => namedHit('primaryKeyword', s.primaryKeyword)).map((s) => s.primaryKeyword),
    acceptedSecondaryKeyword: suggestions.flatMap((s) => (s.secondaryKeywords ?? []).filter((k) => namedHit('secondaryKeyword', k))),
    acceptedLinkTarget: suggestions.flatMap((s) => (s.suggestedInternalLinks ?? []).filter((l) => namedHit('linkTarget', l.anchor)).map((l) => l.anchor)),
    acceptedMatches,
  }
  // Stage E3A FIX 3 — truthful consumption/acceptance for GSC-origin briefs (opportunityId
  // 'gsc:…'). Derived from the SAME consumption map + candidate outcomes as every other brief;
  // GSC evidence merged into a normal brief keeps mergedIntoExistingCount (not counted here as a
  // new GSC-origin brief). The snapshot is never mutated (a fresh gscInput object is returned).
  const consumedGscBriefIds = workingPool.filter((b) => b.opportunityId.startsWith('gsc:') && consumptionByBriefId.has(b.opportunityId)).map((b) => b.opportunityId)
  const acceptedGscBriefIds = candidateOutcomes.filter((o) => o.outcome === 'accepted' && (o.opportunityId ?? '').startsWith('gsc:')).map((o) => o.opportunityId as string)
  // Stage E3A FIX 4 — truthful participation for GSC evidence MERGED into a normal brief. Each
  // record's consumed/accepted is derived from the SAME consumption map + accepted outcomes,
  // keyed by the matched normal brief id (never the raw GSC opportunity id).
  const mergedGscEvidence = (snapshot.gscInput.mergedGscEvidence ?? []).map((rec) => ({
    ...rec,
    consumed: consumptionByBriefId.has(rec.briefId),
    accepted: candidateOutcomes.some((o) => o.opportunityId === rec.briefId && o.outcome === 'accepted'),
  }))
  // Stage E3A FIX 4 — enrich per-brief detail records with synthesis-derived fields. finalOutcome
  // is resolved to the engine-determinable value here (not_consumed / rejected_by_engine / null);
  // the route layer fills the route/blog stages for engine-accepted (null) records via the
  // existing stage-aware finalCandidateOutcomes. A merely-selected brief is never marked consumed.
  const selectedGscBriefDetails = (snapshot.gscInput.selectedGscBriefDetails ?? []).map((d) => {
    const b = briefById.get(d.briefId)
    const c = consumptionByBriefId.get(d.briefId)
    const consumed = !!c
    const acceptedByEngine = candidateOutcomes.some((o) => o.opportunityId === d.briefId && o.outcome === 'accepted')
    const finalOutcome: SelectedGscBriefDetail['finalOutcome'] = !consumed ? 'not_consumed' : acceptedByEngine ? null : 'rejected_by_engine'
    return {
      ...d,
      priorityTier: b?.priority?.tier ?? null,
      finalSynthesisRank: b?.priority?.finalSynthesisRank ?? (b ? workingPool.indexOf(b) : null),
      consumed,
      consumedRound: c?.consumedRound ?? null,
      acceptedByEngine,
      finalOutcome,
    }
  })
  // Stage E3A FIX 5 — the REAL first-batch participation (reflects the actual batch, not admission).
  const anyNewGscBrief = workingPool.some(isGscOriginBrief)
  const participationMode: GscParticipation['participationMode'] =
    !snapshot.gscInput.enabled ? 'disabled'
      : !anyNewGscBrief ? 'no_gsc_briefs'
        : participationAppendedIds.length > 0 ? 'appended_trial'
          : 'natural'
  const gscParticipation: GscParticipation = {
    enabled: snapshot.gscInput.enabled,
    maxTrialBriefs: MAX_TRIAL_GSC_BRIEFS,
    naturalGscBriefCountInFirstBatch: participationNaturalGscInFirstBatch,
    appendedTrialBriefCount: participationAppendedIds.length,
    appendedTrialBriefIds: participationAppendedIds,
    totalGscBriefsConsumed: consumedGscBriefIds.length,
    participationMode,
  }
  // Distinct collapsed GSC need ids consumed in the FIRST-round participation lane. Each gsc: brief
  // is already one unique need (collapse ran before admission), so the two trial slots are two
  // different needs whenever ≥2 unique eligible needs exist.
  const trialDistinctNeedCount = new Set(workingPool.filter((b) => isGscOriginBrief(b) && consumptionByBriefId.get(b.opportunityId)?.consumedRound === 1).map((b) => b.opportunityId)).size
  const gscInputOut = { ...snapshot.gscInput, mergedGscEvidence, consumedGscBriefIds, consumedGscBriefCount: consumedGscBriefIds.length, acceptedGscBriefIds, acceptedGscSuggestionCount: acceptedGscBriefIds.length, selectedGscBriefDetails, gscParticipation, trialDistinctNeedCount }
  return {
    suggestions,
    diagnostics: {
      engine: 'evidence_first_briefs',
      // Stage E3A — GSC input summary (adapter+order counts from the snapshot, augmented with
      // truthful consumed/accepted here). Identical across the direct prepare→synthesize path
      // and generateFromBriefs.
      gscInput: gscInputOut,
      modelPath,
      modelConfig: modelConfigHolder.value,
      evidence_inventory: evidenceInventory,
      brief_pool: briefPool,
      synthesis_brief_trace: workingPool.map((bb, idx) => {
        const c = consumptionByBriefId.get(bb.opportunityId)
        return { opportunityId: bb.opportunityId, subject: bb.subject, priorityTier: bb.priority?.tier ?? null, finalSynthesisRank: bb.priority?.finalSynthesisRank ?? idx, consumed: !!c, consumedRound: c?.consumedRound ?? null, roundPosition: c?.roundPosition ?? null }
      }),
      discovery,
      rounds,
      candidateOutcomes,
      candidateAccounting: (() => {
        const generated = rounds.reduce((s, r) => s + r.polished, 0)
        const accepted = candidateOutcomes.filter((o) => o.outcome === 'accepted').length
        const rejected = candidateOutcomes.filter((o) => o.outcome === 'rejected').length
        const not_processed = candidateOutcomes.filter((o) => o.outcome === 'not_processed').length
        const dropped = candidateOutcomes.filter((o) => o.outcome === 'dropped').length
        return { generated, accepted, rejected, not_processed, dropped, outcomesCapped, reconciles: !outcomesCapped && generated === accepted + rejected + not_processed + dropped }
      })(),
      rejected_by_reason,
      shadow_rejected_by_reason,
      generated_opportunities: rounds.reduce((s, r) => s + r.polished, 0),
      finalCount: suggestions.length,
      // TOTAL paid calls: synthesis rounds + the (single) discovery call.
      model_calls: rounds.length + (discovery?.ran ? 1 : 0),
      stop_reason: stop,
      brief_consumption: { effectivePoolSize, consumedBriefs, remainingBriefs, callsRemaining: Math.max(0, 2 - totalPaidCalls) },
      insufficient_inventory: stop === 'insufficient_inventory',
      secondary_keywords_filtered: secondaryKeywordsFiltered,
      domainTypeWords: Array.from(domainTypeWords),
      target_role_mappings,
      competitorLeakage,
      cost: { totalCalls: summary.totalCalls, ...costTelemetry },
    },
  }
}

/**
 * Public entry — behavior-identical to the pre-split single function: prepare the
 * immutable snapshot (evidence → pool → the single discovery call) then synthesize
 * with the SAME controller. The deterministic fixture comparison
 * (reco-briefrun-snapshot-identity.qa) proves this path and the direct
 * prepare→synthesize path produce identical suggestions, order, diagnostics,
 * discovery decision/call-count, rejection reasons, round diagnostics, stop reason,
 * and model-call/cost reconciliation.
 */
export async function generateFromBriefs(
  admin: Admin,
  input: BriefRunInput,
  controller: RunCostController,
): Promise<{ suggestions: TopicSuggestion[]; diagnostics: BriefRunDiagnostics }> {
  const snapshot = await prepareBriefRun(admin, input, controller)
  return synthesizeFromSnapshot(snapshot, controller)
}
