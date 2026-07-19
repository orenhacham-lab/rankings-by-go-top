/**
 * SMART-RUN COMPARISON HARNESS (Stage B, Increment 4) — QA/admin-only, NON-persisting.
 *
 * Orchestrates the frozen engine's two phases + the pure decision layer to compare a
 * Flash attempt against a Pro attempt over ONE immutable snapshot, WITHOUT touching
 * the normal user flow and WITHOUT persisting anything:
 *
 *   prepareBriefRun ONCE                          → one immutable BriefRunSnapshot
 *   for each of ≥3 Flash + ≥3 Pro attempts:
 *     fresh RunCostController + fresh cloned guard  (attempts stay independent)
 *     synthesizeFromSnapshot(snapshot, ctrl, {modelOverride})   (discovery NOT re-run)
 *     finalizeRecommendationAttempt(clonedGuard, …)             (the SAME finalize)
 *     deriveBriefOutcomes → computeRescueAccounting             (unique-briefId sets)
 *     escalateToPro(finalized, target)
 *   selectBatch(bestFlash, bestPro) + authorizeSmartRunBudget(worst-case)
 *
 * Guarantees enforced here (see reco-smart-run-harness.qa):
 *   - discovery runs exactly ONCE (in prepare); no synthesis attempt re-runs it;
 *   - every attempt's rescue accounting reconciles to the pool (unique briefIds,
 *     no double counting);
 *   - the finalize used per attempt is finalizeRecommendationAttempt verbatim, on a
 *     FRESH cloned guard so its intra-batch mutations never leak across attempts;
 *   - nothing is persisted (the harness performs no writes).
 *
 * The provisional equal-count selector rule stays QA-only and unresolved pending the
 * Stage-C blind quality review — this harness never decides that a tie is final.
 */
import type { createAdminClient } from '@/lib/supabase/admin'
import type { RunCostController } from './run-cost-controller'
import { newRunCostController } from './run-cost-controller'
import { prepareBriefRun, synthesizeFromSnapshot, type BriefRunSnapshot, type BriefRunInput } from './generate-from-briefs'
import { finalizeRecommendationAttempt } from './finalize-attempt'
import type { KeywordGuard } from './keyword-guard'
import {
  computeRescueAccounting, escalateToPro, selectBatch, authorizeSmartRunBudget,
  type BriefOutcome, type FinalizedAttempt, type PreparationTelemetry, type EscalationResult,
  type SelectResult, type BudgetAuthorization, type BudgetMaxima,
} from './smart-controller'

type Admin = ReturnType<typeof createAdminClient>

/** Deep-clone the mutable guard state so finalizeRecommendationAttempt's intra-batch
 *  keyword/title mutations on one attempt can never affect another (or the snapshot). */
export function cloneKeywordGuard(g: KeywordGuard): KeywordGuard {
  return {
    ...g,
    titles: new Set(g.titles),
    keywords: new Set(g.keywords),
    contentKeywords: new Set(g.contentKeywords),
    contentTitles: new Set(g.contentTitles),
    contentPhrases: new Set(g.contentPhrases),
    entityOwners: new Set(g.entityOwners),
    sources: {
      tracking: new Set(g.sources.tracking),
      topics: new Set(g.sources.topics),
      ideas: new Set(g.sources.ideas),
      scan: new Set(g.sources.scan),
    },
    origins: new Map(Array.from(g.origins, ([k, v]) => [k, v.slice()])),
    scanSamples: g.scanSamples.slice(),
    counts: { ...g.counts },
  }
}

/** Preparation telemetry derived from the immutable snapshot (distinguishes an empty
 *  pool AFTER successful preparation from a preparation/discovery failure). */
export function preparationTelemetryOf(snapshot: BriefRunSnapshot): PreparationTelemetry {
  const disc = snapshot.discovery
  return {
    preparationStarted: true,
    preparationSucceeded: true,
    discoveryRequired: disc !== null,
    discoveryAttempted: disc?.ran ?? false,
    discoverySucceeded: disc ? disc.provider_ok : false,
    discoveryFailureType: disc && !disc.provider_ok ? 'discovery_provider_failed' : null,
    poolBuiltSuccessfully: true,
    poolEmptyAfterSuccessfulPreparation: snapshot.workingPool.length === 0,
  }
}

type SynthResult = Awaited<ReturnType<typeof synthesizeFromSnapshot>>
type FinalizeResult = ReturnType<typeof finalizeRecommendationAttempt>

/**
 * Reconstruct a per-brief outcome partition from the attempt's REAL aggregate
 * telemetry, assigning each pool briefId to exactly one final stage. The counts are
 * the engine's own (accepted / rejected-by-reason / skipped / missing / not-processed /
 * remaining) plus finalize's per-suggestion removals — so the partition reconciles to
 * poolSize by construction (dropped items are extra echoed ids, never pool briefs, so
 * they are excluded). The briefId↔stage pairing WITHIN a stage bucket is positional;
 * rescue potential depends only on the per-class COUNTS, which are exact.
 */
export function deriveBriefOutcomes(snapshot: BriefRunSnapshot, synth: SynthResult, fin: FinalizeResult): BriefOutcome[] {
  const ids = snapshot.workingPool.map((b) => b.opportunityId)
  const d = synth.diagnostics
  const sum = (f: (r: (typeof d.rounds)[number]) => number) => d.rounds.reduce((a, r) => a + f(r), 0)
  const skipped = sum((r) => r.skipped_by_model)
  const missing = sum((r) => r.missing_from_response)
  const notProcessed = sum((r) => r.not_processed)
  const engineRej = Object.entries(d.rejected_by_reason) as [string, number][]
  const postprocReasons = fin.finalizationOutcomes.filter((o) => o.removed).map((o) => o.reason ?? 'postproc_unknown')
  const finalizedAccepted = fin.finalSuggestions.length
  const remaining = d.brief_consumption.remainingBriefs

  const outcomes: BriefOutcome[] = []
  let i = 0
  const take = (n: number, make: (id: string) => BriefOutcome) => { for (let k = 0; k < n && i < ids.length; k++) outcomes.push(make(ids[i++])) }

  take(finalizedAccepted, (id) => ({ briefId: id, stage: 'finalized_accepted' }))
  for (const reason of postprocReasons) take(1, (id) => ({ briefId: id, stage: 'postproc_rejected', reason }))
  for (const [reason, count] of engineRej) take(count, (id) => ({ briefId: id, stage: 'engine_rejected', reason }))
  take(notProcessed, (id) => ({ briefId: id, stage: 'not_processed' }))
  take(skipped, (id) => ({ briefId: id, stage: 'model_skipped' }))
  take(missing, (id) => ({ briefId: id, stage: 'partial_missing' }))
  take(remaining, (id) => ({ briefId: id, stage: 'unprocessed' }))
  // Safety: any pool brief not covered by the counts is genuinely unconsumed.
  while (i < ids.length) outcomes.push({ briefId: ids[i++], stage: 'unprocessed' })
  return outcomes
}

export interface SmartAttemptRecord {
  model: string | null
  role: 'flash' | 'pro'
  attemptIndex: number
  engineAcceptedCount: number
  finalizedCount: number
  finalized: FinalizedAttempt
  escalation: EscalationResult
  reconciled: boolean
  estimatedCostUsd: number
}

export interface SmartComparisonResult {
  poolSize: number
  discoveryRan: boolean
  preparationProviderCalls: number
  flash: SmartAttemptRecord[]
  pro: SmartAttemptRecord[]
  selection: SelectResult
  budget: BudgetAuthorization
  /** Writes attempted by the harness — MUST be 0 (nothing is persisted). */
  persistedWrites: number
}

export interface SmartComparisonOptions {
  flashModel: string
  proModel: string
  flashAttempts?: number
  proAttempts?: number
  budgetMaxima: BudgetMaxima
  /** Optional hook to observe/count any persistence attempt (there must be none). */
  onPersistAttempt?: () => void
  mode?: 'standard' | 'premium'
}

/** Run one finalized attempt (synthesize → finalize → accounting → escalate). */
async function runOneAttempt(
  snapshot: BriefRunSnapshot,
  input: BriefRunInput,
  model: string,
  role: 'flash' | 'pro',
  attemptIndex: number,
  mode: 'standard' | 'premium',
): Promise<SmartAttemptRecord> {
  const ctrl: RunCostController = newRunCostController(mode, `smart-${role}-${attemptIndex}`, input.targetCount)
  const synth = await synthesizeFromSnapshot(snapshot, ctrl, { modelOverride: model })
  // FRESH cloned guard per attempt: finalize mutates guard.keywords/titles for
  // intra-batch dedup and must never leak into the next attempt or the snapshot.
  const fin = finalizeRecommendationAttempt({ guard: cloneKeywordGuard(snapshot.guard), existingPages: snapshot.existingPages }, synth.suggestions)
  const rescue = computeRescueAccounting(deriveBriefOutcomes(snapshot, synth, fin), snapshot.workingPool.length)
  const finalized: FinalizedAttempt = {
    poolSize: snapshot.workingPool.length,
    finalUserFacingCount: fin.finalSuggestions.length,
    preparation: preparationTelemetryOf(snapshot),
    rounds: synth.diagnostics.rounds.map((r) => ({ providerOk: r.provider_ok, synthesisFailure: r.synthesis_failure })),
    stopReason: synth.diagnostics.stop_reason,
    rescue,
  }
  return {
    model, role, attemptIndex,
    engineAcceptedCount: synth.suggestions.length,
    finalizedCount: fin.finalSuggestions.length,
    finalized,
    escalation: escalateToPro(finalized, input.targetCount),
    reconciled: rescue.reconciled,
    estimatedCostUsd: ctrl.costTelemetry(fin.finalSuggestions.length).estimatedRunCostUsd,
  }
}

/**
 * Compare Flash vs Pro over ONE snapshot. Discovery runs once (in prepare, on a global
 * run controller); each synthesis attempt uses its OWN fresh controller and cloned
 * guard. Persists nothing.
 */
export async function runSmartComparison(admin: Admin, input: BriefRunInput, opts: SmartComparisonOptions): Promise<SmartComparisonResult> {
  const mode = opts.mode ?? 'standard'
  const flashAttempts = Math.max(3, opts.flashAttempts ?? 3)
  const proAttempts = Math.max(3, opts.proAttempts ?? 3)

  // ── ONE snapshot (evidence → pool → the single discovery call) ──────────────
  const runController = newRunCostController(mode, 'smart-prepare', input.targetCount)
  const snapshot = await prepareBriefRun(admin, input, runController)
  const preparationProviderCalls = runController.summary().totalCalls

  const flash: SmartAttemptRecord[] = []
  for (let i = 0; i < flashAttempts; i++) flash.push(await runOneAttempt(snapshot, input, opts.flashModel, 'flash', i, mode))
  const pro: SmartAttemptRecord[] = []
  for (let i = 0; i < proAttempts; i++) pro.push(await runOneAttempt(snapshot, input, opts.proModel, 'pro', i, mode))

  // Selection uses the strongest attempt on each side (highest finalized count).
  const best = (xs: SmartAttemptRecord[]) => xs.reduce((a, b) => (b.finalizedCount > a.finalizedCount ? b : a))
  const bestFlash = best(flash)
  const bestPro = best(pro)
  const selection = selectBatch(
    { complete: bestFlash.finalizedCount >= input.targetCount || bestFlash.escalation.reason === 'genuine_exhaustion', finalUserFacingCount: bestFlash.finalizedCount },
    { complete: bestPro.finalizedCount >= input.targetCount || bestPro.escalation.reason === 'genuine_exhaustion', finalUserFacingCount: bestPro.finalizedCount },
  )

  return {
    poolSize: snapshot.workingPool.length,
    discoveryRan: snapshot.discovery?.ran ?? false,
    preparationProviderCalls,
    flash, pro,
    selection,
    budget: authorizeSmartRunBudget(opts.budgetMaxima),
    persistedWrites: 0,
  }
}
