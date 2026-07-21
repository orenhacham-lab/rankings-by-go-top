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
import { sanitizeProviderMessage, classifyModelError } from './model'
import type { KeywordGuard } from './keyword-guard'
import type { TopicSuggestion } from './types'
import {
  computeRescueAccounting, escalateToPro, authorizeSmartRunBudget, simulatePairedSelection,
  type BriefOutcome, type FinalizedAttempt, type PreparationTelemetry, type EscalationResult,
  type PairedSelectionResult, type BudgetAuthorization, type BudgetMaxima,
} from './smart-controller'

/** Server-side HARD ceiling on attempts per model (defense in depth; the QA endpoint
 *  enforces its own, lower, operator-facing maximum). */
export const HARNESS_MAX_ATTEMPTS_PER_MODEL = 8
/** Minimum attempts per model (Stage-B requires ≥3 Flash + ≥3 Pro). */
export const HARNESS_MIN_ATTEMPTS_PER_MODEL = 3

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
  zeroResult: boolean
  providerOk: boolean
  synthesisFailure: string | null
  stopReason: string
  finalized: FinalizedAttempt
  escalation: EscalationResult
  reconciled: boolean
  /** True when the attempt threw (e.g. provider/model unavailable) — recorded, never
   *  aborts the comparison. A failed attempt processed nothing (all briefs unprocessed). */
  failed: boolean
  error: string | null
  estimatedCostUsd: number
  tokenUsage: { input: number; output: number; thinking: number }
  callCount: number
  latencyMs: number
  /** UNIQUE finalized-accepted brief IDs (from the rescue accounting's ID set). */
  uniqueAcceptedBriefIds: string[]
  /** Rescue-accounting counts DERIVED from unique briefId sets (never summed). */
  rescueCounts: FinalizedAttempt['rescue']['counts']
  /** QA/admin-only provider diagnostics for this attempt (exact requested model id +
   *  the sanitized provider failure cause). NEVER enters the blind-review export. */
  providerDiagnostics: {
    requestedModel: string | null
    providerStatus: string | null
    providerErrorType: string | null
    sanitizedProviderMessage: string | null
    finishReason: string | null
    httpStatus: number | null
    retryCount: number
    threw: boolean
  }
  /** Server-only: the finalized suggestions, used to build the blind export. NEVER
   *  serialized to the client raw (they carry modelUsed). */
  finalizedSuggestions: TopicSuggestion[]
}

/** Aggregate Flash-vs-Pro metrics for one model side (derived from the attempts). */
export interface AggregateMetrics {
  model: string | null
  totalAttempts: number
  targetCompletionRate: number
  nonEmptyRate: number
  zeroResultRate: number
  meanFinalized: number
  medianFinalized: number
  minFinalized: number
  maxFinalized: number
  averageCostUsd: number
  costPerNonEmptyBatchUsd: number | null
  costPerFinalizedAcceptedUsd: number | null
  averageLatencyMs: number
  p95LatencyMs: number
  providerFailureRate: number
  synthesisFailureRate: number
}

export interface SmartComparisonResult {
  snapshotId: string
  poolSize: number
  orderedBriefIds: string[]
  discoveryRan: boolean
  preparationProviderCalls: number
  targetCount: number
  flash: SmartAttemptRecord[]
  pro: SmartAttemptRecord[]
  aggregate: { flash: AggregateMetrics; pro: AggregateMetrics }
  /** QA measurement over SIX independent attempts — a labeled per-attempt-pair
   *  simulation, never one arbitrary top-level winner. Failed attempts are ineligible. */
  selectionSimulation: PairedSelectionResult
  budget: BudgetAuthorization
  maxAuthorizedCostUsd: number
  actualCostUsd: number
  /** Writes attempted by the harness — MUST be 0 (nothing is persisted). */
  persistedWrites: number
}

export interface SmartComparisonOptions {
  flashModel: string
  proModel: string
  flashAttempts?: number
  proAttempts?: number
  budgetMaxima: BudgetMaxima
  /** Per-attempt cost ceiling (USD) for the pre-run max-authorized cost (defaults to
   *  budgetMaxima.flashAttemptMaxUsd). */
  perAttemptCeilingUsd?: number
  /** Preparation (discovery) cost ceiling (USD) for the pre-run max-authorized cost
   *  (defaults to budgetMaxima.preparationMaxUsd). */
  preparationCeilingUsd?: number
  mode?: 'standard' | 'premium'
  /** Cooperative cancellation — checked between attempts. */
  signal?: { aborted: boolean }
  /** Progress hook (attempt completed). */
  onAttempt?: (rec: SmartAttemptRecord) => void
}

/** Deterministic, model-independent snapshot id from the ORDERED brief pool. */
export function snapshotIdOf(snapshot: BriefRunSnapshot, projectId: string): string {
  const basis = `${projectId}|${snapshot.workingPool.length}|${snapshot.workingPool.map((b) => b.opportunityId).join(',')}`
  let h = 0x811c9dc5
  for (let i = 0; i < basis.length; i++) { h ^= basis.charCodeAt(i); h = Math.imul(h, 0x01000193) }
  return `snap_${(h >>> 0).toString(36)}`
}

function parseHttpStatus(s: string | null | undefined): number | null {
  if (!s) return null
  const m = /\b(4\d\d|5\d\d)\b/.exec(s)
  return m ? Number(m[1]) : null
}

type SynthResultForDiag = Awaited<ReturnType<typeof synthesizeFromSnapshot>>
/** Pull the exact provider diagnostics for a (possibly failed) synthesis attempt from
 *  its round diagnostics — the failing round if any, else the last. QA/admin only. */
function providerDiagnosticsOf(synth: SynthResultForDiag, requestedModel: string): SmartAttemptRecord['providerDiagnostics'] {
  const rounds = synth.diagnostics.rounds
  const bad = rounds.find((r) => !r.provider_ok) ?? rounds[rounds.length - 1] ?? null
  const msg = bad?.sanitizedProviderMessage ?? null
  return {
    requestedModel,
    providerStatus: bad ? (bad.provider_ok ? 'ok' : (bad.providerStatus ?? 'error')) : null,
    providerErrorType: bad?.providerErrorType ?? null,
    sanitizedProviderMessage: msg,
    finishReason: bad?.finishReason ?? null,
    httpStatus: parseHttpStatus(msg) ?? parseHttpStatus(bad?.providerErrorType ?? null),
    retryCount: 0, // synthesis never repeats a non-retryable provider failure in a round
    threw: false,
  }
}

/** Run one finalized attempt (synthesize → finalize → accounting → escalate). */
async function runOneAttempt(
  snapshot: BriefRunSnapshot,
  input: BriefRunInput,
  model: string,
  role: 'flash' | 'pro',
  attemptIndex: number,
  mode: 'standard' | 'premium',
  now: () => number,
): Promise<SmartAttemptRecord> {
  const ctrl: RunCostController = newRunCostController(mode, `smart-${role}-${attemptIndex}`, input.targetCount)
  const t0 = now()
  let synth: Awaited<ReturnType<typeof synthesizeFromSnapshot>>
  try {
    synth = await synthesizeFromSnapshot(snapshot, ctrl, { modelOverride: model })
  } catch (err) {
    // A hard provider/model failure for THIS attempt — recorded, never fatal. The
    // attempt processed nothing, so every pool brief is unprocessed (rescue potential),
    // and it reads as a provider-failed under-target attempt (escalates).
    const rescue = computeRescueAccounting(snapshot.workingPool.map((b) => ({ briefId: b.opportunityId, stage: 'unprocessed' as const })), snapshot.workingPool.length)
    const finalized: FinalizedAttempt = {
      poolSize: snapshot.workingPool.length, finalUserFacingCount: 0,
      preparation: preparationTelemetryOf(snapshot), rounds: [{ providerOk: false, synthesisFailure: null }],
      stopReason: 'provider_failed', rescue,
    }
    const sum = ctrl.summary()
    return {
      model, role, attemptIndex, engineAcceptedCount: 0, finalizedCount: 0, zeroResult: true,
      providerOk: false, synthesisFailure: null, stopReason: 'provider_failed', finalized,
      escalation: escalateToPro(finalized, input.targetCount), reconciled: rescue.reconciled,
      failed: true, error: sanitizeProviderMessage(err instanceof Error ? err.message : String(err)).slice(0, 300),
      estimatedCostUsd: ctrl.costTelemetry(0).estimatedRunCostUsd,
      tokenUsage: { input: sum.totalInputTokens, output: sum.totalOutputTokens, thinking: sum.totalThinkingTokens },
      callCount: sum.totalCalls, latencyMs: now() - t0,
      uniqueAcceptedBriefIds: [], rescueCounts: rescue.counts, finalizedSuggestions: [],
      providerDiagnostics: {
        requestedModel: model, providerStatus: 'error',
        providerErrorType: classifyModelError(err instanceof Error ? err.message : String(err)),
        sanitizedProviderMessage: sanitizeProviderMessage(err instanceof Error ? err.message : String(err)),
        finishReason: null, httpStatus: parseHttpStatus(err instanceof Error ? err.message : String(err)),
        retryCount: 0, threw: true,
      },
    }
  }
  // FRESH cloned guard per attempt: finalize mutates guard.keywords/titles for
  // intra-batch dedup and must never leak into the next attempt or the snapshot.
  const fin = finalizeRecommendationAttempt({ guard: cloneKeywordGuard(snapshot.guard), existingPages: snapshot.existingPages }, synth.suggestions)
  const latencyMs = now() - t0
  const rescue = computeRescueAccounting(deriveBriefOutcomes(snapshot, synth, fin), snapshot.workingPool.length)
  const finalized: FinalizedAttempt = {
    poolSize: snapshot.workingPool.length,
    finalUserFacingCount: fin.finalSuggestions.length,
    preparation: preparationTelemetryOf(snapshot),
    rounds: synth.diagnostics.rounds.map((r) => ({ providerOk: r.provider_ok, synthesisFailure: r.synthesis_failure })),
    stopReason: synth.diagnostics.stop_reason,
    rescue,
  }
  const sum = ctrl.summary()
  const providerOk = synth.diagnostics.stop_reason !== 'provider_failed' && synth.diagnostics.rounds.every((r) => r.provider_ok)
  const synthesisFailure = synth.diagnostics.rounds.map((r) => r.synthesis_failure).find((x) => x !== null) ?? (synth.diagnostics.stop_reason === 'synthesis_failed' ? 'synthesis_failed' : null)
  return {
    model, role, attemptIndex,
    engineAcceptedCount: synth.suggestions.length,
    finalizedCount: fin.finalSuggestions.length,
    zeroResult: fin.finalSuggestions.length === 0,
    providerOk,
    synthesisFailure,
    stopReason: synth.diagnostics.stop_reason,
    finalized,
    escalation: escalateToPro(finalized, input.targetCount),
    reconciled: rescue.reconciled,
    // A provider- or synthesis-failed attempt (even without a throw) is a FAILED
    // attempt — never an eligible batch. A valid attempt that finalized 0 is NOT failed.
    failed: !providerOk || synthesisFailure !== null,
    error: providerOk && synthesisFailure === null ? null : (synth.diagnostics.rounds.find((r) => !r.provider_ok)?.sanitizedProviderMessage ?? synthesisFailure ?? 'attempt_incomplete'),
    estimatedCostUsd: ctrl.costTelemetry(fin.finalSuggestions.length).estimatedRunCostUsd,
    tokenUsage: { input: sum.totalInputTokens, output: sum.totalOutputTokens, thinking: sum.totalThinkingTokens },
    callCount: sum.totalCalls,
    latencyMs,
    uniqueAcceptedBriefIds: Array.from(rescue.finalizedAcceptedBriefIds),
    rescueCounts: rescue.counts,
    finalizedSuggestions: fin.finalSuggestions,
    providerDiagnostics: providerDiagnosticsOf(synth, model),
  }
}

const median = (xs: number[]): number => {
  if (xs.length === 0) return 0
  const s = [...xs].sort((a, b) => a - b)
  const mid = Math.floor(s.length / 2)
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2
}
const p95 = (xs: number[]): number => {
  if (xs.length === 0) return 0
  const s = [...xs].sort((a, b) => a - b)
  return s[Math.min(s.length - 1, Math.ceil(0.95 * s.length) - 1)]
}
const round = (n: number, d = 4): number => Number(n.toFixed(d))

/** Aggregate one model side's attempts (target completion, yield distribution, cost
 *  efficiency, latency, failure rates) — all derived from the attempt records. */
export function computeAggregate(records: SmartAttemptRecord[], targetCount: number, model: string | null): AggregateMetrics {
  const n = records.length
  const finals = records.map((r) => r.finalizedCount)
  const nonEmpty = records.filter((r) => r.finalizedCount > 0)
  const totalCost = records.reduce((s, r) => s + r.estimatedCostUsd, 0)
  const totalFinalized = finals.reduce((s, x) => s + x, 0)
  return {
    model,
    totalAttempts: n,
    targetCompletionRate: n ? round(records.filter((r) => r.finalizedCount >= targetCount).length / n) : 0,
    nonEmptyRate: n ? round(nonEmpty.length / n) : 0,
    zeroResultRate: n ? round(records.filter((r) => r.zeroResult).length / n) : 0,
    meanFinalized: n ? round(totalFinalized / n, 3) : 0,
    medianFinalized: median(finals),
    minFinalized: n ? Math.min(...finals) : 0,
    maxFinalized: n ? Math.max(...finals) : 0,
    averageCostUsd: n ? round(totalCost / n, 6) : 0,
    costPerNonEmptyBatchUsd: nonEmpty.length ? round(totalCost / nonEmpty.length, 6) : null,
    costPerFinalizedAcceptedUsd: totalFinalized ? round(totalCost / totalFinalized, 6) : null,
    averageLatencyMs: n ? Math.round(records.reduce((s, r) => s + r.latencyMs, 0) / n) : 0,
    p95LatencyMs: p95(records.map((r) => r.latencyMs)),
    providerFailureRate: n ? round(records.filter((r) => !r.providerOk).length / n) : 0,
    synthesisFailureRate: n ? round(records.filter((r) => r.synthesisFailure !== null).length / n) : 0,
  }
}

/**
 * Compare Flash vs Pro over ONE snapshot. Discovery runs once (in prepare, on a global
 * run controller); each synthesis attempt uses its OWN fresh controller and cloned
 * guard. Persists nothing.
 */
export async function runSmartComparison(admin: Admin, input: BriefRunInput, opts: SmartComparisonOptions): Promise<SmartComparisonResult> {
  const mode = opts.mode ?? 'standard'
  const clamp = (v: number | undefined) => Math.min(HARNESS_MAX_ATTEMPTS_PER_MODEL, Math.max(HARNESS_MIN_ATTEMPTS_PER_MODEL, v ?? HARNESS_MIN_ATTEMPTS_PER_MODEL))
  const flashAttempts = clamp(opts.flashAttempts)
  const proAttempts = clamp(opts.proAttempts)
  // Date.now is unavailable to workflow scripts but this is a normal module — used
  // ONLY for latency telemetry, never for control flow.
  const now = () => Date.now()
  const aborted = () => opts.signal?.aborted === true

  // ── ONE snapshot (evidence → pool → the single discovery call) ──────────────
  const runController = newRunCostController(mode, 'smart-prepare', input.targetCount)
  const snapshot = await prepareBriefRun(admin, input, runController)
  const preparationProviderCalls = runController.summary().totalCalls

  const flash: SmartAttemptRecord[] = []
  for (let i = 0; i < flashAttempts; i++) {
    if (aborted()) break
    const rec = await runOneAttempt(snapshot, input, opts.flashModel, 'flash', i, mode, now)
    flash.push(rec); opts.onAttempt?.(rec)
  }
  const pro: SmartAttemptRecord[] = []
  for (let i = 0; i < proAttempts; i++) {
    if (aborted()) break
    const rec = await runOneAttempt(snapshot, input, opts.proModel, 'pro', i, mode, now)
    pro.push(rec); opts.onAttempt?.(rec)
  }

  // Selection is a per-attempt-PAIR simulation over the six independent attempts —
  // NOT a single arbitrary winner. Failed attempts are ineligible; a complete batch
  // always outranks an ineligible one; Flash and Pro are never merged.
  const forSel = (a: SmartAttemptRecord) => ({ failed: a.failed, providerOk: a.providerOk, synthesisFailure: a.synthesisFailure, finalizedCount: a.finalizedCount })
  const selectionSimulation = simulatePairedSelection(flash.map(forSel), pro.map(forSel))

  const perAttemptCeilingUsd = opts.perAttemptCeilingUsd ?? opts.budgetMaxima.flashAttemptMaxUsd
  const preparationCeilingUsd = opts.preparationCeilingUsd ?? opts.budgetMaxima.preparationMaxUsd
  const actualCostUsd = round([...flash, ...pro].reduce((s, r) => s + r.estimatedCostUsd, 0), 6)
  const maxAuthorizedCostUsd = round(preparationCeilingUsd + perAttemptCeilingUsd * (flashAttempts + proAttempts), 6)

  return {
    snapshotId: snapshotIdOf(snapshot, input.projectId),
    poolSize: snapshot.workingPool.length,
    orderedBriefIds: snapshot.workingPool.map((b) => b.opportunityId),
    discoveryRan: snapshot.discovery?.ran ?? false,
    preparationProviderCalls,
    targetCount: input.targetCount,
    flash, pro,
    aggregate: { flash: computeAggregate(flash, input.targetCount, opts.flashModel), pro: computeAggregate(pro, input.targetCount, opts.proModel) },
    selectionSimulation,
    budget: authorizeSmartRunBudget(opts.budgetMaxima),
    maxAuthorizedCostUsd,
    actualCostUsd,
    persistedWrites: 0,
  }
}

/** Pre-run WORST-CASE cost estimate (no snapshot prepared, no provider calls): the
 *  preparation ceiling + the per-attempt ceiling for every Flash and Pro attempt. It is
 *  a worst-case CEILING (each attempt's real spend is bounded far below its per-run
 *  ceiling), and it depends on the attempt count + the per-run ceiling — NOT on the
 *  target count, because the per-run cost ceiling is itself target-independent. */
export function maxAuthorizedCostFor(attemptsPerModel: number, perAttemptCeilingUsd: number, preparationCeilingUsd: number): number {
  const n = Math.min(HARNESS_MAX_ATTEMPTS_PER_MODEL, Math.max(HARNESS_MIN_ATTEMPTS_PER_MODEL, attemptsPerModel))
  return round(preparationCeilingUsd + perAttemptCeilingUsd * (n * 2), 6)
}

/** Parse the QA global cost cap from its env string. A missing, non-numeric, or
 *  non-positive value falls back to the default (never NaN — which would break the
 *  authorization comparison). */
export function parseQaCostCapUsd(raw: string | undefined, defaultCapUsd: number): number {
  const n = Number(raw)
  return Number.isFinite(n) && n > 0 ? n : defaultCapUsd
}

/** Authorize a QA comparison run against the enforced cap. A run whose WORST-CASE
 *  estimate exceeds the authorized limit is NOT authorized — the endpoint must reject
 *  it (and the UI must not offer a confirm) rather than start spending. */
export function authorizeQaRunCost(estimatedWorstCaseCostUsd: number, authorizedLimitUsd: number): { withinAuthorizedLimit: boolean } {
  return { withinAuthorizedLimit: estimatedWorstCaseCostUsd <= authorizedLimitUsd }
}
