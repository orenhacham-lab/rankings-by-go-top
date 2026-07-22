/**
 * Content automation — POST /api/content/automation/recommendations
 *
 * Generate topic-idea suggestions for a project from one source
 * ('keyword' | 'project_data' | 'keyword_research_url'). Read-only: nothing is
 * persisted here — the caller approves selected ideas via the bulk route.
 *
 * Gated by ENABLE_CONTENT_AUTOMATION + project ownership.
 */

import { authContentProject, isContentAutomationEnabled, isProFirstControllerEnabled } from '@/lib/content/api-auth'
import { generateRecommendations } from '@/lib/content/recommendations/engine'
import { generateOpportunities } from '@/lib/content/recommendations/generate-opportunities'
import { generateFromBriefs } from '@/lib/content/recommendations/generate-from-briefs'
import { buildFinalCandidateOutcomes, applyFinalOutcomesToGscDetails } from '@/lib/content/recommendations/final-outcomes'
import { buildScanSources, buildGscRunSummary } from '@/lib/content/recommendations/customer-run-summary'
import { runProFirstProduction, type ProductionProvenance, type ProFirstProductionResult } from '@/lib/content/recommendations/production-run'
import { decideBlogArticle } from '@/lib/content/recommendations/blog-article-acceptance'
import type { SearchIntent } from '@/lib/content/recommendations/opportunity'
import { getCachedIndex, reassembleReport } from '@/lib/content/wordpress-content-index'
import { canonicalizeSuggestionLinks } from '@/lib/content/recommendations/canonical-links'
import type { ScannedTarget } from '@/lib/content/wordpress-content-scan'
import { generateContentPlan } from '@/lib/content/recommendations/content-plan'
import { newRunCostController } from '@/lib/content/recommendations/run-cost-controller'
import type { RecommendationSource } from '@/lib/content/recommendations/types'
import { insertPendingIdeas, loadPendingIdeas, ideaToSuggestion, normalizeText, markIdeasDuplicate, topicIdeaFingerprint } from '@/lib/content/recommendations/topic-idea-store'
import { buildKeywordGuard, partitionPending } from '@/lib/content/recommendations/keyword-guard'
import type { ExistingPageSignal } from '@/lib/content/recommendations/opportunity'
import { finalizeRecommendationAttempt } from '@/lib/content/recommendations/finalize-attempt'
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
  // Scope A — Preview-only NO-WRITE diagnostics mode. Runs the EXACT normal pipeline
  // (preparation → snapshot → Pro-first controller → synthesis → deterministic
  // validation → finalization → blog gate) but SKIPS every persistence/mutation once
  // the final result is known, and returns the full accepted + rejected candidate
  // accounting. Allowed ONLY when isolation diagnostics are enabled AND this is not a
  // Production deployment; owner-authenticated + project-scoped like any normal run.
  const requestedDiagnosticsOnly = body.diagnosticsOnly === true
  const diagnosticsOnly = requestedDiagnosticsOnly && diagnostics && (process.env.VERCEL_ENV ?? null) !== 'production'
  // Model tier (Phase 2 — explicit, truthful): 'standard' = Flash-class,
  // 'premium' = a VALIDATED Pro-class model for the (single) synthesis call.
  // When the key does not offer a Pro-class model the run proceeds on standard
  // with an EXPLICIT downgrade record in diagnostics — never silent, never a 400.
  const qualityMode: 'standard' | 'premium' = body.qualityMode === 'premium' ? 'premium' : 'standard'

  const auth = await authContentProject(projectId)
  if ('error' in auth) return Response.json({ error: auth.error }, { status: auth.status })

  // FAIL-CLOSED (Scope 1): a REQUESTED dry run that could not be honored (isolation
  // diagnostics disabled OR Production) must NEVER silently continue as a normal,
  // write-enabled generation. Reject with a typed 403 HERE — after authentication but
  // BEFORE INFLIGHT.add, any model/provider call, generation, or persistence — so a
  // dry-run request can never become a write.
  if (requestedDiagnosticsOnly && !diagnosticsOnly) {
    return Response.json(
      { ok: false, error: 'diagnostics_only_unavailable', reason: 'diagnostics_only_unavailable', persisted: false },
      { status: 403 },
    )
  }

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
  // D — no user-selected quantity modes. A single generation action targets up to ~30
  // safe distinct topics (bounded server-side). Any legacy mode/count fields in the
  // body are ignored; an explicitly malformed one is a typed 400.
  if (body.requestedCount !== undefined && (typeof body.requestedCount !== 'number' || !Number.isFinite(body.requestedCount))) {
    return Response.json({ error: 'invalid_requested_count' }, { status: 400 })
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
    let briefDiagnostics: import('@/lib/content/recommendations/generate-from-briefs').BriefRunDiagnostics | null = null
    let contentPlanDiag: import('@/lib/content/recommendations/content-plan').ContentPlanResult['diagnostics'] | null = null
    let generationPath: 'opportunity_first' | 'legacy_explicit' = 'opportunity_first'
    let legacyUsed = false
    let recoveryTierUsed: number | null = null
    let discoveryUsed = false
    let fallbackReason: string | null = null
    let result: Awaited<ReturnType<typeof generateRecommendations>>
    // Stage D — the GLOBAL Pro-first production controller. When enabled it fully owns
    // the normal recommendation flow: one snapshot, real Pro once, Flash only as a
    // strictly-gated single fallback. The old UI tier field is IGNORED (no Flash-first).
    let proFirstProvenance: ProductionProvenance | null = null
    let proFirstResult: ProFirstProductionResult | null = null
    const useProFirst = isProFirstControllerEnabled()
    const useLegacy = !useProFirst && process.env.RECO_LEGACY_PATH === '1'
    // Phase 4 — the DEFAULT is the EVIDENCE-FIRST brief engine (deterministic
    // OpportunityBrief pool → one batched polish call → deterministic validation).
    // RECO_TIERED_OPPORTUNITIES=1 rolls back to the previous tiered generator;
    // RECO_ENABLE_CONTENT_PLAN=1 keeps the experimental batched plan reachable;
    // RECO_LEGACY_PATH=1 stays the explicit legacy rollback. All default OFF.
    const useContentPlan = !useProFirst && !useLegacy && process.env.RECO_ENABLE_CONTENT_PLAN === '1'
    const useTiered = !useProFirst && !useLegacy && !useContentPlan && process.env.RECO_TIERED_OPPORTUNITIES === '1'
    if (useProFirst) {
      // GLOBAL Pro-first (Stage D). Ignore the client's tier field; always premium.
      // One controller covers preparation + Pro + the single Flash fallback (premium
      // budget — never the QA cap). The orchestrator returns the SELECTED attempt's
      // PRISTINE engine suggestions; the route finalizes + persists them exactly as
      // usual, so only the selected finalized batch is stored.
      const controller = newRunCostController('premium', generationRunId, 12)
      const prod = await runProFirstProduction(auth.admin, { projectId: auth.project.id, targetCount: 12, userId: auth.user.id }, controller)
      proFirstResult = prod
      proFirstProvenance = prod.provenance
      briefDiagnostics = prod.briefDiagnostics
      fallbackReason = prod.provenance.fallbackReason
      result = { suggestions: prod.selectedEngineSuggestions, meta: { source, generated: prod.rawGenerated, skippedDuplicates: 0, finalCount: prod.selectedEngineSuggestions.length, attempts: prod.briefDiagnostics.rounds.length, reason: prod.selectedModel === 'none' ? (prod.emptyReason ?? 'no_safe_opportunities') : undefined, runtimeDiag: diagnostics ? { totalCalls: controller.summary().totalCalls, rawCandidates: prod.rawGenerated, path: 'pro_first_production', selectedModel: prod.selectedModel, flashAttempted: prod.provenance.flashAttempted } : undefined } }
    } else if (useLegacy) {
      // EXPLICIT operational rollback ONLY.
      generationPath = 'legacy_explicit'; legacyUsed = true; fallbackReason = 'explicit_legacy_mode'
      result = await generateRecommendations(auth.admin, { userId: auth.user.id, projectId: auth.project.id, source, keyword, avoidKeywords: Array.from(guard.keywords), generationRunId, collectTrace: diagnostics, excludePendingContext, qualityMode: 'standard' })
    } else if (useContentPlan) {
      // EXPERIMENTAL bulk content-plan (flag-gated). No customer-facing up-to-30 /
      // shortfall / validator / cost / snapshot wording — everything is Preview-only.
      const plan = await generateContentPlan(auth.admin, { projectId: auth.project.id, generationRunId })
      opportunityDiagnostics = plan.opportunityDiagnostics
      contentPlanDiag = plan.diagnostics
      recoveryTierUsed = plan.opportunityDiagnostics.recoveryTierUsed
      discoveryUsed = plan.opportunityDiagnostics.discoveryUsed
      fallbackReason = plan.opportunityDiagnostics.fallbackReason
      result = { suggestions: plan.suggestions, meta: { source, generated: plan.diagnostics.generated_candidates, skippedDuplicates: 0, finalCount: plan.suggestions.length, attempts: 1, reason: plan.suggestions.length === 0 ? 'no_safe_opportunities' : undefined, runtimeDiag: diagnostics ? { totalCalls: plan.diagnostics.actual_calls, rawCandidates: plan.diagnostics.generated_candidates, path: 'opportunity_first' } : undefined } }
    } else if (useTiered) {
      // ROLLBACK — the previous tiered opportunity generator (flag-gated).
      const controller = newRunCostController('standard', generationRunId, 15)
      const opp = await generateOpportunities(auth.admin, { projectId: auth.project.id, targetCount: 15, maxClusters: 12 }, controller)
      opportunityDiagnostics = opp.diagnostics
      recoveryTierUsed = opp.diagnostics.recoveryTierUsed
      discoveryUsed = opp.diagnostics.discoveryUsed
      fallbackReason = opp.diagnostics.fallbackReason
      result = { suggestions: opp.suggestions, meta: { source, generated: opp.diagnostics.generated_opportunities, skippedDuplicates: 0, finalCount: opp.suggestions.length, attempts: opp.diagnostics.tiers.length, reason: opp.suggestions.length === 0 ? 'no_safe_opportunities' : undefined, runtimeDiag: diagnostics ? { totalCalls: opp.diagnostics.model_calls, rawCandidates: opp.diagnostics.generated_opportunities, path: 'opportunity_first', recoveryTierUsed, discoveryUsed, fallbackReason } : undefined } }
    } else {
      // DEFAULT — EVIDENCE-FIRST brief engine (Phase 4). One controller per run;
      // premium mode may use a validated Pro-class model for the synthesis call.
      const controller = newRunCostController(qualityMode, generationRunId, 12)
      const run = await generateFromBriefs(auth.admin, { projectId: auth.project.id, targetCount: 12, qualityMode, userId: auth.user.id }, controller)
      briefDiagnostics = run.diagnostics
      fallbackReason = run.diagnostics.insufficient_inventory ? 'insufficient_inventory' : null
      result = { suggestions: run.suggestions, meta: { source, generated: run.diagnostics.generated_opportunities, skippedDuplicates: 0, finalCount: run.suggestions.length, attempts: run.diagnostics.rounds.length, reason: run.suggestions.length === 0 ? (run.diagnostics.insufficient_inventory ? 'insufficient_inventory' : 'no_safe_opportunities') : undefined, runtimeDiag: diagnostics ? { totalCalls: run.diagnostics.model_calls, rawCandidates: run.diagnostics.generated_opportunities, path: 'evidence_first_briefs', modelPath: run.diagnostics.modelPath, stopReason: run.diagnostics.stop_reason } : undefined } }
    }
    // Generation-path contract — customer-safe only (NO content-plan/up-to-30/shortfall/
    // validator/cost/snapshot fields). Technical detail stays in Preview isolationDebug.
    const pathContract = { generationPath, legacyUsed, recoveryTierUsed, discoveryUsed, fallbackReason }

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
    // Route-level deterministic FINALIZATION (Increment 2) — the exact guard /
    // salvage / coverage / keyword-collision / intra-run-dedup post-processing,
    // extracted VERBATIM into finalizeRecommendationAttempt and called ONCE here so
    // behavior, rule order, suggestion order, rejection counts and funnel are
    // unchanged. Nothing is persisted inside it.
    const existingPages: ExistingPageSignal[] = Array.from(guard.entityOwners).map((n) => ({ name: n, pageType: 'unknown' as const }))
    // Stage D — the Pro-first controller ALREADY finalized the selected attempt exactly
    // once; reuse that result (fresh / funnel / rejection counts / persistence) so the
    // persisted array is precisely selectedFinalization.finalSuggestions, in order. When
    // the flag is off, the route finalizes here exactly as before.
    const finalized = proFirstResult ? proFirstResult.selectedFinalization : finalizeRecommendationAttempt({ guard, existingPages }, result.suggestions)
    const engineFresh = finalized.finalSuggestions
    const { filteredPrimaryKeywordExists, filteredTitleExists, filteredCoveredByContent, exactExistingKeywordOwner, sourceOnlyEntityExpansion, filteredExamples, primaryKeywordMatches, intraRun, rejectionClassification } = finalized

    // BLOG-ONLY persistence gate (production Pro-first path only). The normal workflow
    // generates NEW blog articles ONLY — never homepage/about/service/category/product or
    // existing-content edits. Every persisted item must be recommendedPageType='article'.
    // Non-aggressive: repair a malformed keyword, drop an incoherent secondary, reclassify
    // a genuinely informational commercial candidate to an article, keep distinct topics;
    // reject only own-brand pitches, unsupported business-model expansions, semantic
    // duplicates, existing-page edits, or real commercial pages. Runs ONLY here (after the
    // engine finalized) so the shared engine / /reco-qa / blind export are unchanged.
    const blogReport = { baseline: engineFresh.length, acceptedUnchanged: 0, acceptedAfterRepair: 0, reclassifiedToArticle: 0, secondaryKeywordsRemoved: 0, semanticDuplicateRejected: 0, unsupportedTopicRejected: 0, rejectedByReason: {} as Record<string, number>, finalValid: engineFresh.length }
    // Scope 2 — per-item blog-gate reject reason keyed by normalized title, so the
    // stage-aware final view can report the EXACT blog-gate reason (additive only).
    const blogRejectedByTitle = new Map<string, string>()
    let fresh = engineFresh
    if (proFirstResult?.acceptanceContext) {
      const ctx = proFirstResult.acceptanceContext
      const kept: typeof engineFresh = []
      for (const s of engineFresh) {
        const d = decideBlogArticle({ title: s.title, primaryKeyword: s.primaryKeyword, secondaryKeywords: s.secondaryKeywords ?? [], intent: (s.searchIntent as SearchIntent) ?? 'informational', recommendedPageType: s.recommendedPageType ?? 'article', supportedQuery: s.demandEvidence?.demandQuery ?? null }, ctx)
        if (d.outcome === 'reject') {
          const r = d.reason ?? 'reject'
          blogReport.rejectedByReason[r] = (blogReport.rejectedByReason[r] ?? 0) + 1
          blogRejectedByTitle.set(normalizeText(s.title), r)
          if (r === 'pending_semantic_duplicate') blogReport.semanticDuplicateRejected++
          else blogReport.unsupportedTopicRejected++
          continue
        }
        if (d.outcome === 'keep') blogReport.acceptedUnchanged++
        if (d.outcome === 'repair_and_keep') blogReport.acceptedAfterRepair++
        if (d.outcome === 'reclassify_to_article') blogReport.reclassifiedToArticle++
        blogReport.secondaryKeywordsRemoved += d.removedSecondaries.length
        kept.push({ ...s, primaryKeyword: d.primaryKeyword, secondaryKeywords: d.secondaryKeywords, recommendedPageType: 'article' })
      }
      fresh = kept
      blogReport.finalValid = kept.length
    }

    // CANONICAL internal-link preview — re-derive each recommendation's selectable links
    // from the SAME planFromCachedTargets planner that GET /internal-links/plan + bulk-save
    // use, against the SAME cached site index. This guarantees a checked card link is a
    // member of the authoritative plan (no not_in_plan/blocked drop at save). It changes
    // ONLY suggestedInternalLinks (+ records the cache snapshot) — never title/keyword/
    // secondaries/score/acceptance/count. Skipped when the project has no cached index yet.
    let canonicalLinkPreview: { applied: boolean; scannerVersion: string | null; scanCompletedAt: string | null; topicsCanonicalized: number } = { applied: false, scannerVersion: null, scanCompletedAt: null, topicsCanonicalized: 0 }
    try {
      const idxRow = await getCachedIndex(auth.admin, auth.project.id)
      if (idxRow) {
        const rep = reassembleReport(idxRow)
        const linkCtx = { targets: (rep.targets ?? []) as ScannedTarget[], hosts: rep.hosts ?? [], scannerVersion: idxRow.scanner_version, scanCompletedAt: idxRow.scan_completed_at }
        fresh = fresh.map((s) => canonicalizeSuggestionLinks(s, linkCtx))
        canonicalLinkPreview = { applied: true, scannerVersion: idxRow.scanner_version, scanCompletedAt: idxRow.scan_completed_at, topicsCanonicalized: fresh.length }
      }
    } catch (e) {
      // Non-fatal: a preview canonicalization failure never blocks recommendations; the
      // engine links remain and the one-click flow reconciles them against the live plan.
      console.warn('[automation-recommendations] canonical link preview skipped', { message: (e as Error)?.message?.slice(0, 120) })
    }

    // E — one truthful stage contract. raw = model output BEFORE gates; engine-accepted
    // = engine output; the engine's removal count is ALWAYS surfaced (customer funnel)
    // so "generated N / 0 rejections" can never happen when the engine removed some.
    const rawGeneratedCount = result.meta.generated ?? 0
    const engineAcceptedCount = result.suggestions.length
    const engineFiltered = Math.max(0, rawGeneratedCount - engineAcceptedCount)
    const engineRejectedByReason = briefDiagnostics?.rejected_by_reason ?? opportunityDiagnostics?.rejected_by_reason ?? {}
    const routeRejectedByReason = () => ({ title_exists: filteredTitleExists, exact_existing_keyword_owner: exactExistingKeywordOwner, source_only_entity_expansion: sourceOnlyEntityExpansion, covered_by_existing_content: filteredCoveredByContent, primary_keyword_exists: filteredPrimaryKeywordExists, intra_run_removed: intraRun.removed, intra_run_merged: intraRun.merged })

    // Scope 2 — STAGE-AWARE final outcomes. engineCandidateOutcomes stop at ENGINE
    // acceptance; this traces each generated candidate through route finalization + the
    // blog gate to the exact `fresh` set that WOULD persist. Separate from (never replaces)
    // the engine view. Computed for both the dry-run and normal responses.
    const engineCandidateOutcomes = briefDiagnostics?.candidateOutcomes ?? []
    const { finalCandidateOutcomes, finalCandidateAccounting } = buildFinalCandidateOutcomes({ engineOutcomes: engineCandidateOutcomes, engineFresh, fresh, blogRejectedByTitle })
    // Stage E3A FIX 4 — resolve the route/blog stages of finalOutcome for engine-accepted GSC
    // briefs (observational; no decision/order change). Used in both dry-run + normal responses.
    const gscInputEnriched = applyFinalOutcomesToGscDetails(briefDiagnostics?.gscInput ?? null, finalCandidateOutcomes)

    // Scope A — DIAGNOSTICS-ONLY (dry-run) EXIT. `fresh` here is byte-identical to what
    // the normal path would persist (identical code above; only the branch below
    // differs). Return the full accounting and perform ZERO writes: no insertPendingIdeas,
    // no markIdeasDuplicate, no queue/approve/reject — nothing after the final result.
    if (diagnosticsOnly) {
      const { gitSha, vercelEnv } = runtimeInfo()
      return Response.json({
        ok: true,
        dryRun: true,
        // The generated set that WOULD be persisted (accepted candidates), in order.
        suggestions: fresh,
        wouldPersistCount: fresh.length,
        // ENGINE view (unchanged) — accepted/rejected BY THE ENGINE.
        engineCandidateOutcomes,
        acceptedCandidates: engineCandidateOutcomes.filter((o) => o.outcome === 'accepted'),
        rejectedCandidates: engineCandidateOutcomes.filter((o) => o.outcome === 'rejected'),
        candidateAccounting: briefDiagnostics?.candidateAccounting ?? null,
        // FINAL (stage-aware) view — one record per candidate through persistence.
        finalCandidateOutcomes,
        finalCandidateAccounting,
        meta: {
          source, projectId: auth.project.id, generationRunId, clientRequestId,
          persisted: false, dryRun: true, newlyAddedCount: 0, wouldPersistCount: fresh.length,
          ...pathContract,
          funnel: { generated: rawGeneratedCount, corpusDuplicates: result.meta.skippedDuplicates, qualityFiltered: result.meta.qualityFilteredCount ?? 0, engineFiltered, keywordExists: filteredPrimaryKeywordExists, titleExists: filteredTitleExists, coveredByExisting: filteredCoveredByContent, hiddenOnLoad: 0 },
          isolationDebug: { gitSha, vercelEnv, generationRunId, clientRequestId, runtimeDiag: result.meta.runtimeDiag ?? null, diagnosticsOnly: true, wouldPersistCount: fresh.length, blogArticleGate: blogReport, canonicalLinkPreview, rejectionClassification, ...pathContract, engineCandidateOutcomes, finalCandidateOutcomes, finalCandidateAccounting, gscInput: gscInputEnriched, opportunityDiagnostics: opportunityDiagnostics ?? null, briefDiagnostics: briefDiagnostics ?? null, productionProvenance: proFirstProvenance ?? null },
        },
      })
    }

    // F/B — persist the EXACT fresh array; capture the typed persistence outcome.
    // Persist the customer's SELECTED tier + the actual model the run used, so the
    // QA/admin view can show them later (never rendered as telemetry on the card).
    // Stage D — persist the SELECTED model truthfully. A Flash fallback is stored as
    // Flash (its resolved id), never as Pro; the requested tier is always premium.
    const persistTier = proFirstProvenance ? 'premium' : qualityMode
    const persistModelUsed = proFirstProvenance ? proFirstProvenance.modelUsedForPersistence : (briefDiagnostics?.modelPath?.model ?? null)
    // Stage E3A provenance chip — fingerprints of persisted suggestions whose brief was also
    // supported by Search Console evidence (a genuinely-new gsc: brief that persisted, OR a normal
    // brief that had GSC evidence merged in and was accepted). Presentational; no engine/E3A change.
    const gscMergedAcceptedBriefIds = new Set((briefDiagnostics?.gscInput?.mergedGscEvidence ?? []).filter((m) => m.accepted).map((m) => m.briefId))
    const gscBackedFingerprints = new Set(
      finalCandidateOutcomes
        .filter((f) => f.wouldPersist && f.opportunityId && (f.opportunityId.startsWith('gsc:') || gscMergedAcceptedBriefIds.has(f.opportunityId)))
        .map((f) => topicIdeaFingerprint(f.finalPrimaryKeyword, f.finalTitle)),
    )
    // Customer-safe run summary (Parts 3/4): truthful sources-analyzed + one GSC run status. Derived
    // from the existing evidence inventory + E3A diagnostics; survives the normal (non-diagnostics)
    // response. supportedResultCount = the current-run GSC-backed accepted set (same as the chip).
    const gscInputForSummary = briefDiagnostics?.gscInput ?? null
    const evInv = briefDiagnostics?.evidence_inventory ?? null
    const scanSources = buildScanSources({
      projectLoaded: !!briefDiagnostics,
      siteScanEntities: evInv?.site_scan_entities ?? 0,
      keywordResearchQueries: evInv?.keyword_research_queries ?? 0,
      gscState: gscInputForSummary?.state ?? 'disabled',
    })
    const gscRunSummary = buildGscRunSummary({
      state: gscInputForSummary?.state ?? 'disabled',
      consumedGscBriefCount: gscInputForSummary?.consumedGscBriefCount ?? 0,
      addedAsNewBriefCount: gscInputForSummary?.addedAsNewBriefCount ?? 0,
      supportedResultCount: gscBackedFingerprints.size,
    })
    const persistOutcome = await insertPendingIdeas(auth.admin, { projectId: auth.project.id, userId: auth.user.id, batchId: randomUUID(), source, suggestions: fresh, requestedTier: persistTier, modelUsed: persistModelUsed, gscBackedFingerprints })

    // F — persistence errors are NEVER swallowed. attempted>0 with 0 inserted AND 0
    // duplicates ⇒ every write failed → a TYPED 500, never a "0 new" success response.
    if (persistOutcome && persistOutcome.attempted > 0 && persistOutcome.inserted === 0 && persistOutcome.duplicate === 0) {
      const { gitSha, vercelEnv } = runtimeInfo()
      console.error('[automation-recommendations] persistence failure', { source, attempted: persistOutcome.attempted, failure: persistOutcome.failure })
      return Response.json({ suggestions: [], ok: false, error: 'persistence_failed', reason: 'persistence_failed', message: 'שמירת הרעיונות נכשלה זמנית. יש לנסות שוב בעוד רגע.', meta: { source, reason: 'persistence_failed', persisted: false, newlyAddedCount: 0, ...(diagnostics ? { isolationDebug: { gitSha, vercelEnv, generationRunId, persistence_attempted: persistOutcome.attempted, persistence_inserted: 0, persistence_failed: persistOutcome.failed, persistence_failure: persistOutcome.failure ?? null } } : {}) } }, { status: 500 })
    }

    // Stage D — record the REAL persisted-writes count. A null persistOutcome (no ideas
    // table → session-only) means NOTHING was durably written: persistedWrites = 0, never
    // fresh.length.
    if (proFirstProvenance) proFirstProvenance.persistedWrites = persistOutcome?.inserted ?? 0
    const freshFingerprints = fresh.map((s) => topicIdeaFingerprint(s.primaryKeyword, s.title))
    const persistenceTrace = diagnostics ? {
      persistence_attempted_ids: fresh.map((s) => s.id),
      persistence_attempted: persistOutcome?.attempted ?? fresh.length,
      persistence_inserted: persistOutcome?.inserted ?? 0,
      persistence_duplicate: persistOutcome?.duplicate ?? 0,
      persistence_failed: persistOutcome?.failed ?? 0,
      persistence_failure: persistOutcome?.failure ?? null,
      // Stage D — when a Flash override created the batch the model path is FLASH,
      // never the snapshot's (Pro) modelPath.
      pipeline: { raw_generated_count: rawGeneratedCount, engine_accepted_count: engineAcceptedCount, engine_rejected_by_reason: engineRejectedByReason, engine_shadow_rejected_by_reason: briefDiagnostics?.shadow_rejected_by_reason ?? opportunityDiagnostics?.shadow_rejected_by_reason ?? {}, model_path: proFirstResult ? proFirstResult.selectedModelPath : (briefDiagnostics?.modelPath ?? null), route_fresh_count: fresh.length, route_rejected_by_reason: routeRejectedByReason(), persistence_attempted_count: persistOutcome?.attempted ?? fresh.length, persistence_inserted_count: persistOutcome?.inserted ?? 0, persistence_duplicate_count: persistOutcome?.duplicate ?? 0, persistence_failed_count: persistOutcome?.failed ?? 0 },
      contentPlan: contentPlanDiag ?? null,
    } : undefined

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
        funnel: { generated: result.meta.generated, corpusDuplicates: result.meta.skippedDuplicates, qualityFiltered: result.meta.qualityFilteredCount ?? 0, engineFiltered, keywordExists: filteredPrimaryKeywordExists, titleExists: filteredTitleExists, coveredByExisting: filteredCoveredByContent, hiddenOnLoad: 0 },
        isolationDebug: diagnostics ? { gitSha: rtInfo.gitSha, vercelEnv: rtInfo.vercelEnv, generationRunId, clientRequestId, runtimeClass, runtimeDiag: result.meta.runtimeDiag ?? null, freshCurrentRunCount: fresh.length, inFlightHit: false, recentReplayHit: false, rejectionClassification, ...pathContract, opportunityDiagnostics: opportunityDiagnostics ?? null, briefDiagnostics: briefDiagnostics ?? null, engineCandidateOutcomes, finalCandidateOutcomes, finalCandidateAccounting, productionProvenance: proFirstProvenance ?? null, ...(persistenceTrace ?? {}) } : undefined,
        debug: buildDebug({ persisted: false }) } })
    }

    // F — after a real insert, ASSERT the inserted rows are visible to the reload query.
    // A mismatch is a TYPED persistence_reload_mismatch, never a successful zero-result.
    if (persistOutcome && persistOutcome.inserted > 0) {
      const reloadedFps = new Set((pending as { fingerprint?: string }[]).map((r) => r.fingerprint).filter(Boolean))
      if (!freshFingerprints.some((fp) => reloadedFps.has(fp))) {
        const { gitSha, vercelEnv } = runtimeInfo()
        console.error('[automation-recommendations] persistence/reload mismatch', { source, inserted: persistOutcome.inserted, reloaded: reloadedFps.size })
        return Response.json({ suggestions: [], ok: false, error: 'persistence_reload_mismatch', reason: 'persistence_reload_mismatch', message: 'הרעיונות נשמרו אך לא נטענו מחדש כראוי. יש לנסות שוב.', meta: { source, reason: 'persistence_reload_mismatch', persisted: true, newlyAddedCount: 0, ...(diagnostics ? { isolationDebug: { gitSha, vercelEnv, generationRunId, persistence_inserted: persistOutcome.inserted, reload_visible_count: reloadedFps.size, ...(persistenceTrace ?? {}) } } : {}) } }, { status: 500 })
      }
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
      // Stage E3A — GSC input summary (also nested under briefDiagnostics). {enabled:false} when off.
      gscInput: gscInputEnriched,
      runtimeDiag: result.meta.runtimeDiag ?? null,
      freshCurrentRunCount: fresh.length,
      freshCurrentRunDomainFlags: suggestionsDomainFlags(fresh),
      accumulatedPendingCount: suggestions.length,
      accumulatedPendingDomainFlags: suggestionsDomainFlags(suggestions),
      // TRUTHFUL persisted-writes count — the rows actually inserted, never the pre-insert
      // fresh count (a DB fingerprint duplicate is never counted as newly added).
      persistedCurrentRunCount: persistOutcome?.inserted ?? 0,
      // Deterministic blog-article acceptance report (Preview-only observability).
      blogArticleGate: blogReport,
      canonicalLinkPreview,
      reload_visible_count: suggestions.length,
      ...(persistenceTrace ?? {}),
      rejectionClassification,
      // Authoritative generation-path contract (E) — proves whether opportunity-first
      // or explicit legacy produced the visible suggestions, and which recovery tier.
      ...pathContract,
      // Opportunity-first pipeline funnel (evidence → clusters → tiers → synthesis →
      // worthiness → link-roles). Full safe funnel so live validation needs no DB.
      opportunityDiagnostics: opportunityDiagnostics ?? null,
      briefDiagnostics: briefDiagnostics ?? null,
      // Scope 2 — stage-aware final-outcome view (separate from the engine view). In the
      // NORMAL (persisting) run wouldPersist === the rows actually inserted.
      engineCandidateOutcomes,
      finalCandidateOutcomes,
      finalCandidateAccounting,
      // Stage D — the FULL Pro-first production provenance (Preview-only; never shown to
      // the normal user). Flash fallback is never recorded as Pro.
      productionProvenance: proFirstProvenance ?? null,
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
        // F/E — "new ideas added" is the TRUTHFUL persistence result (rows actually
        // inserted), not the pre-insert fresh count.
        newlyAddedCount: persistOutcome ? persistOutcome.inserted : fresh.length,
        totalPendingCount: suggestions.length,
        filteredCount: filteredExisting,
        hiddenDuplicateCount: conflictIds.length,
        // Customer-safe scan transparency (Parts 3/4) — truthful, non-technical; not gated on diagnostics.
        scanSources,
        gscRunSummary,
        // Preview/operator-only low-yield diagnostic (never in Production; only existing counts, no
        // prompts/model output/secrets/raw queries/opportunity ids). Present ONLY when the isolation
        // diagnostics flag is on AND this is not a Production deployment.
        ...((diagnostics && rtInfo.vercelEnv !== 'production') ? {
          operatorRunDiag: {
            pool: briefDiagnostics?.brief_consumption?.effectivePoolSize ?? null,
            evaluated: briefDiagnostics?.brief_consumption?.consumedBriefs ?? null,
            generated: rawGeneratedCount,
            engineAccepted: engineAcceptedCount,
            finalReady: fresh.length,
            persisted: persistOutcome ? persistOutcome.inserted : fresh.length,
            stopReason: briefDiagnostics?.stop_reason ?? null,
            callsRemaining: briefDiagnostics?.brief_consumption?.callsRemaining ?? null,
            gscConsumed: gscInputForSummary?.consumedGscBriefCount ?? 0,
            gscSupported: gscBackedFingerprints.size,
            // Part 2 — throughput + rejection transparency (count-only; no prompts/ids/queries/bodies).
            remainingPool: briefDiagnostics?.brief_consumption?.remainingBriefs ?? null,
            synthesisRounds: briefDiagnostics?.synthesisCallsMade ?? null,
            thirdRefillEligible: briefDiagnostics?.thirdRefillEligible ?? false,
            thirdRefillUsed: briefDiagnostics?.thirdRefillUsed ?? false,
            topRejectionReasons: Object.entries(briefDiagnostics?.rejected_by_reason ?? {})
              .map(([reason, count]) => ({ reason, count: count as number }))
              .sort((a, b) => b.count - a.count || (a.reason < b.reason ? -1 : a.reason > b.reason ? 1 : 0))
              .slice(0, 5),
            // Low-final-yield discovery-synthesis fallback — which strategy the final paid
            // call used + count-only fallback accounting (never prompts/ids/queries/bodies).
            thirdCallStrategy: briefDiagnostics?.thirdCallStrategy ?? 'not_used',
            lowYieldFallback: briefDiagnostics?.lowYieldFallback ?? null,
          },
        } : {}),
        // Back-compat aliases.
        newlySaved: persistOutcome ? persistOutcome.inserted : fresh.length,
        filteredExisting,
        revalidatedHidden: conflictIds.length,
        pendingCount: suggestions.length,
        reason,
        // E — customer funnel ALWAYS carries engineFiltered so "generated N / 0
        // rejections" is impossible when the engine removed candidates in-generator.
        funnel: { generated: result.meta.generated, corpusDuplicates: result.meta.skippedDuplicates, qualityFiltered: result.meta.qualityFilteredCount ?? 0, engineFiltered, keywordExists: filteredPrimaryKeywordExists, titleExists: filteredTitleExists, coveredByExisting: filteredCoveredByContent, hiddenOnLoad: conflictIds.length },
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
