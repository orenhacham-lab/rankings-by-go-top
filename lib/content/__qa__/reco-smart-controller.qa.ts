/**
 * SMART-CONTROLLER (Stage B) — pure decision-layer QA.
 *
 * Covers: unique-briefId rescue accounting + no double counting + the accounting
 * invariant; every route/engine rejection classification; escalateToPro across all
 * branches incl. preparation-failure vs genuine empty pool and the corrected
 * consumed-rescuable cases; selectBatch (never merges, provisional tie); budget
 * authorization. Nothing here touches the validated engine.
 */
import {
  classifyEngineReason, classifyPostProcReason, computeRescueAccounting, escalateToPro,
  selectBatch, authorizeSmartRunBudget, type BriefOutcome, type FinalizedAttempt, type PreparationTelemetry,
} from '../recommendations/smart-controller'

let pass = 0, fail = 0
const check = (name: string, cond: boolean, detail?: string) => { if (cond) { pass++; console.log(`  ✓ ${name}`) } else { fail++; console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`) } }

const okPrep: PreparationTelemetry = { preparationStarted: true, preparationSucceeded: true, discoveryRequired: false, discoveryAttempted: false, discoverySucceeded: true, discoveryFailureType: null, poolBuiltSuccessfully: true, poolEmptyAfterSuccessfulPreparation: false }
const emptyPrep: PreparationTelemetry = { ...okPrep, poolBuiltSuccessfully: true, poolEmptyAfterSuccessfulPreparation: true }
const failedPrep: PreparationTelemetry = { preparationStarted: true, preparationSucceeded: false, discoveryRequired: true, discoveryAttempted: true, discoverySucceeded: false, discoveryFailureType: 'provider_error', poolBuiltSuccessfully: false, poolEmptyAfterSuccessfulPreparation: false }

const fin = (over: Partial<FinalizedAttempt>, outcomes: BriefOutcome[], poolSize: number): FinalizedAttempt => {
  const rescue = computeRescueAccounting(outcomes, poolSize)
  return { poolSize, finalUserFacingCount: rescue.counts.finalizedAccepted, preparation: okPrep, rounds: [{ providerOk: true, synthesisFailure: null }], stopReason: 'zero_marginal_yield', rescue, ...over }
}
const ids = (prefix: string, n: number, start = 0) => Array.from({ length: n }, (_, i) => `${prefix}${start + i}`)

async function main() {
  console.log('CLASSIFY) engine + route rejection reasons')
  {
    check('engine title_keyword_mismatch → model_rescuable', classifyEngineReason('title_keyword_mismatch') === 'model_rescuable')
    check('engine existing_content_owns_need → structural', classifyEngineReason('existing_content_owns_need') === 'structural')
    check('engine final_keyword_lost_subject → model_rescuable', classifyEngineReason('final_keyword_lost_subject') === 'model_rescuable')
    check('route primary_keyword_exists → model_rescuable', classifyPostProcReason('primary_keyword_exists') === 'model_rescuable')
    check('route intra_run_removed → batch_replacement', classifyPostProcReason('intra_run_removed') === 'batch_replacement')
    check('route covered_by_existing_content → structural', classifyPostProcReason('covered_by_existing_content') === 'structural')
    check('route title_exists → structural', classifyPostProcReason('title_exists') === 'structural')
  }

  console.log('ACCOUNTING) unique-briefId sets, no double counting, invariant')
  {
    // 3 accepted + 2 engine-rescuable-rejected + 1 structural + 2 unprocessed = pool 8
    const outcomes: BriefOutcome[] = [
      ...ids('a', 3).map((briefId) => ({ briefId, stage: 'finalized_accepted' as const })),
      ...ids('e', 2).map((briefId) => ({ briefId, stage: 'engine_rejected' as const, reason: 'title_keyword_mismatch' })),
      { briefId: 's0', stage: 'engine_rejected', reason: 'existing_content_owns_need' },
      ...ids('u', 2).map((briefId) => ({ briefId, stage: 'unprocessed' as const })),
    ]
    const acc = computeRescueAccounting(outcomes, 8)
    check('A1. reconciled (all 8 briefs accounted once)', acc.reconciled)
    check('A2. finalizedAccepted = 3', acc.counts.finalizedAccepted === 3)
    check('A3. rescue potential = 4 (2 engine-rescuable + 2 unprocessed)', acc.counts.totalRescuePotential === 4, String(acc.counts.totalRescuePotential))
    check('A4. structural not counted as rescue', acc.counts.permanentlyStructuralRejected === 1 && !acc.rescuePotentialBriefIds.has('s0'))
    check('A5. genuineExhaustion false', acc.genuineExhaustion === false)
    // No double counting: the same briefId in accepted must never also be rescue.
    check('A6. accepted and rescue sets are disjoint', ids('a', 3).every((id) => !acc.rescuePotentialBriefIds.has(id)))
  }

  console.log('ACCOUNTING) genuine exhaustion only when rescue set empty')
  {
    const outcomes: BriefOutcome[] = [
      ...ids('a', 6).map((briefId) => ({ briefId, stage: 'finalized_accepted' as const })),
      ...ids('s', 4).map((briefId) => ({ briefId, stage: 'engine_rejected' as const, reason: 'covered_by_existing_content' })),
    ]
    const acc = computeRescueAccounting(outcomes, 10)
    check('EX1. all non-accepted are structural, pool consumed → genuineExhaustion', acc.genuineExhaustion === true)
    check('EX2. reconciled', acc.reconciled)
  }

  console.log('ACCOUNTING) finalization removed 4, expression-avoidable → NOT exhaustion')
  {
    // engine accepted 10 → 4 removed by post-processing (primary_keyword_exists, model-rescuable)
    const outcomes: BriefOutcome[] = [
      ...ids('a', 6).map((briefId) => ({ briefId, stage: 'finalized_accepted' as const })),
      ...ids('p', 4).map((briefId) => ({ briefId, stage: 'postproc_rejected' as const, reason: 'primary_keyword_exists' })),
    ]
    const acc = computeRescueAccounting(outcomes, 10)
    check('PP1. 4 expression-avoidable finalization losses are rescue potential', acc.counts.postProcessingModelRescuable === 4 && acc.counts.totalRescuePotential === 4)
    check('PP2. NOT genuine exhaustion', acc.genuineExhaustion === false)
  }

  console.log('ACCOUNTING) structural finalization losses become batch-replacement only WITH headroom')
  {
    // 6 accepted, 4 structural finalization losses, but 3 unprocessed briefs (headroom).
    const withHeadroom = computeRescueAccounting([
      ...ids('a', 6).map((briefId) => ({ briefId, stage: 'finalized_accepted' as const })),
      ...ids('p', 4).map((briefId) => ({ briefId, stage: 'postproc_rejected' as const, reason: 'covered_by_existing_content' })),
      ...ids('u', 3).map((briefId) => ({ briefId, stage: 'unprocessed' as const })),
    ], 13)
    check('BR1. structural slots refillable (headroom) → batch-replacement counted', withHeadroom.counts.batchReplacementPotential === 4 && !withHeadroom.genuineExhaustion)
    // same but NO headroom → structural losses are dead, exhaustion.
    const noHeadroom = computeRescueAccounting([
      ...ids('a', 6).map((briefId) => ({ briefId, stage: 'finalized_accepted' as const })),
      ...ids('p', 4).map((briefId) => ({ briefId, stage: 'postproc_rejected' as const, reason: 'covered_by_existing_content' })),
    ], 10)
    check('BR2. structural losses + no headroom → genuine exhaustion', noHeadroom.genuineExhaustion === true && noHeadroom.counts.batchReplacementPotential === 0)
  }

  console.log('ESCALATE) branch order and corrected under-yield')
  {
    // preparation failure vs genuine empty pool
    check('E0. pool 0 + failed prep → preparation_failure (not no_evidence)', escalateToPro({ ...fin({}, [], 0), preparation: failedPrep, poolSize: 0 }, 10).reason === 'preparation_failure')
    check('E1. pool 0 + successful empty prep → no_evidence', escalateToPro({ ...fin({}, [], 0), preparation: emptyPrep, poolSize: 0 }, 10).reason === 'no_evidence')
    // target met on FINALIZED count precedes failure branches
    const met = fin({ rounds: [{ providerOk: false, synthesisFailure: null }] }, ids('a', 10).map((b) => ({ briefId: b, stage: 'finalized_accepted' as const })), 10)
    check('E2. finalized target met → target_met even with a provider hiccup', escalateToPro(met, 10).reason === 'target_met' && !escalateToPro(met, 10).escalate)
    // provider / synthesis failure while under target
    check('E3. provider failure under target → escalate', escalateToPro(fin({ stopReason: 'provider_failed', rounds: [{ providerOk: false, synthesisFailure: null }] }, [...ids('a', 2).map((b) => ({ briefId: b, stage: 'finalized_accepted' as const })), ...ids('u', 5).map((b) => ({ briefId: b, stage: 'unprocessed' as const }))], 7), 10).reason === 'flash_provider_failure')
    check('E4. synthesis failure under target → escalate', escalateToPro(fin({ stopReason: 'synthesis_failed', rounds: [{ providerOk: true, synthesisFailure: 'synthesis_all_briefs_missing' }] }, ids('u', 8).map((b) => ({ briefId: b, stage: 'unprocessed' as const })), 8), 10).reason === 'flash_synthesis_failure')
    // zero finalized with rescue → mandatory escalate
    check('E5. finalized 0 + rescue → escalate', escalateToPro(fin({}, ids('u', 8).map((b) => ({ briefId: b, stage: 'unprocessed' as const })), 8), 10).reason === 'flash_zero_with_rescue')
    // CORRECTED under-yield: finalized 2, rescue 5 (< deficit 8) → STILL escalate
    const underyield = fin({}, [
      ...ids('a', 2).map((b) => ({ briefId: b, stage: 'finalized_accepted' as const })),
      ...ids('r', 5).map((b) => ({ briefId: b, stage: 'engine_rejected' as const, reason: 'title_keyword_mismatch' })),
    ], 7)
    check('E6. finalized 2, rescue 5 < deficit 8 → STILL escalate (no deficit-closing rule)', escalateToPro(underyield, 10).reason === 'flash_underyield_with_rescue' && escalateToPro(underyield, 10).escalate)
    // under target, rescue 0 → genuine exhaustion
    check('E7. under target, rescue 0 → genuine_exhaustion (no escalate)', escalateToPro(fin({}, [
      ...ids('a', 3).map((b) => ({ briefId: b, stage: 'finalized_accepted' as const })),
      ...ids('s', 4).map((b) => ({ briefId: b, stage: 'engine_rejected' as const, reason: 'insufficient_independent_need' })),
    ], 7), 10).reason === 'genuine_exhaustion')
  }

  console.log('SELECT) never merges; provisional tie → Pro')
  {
    check('S1. incomplete Pro → Flash', selectBatch({ complete: true, finalUserFacingCount: 3 }, { complete: false, finalUserFacingCount: 0 }).select === 'flash')
    check('S2. Pro higher → Pro', selectBatch({ complete: true, finalUserFacingCount: 3 }, { complete: true, finalUserFacingCount: 7 }).select === 'pro')
    const tie = selectBatch({ complete: true, finalUserFacingCount: 5 }, { complete: true, finalUserFacingCount: 5 })
    check('S3. equal → Pro, flagged provisional', tie.select === 'pro' && tie.reason === 'provisional_tie_pro' && tie.provisional === true)
    check('S4. Pro lower → Flash', selectBatch({ complete: true, finalUserFacingCount: 8 }, { complete: true, finalUserFacingCount: 6 }).select === 'flash')
  }

  console.log('BUDGET) worst-case smart-path authorization')
  {
    check('B1. full path authorized → flash_first', authorizeSmartRunBudget({ preparationMaxUsd: 0.01, flashAttemptMaxUsd: 0.02, proRescueMaxUsd: 0.06, globalAuthorizedUsd: 0.20 }).path === 'flash_first')
    check('B2. cannot fund Flash+rescue but Pro fits → pro_first', authorizeSmartRunBudget({ preparationMaxUsd: 0.01, flashAttemptMaxUsd: 0.02, proRescueMaxUsd: 0.06, globalAuthorizedUsd: 0.08 }).path === 'pro_first')
    check('B3. cannot fund even Pro path → reject', authorizeSmartRunBudget({ preparationMaxUsd: 0.01, flashAttemptMaxUsd: 0.02, proRescueMaxUsd: 0.06, globalAuthorizedUsd: 0.03 }).ok === false)
  }

  console.log(`\n${pass} passed, ${fail} failed`)
  if (fail > 0) process.exit(1)
}
main().catch((e) => { console.error(e); process.exit(1) })
