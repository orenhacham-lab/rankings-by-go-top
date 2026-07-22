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
  /** ACTUAL recommendation brief ids admitted (new gsc:<id> ids + matched normal brief ids),
   *  deduplicated in deterministic first-seen order. */
  selectedBriefIds: string[]
  rejectionCounts: Record<string, number>
  /** Per merged GSC opportunity: which normal brief received it + whether that brief was
   *  consumed / accepted (the separate truth source for merged evidence). */
  mergedGscEvidence: { gscOpportunityId: string; briefId: string; consumed: boolean; accepted: boolean }[]
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
  // ── FIX 4 / FIX 5 — bounded live-participation diagnostics ──
  /** Per admitted new GSC brief (within source budget): safe source metrics + participation. */
  selectedGscBriefDetails: SelectedGscBriefDetail[]
  /** The REAL first-batch GSC participation (natural vs bounded appended trial). */
  gscParticipation: GscParticipation
}

/** FIX 4 — one bounded, safe diagnostic record per NEW GSC-origin brief admitted within the
 *  source budget (never merged evidence, never OAuth/tokens/prompt/article bodies). Source
 *  metrics are filled at integration; the synthesis fields are filled during synthesis; the
 *  route layer resolves `finalOutcome` from the existing stage-aware final outcomes. */
export interface SelectedGscBriefDetail {
  briefId: string
  gscOpportunityId: string
  primaryQuery: string
  queryIntent: string
  opportunityScore: number
  impressions: number
  clicks: number
  averagePosition: number
  priorityTier: number | null
  finalSynthesisRank: number | null
  consumed: boolean
  consumedRound: number | null
  acceptedByEngine: boolean
  finalOutcome:
    | 'accepted_for_persistence'
    | 'rejected_by_engine'
    | 'rejected_by_route_finalization'
    | 'rejected_by_blog_gate'
    | 'not_consumed'
    | null
}

export type GscParticipationMode = 'disabled' | 'no_gsc_briefs' | 'natural' | 'appended_trial'

/** FIX 5 — the REAL first-batch GSC participation (not planned admission). */
export interface GscParticipation {
  enabled: boolean
  maxTrialBriefs: number
  naturalGscBriefCountInFirstBatch: number
  appendedTrialBriefCount: number
  appendedTrialBriefIds: string[]
  totalGscBriefsConsumed: number
  participationMode: GscParticipationMode
}

export interface GscBriefLoad {
  diagnostics: GscInputDiagnostics
  /** Adapter-eligible candidates (supporting type + intent + ≥2 tokens + not decided + no
   *  strong E2A content match), ordered deterministically: score DESC, impressions DESC, id ASC.
   *  The recommendation side still applies its own coverage/duplicate/merge/budget guards. */
  candidates: GscCandidate[]
}
