/**
 * Opportunity-first recovery tiers (P0 Part C) — PURE control flow.
 *
 * strict opportunity-first (Tier 1)
 *   → broadened opportunity-first (Tier 2)
 *   → controlled discovery within the SAME architecture (Tier 3)
 *   → typed empty only when no safe opportunity exists.
 *
 * NEVER strict → legacy product-derived generation, and NEVER strict → immediate
 * zero. Each tier uses the same evidence graph, the same ContentOpportunity model
 * and the same hard safety gates (worthiness + cannibalization); only the breadth of
 * evidence admitted and the confidence label change. This module decides WHICH tiers
 * run; the injected `runTier` performs the per-tier build + synthesis + gating and
 * returns already-validated suggestions.
 */

import type { TopicSuggestion } from './types'

export type RecoveryTier = 1 | 2 | 3
export type ConfidenceLevel = 'high_confidence' | 'medium_confidence' | 'discovery'

export interface TierPlan {
  tier: RecoveryTier
  confidenceLevel: ConfidenceLevel
  discovery: boolean
}

/** Tier 1 strict → Tier 2 broadened → Tier 3 controlled discovery. */
export const TIER_PLANS: readonly TierPlan[] = [
  { tier: 1, confidenceLevel: 'high_confidence', discovery: false },
  { tier: 2, confidenceLevel: 'medium_confidence', discovery: false },
  { tier: 3, confidenceLevel: 'discovery', discovery: true },
]

export type FallbackReason =
  | 'tier_1_insufficient'
  | 'tier_2_insufficient'
  | 'no_safe_opportunities'
  | null

export interface RecoveryOutcome {
  suggestions: TopicSuggestion[]
  tiersRun: RecoveryTier[]
  recoveryTierUsed: RecoveryTier | null
  discoveryUsed: boolean
  fallbackReason: FallbackReason
}

/**
 * Run recovery tiers until `targetFloor` defensible suggestions accumulate or all
 * tiers are exhausted. A tier that already satisfies the floor short-circuits the
 * rest (Tier 1 success never runs Tier 2/3). Suggestions are de-duplicated across
 * tiers by `keyKey` so a broader tier never re-emits an earlier tier's opportunity.
 */
export async function runRecoveryTiers(deps: {
  targetFloor: number
  keyKey: (s: TopicSuggestion) => string
  runTier: (plan: TierPlan) => Promise<TopicSuggestion[]>
  plans?: readonly TierPlan[]
}): Promise<RecoveryOutcome> {
  const plans = deps.plans ?? TIER_PLANS
  const acc: TopicSuggestion[] = []
  const seen = new Set<string>()
  const tiersRun: RecoveryTier[] = []

  for (const plan of plans) {
    tiersRun.push(plan.tier)
    const produced = await deps.runTier(plan)
    for (const s of produced) {
      const k = deps.keyKey(s)
      if (!k || seen.has(k)) continue
      seen.add(k)
      acc.push(s)
    }
    if (acc.length >= deps.targetFloor) break
  }

  const lastRun = tiersRun.length ? tiersRun[tiersRun.length - 1] : null
  const fallbackReason: FallbackReason =
    acc.length === 0 ? 'no_safe_opportunities'
      : tiersRun.includes(3) ? 'tier_2_insufficient'
        : tiersRun.includes(2) ? 'tier_1_insufficient'
          : null
  return {
    suggestions: acc,
    tiersRun,
    recoveryTierUsed: lastRun,
    discoveryUsed: tiersRun.includes(3),
    fallbackReason,
  }
}
