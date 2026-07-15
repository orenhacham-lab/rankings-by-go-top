/**
 * Content automation — POST /api/content/automation/recommendations
 *
 * Generate topic-idea suggestions for a project from one source
 * ('keyword' | 'project_data' | 'keyword_research_url'). Read-only: nothing is
 * persisted here — the caller approves selected ideas via the bulk route.
 *
 * Gated by ENABLE_CONTENT_AUTOMATION + project ownership.
 */

import { authContentProject, isContentAutomationEnabled } from '@/lib/content/api-auth'
import { generateRecommendations } from '@/lib/content/recommendations/engine'
import { generateOpportunities } from '@/lib/content/recommendations/generate-opportunities'
import { generateContentPlan } from '@/lib/content/recommendations/content-plan'
import { newRunCostController } from '@/lib/content/recommendations/run-cost-controller'
import type { RecommendationSource } from '@/lib/content/recommendations/types'
import { insertPendingIdeas, loadPendingIdeas, ideaToSuggestion, normalizeText, markIdeasDuplicate } from '@/lib/content/recommendations/topic-idea-store'
import { buildKeywordGuard, partitionPending, keywordSourcesOf, keywordOriginsOf, coveredByExistingContent, ownedByExistingEntity, type KeywordOriginEntry } from '@/lib/content/recommendations/keyword-guard'
import { evaluateArticleWorthiness, type ExistingPageSignal, type SearchIntent } from '@/lib/content/recommendations/opportunity'
import { salvageLongTailKeyword } from '@/lib/content/recommendations/keyword-salvage'
import { dedupeIntraRunSemantic } from '@/lib/content/recommendations/intra-run-dedupe'
import { ExistingCorpus } from '@/lib/content/recommendations/dedupe'
import { domainFlags } from '@/lib/content/recommendations/domain-flags'
import { BillingExhaustedError, RecommendationModelUnavailableError } from '@/lib/content/recommendations/model'
import { classifyRecoRun } from '@/lib/content/recommendations/run-classify'
import { runtimeInfo } from '@/lib/runtime-info'
import { randomUUID } from 'crypto'

// Node runtime (uses node:crypto for run ids + SHA-256 domain fingerprints).
export const runtime = 'nodejs'

/** In-flight run keys (project+source) for best-effort duplicate-click protection.
 *  Per server instance; released in a finally. Holds only opaque keys, no data. */
const INFLIGHT = new Set<string>()
/** Recently-completed idempotency keys (owner+project+source+clientRequestId) with
 *  a short TTL, so an immediate duplicate replay of the SAME click doesn't run a
 *  second time. Process-local (best-effort); a cross-instance guard needs a runs
 *  table — see the report's production blocker. */
const RECENT = new Map<string, number>()
const RECENT_TTL_MS = 30_000
function seenRecently(key: string): boolean {
  const now = Date.now()
  for (const [k, t] of RECENT) if (now - t > RECENT_TTL_MS) RECENT.delete(k)
  return RECENT.has(key)
}

/** Domain flags for a set of suggestions (titles + keywords) — Preview diagnostic. */
function suggestionsDomainFlags(items: { title: string; primaryKeyword: string }[]) {
  return domainFlags(items.map((s) => `${s.title} ${s.primaryKeyword}`).join(' \n '))
}

const SOURCES: RecommendationSource[] = ['keyword', 'project_data', 'keyword_research_url', 'site_scan', 'hybrid']

export async function POST(request: Request) {
  if (!isContentAutomationEnabled()) return Response.json({ error: 'Not found' }, { status: 404 })

  let body: Record<string, unknown>
  try {
    body = await request.json()
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const projectId = typeof body.projectId === 'string' ? body.projectId : null
  const source = typeof body.source === 'string' ? (body.source as RecommendationSource) : null
  const keyword = typeof body.keyword === 'string' ? body.keyword.trim() : ''
  // Isolation diagnostics — a server-generated immutable run id + the client's
  // request id (echoed back so the UI can reject a stale response for another
  // project). Preview-only debug is gated behind RECO_ISOLATION_DIAGNOSTICS.
  const generationRunId = randomUUID()
  const clientRequestId = typeof body.clientRequestId === 'string' ? body.clientRequestId : null
  const diagnostics = process.env.RECO_ISOLATION_DIAGNOSTICS === '1'
  const excludePendingContext = diagnostics && body.excludePendingContext === true
  // Premium (Pro curator) is NOT implemented yet — a premium request is explicitly
  // rejected (never silently downgraded to standard). Standard = Flash only.
  if (body.qualityMode === 'premium') {
    return Response.json({ suggestions: [], error: 'premium_not_available', meta: { source, reason: 'premium_not_available', qualityMode: 'premium', persisted: false, newlyAddedCount: 0 } }, { status: 400 })
  }
  const qualityMode: 'standard' = 'standard'

  const auth = await authContentProject(projectId)
  if ('error' in auth) return Response.json({ error: auth.error }, { status: auth.status })

  // Duplicate-click protection: reject a concurrent identical run for the same
  // project+source (idempotency) so one accidental double-click can't pay twice.
  // Idempotency: owner + project + source + clientRequestId. Two identical
  // requests (concurrent OR an immediate replay of the same click) must not both
  // call Gemini. A distinct clientRequestId is a new intentional run and is allowed.
  const idemKey = `${auth.user.id}:${auth.project.id}:${source}:${clientRequestId ?? 'none'}`
  const inflightKey = clientRequestId ? idemKey : `${auth.project.id}:${source}`
  const inFlightHit = INFLIGHT.has(inflightKey)
  const recentReplayHit = !!clientRequestId && seenRecently(idemKey)
  if (inFlightHit || recentReplayHit) {
    // J — an idempotency short-circuit is a DISTINCT typed 409 (never rendered as a
    // successful 0-new result). Echo which guard fired so a replay is diagnosable.
    return Response.json({ error: 'run_in_progress', reason: 'run_in_progress', inFlightHit, recentReplayHit, clientRequestId }, { status: 409 })
  }
  INFLIGHT.add(inflightKey)

  if (!source || !SOURCES.includes(source)) {
    return Response.json({ error: 'invalid_source', allowed: SOURCES }, { status: 400 })
  }
  if (source === 'keyword' && !keyword) {
    return Response.json({ error: 'keyword_required' }, { status: 400 })
  }

  try {
    // Build the exact-keyword guard FIRST so keyword-research can also skip
    // already-known clusters (avoidKeywords) — repeat runs surface fresh ones.
    const guard = await buildKeywordGuard(auth.admin, auth.project.id)

    // PRIMARY PATH — opportunity-first with quality-preserving RECOVERY TIERS: build
    // cross-source evidence clusters → Tier 1 (strict) → Tier 2 (broadened) → Tier 3
    // (controlled discovery), each validated deterministically with the SAME hard
    // gates, links role-mapped. Site entities are ownership/target signals, not article
    // seeds. Shared cost controller (no new call/cost ceilings; ≤3 tier calls).
    //
    // There is NO silent legacy fallback. The legacy source-first engine runs ONLY as
    // an explicit operational rollback (RECO_LEGACY_PATH=1). When it is not enabled a
    // zero result is a TYPED no_safe_opportunities returned inside the opportunity-first
    // architecture — legacy product-derived suggestions never reach the response.
    let opportunityDiagnostics: import('@/lib/content/recommendations/generate-opportunities').OpportunityDiagnostics | null = null
    let contentPlan: import('@/lib/content/recommendations/content-plan').ContentPlanResult['plan'] | null = null
    let generationPath: 'opportunity_first' | 'legacy_explicit' = 'opportunity_first'
    let legacyUsed = false
    let recoveryTierUsed: number | null = null
    let discoveryUsed = false
    let fallbackReason: string | null = null
    let result: Awaited<ReturnType<typeof generateRecommendations>>
    const useLegacy = process.env.RECO_LEGACY_PATH === '1'
    // Batched CONTENT-PLAN mode (C) — one operation returns a whole calendar. Evidence
    // is collected once and reused across a few family-scoped batched calls.
    const planModeReq = typeof body.mode === 'string' ? body.mode : null
    const requestedCount = typeof body.requestedCount === 'number' ? body.requestedCount : null
    const isPlanMode = !useLegacy && (['plan', 'plan_25', 'full_calendar', 'full_calendar_50', 'calendar'].includes((planModeReq ?? '').toLowerCase()) || (requestedCount ?? 0) >= 20)
    if (useLegacy) {
      // EXPLICIT operational rollback ONLY.
      generationPath = 'legacy_explicit'; legacyUsed = true; fallbackReason = 'explicit_legacy_mode'
      result = await generateRecommendations(auth.admin, { userId: auth.user.id, projectId: auth.project.id, source, keyword, avoidKeywords: Array.from(guard.keywords), generationRunId, collectTrace: diagnostics, excludePendingContext, qualityMode })
    } else if (isPlanMode) {
      const plan = await generateContentPlan(auth.admin, { projectId: auth.project.id, mode: planModeReq, requestedCount, generationRunId })
      opportunityDiagnostics = plan.opportunityDiagnostics
      contentPlan = plan.plan
      recoveryTierUsed = plan.opportunityDiagnostics.recoveryTierUsed
      discoveryUsed = plan.opportunityDiagnostics.discoveryUsed
      fallbackReason = plan.plan.shortfall_reason
      result = { suggestions: plan.suggestions, meta: { source, generated: plan.plan.candidate_count, skippedDuplicates: 0, finalCount: plan.suggestions.length, attempts: 1, reason: plan.suggestions.length === 0 ? 'no_safe_opportunities' : undefined, runtimeDiag: diagnostics ? { totalCalls: plan.plan.actual_calls, rawCandidates: plan.plan.candidate_count, path: 'opportunity_first', contentPlanMode: plan.plan.mode } : undefined } }
    } else {
      const controller = newRunCostController(qualityMode, generationRunId, 15)
      const opp = await generateOpportunities(auth.admin, { projectId: auth.project.id, targetCount: 15, maxClusters: 12 }, controller)
      opportunityDiagnostics = opp.diagnostics
      recoveryTierUsed = opp.diagnostics.recoveryTierUsed
      discoveryUsed = opp.diagnostics.discoveryUsed
      fallbackReason = opp.diagnostics.fallbackReason
      // ALWAYS use the opportunity-first result — even zero. NEVER call legacy here.
      result = { suggestions: opp.suggestions, meta: { source, generated: opp.diagnostics.generated_opportunities, skippedDuplicates: 0, finalCount: opp.suggestions.length, attempts: opp.diagnostics.tiers.length, reason: opp.suggestions.length === 0 ? 'no_safe_opportunities' : undefined, runtimeDiag: diagnostics ? { totalCalls: opp.diagnostics.model_calls, rawCandidates: opp.diagnostics.generated_opportunities, path: 'opportunity_first', recoveryTierUsed, discoveryUsed, fallbackReason } : undefined } }
    }
    // The authoritative generation-path contract exposed on every response (E). In
    // plan mode it also carries the content-plan funnel + cost + shortfall contract.
    const pathContract = { generationPath, legacyUsed, recoveryTierUsed, discoveryUsed, fallbackReason, contentPlan: contentPlan ?? null }

    // Part C — a run where EVERY attempted source failed at the provider (no raw
    // candidates were generated) is a typed PROVIDER error, never a successful
    // "0 new ideas" banner. A genuine empty (model_empty / all_duplicates / dedupe)
    // still returns normally, because reason is only 'model_error' when the calls
    // themselves failed. (Model-unavailable already threw a typed 503 above.)
    if (result.meta.reason === 'model_error' && (result.meta.generated ?? 0) === 0) {
      const { gitSha, vercelEnv } = runtimeInfo()
      console.error('[automation-recommendations] provider failure — all calls failed', { source, gitSha })
      return Response.json(
        { suggestions: [], ok: false, error: 'recommendation_provider_error', reason: 'recommendation_provider_error', message: 'שירות יצירת ההמלצות נכשל זמנית. יש לנסות שוב בעוד רגע.', meta: { source, reason: 'recommendation_provider_error', persisted: false, newlyAddedCount: 0, ...(diagnostics ? { isolationDebug: { gitSha, vercelEnv, generationRunId, runtimeClass: 'CALLS_FAILED', runtimeDiag: result.meta.runtimeDiag ?? null } } : {}) } },
        { status: 502 },
      )
    }

    // Phase 3F.3.1b — gentle EXACT primary-keyword + exact-title guard. Blocks a
    // suggestion whose normalized primary keyword already exists (project keyword,
    // topic keyword, generated-article topic keyword, persisted-idea keyword, or a
    // RELIABLE WordPress/site-scan focus keyword) OR whose exact normalized title
    // already exists. No fuzzy / contains / token-overlap — long-tail stays allowed.
    let filteredPrimaryKeywordExists = 0
    let filteredTitleExists = 0
    let filteredCoveredByContent = 0
    // Part 5 — keyword-collision classification (bare keyword equality is no longer
    // a permanent rejection; it is salvaged to a narrower long-tail when possible).
    let exactTopicDuplicates = 0
    let trueContentCoverage = 0
    let exactExistingKeywordOwner = 0
    // Opportunity-model deterministic layer (domain-neutral): an entity re-expressed
    // with no independent need added is a source-only expansion, not an opportunity.
    let sourceOnlyEntityExpansion = 0
    let cannibalizationReviews = 0
    // Existing indexed commercial-entity NAME signals (from the keyword guard's
    // entityOwners: scan product/category/page + Shopify entities). Used by the
    // article-worthiness gate for multi-signal cannibalization + expansion checks.
    const existingPages: ExistingPageSignal[] = Array.from(guard.entityOwners).map((n) => ({ name: n, pageType: 'unknown' as const }))
    let keywordCollisionCandidates = 0
    let keywordCollisionSalvaged = 0
    let keywordCollisionStillRejected = 0
    const salvagedExamples: { title: string; from: string; to: string }[] = []
    // A frozen-corpus semantic guard over OWNED keywords so a salvaged keyword can
    // never bypass semantic dedupe (Part 4.3 / Part 8.7).
    const ownedKeywordCorpus = new ExistingCorpus()
    for (const k of guard.keywords) ownedKeywordCorpus.add(k)
    const salvageChecks = {
      isOwnedKeyword: (nk: string) => guard.keywords.has(nk),
      isSemanticKeywordDup: (kw: string) => ownedKeywordCorpus.isDuplicate(kw),
      // A salvaged long-tail must ALSO not collide with an existing content phrase
      // OR the exact name of an existing indexed commercial entity (cannibalization).
      isCoveredByContent: (title: string, kw: string) => coveredByExistingContent(guard, title, kw) || ownedByExistingEntity(guard, kw),
    }
    const filteredExamples: { title: string; primaryKeyword: string; reason: string; sources: string[] }[] = []
    // Phase 3I.6 — PRODUCTION evidence for primary_keyword_exists rejections:
    // for each blocked idea, the exact originating row(s) of the blocking
    // keyword (source table, original keyword, row status, row title/URL) and
    // the exact rule. Owner-only response data; capped; returned only on runs
    // that added nothing new. This exists because zero-result runs were
    // undiagnosable in production (debug is dev-only).
    const primaryKeywordMatches: {
      ideaTitle: string
      ideaPrimaryKeyword: string
      normalizedPrimaryKeyword: string
      /** Site-scan ideas: the model's source context is embedded in the reason. */
      ideaSourceContext: string
      ideaSuggestedUrl: string | null
      rule: 'exact_normalized_primary_keyword'
      matches: KeywordOriginEntry[]
    }[] = []
    let fresh = result.suggestions.filter((s) => {
      const nt = normalizeText(s.title)
      let nk = normalizeText(s.primaryKeyword)
      const pushEx = (reason: string) => { if (filteredExamples.length < 10) filteredExamples.push({ title: s.title, primaryKeyword: s.primaryKeyword, reason, sources: keywordSourcesOf(guard, s.primaryKeyword) }) }
      // 1) EXACT_TOPIC_DUPLICATE — the same title already exists/pending. Permanent.
      if (nt && guard.titles.has(nt)) { exactTopicDuplicates++; filteredTitleExists++; pushEx('title_exists'); return false }
      // 1b) EXACT_EXISTING_KEYWORD_OWNER — the primary keyword EXACTLY equals the
      //    name of an existing indexed commercial entity (product / category / page /
      //    Shopify entity). That page already owns this exact query → a new article
      //    on it is direct keyword+intent cannibalization. HARD permanent rejection
      //    (never salvaged), regardless of the model's declared intent or a longer
      //    article title. EXACT match only, so genuine long-tails are unaffected.
      if (ownedByExistingEntity(guard, s.primaryKeyword)) { exactExistingKeywordOwner++; pushEx('exact_existing_keyword_owner'); return false }
      // 1c) OPPORTUNITY GATE (deterministic, domain-neutral): reject a candidate that
      //    only re-expresses existing entity names (every token belongs to an entity
      //    or is a generic modifier) — a source-only expansion, not an independent
      //    need. Ambiguous commercial-overlap cases are counted for REVIEW but not
      //    dropped (the model/prompt handled the nuance). No cost/model calls.
      if (existingPages.length > 0) {
        const w = evaluateArticleWorthiness({
          primaryKeyword: s.primaryKeyword, title: s.title, secondaryKeywords: s.secondaryKeywords,
          intent: (s.searchIntent as SearchIntent) || 'informational', existingPages,
          hasEvidence: true, businessRelevant: true, // scoring-only here; not hard gates in the route
        })
        if (!w.ok && (w.rejection_reason === 'source_only_entity_expansion' || w.rejection_reason === 'weak_entity_modifier')) {
          sourceOnlyEntityExpansion++; pushEx(w.rejection_reason); return false
        }
        if (w.cannibalization.outcome === 'review') cannibalizationReviews++
      }
      // 2) TRUE_CONTENT_COVERAGE — an existing PUBLISHED page already satisfies this
      //    query (same main phrase / owned content phrase). Permanent. Catches the
      //    real cannibalization cases (e.g. re-titled duplicate of an existing article).
      if (coveredByExistingContent(guard, s.title, s.primaryKeyword)) { trueContentCoverage++; filteredCoveredByContent++; pushEx('covered_by_existing_content'); return false }
      // 2b) The exact keyword is already owned by PUBLISHED content (a project /
      //    topic / tracked / scan focus keyword — NOT a mere pending idea). A second
      //    article on a keyword the site already targets cannibalizes it → true
      //    coverage, permanent. (Pending-idea ownership falls through to salvage.)
      if (nk && guard.contentKeywords.has(nk)) { trueContentCoverage++; filteredCoveredByContent++; pushEx('content_keyword_owned'); return false }
      // 3) KEYWORD_COLLISION — the primaryKeyword is owned ONLY by another pending
      //    idea (often a BROAD category keyword). This is NOT topic ownership: salvage
      //    a narrower long-tail primary keyword from the candidate's own data and
      //    re-validate. Only when salvage fails is the candidate rejected.
      if (nk && guard.keywords.has(nk)) {
        keywordCollisionCandidates++
        const salv = salvageLongTailKeyword(
          { title: s.title, primaryKeyword: s.primaryKeyword, secondaryKeywords: s.secondaryKeywords },
          salvageChecks,
        )
        if (salv.ok && salv.keyword) {
          keywordCollisionSalvaged++
          if (salvagedExamples.length < 10) salvagedExamples.push({ title: s.title, from: s.primaryKeyword, to: salv.keyword })
          s.primaryKeyword = salv.keyword // reassign; title/angle/intent/reason preserved
          nk = normalizeText(salv.keyword)
        } else {
          keywordCollisionStillRejected++
          filteredPrimaryKeywordExists++
          pushEx('primary_keyword_exists')
          if (primaryKeywordMatches.length < 20) {
            const origins = keywordOriginsOf(guard, s.primaryKeyword)
            primaryKeywordMatches.push({
              ideaTitle: s.title,
              ideaPrimaryKeyword: s.primaryKeyword,
              normalizedPrimaryKeyword: normalizeText(s.primaryKeyword),
              ideaSourceContext: s.suggestionReason || '',
              ideaSuggestedUrl: s.suggestedInternalLinks[0]?.url ?? null,
              rule: 'exact_normalized_primary_keyword',
              matches: origins.length ? origins : [{ source: 'idea_keyword', original: s.primaryKeyword, status: 'intra_batch_earlier_idea', detail: '' }],
            })
          }
          return false
        }
      }
      if (nk) { guard.keywords.add(nk); ownedKeywordCorpus.add(nk) } // avoid intra-batch dupes
      if (nt) guard.titles.add(nt)
      // Phase 3H.1 — NO intra-batch PHRASE dedupe: many legitimate ideas for one
      // seed share the "<core phrase>: <angle>" title pattern; adding the first
      // idea's main phrase to contentPhrases killed every sibling in the batch
      // (part of the systemic zero-results bug). Exact keyword/title dedupe above
      // still prevents true intra-batch duplicates.
      return true
    })

    // FINAL intra-run semantic dedupe (after keyword salvage, before persistence):
    // collapse same-topic candidates from THIS run — incl. cross-source pairs whose
    // primary keywords were changed/salvaged — to one deterministic winner, merging
    // safe metadata. Distinct subtopics (different intent/location/lifecycle) are
    // preserved. No model call, no filler.
    const intraRun = dedupeIntraRunSemantic(fresh)
    fresh = intraRun.survivors

    // Part 5 — rejection classification (only exactTopicDuplicates + trueContentCoverage
    // are PERMANENT). Surfaced in Preview diagnostics so a run is never opaque.
    const rejectionClassification = {
      exactTopicDuplicates,
      trueContentCoverage,
      exactExistingKeywordOwner,
      sourceOnlyEntityExpansion,
      cannibalizationReviews,
      keywordCollisionCandidates,
      keywordCollisionSalvaged,
      keywordCollisionStillRejected,
      salvagedExamples,
      // Part D — intra-run semantic collision outcome.
      intraRunSemanticCollisions: intraRun.collisions.length,
      intraRunCandidatesRemoved: intraRun.removed,
      intraRunCandidatesMerged: intraRun.merged,
      intraRunCollisions: intraRun.collisions.slice(0, 10),
    }

    await insertPendingIdeas(auth.admin, { projectId: auth.project.id, userId: auth.user.id, batchId: randomUUID(), source, suggestions: fresh })

    const filteredExisting = result.suggestions.length - fresh.length
    // Phase 3I.6 — in PRODUCTION, a run that added nothing new returns the
    // primary-keyword match evidence (and only it) so the exact blockers are
    // visible in the UI/API without a dev build. Dev keeps the full debug.
    const buildDebug = (extra: Record<string, unknown>) => process.env.NODE_ENV !== 'production'
      ? { ...guard.counts, scanKeywordSamples: guard.scanSamples, modelSuggestions: result.suggestions.length, filteredPrimaryKeywordExistsCount: filteredPrimaryKeywordExists, filteredTitleExistsCount: filteredTitleExists, filteredCoveredByContentCount: filteredCoveredByContent, filteredExamples, primaryKeywordMatches, kr: (result.meta as { debug?: unknown }).debug, ...extra }
      : (fresh.length === 0 && primaryKeywordMatches.length > 0 ? { primaryKeywordMatches } : undefined)

    // Runtime classification (G) — always computable from the engine's controller
    // totals + raw candidates + this run's fresh count. Proven, not assumed.
    const rtDiag = (result.meta.runtimeDiag ?? {}) as Record<string, number | boolean | undefined>
    const runtimeClass = classifyRecoRun({
      totalCalls: Number(rtDiag.totalCalls ?? 0),
      rawCandidates: Number(rtDiag.rawCandidates ?? result.meta.generated ?? 0),
      freshPersisted: fresh.length,
      reason: result.meta.reason ?? null,
      billingExhausted: !!rtDiag.billingExhausted,
      callsPreventedByBudget: Number(rtDiag.callsPreventedByBudget ?? 0),
    })
    const rtInfo = runtimeInfo()

    const pending = await loadPendingIdeas(auth.admin, auth.project.id)
    // No ideas table yet (migration not applied): still return the GUARD-FILTERED
    // list session-only, so the keyword guard works even before persistence.
    if (pending === null) {
      return Response.json({ suggestions: fresh, meta: { ...result.meta, persisted: false, source, ...pathContract, projectId: auth.project.id, generationRunId, clientRequestId, newlyAddedCount: fresh.length, totalPendingCount: fresh.length, filteredCount: filteredExisting, newlySaved: fresh.length, filteredExisting,
        // Phase 3I.3 — PRODUCTION-safe funnel counts so a 0-result run explains
        // its exact bottleneck in the UI (counts only, no content).
        funnel: { generated: result.meta.generated, corpusDuplicates: result.meta.skippedDuplicates, qualityFiltered: result.meta.qualityFilteredCount ?? 0, keywordExists: filteredPrimaryKeywordExists, titleExists: filteredTitleExists, coveredByExisting: filteredCoveredByContent, hiddenOnLoad: 0 },
        isolationDebug: diagnostics ? { gitSha: rtInfo.gitSha, vercelEnv: rtInfo.vercelEnv, generationRunId, clientRequestId, runtimeClass, runtimeDiag: result.meta.runtimeDiag ?? null, freshCurrentRunCount: fresh.length, inFlightHit: false, recentReplayHit: false, rejectionClassification, ...pathContract, opportunityDiagnostics: opportunityDiagnostics ?? null } : undefined,
        debug: buildDebug({ persisted: false }) } })
    }

    // Phase 3F.3.1c — revalidate ALREADY-PERSISTED pending ideas against the
    // current guard. Pre-guard rows that now conflict with an existing exact
    // primary keyword/title are marked 'duplicate' (history kept) and hidden.
    const { visible, conflictIds } = partitionPending(pending, guard)
    if (conflictIds.length > 0) await markIdeasDuplicate(auth.admin, auth.project.id, conflictIds)
    // Phase 4C — re-attach hybrid provenance (lost by ideaToSuggestion, which
    // reads persisted rows). Keyed by normalized primary keyword from THIS run's
    // fresh merged set, so the "סריקה משולבת" run shows source badges + counts.
    const provByKw = new Map(result.suggestions
      .filter((s) => s.supportingSources && s.supportingSources.length)
      .map((s) => [normalizeText(s.primaryKeyword), { supportingSources: s.supportingSources, sourceEvidence: s.sourceEvidence }]))
    const suggestions = visible.map(ideaToSuggestion).map((s) => {
      const prov = provByKw.get(normalizeText(s.primaryKeyword))
      return prov ? { ...s, ...prov } : s
    })

    // Precise "nothing new this run" reason (accurate whether the model produced
    // known ideas that were filtered, or produced nothing because avoid-skip
    // already covered every cluster). Phase 3H.1 — when the dominant filter was
    // "covered by existing site content", say THAT instead of the misleading
    // "already saved/approved/rejected" message.
    const allKnownReason = source === 'keyword_research_url' ? 'kr_all_known' : 'all_known'
    const emptyBecause = filteredExisting > 0 && filteredCoveredByContent > 0 && filteredPrimaryKeywordExists === 0 && filteredTitleExists === 0
      ? 'covered_by_existing'
      : filteredExisting > 0 && filteredPrimaryKeywordExists > 0 && filteredTitleExists === 0 ? 'primary_keyword_exists' : allKnownReason
    let reason: string | undefined
    if (suggestions.length === 0) {
      reason = result.meta.reason ?? (result.suggestions.length > 0 ? emptyBecause : undefined)
    } else if (fresh.length === 0) {
      // Total pending > 0 but this run added nothing new — surface WHY.
      reason = result.meta.reason ?? (result.suggestions.length > 0 ? emptyBecause : (source === 'keyword_research_url' ? 'kr_no_new' : 'no_new'))
    }
    // Preview-only isolation diagnostics: current-run flags vs the accumulated
    // pending list (the UI shows the full pending set) + the Site Scan call trace.
    // Runtime classification computed above (reused here) — distinguishes
    // ZERO_CALLS from CALLS_FAILED / CALLS_SUCCEEDED_ZERO_OUTPUT /
    // CANDIDATES_REJECTED, so a 0-new run is proven, not assumed to be dedupe.
    const isolationDebug = diagnostics ? {
      gitSha: rtInfo.gitSha,
      vercelEnv: rtInfo.vercelEnv,
      generationRunId,
      clientRequestId,
      runtimeClass,
      runtimeDiag: result.meta.runtimeDiag ?? null,
      freshCurrentRunCount: fresh.length,
      freshCurrentRunDomainFlags: suggestionsDomainFlags(fresh),
      accumulatedPendingCount: suggestions.length,
      accumulatedPendingDomainFlags: suggestionsDomainFlags(suggestions),
      persistedCurrentRunCount: fresh.length,
      rejectionClassification,
      // Authoritative generation-path contract (E) — proves whether opportunity-first
      // or explicit legacy produced the visible suggestions, and which recovery tier.
      ...pathContract,
      // Opportunity-first pipeline funnel (evidence → clusters → tiers → synthesis →
      // worthiness → link-roles). Full safe funnel so live validation needs no DB.
      opportunityDiagnostics: opportunityDiagnostics ?? null,
      // Idempotency (J) — this run actually executed generation (not a replay).
      inFlightHit: false,
      recentReplayHit: false,
      excludePendingContext,
      siteScanTrace: (result.meta as { debug?: { siteScanCallTrace?: unknown } }).debug?.siteScanCallTrace ?? null,
    } : undefined
    return Response.json({
      suggestions,
      meta: {
        ...result.meta,
        persisted: true,
        source,
        // Authoritative generation-path contract (E) — always on the response so the
        // UI/diagnostics never imply opportunity-first when legacy actually ran.
        ...pathContract,
        // Scope echo — the client verifies these before applying the response.
        projectId: auth.project.id,
        generationRunId,
        clientRequestId,
        isolationDebug,
        newlyAddedCount: fresh.length,
        totalPendingCount: suggestions.length,
        filteredCount: filteredExisting,
        hiddenDuplicateCount: conflictIds.length,
        // Back-compat aliases.
        newlySaved: fresh.length,
        filteredExisting,
        revalidatedHidden: conflictIds.length,
        pendingCount: suggestions.length,
        reason,
        // Phase 3I.3 — PRODUCTION-safe funnel counts so a 0-result run explains
        // its exact bottleneck in the UI (counts only, no content).
        funnel: { generated: result.meta.generated, corpusDuplicates: result.meta.skippedDuplicates, qualityFiltered: result.meta.qualityFilteredCount ?? 0, keywordExists: filteredPrimaryKeywordExists, titleExists: filteredTitleExists, coveredByExisting: filteredCoveredByContent, hiddenOnLoad: conflictIds.length },
        debug: buildDebug({ revalidatedHidden: conflictIds.length }),
      },
    })
  } catch (e) {
    // BILLING EXHAUSTED — a typed, honest state (NOT "no ideas / broader keyword").
    // No provider details, keys or billing-account ids are exposed.
    if (e instanceof BillingExhaustedError) {
      return Response.json({ suggestions: [], error: 'billing_exhausted', meta: { source, reason: 'billing_exhausted', persisted: false, newlyAddedCount: 0 } }, { status: 402 })
    }
    // MODEL UNAVAILABLE (Part B/C) — the configured Gemini model is not offered to
    // the active key. A typed non-success — NEVER a 200 with a false 0-new result.
    if (e instanceof RecommendationModelUnavailableError) {
      console.error('[automation-recommendations] model unavailable', { source })
      return Response.json(
        { suggestions: [], ok: false, error: 'recommendation_model_unavailable', reason: 'recommendation_model_unavailable', message: 'מודל יצירת ההמלצות אינו זמין כרגע. יש לעדכן את הגדרת מודל Gemini.', meta: { source, reason: 'recommendation_model_unavailable', persisted: false, newlyAddedCount: 0 } },
        { status: 503 },
      )
    }
    if ((e as { code?: string })?.code === '42P01') return Response.json({ error: 'Content module not initialized' }, { status: 404 })
    console.error('[automation-recommendations] failed', { message: (e as Error)?.message })
    return Response.json({ error: 'Failed to generate recommendations' }, { status: 500 })
  } finally {
    INFLIGHT.delete(inflightKey)
    if (clientRequestId) RECENT.set(idemKey, Date.now())
  }
}
