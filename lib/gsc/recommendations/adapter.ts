/**
 * Stage E3A — GSC recommendation adapter. Loads the latest succeeded 90-day run, computes the
 * accepted Stage E2A opportunities (read-only, unchanged), applies decision suppression and
 * the domain-neutral eligibility rules, and returns neutral GscCandidate[] + diagnostics.
 *
 * Isolation: imports ONLY the Stage E2A read-only calculation + decisions. It NEVER imports the
 * recommendation engine (direction is reco → adapter → E2A). It performs NO writes. It uses ONLY
 * the 90-day query+page detail rows — never the property-level summary totals, never 28-day rows,
 * never mixes runs. A read failure is surfaced as a typed state (never fabricated as zero).
 */
import type { createAdminClient } from '@/lib/supabase/admin'
import { loadUserConnection, loadProjectProperty, GscServiceError } from '../service'
import { loadOpportunityInputs, OpportunityLoadError } from '../opportunities/load'
import { buildOpportunities } from '../opportunities/engine'
import { contentTokenSet } from '../opportunities/normalize'
import { loadDecisionsMap, DecisionError } from '../opportunities/decisions'
import type { Opportunity } from '../opportunities/types'
import type { GscBriefLoad, GscCandidate, GscInputDiagnostics, GscInputState } from './types'

type Admin = ReturnType<typeof createAdminClient>
const ELIGIBLE_INTENTS = new Set(['informational', 'commercial'])

export interface EligibilityCounts {
  supportingCandidateCount: number
  eligibleAfterIntentCount: number
  eligibleAfterBareHeadGuardCount: number
  suppressedByDecisionCount: number
}

/**
 * PURE Stage E3A eligibility over accepted E2A opportunities (domain-neutral). A GSC opportunity
 * is eligible for a NEW automatic article brief only when ALL hold:
 *  (1) opportunityType === 'supporting_content_candidate'
 *  (2) no persisted decision (irrelevant / already_covered / created_topic)
 *  (3) queryIntent ∈ {informational, commercial}
 *  (4) not a bare single-token head — ≥2 meaningful tokens (accepted GSC normalization)
 *  (5) no strong existing E2A content match.
 * A high score never overrides these. multi_page_signal is evidence only, never eligibility.
 */
export function filterEligibleGscOpportunities(all: Opportunity[], decided: Set<string>): { eligible: Opportunity[]; counts: EligibilityCounts } {
  const supporting = all.filter((o) => o.opportunityType === 'supporting_content_candidate')
  const afterIntent = supporting.filter((o) => ELIGIBLE_INTENTS.has(o.queryIntent))
  const afterBareHead = afterIntent.filter((o) => contentTokenSet(o.primaryQuery).length >= 2)
  const afterDecision = afterBareHead.filter((o) => !decided.has(o.id))
  const eligible = afterDecision.filter((o) => o.existingContentMatch === null)
  // Deterministic order: opportunityScore DESC, impressions DESC, stable id ASC.
  eligible.sort((a, b) => b.opportunityScore - a.opportunityScore || b.impressions - a.impressions || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
  return {
    eligible,
    counts: {
      supportingCandidateCount: supporting.length,
      eligibleAfterIntentCount: afterIntent.length,
      eligibleAfterBareHeadGuardCount: afterBareHead.length,
      suppressedByDecisionCount: afterBareHead.length - afterDecision.length,
    },
  }
}

function baseDiagnostics(enabled: boolean, state: GscInputState): GscInputDiagnostics {
  return {
    enabled, state, windowDays: null, syncRunId: null,
    rawOpportunityCount: 0, supportingCandidateCount: 0, eligibleAfterIntentCount: 0, eligibleAfterBareHeadGuardCount: 0,
    suppressedByDecisionCount: 0, rejectedByExistingCoverageCount: 0, mergedIntoExistingCount: 0, addedAsNewBriefCount: 0,
    deferredByBudgetCount: 0, selectedBriefIds: [], rejectionCounts: {}, mergedGscEvidence: [],
    subjectlessGenericRejectedCount: 0, collapsedNearDuplicateCount: 0, uniqueNeedCountBeforeBudget: 0, trialDistinctNeedCount: 0,
    combinedPoolSizeBeforeDiscovery: 0, combinedPoolSizeAfterDiscovery: 0, discoveryDeficitAfterGsc: 0, discoverySkippedBecauseGscFilledDeficit: false,
    consumedGscBriefCount: 0, consumedGscBriefIds: [], acceptedGscSuggestionCount: 0, acceptedGscBriefIds: [],
    selectedGscBriefDetails: [],
    gscParticipation: { enabled, maxTrialBriefs: 2, naturalGscBriefCountInFirstBatch: 0, appendedTrialBriefCount: 0, appendedTrialBriefIds: [], totalGscBriefsConsumed: 0, participationMode: enabled ? 'no_gsc_briefs' : 'disabled' },
  }
}

/** Load adapter-eligible GSC candidates for the automatic recommendation flow. Never throws:
 *  a read/contract failure returns state='read_failed' with zero candidates (visible in
 *  diagnostics) so overall generation can continue on its normal sources. The caller has
 *  ALREADY verified that userId owns projectId. */
export async function loadGscRecommendationCandidates(admin: Admin, params: { projectId: string; userId: string }, opts: { enabled: boolean }): Promise<GscBriefLoad> {
  if (!opts.enabled) return { diagnostics: baseDiagnostics(false, 'disabled'), candidates: [] }
  const { projectId, userId } = params

  try {
    const connection = await loadUserConnection(admin, userId)
    if (!connection || connection.status === 'revoked') return { diagnostics: baseDiagnostics(true, 'not_connected'), candidates: [] }
    const property = await loadProjectProperty(admin, projectId)
    if (!property) return { diagnostics: baseDiagnostics(true, 'no_property'), candidates: [] }

    // Stage E3A uses the more stable 90-day window only, from the latest succeeded run.
    const inputs = await loadOpportunityInputs(admin, projectId, 90)
    if (inputs.state === 'never_synced') return { diagnostics: baseDiagnostics(true, 'never_synced'), candidates: [] }

    const all = buildOpportunities(inputs.rows, inputs.evidence, inputs.runMeta) // accepted E2A calc, unchanged
    const decisions = await loadDecisionsMap(admin, projectId)

    const diag = baseDiagnostics(true, 'loaded')
    diag.windowDays = 90
    diag.syncRunId = inputs.runMeta.syncRunId
    diag.rawOpportunityCount = all.length

    const decisionIds = new Set(Array.from(decisions.keys()))
    const { eligible, counts } = filterEligibleGscOpportunities(all, decisionIds)
    diag.supportingCandidateCount = counts.supportingCandidateCount
    diag.eligibleAfterIntentCount = counts.eligibleAfterIntentCount
    diag.eligibleAfterBareHeadGuardCount = counts.eligibleAfterBareHeadGuardCount
    diag.suppressedByDecisionCount = counts.suppressedByDecisionCount

    const candidates: GscCandidate[] = eligible.map((o) => ({
      opportunityId: o.id, primaryQuery: o.primaryQuery, relatedQueries: o.relatedQueries, page: o.page,
      clicks: o.clicks, impressions: o.impressions, ctr: o.ctr, averagePosition: o.averagePosition,
      opportunityScore: o.opportunityScore, reasonCodes: o.reasons.map((r) => r.code), queryIntent: o.queryIntent,
      signals: o.signals, syncRunId: inputs.runMeta.syncRunId, windowDays: 90,
    }))
    if (candidates.length === 0) diag.state = 'no_eligible_opportunities'
    return { diagnostics: diag, candidates }
  } catch (e) {
    // Non-fatal to overall generation, but ALWAYS visible + never fabricated as zero evidence.
    const state: GscInputState = 'read_failed'
    const diag = baseDiagnostics(true, state)
    if (e instanceof GscServiceError || e instanceof OpportunityLoadError || e instanceof DecisionError) {
      diag.rejectionCounts = { [e.code]: 1 }
    }
    return { diagnostics: diag, candidates: [] }
  }
}
