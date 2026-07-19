/**
 * SMART-CONTROLLER — pure, non-user-facing decision layer (Stage B).
 *
 * These functions decide, from a FINALIZED recommendation attempt's telemetry,
 * whether a Flash attempt should be escalated to Pro, which of two finalized
 * attempts to select, and whether the account budget can authorize the worst-case
 * smart path. They are DECISION-ONLY: they never generate, rank, validate, persist,
 * or change any recommendation. They are wired to nothing in production yet.
 *
 * Rescue accounting is computed over UNIQUE briefId SETS (unions/differences), so a
 * brief can never inflate rescue potential more than once by appearing on multiple
 * telemetry paths. An accounting invariant reconciles every known brief.
 */

// ── Rejection classification (traced to code semantics; see the design doc) ──────

/** ENGINE (validatePolished) rejections a stronger model may express validly. */
export const ENGINE_MODEL_RESCUABLE: ReadonlySet<string> = new Set([
  'invalid_primary_keyword', 'intent_keyword_mismatch', 'final_keyword_lost_subject',
  'primary_keyword_not_search_phrase', 'title_keyword_mismatch', 'unsafe_named_entity_mutation',
])
/** ENGINE rejections that are invalid regardless of wording (subject covered/owned/no need). */
export const ENGINE_STRUCTURAL: ReadonlySet<string> = new Set([
  'existing_content_owns_need', 'pending_semantic_duplicate', 'primary_keyword_exists',
  'intra_run_need_duplicate', 'already_covered', 'insufficient_independent_need',
  'exact_existing_keyword_owner', 'covered_by_existing_content',
])
/** ROUTE post-processing rejection where a different Pro keyword may avoid the
 *  pending-collision (salvage already exhausted Flash's phrasing). */
export const POSTPROC_MODEL_RESCUABLE: ReadonlySet<string> = new Set(['primary_keyword_exists'])
/** ROUTE post-processing rejection whose freed slot a different batch could refill. */
export const POSTPROC_BATCH_REPLACEMENT: ReadonlySet<string> = new Set(['intra_run_removed', 'intra_run_merged'])
/** ROUTE post-processing rejections whose SUBJECT is permanently covered/owned (the
 *  ITEM can't be rescued, though its slot is refillable when pool headroom exists). */
export const POSTPROC_STRUCTURAL: ReadonlySet<string> = new Set([
  'title_exists', 'exact_existing_keyword_owner', 'covered_by_existing_content',
  'content_keyword_owned', 'source_only_entity_expansion', 'weak_entity_modifier',
])

export type RescueClass = 'model_rescuable' | 'batch_replacement' | 'structural'

export function classifyEngineReason(reason: string): RescueClass {
  if (ENGINE_MODEL_RESCUABLE.has(reason)) return 'model_rescuable'
  return 'structural' // everything else engine-side is structural
}
export function classifyPostProcReason(reason: string): RescueClass {
  if (POSTPROC_MODEL_RESCUABLE.has(reason)) return 'model_rescuable'
  if (POSTPROC_BATCH_REPLACEMENT.has(reason)) return 'batch_replacement'
  return 'structural'
}

// ── Per-brief outcome → unique-ID rescue accounting ──────────────────────────────

/** The FINAL stage of a single brief in one finalized attempt. Exactly one per brief. */
export type BriefStage =
  | 'finalized_accepted'      // survived engine + post-processing → user-facing
  | 'engine_rejected'         // rejected by validatePolished (carries reason)
  | 'postproc_rejected'       // engine-accepted, removed by route post-processing (carries reason)
  | 'model_skipped'           // the model self-marked "skip"
  | 'partial_missing'         // the model omitted it from the response (partial)
  | 'unprocessed'             // never consumed (remaining pool)
  | 'not_processed'           // consumed but not evaluated because target was met
  | 'dropped'                 // unknown/invalid briefId echoed by the model

export interface BriefOutcome { briefId: string; stage: BriefStage; reason?: string }

export interface RescueAccounting {
  finalizedAcceptedBriefIds: Set<string>
  unprocessedBriefIds: Set<string>
  modelSkippedBriefIds: Set<string>
  partialMissingBriefIds: Set<string>
  engineModelRescuableRejectedBriefIds: Set<string>
  postProcessingModelRescuableBriefIds: Set<string>
  batchReplacementSourceBriefIds: Set<string>   // postproc batch-replacement + refillable structural slots
  permanentlyStructuralRejectedBriefIds: Set<string>
  notProcessedBriefIds: Set<string>
  droppedBriefIds: Set<string>
  /** UNION of the rescue-bearing sets (deduped by briefId). */
  rescuePotentialBriefIds: Set<string>
  /** Counts DERIVED from the unique-ID sets (never summed independently). */
  counts: {
    finalizedAccepted: number
    unprocessedPotential: number
    modelSkipped: number
    partialMissingPotential: number
    engineModelRescuableRejected: number
    postProcessingModelRescuable: number
    batchReplacementPotential: number
    permanentlyStructuralRejected: number
    totalRescuePotential: number
  }
  genuineExhaustion: boolean
  /** Every known brief is reconciled exactly once (no double counting). */
  reconciled: boolean
}

const add = (s: Set<string>, id: string) => { s.add(id) }

/**
 * Build the unique-ID rescue accounting from a per-brief outcome list. `poolSize`
 * is the number of prepared briefs (the reconciliation target). Batch-replacement
 * potential (refillable structural slots) is credited ONLY when non-dead pool
 * headroom actually exists — otherwise a permanently-structural loss with no
 * inventory to refill it is not potential.
 */
export function computeRescueAccounting(outcomes: BriefOutcome[], poolSize: number): RescueAccounting {
  const acc: RescueAccounting = {
    finalizedAcceptedBriefIds: new Set(), unprocessedBriefIds: new Set(), modelSkippedBriefIds: new Set(),
    partialMissingBriefIds: new Set(), engineModelRescuableRejectedBriefIds: new Set(),
    postProcessingModelRescuableBriefIds: new Set(), batchReplacementSourceBriefIds: new Set(),
    permanentlyStructuralRejectedBriefIds: new Set(), notProcessedBriefIds: new Set(), droppedBriefIds: new Set(),
    rescuePotentialBriefIds: new Set(), counts: {
      finalizedAccepted: 0, unprocessedPotential: 0, modelSkipped: 0, partialMissingPotential: 0,
      engineModelRescuableRejected: 0, postProcessingModelRescuable: 0, batchReplacementPotential: 0,
      permanentlyStructuralRejected: 0, totalRescuePotential: 0,
    }, genuineExhaustion: false, reconciled: false,
  }
  // structural post-processing losses are refillable SLOTS pending a headroom check.
  const structuralPostProcSlots: string[] = []
  for (const o of outcomes) {
    switch (o.stage) {
      case 'finalized_accepted': add(acc.finalizedAcceptedBriefIds, o.briefId); break
      case 'unprocessed': add(acc.unprocessedBriefIds, o.briefId); break
      case 'model_skipped': add(acc.modelSkippedBriefIds, o.briefId); break
      case 'partial_missing': add(acc.partialMissingBriefIds, o.briefId); break
      case 'not_processed': add(acc.notProcessedBriefIds, o.briefId); break
      case 'dropped': add(acc.droppedBriefIds, o.briefId); break
      case 'engine_rejected':
        if (classifyEngineReason(o.reason ?? '') === 'model_rescuable') add(acc.engineModelRescuableRejectedBriefIds, o.briefId)
        else add(acc.permanentlyStructuralRejectedBriefIds, o.briefId)
        break
      case 'postproc_rejected': {
        const c = classifyPostProcReason(o.reason ?? '')
        if (c === 'model_rescuable') add(acc.postProcessingModelRescuableBriefIds, o.briefId)
        else if (c === 'batch_replacement') add(acc.batchReplacementSourceBriefIds, o.briefId)
        else { add(acc.permanentlyStructuralRejectedBriefIds, o.briefId); structuralPostProcSlots.push(o.briefId) }
        break
      }
    }
  }
  // Non-dead pool headroom = briefs that could still become recs (any rescue-bearing
  // set already collected). A structural finalization slot is only "batch-replaceable"
  // when such headroom exists to fill it — represented as unresolved potential.
  const directRescue = acc.unprocessedBriefIds.size + acc.modelSkippedBriefIds.size + acc.partialMissingBriefIds.size
    + acc.engineModelRescuableRejectedBriefIds.size + acc.postProcessingModelRescuableBriefIds.size + acc.batchReplacementSourceBriefIds.size
  if (directRescue > 0) for (const id of structuralPostProcSlots) add(acc.batchReplacementSourceBriefIds, id)

  // Rescue potential = UNION of rescue-bearing sets (unique briefIds). A structural
  // slot promoted above is already in batchReplacementSourceBriefIds, but it also
  // remains in permanentlyStructuralRejectedBriefIds for provenance — so union, not sum.
  for (const s of [acc.unprocessedBriefIds, acc.modelSkippedBriefIds, acc.partialMissingBriefIds,
    acc.engineModelRescuableRejectedBriefIds, acc.postProcessingModelRescuableBriefIds, acc.batchReplacementSourceBriefIds]) {
    for (const id of s) acc.rescuePotentialBriefIds.add(id)
  }

  acc.counts = {
    finalizedAccepted: acc.finalizedAcceptedBriefIds.size,
    unprocessedPotential: acc.unprocessedBriefIds.size,
    modelSkipped: acc.modelSkippedBriefIds.size,
    partialMissingPotential: acc.partialMissingBriefIds.size,
    engineModelRescuableRejected: acc.engineModelRescuableRejectedBriefIds.size,
    postProcessingModelRescuable: acc.postProcessingModelRescuableBriefIds.size,
    batchReplacementPotential: acc.batchReplacementSourceBriefIds.size,
    permanentlyStructuralRejected: acc.permanentlyStructuralRejectedBriefIds.size,
    totalRescuePotential: acc.rescuePotentialBriefIds.size,
  }
  acc.genuineExhaustion = acc.rescuePotentialBriefIds.size === 0

  // ACCOUNTING INVARIANT — every known brief reconciled exactly once. A structural
  // slot may appear in BOTH batchReplacement and permanentlyStructural provenance
  // sets, so reconcile on the PRIMARY partition (each brief's single final stage).
  const primaryPartition = new Set<string>()
  let doubleCount = false
  for (const o of outcomes) { if (primaryPartition.has(o.briefId)) doubleCount = true; primaryPartition.add(o.briefId) }
  acc.reconciled = !doubleCount && primaryPartition.size === poolSize
  return acc
}

// ── Preparation telemetry (distinguish empty pool from prep/discovery failure) ───

export interface PreparationTelemetry {
  preparationStarted: boolean
  preparationSucceeded: boolean
  discoveryRequired: boolean
  discoveryAttempted: boolean
  discoverySucceeded: boolean
  discoveryFailureType: string | null
  poolBuiltSuccessfully: boolean
  poolEmptyAfterSuccessfulPreparation: boolean
}

// ── Finalized attempt shape the decision layer reads ─────────────────────────────

export interface RoundStatus { providerOk: boolean; synthesisFailure: string | null }

export interface FinalizedAttempt {
  poolSize: number
  finalUserFacingCount: number
  preparation: PreparationTelemetry
  rounds: RoundStatus[]
  stopReason: string
  rescue: RescueAccounting
}

// ── escalateToPro ────────────────────────────────────────────────────────────────

export type EscalationDecision =
  | 'preparation_failure' | 'no_evidence' | 'target_met'
  | 'flash_provider_failure' | 'flash_synthesis_failure'
  | 'flash_zero_with_rescue' | 'flash_underyield_with_rescue' | 'genuine_exhaustion'

export interface EscalationResult { escalate: boolean; reason: EscalationDecision }

export function escalateToPro(fin: FinalizedAttempt, targetCount: number): EscalationResult {
  const count = fin.finalUserFacingCount
  const providerFail = fin.stopReason === 'provider_failed' || fin.rounds.some((r) => r.providerOk === false)
  const synthFail = fin.stopReason === 'synthesis_failed' || fin.rounds.some((r) => r.synthesisFailure !== null)
  const rescue = fin.rescue.rescuePotentialBriefIds.size

  // 0. A zero pool that came from a FAILED preparation/discovery is NOT no-evidence.
  if (fin.poolSize === 0 && !fin.preparation.poolEmptyAfterSuccessfulPreparation) return { escalate: false, reason: 'preparation_failure' }
  // 1. Genuinely empty pool after successful preparation.
  if (fin.poolSize === 0) return { escalate: false, reason: 'no_evidence' }
  // 2. Finalized target already met — a stray failure must not escalate a satisfied run.
  if (count >= targetCount) return { escalate: false, reason: 'target_met' }
  // 3/4. Model underperformance while under target.
  if (providerFail) return { escalate: true, reason: 'flash_provider_failure' }
  if (synthFail) return { escalate: true, reason: 'flash_synthesis_failure' }
  // 5. Mandatory: zero finalized while rescue potential exists.
  if (count === 0 && rescue > 0) return { escalate: true, reason: 'flash_zero_with_rescue' }
  // 6. Under target with ANY genuine rescue potential (no deficit-closing requirement).
  if (count < targetCount && rescue > 0) return { escalate: true, reason: 'flash_underyield_with_rescue' }
  // 7. Genuine exhaustion — proven by an empty rescue set.
  return { escalate: false, reason: 'genuine_exhaustion' }
}

// ── selectBatch ─────────────────────────────────────────────────────────────────

export interface AttemptSummary { complete: boolean; finalUserFacingCount: number }
export type SelectReason = 'pro_incomplete' | 'pro_higher_count' | 'provisional_tie_pro' | 'flash_higher_count'
export interface SelectResult { select: 'flash' | 'pro'; reason: SelectReason; provisional: boolean }

/**
 * Deterministic whole-batch selector. Never merges the two attempts. The equal-count
 * tie provisionally favors Pro (deeper synthesis, same deterministic validation) and
 * is flagged `provisional` — Stage-C blind quality review decides if that holds.
 */
export function selectBatch(flash: AttemptSummary, pro: AttemptSummary): SelectResult {
  if (!pro.complete) return { select: 'flash', reason: 'pro_incomplete', provisional: false }
  if (pro.finalUserFacingCount > flash.finalUserFacingCount) return { select: 'pro', reason: 'pro_higher_count', provisional: false }
  if (pro.finalUserFacingCount === flash.finalUserFacingCount) return { select: 'pro', reason: 'provisional_tie_pro', provisional: true }
  return { select: 'flash', reason: 'flash_higher_count', provisional: false }
}

// ── Budget authorization (pre-run, worst-case smart path) ────────────────────────

export interface BudgetMaxima { preparationMaxUsd: number; flashAttemptMaxUsd: number; proRescueMaxUsd: number; globalAuthorizedUsd: number }
export type BudgetPath = 'flash_first' | 'pro_first' | 'reject'
export interface BudgetAuthorization { ok: boolean; path: BudgetPath; requiredAuthorizationUsd: number; reason: string }

/**
 * Authorize (not charge) the worst-case smart path BEFORE spending on Flash. If the
 * full Flash+rescue path is not authorized but a Pro-first path fits, prefer Pro-first;
 * otherwise reject the run before spending — never start a Flash run whose required
 * rescue cannot complete.
 */
export function authorizeSmartRunBudget(m: BudgetMaxima): BudgetAuthorization {
  const required = m.preparationMaxUsd + m.flashAttemptMaxUsd + m.proRescueMaxUsd
  if (m.globalAuthorizedUsd >= required) return { ok: true, path: 'flash_first', requiredAuthorizationUsd: required, reason: 'full_smart_path_authorized' }
  if (m.globalAuthorizedUsd >= m.preparationMaxUsd + m.proRescueMaxUsd) return { ok: true, path: 'pro_first', requiredAuthorizationUsd: required, reason: 'insufficient_for_flash_first_pro_fits' }
  return { ok: false, path: 'reject', requiredAuthorizationUsd: required, reason: 'insufficient_quota_for_smart_path' }
}
