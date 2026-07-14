/**
 * Runtime classification of a recommendation run (observability only).
 *
 * Distinguishes a run that made ZERO model calls from one that made calls but
 * failed, succeeded with no output, or generated candidates that were all
 * rejected by dedupe/coverage/quality. This is what lets a 0-new result be
 * honestly diagnosed instead of being assumed to be "expected dedupe". Pure —
 * no model, no DB, no prompt/threshold logic.
 */

export type RecoRuntimeClass =
  | 'ZERO_CALLS'
  | 'CALLS_FAILED'
  | 'CALLS_SUCCEEDED_ZERO_OUTPUT'
  | 'CANDIDATES_REJECTED'
  | 'PRODUCED_NEW'
  | 'UI_RESPONSE_BINDING_ERROR'

export interface RecoRuntimeSignals {
  /** Model calls actually recorded by the shared cost controller. */
  totalCalls: number
  /** Raw candidates the model returned (pre local/guard filtering). */
  rawCandidates: number
  /** NEW ideas persisted by THIS run after the route's exact-dup/coverage guard. */
  freshPersisted: number
  /** The engine's own reason (model_error / model_empty / all_duplicates / …). */
  reason?: string | null
  /** The shared controller hit the billing circuit breaker. */
  billingExhausted?: boolean
  /** A call was denied before execution by the call/cost budget gate. */
  callsPreventedByBudget?: number
}

const FAILED_REASONS = new Set(['model_error', 'provider_error', 'keyword_research_failed'])

/**
 * Classify one run. Priority: a genuine transient/billing failure, then no-calls,
 * then succeeded-but-empty, then generated-but-all-rejected, else produced-new.
 * NEVER returns CANDIDATES_REJECTED (the "expected dedupe" class) unless raw
 * candidates were actually generated — that is the guard the task demands.
 */
export function classifyRecoRun(s: RecoRuntimeSignals): RecoRuntimeClass {
  if (s.billingExhausted || (s.reason && FAILED_REASONS.has(s.reason))) return 'CALLS_FAILED'
  if (s.totalCalls === 0) return 'ZERO_CALLS'
  if (s.rawCandidates === 0) return 'CALLS_SUCCEEDED_ZERO_OUTPUT'
  // rawCandidates > 0 from here.
  if (s.freshPersisted > 0) return 'PRODUCED_NEW'
  return 'CANDIDATES_REJECTED'
}

/**
 * Fold in the client-observed outcome: if the SERVER produced/persisted new ideas
 * but the UI shows zero, that is a response-binding/scope error, not dedupe.
 */
export function reconcileWithUi(serverClass: RecoRuntimeClass, uiShowedZeroNew: boolean): RecoRuntimeClass {
  if (uiShowedZeroNew && serverClass === 'PRODUCED_NEW') return 'UI_RESPONSE_BINDING_ERROR'
  return serverClass
}
