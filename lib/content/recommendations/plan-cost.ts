/**
 * Content-plan cost model (H) — PURE. Mode-specific HARD ceilings (maximums, not fixed
 * prices) for the batched content-plan architecture. The KPI is cost per ACCEPTED safe
 * topic, not cost per scan. 'quick' preserves the existing single-scan budget.
 */

export type PlanMode = 'quick' | 'plan_25' | 'full_calendar_50'

export interface PlanBudget {
  mode: PlanMode
  requestedTopicCount: number
  /** Over-generate: build a larger candidate pool because deterministic gates reject
   *  many. Never one model call per topic. */
  candidatePoolTarget: number
  maxSynthesisCalls: number
  maxValidatorCalls: number
  maxCalls: number
  maxCostUsd: number
}

const BUDGETS: Record<PlanMode, PlanBudget> = {
  // At most 1 validator call for quick/plan_25, at most 2 for full_calendar_50 (A.1).
  quick: { mode: 'quick', requestedTopicCount: 10, candidatePoolTarget: 15, maxSynthesisCalls: 2, maxValidatorCalls: 1, maxCalls: 4, maxCostUsd: 0.15 },
  plan_25: { mode: 'plan_25', requestedTopicCount: 25, candidatePoolTarget: 45, maxSynthesisCalls: 2, maxValidatorCalls: 1, maxCalls: 4, maxCostUsd: 0.30 },
  full_calendar_50: { mode: 'full_calendar_50', requestedTopicCount: 50, candidatePoolTarget: 90, maxSynthesisCalls: 3, maxValidatorCalls: 2, maxCalls: 5, maxCostUsd: 0.50 },
}

/** Server-side maximum requestedCount per mode (D.2). */
export function maxRequestedForMode(mode: PlanMode): number {
  return planBudget(mode).requestedTopicCount
}

export function planBudget(mode: PlanMode): PlanBudget {
  return BUDGETS[mode] ?? BUDGETS.quick
}

/** Map a raw requested count / mode string to a mode (bounded, safe). */
export function resolvePlanMode(input: { mode?: string | null; requestedCount?: number | null }): PlanMode {
  const m = (input.mode ?? '').toLowerCase()
  if (m === 'full_calendar_50' || m === 'full_calendar' || m === 'calendar') return 'full_calendar_50'
  if (m === 'plan_25' || m === 'plan') return 'plan_25'
  if (m === 'quick') return 'quick'
  const n = input.requestedCount ?? 0
  if (n >= 40) return 'full_calendar_50'
  if (n >= 20) return 'plan_25'
  return 'quick'
}

export interface PlanCostEstimate { estimated_calls: number; estimated_max_cost: number; requested_topic_count: number }

/** BEFORE execution — expose the ceiling to the caller/UI. */
export function estimatePlanCost(mode: PlanMode): PlanCostEstimate {
  const b = planBudget(mode)
  return { estimated_calls: b.maxSynthesisCalls + b.maxValidatorCalls, estimated_max_cost: b.maxCostUsd, requested_topic_count: b.requestedTopicCount }
}

export interface PlanCostActuals { actual_calls: number; actual_estimated_cost: number; accepted_topic_count: number; cost_per_accepted_topic: number }

/** AFTER execution — the real KPI is cost per ACCEPTED safe topic. */
export function planCostActuals(actualCalls: number, actualCostUsd: number, acceptedCount: number): PlanCostActuals {
  return {
    actual_calls: actualCalls,
    actual_estimated_cost: Number(actualCostUsd.toFixed(4)),
    accepted_topic_count: acceptedCount,
    cost_per_accepted_topic: acceptedCount > 0 ? Number((actualCostUsd / acceptedCount).toFixed(4)) : 0,
  }
}
