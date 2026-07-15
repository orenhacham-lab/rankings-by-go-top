/**
 * Batched CONTENT-PLAN orchestrator (B–I) — builds a full publishing calendar in ONE
 * operation on top of the opportunity-first model. Evidence is collected ONCE and
 * reused across a few family-scoped synthesis calls (never one call per topic); the
 * SAME deterministic gates run on the whole candidate pool without extra model calls;
 * survivors are diversity-selected to the requested count; a truthful partial result is
 * returned when safe inventory is exhausted (no fabricated weak topics).
 */

import type { createAdminClient } from '@/lib/supabase/admin'
import { generateOpportunities, type OpportunityDiagnostics } from './generate-opportunities'
import { OPPORTUNITY_FAMILIES } from './opportunity-synthesis'
import { selectDiverse, DEFAULT_CAPS, type DiversityItem } from './diversity'
import { planBudget, estimatePlanCost, planCostActuals, resolvePlanMode, type PlanMode } from './plan-cost'
import { newRunCostController } from './run-cost-controller'
import { contentTokens } from './evidence-cluster'
import { GENERIC_TOKENS } from './opportunity'
import { normalizeText } from './topic-idea-store'
import type { TopicSuggestion } from './types'

type Admin = ReturnType<typeof createAdminClient>

/** In-process evidence-snapshot registry (best-effort reuse signal). A durable cross-
 *  request cache is an additive follow-up; within a single plan request evidence is
 *  already built once and reused across family calls (the actual throughput fix). */
const SNAPSHOTS = new Map<string, { hash: string; at: number }>()

export interface ContentPlanResult {
  suggestions: TopicSuggestion[]
  plan: {
    mode: PlanMode
    requested_count: number
    accepted_count: number
    shortfall: number
    shortfall_reason: 'exhausted_safe_opportunities' | null
    // Evidence snapshot (B).
    evidence_snapshot_id: string
    evidence_snapshot_reused: boolean
    evidence_snapshot_hash: string
    evidence_snapshot_age: number
    // Funnel (G).
    candidate_count: number
    deterministic_survivor_count: number
    validator_accept_count: number
    selected_count: number
    rejected_by_reason: Record<string, number>
    distribution_by_intent: Record<string, number>
    distribution_by_opportunity_type: Record<string, number>
    duplicate_clusters_removed: number
    // Cost (H).
    estimated_calls: number
    estimated_max_cost: number
    requested_topic_count: number
    actual_calls: number
    actual_estimated_cost: number
    accepted_topic_count: number
    cost_per_accepted_topic: number
  }
  opportunityDiagnostics: OpportunityDiagnostics
}

/** A stable-ish hash of the evidence inventory (order-independent) for snapshot reuse. */
function evidenceHash(diag: OpportunityDiagnostics): string {
  const inv = diag.evidence_inventory
  const parts = Object.entries(inv).sort(([a], [b]) => (a < b ? -1 : 1)).map(([k, v]) => `${k}:${v}`)
  return parts.join('|')
}

function toDiversityItem(s: TopicSuggestion): DiversityItem {
  const subjectTokens = contentTokens(s.primaryKeyword).filter((t) => !GENERIC_TOKENS.has(t))
  return {
    key: s.id || normalizeText(s.primaryKeyword),
    score: typeof s.suggestionScore === 'number' ? s.suggestionScore : 0,
    subjectTokens,
    entityKey: s.moneyTargetUrl ?? null,
    intent: s.searchIntent || 'informational',
    opportunityType: s.opportunityFamily || 'informational',
    isSeasonal: false,
  }
}

/** Run a full batched content plan for a project. */
export async function generateContentPlan(
  admin: Admin,
  input: { projectId: string; mode?: string | null; requestedCount?: number | null; generationRunId: string },
): Promise<ContentPlanResult> {
  const mode = resolvePlanMode({ mode: input.mode, requestedCount: input.requestedCount })
  const budget = planBudget(mode)
  const estimate = estimatePlanCost(mode)

  // Mode-specific HARD ceiling (H) via the additive cost-controller override.
  const controller = newRunCostController('standard', input.generationRunId, budget.requestedTopicCount, { maxModelCallsPerRun: budget.maxCalls, maxEstimatedCostUsd: budget.maxCostUsd })

  // D — over-generate a pool via family-scoped batched synthesis (evidence built once).
  const families = OPPORTUNITY_FAMILIES.map((f) => f.family).slice(0, budget.maxSynthesisCalls)
  const perFamily = Math.max(10, Math.ceil(budget.candidatePoolTarget / Math.max(1, families.length)))
  const opp = await generateOpportunities(admin, { projectId: input.projectId, targetCount: perFamily, maxClusters: 14, families, poolTarget: budget.candidatePoolTarget }, controller)

  // E — deterministic gates already ran inside generateOpportunities; the returned
  // suggestions are the deterministic survivors (validator_accept mirrors them until a
  // batched validator call is enabled — F is a further additive step).
  const survivors = opp.suggestions
  const candidate_count = opp.diagnostics.generated_opportunities
  const deterministic_survivor_count = survivors.length

  // G — rank globally, then diversity-select to the requested count.
  const div = selectDiverse(survivors.map(toDiversityItem), budget.requestedTopicCount, DEFAULT_CAPS)
  const chosenKeys = new Set(div.selected.map((d) => d.key))
  const selected = survivors.filter((s) => chosenKeys.has(s.id || normalizeText(s.primaryKeyword)))

  // I — truthful partial result: no fabricated weak topics.
  const accepted_count = selected.length
  const shortfall = Math.max(0, budget.requestedTopicCount - accepted_count)
  const shortfall_reason = shortfall > 0 ? 'exhausted_safe_opportunities' as const : null

  // B — evidence snapshot reuse signal (in-process).
  const hash = evidenceHash(opp.diagnostics)
  const prev = SNAPSHOTS.get(input.projectId)
  const reused = !!prev && prev.hash === hash
  const age = 0
  SNAPSHOTS.set(input.projectId, { hash, at: 0 })

  const cs = controller.summary()
  const actuals = planCostActuals(cs.totalCalls, cs.estimatedRunCostUsd, accepted_count)

  return {
    suggestions: selected,
    plan: {
      mode, requested_count: budget.requestedTopicCount, accepted_count, shortfall, shortfall_reason,
      evidence_snapshot_id: `${input.projectId}:${hash.length}`, evidence_snapshot_reused: reused, evidence_snapshot_hash: hash, evidence_snapshot_age: age,
      candidate_count, deterministic_survivor_count, validator_accept_count: deterministic_survivor_count, selected_count: accepted_count,
      rejected_by_reason: opp.diagnostics.rejected_by_reason,
      distribution_by_intent: div.distribution_by_intent,
      distribution_by_opportunity_type: div.distribution_by_opportunity_type,
      duplicate_clusters_removed: div.duplicate_clusters_removed,
      estimated_calls: estimate.estimated_calls, estimated_max_cost: estimate.estimated_max_cost, requested_topic_count: estimate.requested_topic_count,
      ...actuals,
    },
    opportunityDiagnostics: opp.diagnostics,
  }
}
