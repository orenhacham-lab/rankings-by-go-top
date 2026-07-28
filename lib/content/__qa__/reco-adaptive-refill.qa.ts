/**
 * Bounded third-refill throughput QA. Proves the exact synthesis-loop rules that add ONE gated
 * third paid call (discovery + synthesis ≤ 3 total) without weakening any gate, plus the Preview-only
 * rejection summary. These are strict source contracts over the real loop (the full reco-brief-engine
 * regression exercises the loop end-to-end); the top-rejection ordering is also proven functionally.
 */
import { readFileSync } from 'fs'
import { join } from 'path'

let pass = 0, fail = 0
function check(name: string, cond: boolean, detail?: string) {
  if (cond) { pass++; console.log(`  ✓ ${name}`) } else { fail++; console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`) }
}
const ROOT = join(__dirname, '..', '..', '..')
const read = (rel: string) => readFileSync(join(ROOT, rel), 'utf8')

function main() {
  console.log('Reco — bounded third-refill throughput')
  const gen = read('lib/content/recommendations/generate-from-briefs.ts')
  const route = read('app/api/content/automation/recommendations/route.ts')
  // The loop body between the refill gate and the zero-yield handler (order-sensitive checks).
  const loop = gen.slice(gen.indexOf('for (let round = 1; round <= maxSynthesisRounds'), gen.indexOf('// The loop ended without an in-loop stop'))

  // GLOBAL cap: total paid calls ≤ 3 across the SHARED controller (Pro + Flash fallback).
  check('(1) paid-call cap is 3', /const PAID_CALL_CAP = 3/.test(gen))
  check('(global-start) attempt captures controller.callCount at start', /const paidCallsAtAttemptStart = controller\.callCount/.test(gen) && /const remainingGlobalCalls = Math\.max\(0, PAID_CALL_CAP - paidCallsAtAttemptStart\)/.test(gen))
  check('(2)(3) maxSynthesisRounds = min(legacy + refill, remainingGlobalCalls)', /const legacyAttemptRounds = discovery\?\.ran \? 1 : 2/.test(gen) && /const maxSynthesisRounds = Math\.min\(legacyAttemptRounds \+ \(allowRefill \? 1 : 0\), remainingGlobalCalls\)/.test(gen))
  check('(refill-opt) allowBoundedThirdRefill defaults true', /const allowRefill = opts\?\.allowBoundedThirdRefill \?\? true/.test(gen))
  check('(1b) the loop is bounded by maxSynthesisRounds', /for \(let round = 1; round <= maxSynthesisRounds && !stop; round\+\+\)/.test(gen))
  check('(1c) model_calls + callsRemaining use the GLOBAL shared controller count', /model_calls: controller\.callCount/.test(gen) && /callsRemaining: Math\.max\(0, PAID_CALL_CAP - controller\.callCount\)/.test(gen))
  {
    // The exact maxSynthesisRounds arithmetic (pure), proving the whole-action total never exceeds 3.
    const maxRounds = (discoveryRan: boolean, allowRefill: boolean, paidAtStart: number) =>
      Math.min((discoveryRan ? 1 : 2) + (allowRefill ? 1 : 0), Math.max(0, 3 - paidAtStart))
    check('(3) primary, no discovery → up to 3 synthesis calls', maxRounds(false, true, 0) === 3)
    check('(4) primary, discovery used (1 spent) → up to 2 synthesis calls', maxRounds(true, true, 1) === 2)
    check('(1) no-discovery: Pro used 1 → Flash fallback ≤ 2 more (total ≤ 3)', maxRounds(false, false, 1) === 2)
    check('(2) discovery + Pro used 2 → Flash fallback ≤ 1 more (total ≤ 3)', maxRounds(true, false, 2) === 1)
    check('(global) once 3 calls already spent, a later attempt makes 0', maxRounds(true, false, 3) === 0 && maxRounds(false, false, 3) === 0)
    check('(5) Flash fallback (allowRefill=false) never gets the extra round', maxRounds(false, false, 0) === 2 && maxRounds(true, false, 0) === 1)
  }

  // The bounded-refill gate conditions (4,6,7 + shortfall/unconsumed).
  check('(4) refill requires at least one already-accepted suggestion', /const canRunBoundedRefill[\s\S]{0,320}suggestions\.length > 0/.test(gen))
  check('(7cond) refill requires a shortfall of at least 3', /shortfall >= 3/.test(gen) && /const shortfall = input\.targetCount - suggestions\.length/.test(gen))
  check('(6cond) refill requires at least 8 unconsumed briefs', /unconsumed >= 8/.test(gen) && /const unconsumed = workingPool\.length - consumptionByBriefId\.size/.test(gen))
  check('(6auth) refill requires controller authorization under the cost ceiling', /!controller\.billingExhausted && controller\.callCount < controller\.budget\.maxModelCallsPerRun/.test(gen))
  check('(F2 refill-identity) bounded refill = per-attempt round beyond the allowance (not global ordinal)', /const isBoundedRefillRound = allowRefill && round > legacyAttemptRounds/.test(gen) && /if \(isBoundedRefillRound\) \{[\s\S]{0,800}if \(!canRunBoundedRefill\(\)\) \{ if \(thirdCallStrategy === 'not_used'\) thirdCallStrategy = 'blocked'; break \}/.test(gen))
  check('(F1 fallback-flag) the Pro-zero Flash fallback passes allowBoundedThirdRefill: false', /synthesizeFromSnapshot\(snapshot, controller, \{ modelOverride: flashModel, allowBoundedThirdRefill: false \}\)/.test(read('lib/content/recommendations/production-run.ts')))
  check('(F3 used-timing) thirdRefillUsed set ONLY after the controller-authorized call (after res.stopped guard)', gen.indexOf("if (res.stopped) { stop = 'budget_stopped'; if (isBoundedRefillRound) thirdCallStrategy = 'blocked'; break }") < gen.indexOf('if (isBoundedRefillRound) { thirdRefillUsed = true; thirdCallStrategy = ') && gen.indexOf("if (isBoundedRefillRound) { thirdRefillUsed = true; thirdCallStrategy = 'normal_refill' }") !== -1)
  check('(F3 calls-made) synthesisCallsMade = controller.callCount − paidCallsAtAttemptStart', /const synthesisCallsMade = controller\.callCount - paidCallsAtAttemptStart/.test(gen))

  // (5) zero-yield deferral only when a bounded refill is available; a zero-result round-1 (no prior
  // accepted) still stops → returns 0 → the existing Pro-zero → Flash fallback is unchanged.
  check('(zero-yield) one zero-yield round defers ONLY to an available bounded refill', /nextIsBoundedRefill && canRunBoundedRefill\(\)\) \{ thirdRefillEligible = true; continue \}/.test(gen))
  check('(5) a zero-result attempt (no prior accepted) cannot refill (Flash fallback path intact)', /suggestions\.length > 0 && shortfall >= 3/.test(gen))
  check('(6) ONLY the Pro-zero fallback opts out; Pro attempt + primary Flash keep the default refill', (read('lib/content/recommendations/production-run.ts').match(/allowBoundedThirdRefill: false/g) ?? []).length === 1)

  // (8) provider/synthesis/budget failures stop BEFORE the zero-yield/refill logic and break.
  check('(8) budget/provider/synthesis failures break before the zero-yield handler', loop.indexOf("stop = 'budget_stopped'") < loop.indexOf('rd.accepted === 0') && loop.indexOf("stop = 'provider_failed'") < loop.indexOf('rd.accepted === 0') && loop.indexOf("stop = 'synthesis_failed'") < loop.indexOf('rd.accepted === 0'))
  check('(8b) the loop only continues while !stop', /round <= maxSynthesisRounds && !stop/.test(gen))

  // (9) no double consumption; (10) no additional GSC trial append after round 1; (11) gates unchanged.
  check('(9) refill uses composeSynthesisBatch (unconsumed-only) + consumedIds guard', /const comp = composeSynthesisBatch\(\{ workingPool, cursor, batchSize, round, consumedIds/.test(gen) && /batch\.forEach\(\(bb\) => consumedIds\.add\(bb\.opportunityId\)\)/.test(gen))
  check('(10) GSC trial append is round-1 only (composeSynthesisBatch), never in a refill', /if \(round === 1\) \{[\s\S]{0,400}appended = workingPool\.filter/.test(gen))
  check('(11) validation/reconciliation gates unchanged (same reconcile + failure classify)', /const rec = reconcileSynthesis\(res\.text, batch\)/.test(gen) && /rd\.synthesis_failure = classifySynthesisFailure\(rec, batch\.length\)/.test(gen) && /if \(rd\.synthesis_failure\) \{ stop = 'synthesis_failed'; break \}/.test(gen))
  check('(11b) same prompt builder + response schema + selected model', /buildBriefSynthesisPrompt\(batch, langLabel, year\)/.test(gen) && /briefSynthesisResponseSchema\(batch\.map/.test(gen) && /\.\.\.\(effectiveModel \? \{ model: effectiveModel \} : \{\}\)/.test(gen))
  check('(target) targetCount is untouched (deficit from input.targetCount)', /const deficit = input\.targetCount - suggestions\.length/.test(gen))

  // (12) top rejection reasons — deterministic (count desc, reason asc), count-only, ≤5.
  check('(12src) route derives topRejectionReasons from rejected_by_reason, sorted + sliced(5)', /topRejectionReasons: Object\.entries\(briefDiagnostics\?\.rejected_by_reason \?\? \{\}\)[\s\S]{0,320}\.slice\(0, 5\)/.test(route))
  {
    const rejected: Record<string, number> = { covered_by_existing_content: 6, title_keyword_mismatch: 4, pending_semantic_duplicate: 2, a_reason: 4, b_reason: 4, extra_low: 1 }
    const top = Object.entries(rejected).map(([reason, count]) => ({ reason, count }))
      .sort((x, y) => y.count - x.count || (x.reason < y.reason ? -1 : x.reason > y.reason ? 1 : 0)).slice(0, 5)
    check('(12) deterministic ordering: count desc, then reason asc; capped at 5', top.length === 5 && top[0].reason === 'covered_by_existing_content' && top[1].reason === 'a_reason' && top[2].reason === 'b_reason' && top[3].reason === 'title_keyword_mismatch' && top[4].reason === 'pending_semantic_duplicate' && !top.some((r) => r.reason === 'extra_low'))
  }

  // (13) operator diagnostics Preview-only; (14) no migration.
  check('(13) operatorRunDiag gated by diagnostics AND non-Production', /\(diagnostics && rtInfo\.vercelEnv !== 'production'\) \? \{\s*operatorRunDiag/.test(route))
  check('(13b) operatorRunDiag carries the refill throughput fields (count-only)', /thirdRefillEligible: briefDiagnostics\?\.thirdRefillEligible/.test(route) && /thirdRefillUsed: briefDiagnostics\?\.thirdRefillUsed/.test(route) && /remainingPool: briefDiagnostics\?\.brief_consumption\?\.remainingBriefs/.test(route) && /synthesisRounds: briefDiagnostics\?\.synthesisCallsMade/.test(route))
  check('(14) no migration / DB field introduced by this change', !/supabase\/migrations|CREATE TABLE|ALTER TABLE/i.test(gen))
  check('(safety) no prompts/model output/ids/queries/bodies in operatorRunDiag', !/primaryQuery|opportunityId|\bprompt\b|apiKey|articleBody/.test((/operatorRunDiag: \{[\s\S]*?\n\s*\},/.exec(route) ?? [''])[0]))

  console.log(`\n${pass} passed, ${fail} failed`)
  if (fail > 0) process.exit(1)
}
main()
