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
 */

import type { createAdminClient } from '@/lib/supabase/admin'
import { getCachedIndex, reassembleReport } from '@/lib/content/wordpress-content-index'
import type { ScannedTarget } from '@/lib/content/wordpress-content-scan'
import { buildKeywordGuard, coveredByExistingContent, ownedByExistingEntity, normalizePhrase } from './keyword-guard'
import { flattenKeywordResearchCacheDetailed, contentTokens, type EntityNode, type KeywordResearchIngestion } from './evidence-cluster'
import { getCachedKeywordResults, setCachedKeywordResults } from '@/lib/content/keyword-research-cache'
import { generateKeywordIdeas } from '@/lib/google-ads/keyword-ideas'
import { evaluateArticleWorthiness, type ExistingPageSignal } from './opportunity'
import { mapLinkRoles, buildLinkPlan, linkPlanToOrdered, isBoilerplatePage, type LinkCandidateEntity, type EntityPageType } from './link-role-mapper'
import { filterLinkPlan } from './link-relevance'
import { assessNeedCannibalization, isSameNeedDuplicate, type ExistingCoverageDoc, type TopicNeed, type CoverageMatch } from './coverage'
import { validateIntentKeywordConsistency, validatePrimaryKeywordQuality, classifyRecommendedPageType, computeDemandEvidence, isMalformedReason, filterSecondaryKeywords, assessBusinessRelevance, assessExistingLocalOwnership, deriveCorpusTypeWords, deriveAttributeTokens, deriveIntent, type RecommendedPageType, type DemandEvidence } from './opportunity-validation'
import { buildBrandSafety, classifyKeywordEntity, containsExternalBusiness, detectUnsafeNamedEntityMutation, scanSuggestionBrandSafety, type BrandSafety } from './brand-safety'
import { generateRecommendationJSON } from './model'
import { resolveRunModel, type ModelPath, type ModelTier } from './model-select'
import { deriveProjectFocus, type ProjectContext } from './prompt-guidance'
import { slugKey } from './dedupe'
import { normalizeText, topicIdeaFingerprint } from './topic-idea-store'
import { buildBriefPool, type OpportunityBrief, type BriefPoolDiagnostics } from './opportunity-brief'
import { buildBriefSynthesisPrompt, reconcileSynthesis, synthesisOutputBudget, briefSynthesisResponseSchema, classifySynthesisFailure, type PolishedTopic, type SynthesisFailureType, type SynthesisResponseDiagnostics } from './brief-synthesis'
import { buildDiscoveryPrompt, discoveryResponseSchema, reconcileDiscovery, validateDiscoveredCandidates } from './constrained-discovery'
import { topicSignature, isHighConfidenceDuplicate, distinctiveTokensOf, canonicalVariants, type TopicSignature } from './semantic-dup'
import { dedupeMegaGuideTitle } from './title-diversity'
import { normalizeToSearchPhrase, isSearchPhraseQuality } from './search-phrase'
import type { RunCostController } from './run-cost-controller'
import type { TopicSuggestion } from './types'

type Admin = ReturnType<typeof createAdminClient>

/** Per-synthesis-round exact accounting (E-reconciliation):
 *  briefs_sent = polished + skipped_by_model + missing_from_response
 *              + provider_failed_briefs. Provider failures are NEVER quality
 *  rejections — they get their own bucket + typed cause. */
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
  accepted: number
  repaired: number
  rejected_by_reason: Record<string, number>
  marginal_yield: number
  /** RC1 — typed synthesis-contract failure on a provider-SUCCESSFUL response. */
  synthesis_failure: SynthesisFailureType | null
  /** RC1 — exact response diagnostics (Preview only; no prompt, no secrets). */
  synthesisResponse: SynthesisResponseDiagnostics | null
}

export interface BriefRunDiagnostics {
  engine: 'evidence_first_briefs'
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
  target_role_mappings: { keyword: string; primaryTarget: string | null; roles: { url: string; role: string; score: number }[] }[]
  /** Competitor leakage grouped by location — rejected evidence vs accepted output. */
  competitorLeakage: {
    researchRejected: string[]; discoveryRejected: string[]; briefRejected: string[]
    acceptedTitle: string[]; acceptedPrimaryKeyword: string[]; acceptedSecondaryKeyword: string[]; acceptedLinkTarget: string[]
  }
  cost: {
    estimatedRunCostUsd: number; totalCalls: number
    calls: { model: string; source: string; callPurpose: string; inputTokens: number; answerOutputTokens: number; thinkingTokens: number; totalBillableOutputTokens: number; estimatedCostUsd: number; success: boolean }[]
    totalPaidCalls: number; estimatedRunCostIls: number; costPerAcceptedTopic: number
    configuredCostCeilingUsd: number; remainingBudgetUsd: number; callsPreventedByBudget: number; configuredMaxCalls: number
  }
}

const MAX_ROUNDS = 2

export async function generateFromBriefs(
  admin: Admin,
  input: { projectId: string; targetCount: number; qualityMode?: ModelTier; userId?: string },
  controller: RunCostController,
): Promise<{ suggestions: TopicSuggestion[]; diagnostics: BriefRunDiagnostics }> {
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
  let generatedArticles = 0
  try { const { data } = await admin.from('generated_articles').select('title').eq('project_id', input.projectId); for (const r of (data ?? []) as { title: string | null }[]) if (r.title) { publishedCoverage.push(r.title); generatedArticles++ } } catch (e) { loadErrors.push(`generated_articles:${(e as Error)?.message?.slice(0, 60) ?? 'error'}`) }
  try { const { data } = await admin.from('article_topics').select('topic').eq('project_id', input.projectId); for (const r of (data ?? []) as { topic: string | null }[]) if (r.topic) publishedCoverage.push(r.topic) } catch (e) { loadErrors.push(`article_topics:${(e as Error)?.message?.slice(0, 60) ?? 'error'}`) }

  // PENDING ideas — SEPARATE identity (exact keys + signatures), never coverage.
  const pendingExactKeys = new Set<string>()
  const pendingSignatures: TopicSignature[] = []
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
  const existingPageTitles = [...entities.map((e) => e.name), ...ineligiblePageTitles, ...publishedCoverage]
  // Existing-content docs for synonym-aware cannibalization (P0-2): published
  // article/topic titles (informational need owners) + owned entity pages.
  const existingCoverageDocs: ExistingCoverageDoc[] = [
    ...publishedCoverage.map((title) => ({ title })),
    ...entities.map((e) => ({ title: e.name, url: e.url ?? null })),
  ]

  const shadow_rejected_by_reason: Record<string, number> = {}
  const shadow = (r: string) => { shadow_rejected_by_reason[r] = (shadow_rejected_by_reason[r] ?? 0) + 1 }

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

  // ── Per-topic deterministic validation (+ brief-anchored repair) ────────────
  const acceptedSignatures: TopicSignature[] = []
  const acceptedNeeds: TopicNeed[] = []
  const validatePolished = (t: PolishedTopic, brief: OpportunityBrief): { suggestion?: TopicSuggestion; rejectionReason?: string; repaired?: boolean } => {
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
    if (!quality.ok) { if (!tryRepair()) return { rejectionReason: 'invalid_primary_keyword' } }
    else if (quality.repairedKeyword) { primaryKeyword = quality.repairedKeyword; repaired = true }

    // (2) title–keyword–intent consistency (incl. the subject-HEAD rule).
    const consistency = validateIntentKeywordConsistency({ primaryKeyword, title: t.title, intent }, commercialEntityTokens)
    if (!consistency.ok) { if (!tryRepair()) return { rejectionReason: 'intent_keyword_mismatch' } }
    else if (consistency.repairedKeyword) { primaryKeyword = consistency.repairedKeyword; repaired = true }
    intent = deriveIntent(primaryKeyword, t.title, intent)

    // (2.5) SEARCH-PHRASE normalization (P0-3): a primary keyword must be a
    // concise target QUERY, not the article headline. Strips headline framing,
    // rewrites "כמה עולה X" → "מחיר X"; falls back to the brief's aligned query
    // or subject when the residue is still headline-shaped. Never mid-clause.
    const sp = normalizeToSearchPhrase(primaryKeyword, { subject: brief.subject, alignedQuery: brief.alignedDemandQuery?.query ?? null })
    if (sp.changed) { primaryKeyword = sp.keyword; repaired = true; intent = deriveIntent(primaryKeyword, t.title, intent) }
    if (!isSearchPhraseQuality(primaryKeyword)) return { rejectionReason: 'primary_keyword_not_search_phrase' }

    // (3) SAFE brand gate — exact named-entity mutation only (hard, proven safe).
    if (detectUnsafeNamedEntityMutation(t.title, primaryKeyword, brandSafety)) return { rejectionReason: 'unsafe_named_entity_mutation' }
    if (classifyKeywordEntity(primaryKeyword, brandSafety) === 'suspected_external_business') shadow('competitor_brand_leakage')

    // (4) ownership / coverage / cannibalization — ALWAYS on the FINAL keyword
    // (the old engine validated the pre-repair keyword only — proven gap).
    const w = evaluateArticleWorthiness({ primaryKeyword, title: t.title, secondaryKeywords: t.secondaryKeywords, intent, existingPages, hasEvidence: true, businessRelevant: true, coveredKeys })
    if (!w.ok) return { rejectionReason: w.rejection_reason || 'already_covered' }
    if (ownedByExistingEntity(guard, primaryKeyword)) return { rejectionReason: 'exact_existing_keyword_owner' }
    if (coveredByExistingContent(guard, t.title, primaryKeyword)) return { rejectionReason: 'covered_by_existing_content' }

    // (4.5) EXISTING-CONTENT cannibalization (P0-2, synonym + need aware): an
    // existing page that already owns the need is not a new article. owns_need →
    // reject; improve → recommend improving the existing page (not a new article).
    const cann = assessNeedCannibalization({ primaryKeyword, title: t.title, intent }, existingCoverageDocs)
    const coverageMatches: CoverageMatch[] = cann.matches
    if (cann.matchType === 'exact' || cann.matchType === 'owns_need') return { rejectionReason: 'existing_content_owns_need' }

    // (5) pending-idea ownership: exact + PROVEN high-confidence semantic only.
    const sig = topicSignature(primaryKeyword, intent)
    if (pendingExactKeys.has(normalizePhrase(primaryKeyword)) || pendingExactKeys.has(normalizePhrase(t.title))) return { rejectionReason: 'primary_keyword_exists' }
    if (pendingSignatures.some((ps) => isHighConfidenceDuplicate(sig, ps))) return { rejectionReason: 'pending_semantic_duplicate' }
    // (6) within-run NEED dedupe: strict semantic dup OR same subject-head + same
    // coarse search-need (catches the transactional/informational price-page pair).
    const thisNeed: TopicNeed = { primaryKeyword, title: t.title, intent }
    if (acceptedNeeds.some((a) => isSameNeedDuplicate(thisNeed, a))) return { rejectionReason: 'intra_run_need_duplicate' }

    // (7) local ownership (existing local/commercial page already owns the intent)
    // + the coverage 'improve' signal → recommend improving the existing page.
    let ownershipPageType: RecommendedPageType | null = cann.matchType === 'improve' ? 'existing_page_improvement' : null
    if (intent === 'local' || intent === 'transactional') {
      const own = assessExistingLocalOwnership(primaryKeyword, t.title, existingPageTitles, domainTypeWords)
      if (own.outcome === 'owns') return { rejectionReason: 'exact_existing_keyword_owner' }
      if (own.outcome === 'improve') ownershipPageType = 'existing_page_improvement'
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
        modelUsed: modelPath.model ?? undefined,
        opportunityFamily: brief.family,
        // Preview-only diagnostics for the acceptance runner.
        linkDiagnostics,
        coverageMatches,
        normalizedPrimaryKeyword: primaryKeyword,
      },
    }
  }

  // ── 4b) CONSTRAINED DISCOVERY (RC3) — ONE batched call, only for a deficit ──
  let discovery: BriefRunDiagnostics['discovery'] = null
  const workingPool = [...pool]
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

  // ── 5) Adaptive synthesis rounds ─────────────────────────────────────────────
  const rounds: BriefRoundDiagnostics[] = []
  const suggestions: TopicSuggestion[] = []
  const briefById = new Map(workingPool.map((b) => [b.opportunityId, b]))
  let cursor = 0
  let stop: BriefRunDiagnostics['stop_reason'] | null = null

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
    const batch = workingPool.slice(cursor, cursor + batchSize)
    cursor += batchSize

    const prompt = buildBriefSynthesisPrompt(batch, ctx, langLabel, year)
    const res = await generateRecommendationJSON(
      prompt,
      { temperature: 0.4, maxOutputTokens: synthesisOutputBudget(batch.length), ...(modelPath.model ? { model: modelPath.model } : {}), responseSchema: briefSynthesisResponseSchema(batch.map((b) => b.opportunityId)) },
      controller,
      { source: 'brief_synthesis', callPurpose: round === 1 ? 'primary' : 'refill', requestedIdeaCount: batch.length },
    )
    const rd: BriefRoundDiagnostics = { round, model: res.modelUsed ?? modelPath.model, briefs_sent: batch.length, provider_ok: res.ok, provider_failed_briefs: 0, providerStatus: res.providerStatus ?? null, providerErrorType: res.errorType ?? null, sanitizedProviderMessage: res.errorMessage ?? null, finishReason: res.finishReason ?? null, textPresent: res.textPresent ?? false, textLength: res.textLength ?? 0, emitted: 0, polished: 0, skipped_by_model: 0, missing_from_response: 0, dropped_items: 0, accepted: 0, repaired: 0, rejected_by_reason: {}, marginal_yield: 0, synthesis_failure: null, synthesisResponse: null }
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

    for (const t of rec.polished) {
      const brief = briefById.get(t.briefId)
      if (!brief) { rd.dropped_items++; continue }
      // Title-pattern diversity (SAFE, never artificial): when one mega-guide
      // title is already accepted, a later "המדריך המלא: X" is reduced to its
      // standalone core X — subject and keyword alignment preserved; anything
      // not safely strippable stays untouched (the acceptance rule reports it).
      const dedupedTitle = dedupeMegaGuideTitle(t.title, suggestions.map((s) => s.title))
      const r = validatePolished(dedupedTitle === t.title ? t : { ...t, title: dedupedTitle }, brief)
      if (r.suggestion) {
        suggestions.push(r.suggestion)
        rd.accepted++
        if (r.repaired) rd.repaired++
      } else {
        const reason = r.rejectionReason || 'insufficient_independent_need'
        rd.rejected_by_reason[reason] = (rd.rejected_by_reason[reason] ?? 0) + 1
        rejectTopic(reason)
      }
      if (suggestions.length >= input.targetCount) break
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
  const consumedBriefs = Math.min(cursor, effectivePoolSize)
  const remainingBriefs = Math.max(0, effectivePoolSize - consumedBriefs)
  const summary = controller.summary()
  const totalPaidCalls = rounds.length + (discovery?.ran ? 1 : 0)
  const costTelemetry = controller.costTelemetry(suggestions.length)

  // Competitor leakage — GROUPED by location (P1). Rejected research/discovery
  // are diagnostics; any external business name in ACCEPTED output is a hard fail.
  const competitorLeakage = {
    researchRejected: keywordResearch.filter((k) => classifyKeywordEntity(k.query, brandSafety) === 'suspected_external_business').slice(0, 10).map((k) => k.query),
    discoveryRejected: Object.entries(discovery?.rejected_by_reason ?? {}).filter(([r]) => r === 'discovery_external_business').map(([, n]) => `${n}`),
    briefRejected: [] as string[],
    acceptedTitle: suggestions.filter((s) => containsExternalBusiness(s.title, brandSafety)).map((s) => s.title),
    acceptedPrimaryKeyword: suggestions.filter((s) => containsExternalBusiness(s.primaryKeyword, brandSafety)).map((s) => s.primaryKeyword),
    acceptedSecondaryKeyword: suggestions.flatMap((s) => (s.secondaryKeywords ?? []).filter((k) => containsExternalBusiness(k, brandSafety))),
    acceptedLinkTarget: suggestions.flatMap((s) => (s.suggestedInternalLinks ?? []).filter((l) => containsExternalBusiness(l.anchor, brandSafety)).map((l) => l.anchor)),
  }
  return {
    suggestions,
    diagnostics: {
      engine: 'evidence_first_briefs',
      modelPath,
      modelConfig: modelConfigHolder.value,
      evidence_inventory: {
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
      },
      brief_pool: briefPool,
      discovery,
      rounds,
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
      target_role_mappings,
      competitorLeakage,
      cost: { totalCalls: summary.totalCalls, ...costTelemetry },
    },
  }
}
