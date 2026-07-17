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
import { flattenKeywordResearchCache, contentTokens, type EntityNode } from './evidence-cluster'
import { evaluateArticleWorthiness, type ExistingPageSignal } from './opportunity'
import { mapLinkRoles, buildLinkPlan, linkPlanToOrdered, type LinkCandidateEntity, type EntityPageType } from './link-role-mapper'
import { validateIntentKeywordConsistency, validatePrimaryKeywordQuality, classifyRecommendedPageType, computeDemandEvidence, isMalformedReason, filterSecondaryKeywords, assessBusinessRelevance, assessExistingLocalOwnership, deriveCorpusTypeWords, deriveAttributeTokens, deriveIntent, type RecommendedPageType, type DemandEvidence } from './opportunity-validation'
import { buildBrandSafety, classifyKeywordEntity, detectUnsafeNamedEntityMutation, scanSuggestionBrandSafety, type BrandSafety } from './brand-safety'
import { generateRecommendationJSON } from './model'
import { resolveRunModel, type ModelPath, type ModelTier } from './model-select'
import { deriveProjectFocus, type ProjectContext } from './prompt-guidance'
import { slugKey } from './dedupe'
import { normalizeText, topicIdeaFingerprint } from './topic-idea-store'
import { buildBriefPool, type OpportunityBrief, type BriefPoolDiagnostics } from './opportunity-brief'
import { buildBriefSynthesisPrompt, reconcileSynthesis, synthesisOutputBudget, type PolishedTopic } from './brief-synthesis'
import { topicSignature, isHighConfidenceDuplicate, distinctiveTokensOf, canonicalVariants, type TopicSignature } from './semantic-dup'
import { dedupeMegaGuideTitle } from './title-diversity'
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
  }
  brief_pool: BriefPoolDiagnostics
  rounds: BriefRoundDiagnostics[]
  rejected_by_reason: Record<string, number>
  shadow_rejected_by_reason: Record<string, number>
  /** raw_generated = Σ rounds.polished (model output that entered validation). */
  generated_opportunities: number
  finalCount: number
  model_calls: number
  /** Truthful zero/low-yield classification. */
  stop_reason: 'target_reached' | 'pool_exhausted' | 'zero_marginal_yield' | 'insufficient_inventory' | 'provider_failed' | 'budget_stopped'
  insufficient_inventory: boolean
  secondary_keywords_filtered: number
  target_role_mappings: { keyword: string; primaryTarget: string | null; roles: { url: string; role: string; score: number }[] }[]
  cost: { estimatedRunCostUsd: number; totalCalls: number }
}

const MAX_ROUNDS = 2

export async function generateFromBriefs(
  admin: Admin,
  input: { projectId: string; targetCount: number; qualityMode?: ModelTier },
  controller: RunCostController,
): Promise<{ suggestions: TopicSuggestion[]; diagnostics: BriefRunDiagnostics }> {
  const loadErrors: string[] = []

  // ── 1) Evidence inventory (project-scoped; failures RECORDED, never silent) ──
  const { data: proj } = await admin.from('projects').select('business_name, target_domain, language, country').eq('id', input.projectId).maybeSingle()
  const p = (proj as { business_name: string | null; target_domain: string | null; language: string | null } | null) ?? { business_name: null, target_domain: null, language: null }
  const language: 'he' | 'en' = String(p.language || '').toLowerCase().startsWith('en') ? 'en' : 'he'
  const langLabel = language === 'he' ? 'Hebrew' : 'English'

  const guard = await buildKeywordGuard(admin, input.projectId)

  const tracked: string[] = []
  try { const { data } = await admin.from('tracking_targets').select('keyword').eq('project_id', input.projectId); for (const r of (data ?? []) as { keyword: string }[]) if (r.keyword) tracked.push(r.keyword) } catch (e) { loadErrors.push(`tracking_targets:${(e as Error)?.message?.slice(0, 60) ?? 'error'}`) }

  const keywordResearch: { query: string; volume?: number | null }[] = []
  let krCacheRows = 0
  try {
    // RECENCY-ORDERED (live defect: unordered limit(20) returned an arbitrary,
    // possibly stale subset of the research cache).
    const { data } = await admin.from('keyword_research_cache').select('results_json').eq('project_id', input.projectId).order('created_at', { ascending: false }).limit(20)
    const rows = (data ?? []) as { results_json: unknown }[]
    krCacheRows = rows.length
    keywordResearch.push(...flattenKeywordResearchCache(rows))
  } catch (e) { loadErrors.push(`keyword_research_cache:${(e as Error)?.message?.slice(0, 60) ?? 'error'}`) }
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
  for (const t of deriveAttributeTokens(entities.map((e) => e.name))) domainTypeWords.add(t)
  const commercialEntityTokens = new Set<string>()
  for (const e of entities) for (const t of contentTokens(e.name)) commercialEntityTokens.add(t)
  const businessEvidenceTokens = new Set<string>(commercialEntityTokens)
  for (const s of [...projectFocus, ...tracked, ...keywordResearch.map((k) => k.query)]) for (const t of contentTokens(s)) businessEvidenceTokens.add(t)
  const existingPageTitles = [...entities.map((e) => e.name), ...ineligiblePageTitles, ...publishedCoverage]

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
  })

  // ── 4) Model path (explicit; downgrade always recorded, never silent) ────────
  const modelPath = await resolveRunModel(input.qualityMode ?? 'standard')

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

    // (3) SAFE brand gate — exact named-entity mutation only (hard, proven safe).
    if (detectUnsafeNamedEntityMutation(t.title, primaryKeyword, brandSafety)) return { rejectionReason: 'unsafe_named_entity_mutation' }
    if (classifyKeywordEntity(primaryKeyword, brandSafety) === 'suspected_external_business') shadow('competitor_brand_leakage')

    // (4) ownership / coverage / cannibalization — ALWAYS on the FINAL keyword
    // (the old engine validated the pre-repair keyword only — proven gap).
    const w = evaluateArticleWorthiness({ primaryKeyword, title: t.title, secondaryKeywords: t.secondaryKeywords, intent, existingPages, hasEvidence: true, businessRelevant: true, coveredKeys })
    if (!w.ok) return { rejectionReason: w.rejection_reason || 'already_covered' }
    if (ownedByExistingEntity(guard, primaryKeyword)) return { rejectionReason: 'exact_existing_keyword_owner' }
    if (coveredByExistingContent(guard, t.title, primaryKeyword)) return { rejectionReason: 'covered_by_existing_content' }

    // (5) pending-idea ownership: exact + PROVEN high-confidence semantic only.
    const sig = topicSignature(primaryKeyword, intent)
    if (pendingExactKeys.has(normalizePhrase(primaryKeyword)) || pendingExactKeys.has(normalizePhrase(t.title))) return { rejectionReason: 'primary_keyword_exists' }
    if (pendingSignatures.some((ps) => isHighConfidenceDuplicate(sig, ps))) return { rejectionReason: 'pending_semantic_duplicate' }
    // (6) within-run semantic dedupe (the multiple-magnesium defect class).
    if (acceptedSignatures.some((as) => isHighConfidenceDuplicate(sig, as))) return { rejectionReason: 'intra_run_semantic_duplicate' }

    // (7) local ownership (existing local/commercial page already owns the intent).
    let ownershipPageType: RecommendedPageType | null = null
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

    // (9) demand — ONLY the brief's own aligned query may back a claim.
    const demandEvidence = computeDemandEvidence(primaryKeyword, sec.kept, brief.alignedDemandQuery ? [brief.alignedDemandQuery] : [], domainTypeWords)
    const suggestionReason = composeReason(brief, demandEvidence)

    // (10) LINKS — mapped AFTER acceptance is already decided; can never reject
    // or degrade the topic. Zero links is a valid outcome.
    const mapped = mapLinkRoles(primaryKeyword, t.title, linkCandidates, { corpusTypeWords: domainTypeWords, intent })
    const linkPlan = buildLinkPlan(mapped)
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
      },
    }
  }

  // ── 5) Adaptive synthesis rounds ─────────────────────────────────────────────
  const rounds: BriefRoundDiagnostics[] = []
  let modelConfig: BriefRunDiagnostics['modelConfig'] = null
  const suggestions: TopicSuggestion[] = []
  const briefById = new Map(pool.map((b) => [b.opportunityId, b]))
  let cursor = 0
  let stop: BriefRunDiagnostics['stop_reason'] | null = null

  if (pool.length === 0) stop = 'insufficient_inventory'

  for (let round = 1; round <= MAX_ROUNDS && !stop; round++) {
    const deficit = input.targetCount - suggestions.length
    if (deficit <= 0) { stop = 'target_reached'; break }
    // Batch size: the deficit + a small validation allowance (bounded) — never
    // "ask for 15 when 1 is missing".
    const batchSize = Math.min(pool.length - cursor, Math.max(4, Math.ceil(deficit * 1.5)))
    if (batchSize <= 0) { stop = suggestions.length > 0 ? 'pool_exhausted' : 'insufficient_inventory'; break }
    const batch = pool.slice(cursor, cursor + batchSize)
    cursor += batchSize

    const prompt = buildBriefSynthesisPrompt(batch, ctx, langLabel, year)
    const res = await generateRecommendationJSON(
      prompt,
      { temperature: 0.4, maxOutputTokens: synthesisOutputBudget(batch.length), ...(modelPath.model ? { model: modelPath.model } : {}) },
      controller,
      { source: 'brief_synthesis', callPurpose: round === 1 ? 'primary' : 'refill', requestedIdeaCount: batch.length },
    )
    const rd: BriefRoundDiagnostics = { round, model: res.modelUsed ?? modelPath.model, briefs_sent: batch.length, provider_ok: res.ok, provider_failed_briefs: 0, providerStatus: res.providerStatus ?? null, providerErrorType: res.errorType ?? null, sanitizedProviderMessage: res.errorMessage ?? null, finishReason: res.finishReason ?? null, textPresent: res.textPresent ?? false, textLength: res.textLength ?? 0, emitted: 0, polished: 0, skipped_by_model: 0, missing_from_response: 0, dropped_items: 0, accepted: 0, repaired: 0, rejected_by_reason: {}, marginal_yield: 0 }
    rounds.push(rd)
    if (modelConfig === null && res.modelConfig) modelConfig = { model: res.modelConfig.model, thinkingMode: res.modelConfig.thinkingMode, thinkingBudget: res.modelConfig.thinkingBudget, maxOutputTokens: res.modelConfig.maxOutputTokens }
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
    if (rd.accepted === 0) { stop = suggestions.length > 0 ? 'zero_marginal_yield' : (cursor >= pool.length ? 'insufficient_inventory' : 'zero_marginal_yield'); break }
    if (cursor >= pool.length) { stop = suggestions.length > 0 ? 'pool_exhausted' : 'insufficient_inventory'; break }
  }
  if (!stop) stop = suggestions.length >= input.targetCount ? 'target_reached' : (suggestions.length > 0 ? 'pool_exhausted' : 'insufficient_inventory')

  const summary = controller.summary()
  return {
    suggestions,
    diagnostics: {
      engine: 'evidence_first_briefs',
      modelPath,
      modelConfig,
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
      },
      brief_pool: briefPool,
      rounds,
      rejected_by_reason,
      shadow_rejected_by_reason,
      generated_opportunities: rounds.reduce((s, r) => s + r.polished, 0),
      finalCount: suggestions.length,
      model_calls: rounds.length,
      stop_reason: stop,
      insufficient_inventory: stop === 'insufficient_inventory',
      secondary_keywords_filtered: secondaryKeywordsFiltered,
      target_role_mappings,
      cost: { estimatedRunCostUsd: summary.estimatedRunCostUsd, totalCalls: summary.totalCalls },
    },
  }
}
