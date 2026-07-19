/**
 * PRODUCTION Pro-first controller — PURE decision layer (Stage D).
 *
 * The global production decision (Stage C evidence): first model = Pro; Flash is a
 * FALLBACK only, run at most once, and ONLY when Pro finalized zero AND the zero is
 * model-rescuable (unique rescue briefIds exist) AND the budget authorizes it.
 *
 * These functions DECIDE only — they never call a provider, never touch a snapshot,
 * never persist, and never depend on the UI. The impure orchestration lives in
 * production-run.ts. Selection is by PRIORITY, never by count/cost/latency:
 *   1. a non-empty finalized Pro batch (even a single recommendation) always wins;
 *   2. else a non-empty finalized Flash fallback batch;
 *   3. else no batch (persist nothing).
 */

export type FallbackReason =
  | 'pro_produced_batch'            // Pro finalized ≥1 → Flash forbidden
  | 'preparation_failure'           // preparation did not succeed
  | 'no_evidence'                   // empty pool after successful preparation
  | 'genuine_exhaustion'            // no unique rescue briefIds (structural-only / nothing to rescue)
  | 'fallback_budget_blocked'       // budget does not authorize the fallback call
  // The FAILURE that triggers a fallback is a PRO failure — named after the Pro cause.
  | 'pro_provider_failure_rescue'   // Pro provider-failed with rescue → Flash runs
  | 'pro_synthesis_failure_rescue'  // Pro synthesis-failed with rescue → Flash runs
  | 'pro_zero_marginal_yield_rescue'// Pro produced 0 usable with rescue → Flash runs

export interface FlashFallbackInput {
  proFinalizedCount: number
  preparationSucceeded: boolean
  poolEmptyAfterSuccessfulPreparation: boolean
  /** |rescuePotentialBriefIds| from the unique-briefId rescue accounting. */
  rescueUniqueBriefIdCount: number
  proProviderFailed: boolean
  proSynthesisFailed: boolean
  budgetAuthorizesFallback: boolean
}

export interface FlashFallbackDecision { runFlash: boolean; reason: FallbackReason }

/**
 * Decide whether the single Flash fallback may run after a real Pro attempt finalized
 * zero. Order matters: a produced Pro batch, a failed preparation, an empty pool, an
 * empty rescue set, or a blocked budget each forbid Flash BEFORE the pro-failure-mode
 * reason is chosen.
 */
export function evaluateFlashFallback(i: FlashFallbackInput): FlashFallbackDecision {
  if (i.proFinalizedCount > 0) return { runFlash: false, reason: 'pro_produced_batch' }
  if (!i.preparationSucceeded) return { runFlash: false, reason: 'preparation_failure' }
  if (i.poolEmptyAfterSuccessfulPreparation) return { runFlash: false, reason: 'no_evidence' }
  // genuine exhaustion ⟺ empty unique-rescue set (structural-only rejections included).
  if (i.rescueUniqueBriefIdCount <= 0) return { runFlash: false, reason: 'genuine_exhaustion' }
  if (!i.budgetAuthorizesFallback) return { runFlash: false, reason: 'fallback_budget_blocked' }
  if (i.proProviderFailed) return { runFlash: true, reason: 'pro_provider_failure_rescue' }
  if (i.proSynthesisFailed) return { runFlash: true, reason: 'pro_synthesis_failure_rescue' }
  return { runFlash: true, reason: 'pro_zero_marginal_yield_rescue' }
}

export type ProductionSelected = 'pro' | 'flash' | 'none'
export type SelectReason = 'pro_final_nonempty' | 'flash_fallback_nonempty' | 'no_batch'
export interface ProductionSelection { selected: ProductionSelected; reason: SelectReason }

/**
 * Priority selector. A non-empty finalized Pro batch ALWAYS wins (even 1 < target, and
 * even if a hypothetical Flash batch would be larger). Never merges; never selects by
 * count/cost/latency.
 */
export function selectProductionBatch(proFinalizedCount: number, flashFinalizedCount: number | null): ProductionSelection {
  if (proFinalizedCount > 0) return { selected: 'pro', reason: 'pro_final_nonempty' }
  if (flashFinalizedCount !== null && flashFinalizedCount > 0) return { selected: 'flash', reason: 'flash_fallback_nonempty' }
  return { selected: 'none', reason: 'no_batch' }
}

export interface ProductionRunDecisionInput {
  /** A REAL Pro model was resolved (not downgraded to Flash before any Pro call). */
  proAvailable: boolean
  proFinalizedCount: number
  /** Present only when proAvailable and proFinalizedCount === 0. */
  fallback: FlashFallbackDecision | null
  /** Present only when a Flash attempt actually ran. */
  flashFinalizedCount: number | null
}

export interface ProductionRunDecision {
  flashRan: boolean
  selected: ProductionSelected
  selectReason: SelectReason
  reason: FallbackReason | 'pro_unavailable'
}

/**
 * Combine model resolution + the fallback decision + the priority selector into the
 * final production run decision (pure). When Pro was downgraded to Flash BEFORE any Pro
 * call, exactly one Flash attempt ran and the run is a Flash run (reason pro_unavailable)
 * — never recorded as Pro.
 */
export function buildProductionRunDecision(i: ProductionRunDecisionInput): ProductionRunDecision {
  if (!i.proAvailable) {
    const sel = selectProductionBatch(0, i.flashFinalizedCount)
    return { flashRan: true, selected: sel.selected, selectReason: sel.reason, reason: 'pro_unavailable' }
  }
  if (i.proFinalizedCount > 0) return { flashRan: false, selected: 'pro', selectReason: 'pro_final_nonempty', reason: 'pro_produced_batch' }
  const fb = i.fallback ?? { runFlash: false, reason: 'genuine_exhaustion' as FallbackReason }
  if (!fb.runFlash) return { flashRan: false, selected: 'none', selectReason: 'no_batch', reason: fb.reason }
  const sel = selectProductionBatch(0, i.flashFinalizedCount)
  return { flashRan: true, selected: sel.selected, selectReason: sel.reason, reason: fb.reason }
}
