/**
 * Batched CONTENT-IDEAS orchestrator (single product mode). One operation attempts up
 * to ~30 safe distinct topics: evidence is collected once and reused across a few
 * family-scoped synthesis calls, the SAME deterministic gates run on the whole pool,
 * an ADDITIVE batched validator refines (never zeroes) the set, and diversity selects
 * up to 30 without ever turning a non-empty safe set into empty. Returns fewer when
 * safe inventory is lower. All cost/call/validator/snapshot fields are SERVER-SIDE
 * diagnostics only — never shown to customers.
 */

import type { createAdminClient } from '@/lib/supabase/admin'
import { generateOpportunities, type OpportunityDiagnostics } from './generate-opportunities'
import { OPPORTUNITY_FAMILIES } from './opportunity-synthesis'
import { selectDiverse, DEFAULT_CAPS, type DiversityItem } from './diversity'
import { contentIdeasBudget, planCostActuals } from './plan-cost'
import { newRunCostController } from './run-cost-controller'
import { contentTokens } from './evidence-cluster'
import { GENERIC_TOKENS } from './opportunity'
import { normalizeText } from './topic-idea-store'
import type { TopicSuggestion } from './types'

type Admin = ReturnType<typeof createAdminClient>

export interface ContentPlanResult {
  suggestions: TopicSuggestion[]
  /** Customer-safe summary (no cost/call/validator/snapshot internals). */
  customer: { requested_count: number; accepted_count: number; shortfall: number; shortfall_reason: 'exhausted_safe_opportunities' | null }
  /** Preview-only diagnostics (gated upstream; never shown to customers). */
  diagnostics: {
    request_evidence_snapshot_id: string
    request_evidence_snapshot_hash: string
    reused_across_family_calls: boolean
    durable_cache_used: boolean
    // B — per-stage counts + IDs.
    generated_candidates: number
    deterministic_survivor_count: number
    deterministic_survivor_ids: string[]
    validator_survivor_count: number
    validator_survivor_ids: string[]
    diversity_selected_count: number
    diversity_selected_ids: string[]
    diversity_cap_removed: number
    // C — validator (additive) metrics.
    validator_call_count: number
    validator_accept_count: number
    validator_reject_count: number
    validator_repair_count: number
    validator_missing_verdict_count: number
    validator_parse_failure_count: number
    validator_degraded: boolean
    // G funnel + cost (server-side only).
    rejected_by_reason: Record<string, number>
    distribution_by_intent: Record<string, number>
    distribution_by_opportunity_type: Record<string, number>
    duplicate_clusters_removed: number
    actual_calls: number
    actual_estimated_cost: number
    cost_per_accepted_topic: number
  }
  opportunityDiagnostics: OpportunityDiagnostics
}

function evidenceHash(diag: OpportunityDiagnostics): string {
  const inv = diag.evidence_inventory
  return Object.entries(inv).sort(([a], [b]) => (a < b ? -1 : 1)).map(([k, v]) => `${k}:${v}`).join('|')
}

const idOf = (s: TopicSuggestion) => s.id || normalizeText(s.primaryKeyword)
function toDiversityItem(s: TopicSuggestion): DiversityItem {
  return {
    key: idOf(s),
    score: typeof s.suggestionScore === 'number' ? s.suggestionScore : 0,
    subjectTokens: contentTokens(s.primaryKeyword).filter((t) => !GENERIC_TOKENS.has(t)),
    entityKey: s.moneyTargetUrl ?? null,
    intent: s.searchIntent || 'informational',
    opportunityType: s.opportunityFamily || 'informational', // missing family is never a removal reason (D)
    isSeasonal: false,
  }
}

/** Run the single-mode batched content-ideas generation for a project. */
export async function generateContentPlan(
  admin: Admin,
  input: { projectId: string; generationRunId: string },
): Promise<ContentPlanResult> {
  const budget = contentIdeasBudget()
  const controller = newRunCostController('standard', input.generationRunId, budget.targetTopicCount, { maxModelCallsPerRun: budget.maxCalls, maxEstimatedCostUsd: budget.maxCostUsd })

  const families = OPPORTUNITY_FAMILIES.map((f) => f.family).slice(0, budget.maxSynthesisCalls)
  const perFamily = Math.max(12, Math.ceil(budget.candidatePoolTarget / Math.max(1, families.length)))
  const opp = await generateOpportunities(admin, { projectId: input.projectId, targetCount: perFamily, maxClusters: 14, families, poolTarget: budget.candidatePoolTarget, validatorCalls: budget.maxValidatorCalls }, controller)

  const survivors = opp.suggestions // post-validator, deterministically-safe set
  const vm = opp.diagnostics.validator
  const stage = opp.diagnostics.plan_stage_ids

  // D — diversity selects up to the max but NEVER empties a non-empty safe set: if the
  // safe set is <= max, all are returned; if larger, the best `max` are chosen and the
  // omitted ones are typed diversity_cap. selectDiverse's relaxed fill guarantees this.
  let selected: TopicSuggestion[]
  let div: ReturnType<typeof selectDiverse>
  if (survivors.length <= budget.maxTopicCount) {
    selected = survivors
    div = selectDiverse(survivors.map(toDiversityItem), budget.maxTopicCount, DEFAULT_CAPS) // for distributions only
    selected = survivors // authoritative: return ALL safe when <= max
  } else {
    div = selectDiverse(survivors.map(toDiversityItem), budget.maxTopicCount, DEFAULT_CAPS)
    const chosen = new Set(div.selected.map((d) => d.key))
    selected = survivors.filter((s) => chosen.has(idOf(s)))
  }
  const diversity_cap_removed = Math.max(0, survivors.length - selected.length)

  const accepted_count = selected.length
  const shortfall = Math.max(0, budget.targetTopicCount - accepted_count)
  const shortfall_reason = shortfall > 0 ? 'exhausted_safe_opportunities' as const : null

  const hash = evidenceHash(opp.diagnostics)
  const cs = controller.summary()
  const actuals = planCostActuals(cs.totalCalls, cs.estimatedRunCostUsd, accepted_count)

  return {
    suggestions: selected,
    customer: { requested_count: budget.targetTopicCount, accepted_count, shortfall, shortfall_reason },
    diagnostics: {
      request_evidence_snapshot_id: `${input.projectId}:${hash.length}`, request_evidence_snapshot_hash: hash, reused_across_family_calls: true, durable_cache_used: false,
      generated_candidates: stage.generated_candidates,
      deterministic_survivor_count: stage.deterministic_survivor_ids.length, deterministic_survivor_ids: stage.deterministic_survivor_ids,
      validator_survivor_count: stage.validator_survivor_ids.length, validator_survivor_ids: stage.validator_survivor_ids,
      diversity_selected_count: selected.length, diversity_selected_ids: selected.map(idOf), diversity_cap_removed,
      validator_call_count: vm.validator_call_count, validator_accept_count: vm.validator_accept_count, validator_reject_count: vm.validator_reject_count, validator_repair_count: vm.validator_repair_count, validator_missing_verdict_count: vm.validator_missing_verdict_count, validator_parse_failure_count: vm.validator_parse_failure_count, validator_degraded: vm.validator_degraded,
      rejected_by_reason: opp.diagnostics.rejected_by_reason,
      distribution_by_intent: div.distribution_by_intent,
      distribution_by_opportunity_type: div.distribution_by_opportunity_type,
      duplicate_clusters_removed: div.duplicate_clusters_removed,
      actual_calls: actuals.actual_calls, actual_estimated_cost: actuals.actual_estimated_cost, cost_per_accepted_topic: actuals.cost_per_accepted_topic,
    },
    opportunityDiagnostics: opp.diagnostics,
  }
}
