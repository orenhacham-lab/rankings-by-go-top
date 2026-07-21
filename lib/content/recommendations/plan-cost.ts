/**
 * Content-ideas generation budget (A/E/H) — PURE. ONE product mode: attempt up to ~30
 * safe distinct topics in a single batched operation. Costs/calls are SERVER-SIDE
 * diagnostics only — never shown to customers. A hard ceiling still bounds the run.
 */

export interface ContentIdeasBudget {
  /** Internal target of ACCEPTED topics (soft) and hard maximum persisted per run. */
  targetTopicCount: number
  maxTopicCount: number
  /** Over-generate a raw candidate pool (~35-45) because deterministic gates reject
   *  many; at most 2 synthesis calls + at most 1 batched validator call. */
  candidatePoolTarget: number
  maxSynthesisCalls: number
  maxValidatorCalls: number
  maxCalls: number
  maxCostUsd: number
}

const BUDGET: ContentIdeasBudget = {
  targetTopicCount: 30,
  maxTopicCount: 30,
  candidatePoolTarget: 42,
  maxSynthesisCalls: 2,
  maxValidatorCalls: 1,
  maxCalls: 4,
  maxCostUsd: 0.35,
}

export function contentIdeasBudget(): ContentIdeasBudget {
  return BUDGET
}

/** SERVER-SIDE cost KPI — cost per ACCEPTED safe topic (diagnostics only). */
export interface PlanCostActuals { actual_calls: number; actual_estimated_cost: number; accepted_topic_count: number; cost_per_accepted_topic: number }
export function planCostActuals(actualCalls: number, actualCostUsd: number, acceptedCount: number): PlanCostActuals {
  return {
    actual_calls: actualCalls,
    actual_estimated_cost: Number(actualCostUsd.toFixed(4)),
    accepted_topic_count: acceptedCount,
    cost_per_accepted_topic: acceptedCount > 0 ? Number((actualCostUsd / acceptedCount).toFixed(4)) : 0,
  }
}
