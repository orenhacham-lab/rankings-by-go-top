/**
 * Stage E3A — neutral types shared by the GSC recommendation adapter. Deliberately
 * dependency-free of the recommendation engine: the adapter (lib/gsc/recommendations) produces
 * these; the recommendation engine (lib/content/recommendations) consumes them and maps them
 * onto its own brief contract. Dependency direction is strictly reco → adapter → E2A.
 */

export type GscInputState =
  | 'disabled'
  | 'not_connected'
  | 'no_property'
  | 'never_synced'
  | 'no_eligible_opportunities'
  | 'loaded'
  | 'read_failed'

/** One eligible GSC opportunity, ready to be mapped into a recommendation brief. Metrics are
 *  from the 90-day query+page detail run — NEVER the property-level summary totals. */
export interface GscCandidate {
  opportunityId: string
  primaryQuery: string
  relatedQueries: string[]
  page: string
  clicks: number
  impressions: number
  ctr: number
  averagePosition: number
  opportunityScore: number
  reasonCodes: string[]
  queryIntent: string
  signals: string[]
  syncRunId: string
  windowDays: 90
}

/** Diagnostics surfaced in the existing generation diagnostics (no secrets). The adapter fills
 *  the load/eligibility counts; the recommendation-side integration fills coverage/merge/budget. */
export interface GscInputDiagnostics {
  enabled: boolean
  state: GscInputState
  windowDays: 90 | null
  syncRunId: string | null
  rawOpportunityCount: number
  supportingCandidateCount: number
  eligibleAfterIntentCount: number
  eligibleAfterBareHeadGuardCount: number
  suppressedByDecisionCount: number
  rejectedByExistingCoverageCount: number
  mergedIntoExistingCount: number
  addedAsNewBriefCount: number
  deferredByBudgetCount: number
  /** GSC evidence admitted by the adapter + source budget (merged ids + new gsc:<id> ids). */
  selectedBriefIds: string[]
  rejectionCounts: Record<string, number>
  // ── FIX 1 — integration order (GSC before constrained discovery) ──
  combinedPoolSizeBeforeDiscovery: number
  combinedPoolSizeAfterDiscovery: number
  discoveryDeficitAfterGsc: number
  discoverySkippedBecauseGscFilledDeficit: boolean
  // ── FIX 3 — truthful consumption/acceptance (filled during synthesis) ──
  /** GSC-origin briefs actually included in a synthesis batch. */
  consumedGscBriefCount: number
  consumedGscBriefIds: string[]
  /** GSC-origin briefs whose polished result passed validation and became a recommendation. */
  acceptedGscSuggestionCount: number
  acceptedGscBriefIds: string[]
}

export interface GscBriefLoad {
  diagnostics: GscInputDiagnostics
  /** Adapter-eligible candidates (supporting type + intent + ≥2 tokens + not decided + no
   *  strong E2A content match), ordered deterministically: score DESC, impressions DESC, id ASC.
   *  The recommendation side still applies its own coverage/duplicate/merge/budget guards. */
  candidates: GscCandidate[]
}
