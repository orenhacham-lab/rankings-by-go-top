/**
 * Low-yield fallback — RELATIVE accepted-count ceiling QA.
 *
 * The fallback trigger and canRunBoundedRefill compete for the SAME single final paid call
 * but disagreed about what "needs help" means: the fallback used an absolute count (< 4)
 * while the refill uses a relative shortfall (targetCount - accepted >= 3). At the
 * production targetCount of 12, a run accepting 5 has a shortfall of 7 — a large miss —
 * yet the fallback declined it and the normal refill took the slot and produced nothing.
 *
 * The ceiling is now max(LOW_YIELD_ACCEPTED_CEILING, ceil(targetCount / 2)):
 *   - targetCount <= 8  → 4  (IDENTICAL to the previous absolute rule — the floor holds)
 *   - targetCount 12    → 6  (Louiz's accepted-5 run now triggers)
 *   - targetCount 24    → 12 (still bounded — a productive run keeps the normal refill)
 *
 * Proves: the intended shapes fire/don't fire, the floor preserves low-target behavior,
 * the change is COST-NEUTRAL (fallback and refill are mutually exclusive for one slot,
 * PAID_CALL_CAP re-checked at evaluation time), and every frozen constant/gate is intact.
 * Source contracts strip comments first so prose can never satisfy a regex.
 */
import { readFileSync } from 'fs'
import { join } from 'path'
import {
  evaluateLowYieldTrigger, lowYieldAcceptedCeiling,
  LOW_YIELD_ACCEPTED_CEILING, MIN_ELIGIBLE_SEEDS, COVERAGE_REJECTION_MIN_RATIO, MAX_SEEDS_SENT,
} from '../recommendations/low-yield-fallback'

let pass = 0, fail = 0
function check(name: string, cond: boolean, detail?: string) {
  if (cond) { pass++; console.log(`  ✓ ${name}`) } else { fail++; console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`) }
}
const ROOT = join(__dirname, '..', '..', '..')
const read = (rel: string) => readFileSync(join(ROOT, rel), 'utf8')
const stripComments = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')

/** All non-ceiling conditions satisfied, so the ceiling is the ONLY variable under test. */
const base = {
  eligibleSeedCount: 14,
  rejectionCounts: { covered_by_existing_content: 4, title_keyword_mismatch: 1 },
  controllerAuthorizes: true, finalSlotAvailable: true, noFailure: true,
}
const fires = (acceptedCount: number, targetCount: number) =>
  evaluateLowYieldTrigger({ ...base, acceptedCount, targetCount }).triggered

function main() {
  console.log('Low-yield fallback — relative (floor-preserving) accepted ceiling\n')

  // ── A) the ceiling function itself ────────────────────────────────────────────
  console.log('A) effective ceiling = max(4, ceil(target/2))')
  {
    check('A1. target 12 → 6', lowYieldAcceptedCeiling(12) === 6, String(lowYieldAcceptedCeiling(12)))
    check('A2. target 24 → 12', lowYieldAcceptedCeiling(24) === 12, String(lowYieldAcceptedCeiling(24)))
    check('A3. target 8 → 4 (floor exactly meets proportional)', lowYieldAcceptedCeiling(8) === 4)
    check('A4. floor holds below 8 — targets 2/4/6 all → 4',
      [2, 4, 6].every((t) => lowYieldAcceptedCeiling(t) === LOW_YIELD_ACCEPTED_CEILING))
    check('A5. never below the documented floor, for any target 0..40',
      Array.from({ length: 41 }, (_, t) => lowYieldAcceptedCeiling(t)).every((v) => v >= LOW_YIELD_ACCEPTED_CEILING))
    check('A6. monotonic non-decreasing in targetCount',
      Array.from({ length: 40 }, (_, t) => lowYieldAcceptedCeiling(t + 1) >= lowYieldAcceptedCeiling(t)).every(Boolean))
  }

  // ── B) the Louiz shape — the defect this change fixes ─────────────────────────
  console.log('\nB) Louiz shape (target 12, accepted 5) now triggers')
  {
    check('B1. target 12, accepted 5 → FIRES (was declined by the absolute 4)', fires(5, 12))
    check('B2. …and the OLD absolute rule would have declined it (5 < 4 is false)',
      !(5 < LOW_YIELD_ACCEPTED_CEILING))
    check('B3. target 12, accepted 0 → fires (zero-yield run, unchanged)', fires(0, 12))
    check('B4. target 12, accepted 3 → fires', fires(3, 12))
    check('B5. target 12, accepted 5 is the boundary-1 case', fires(5, 12) && !fires(6, 12))
  }

  // ── C) productive runs still keep the normal bounded refill ───────────────────
  console.log('\nC) a productive run does NOT fire (the refill keeps the slot)')
  {
    check('C1. target 12, accepted 6 → no fire (=== ceiling)', !fires(6, 12))
    check('C2. target 12, accepted 7 → no fire', !fires(7, 12))
    check('C3. target 12, accepted 11 → no fire', !fires(11, 12))
    check('C4. japan4u shape (target 12, accepted 7 at the refill round) → no fire, unaffected',
      !fires(7, 12))
  }

  // ── D) scales correctly at the coming targetCount of 24 ───────────────────────
  console.log('\nD) target 24 scales, and stays BOUNDED (not a blanket fire)')
  {
    check('D1. target 24, accepted 5 → fires', fires(5, 24))
    check('D2. target 24, accepted 11 → fires', fires(11, 24))
    check('D3. target 24, accepted 15 → NO fire (bounded — Option A would have fired)', !fires(15, 24))
    check('D4. target 24, accepted 12 → no fire (=== ceiling)', !fires(12, 24))
    // A literal shortfall>=3 mirror (rejected Option A) would fire here; prove we did not ship it.
    check('D5. NOT a shortfall>=3 mirror: target 24 accepted 20 (shortfall 4) does not fire',
      !fires(20, 24))
  }

  // ── E) the previous QA's cases still hold (no silent loosening) ───────────────
  console.log('\nE) existing assertions preserved (U12 / U13 shapes, target 8)')
  {
    check('E1. U12 shape — target 8, accepted 4 → no fire (floor keeps the old behavior)',
      !fires(4, 8))
    check('E2. U13 shape — target 8, accepted 8 → no fire (target reached)', !fires(8, 8))
    check('E3. target 8, accepted 3 → fires (unchanged from the absolute rule)', fires(3, 8))
    check('E4. every target <= 8 behaves EXACTLY as the old absolute rule for accepted 0..8',
      [2, 4, 6, 8].every((t) => Array.from({ length: 9 }, (_, a) => a).every((a) =>
        fires(a, t) === (a < LOW_YIELD_ACCEPTED_CEILING && a < t))))
  }

  // ── F) the other six trigger conditions are untouched ─────────────────────────
  console.log('\nF) the ceiling is the ONLY condition changed')
  {
    check('F1. targetNotReached still gates (accepted === target → no fire)', !fires(12, 12))
    check('F2. enoughSeeds still gates (seeds 11 < 12 → no fire)',
      !evaluateLowYieldTrigger({ ...base, acceptedCount: 5, targetCount: 12, eligibleSeedCount: 11 }).triggered)
    check('F3. coverageDominated still gates (coverage-type ratio below 0.5 → no fire)',
      !evaluateLowYieldTrigger({ ...base, acceptedCount: 5, targetCount: 12, rejectionCounts: { title_keyword_mismatch: 5 } }).triggered)
    check('F4. noFailure still gates',
      !evaluateLowYieldTrigger({ ...base, acceptedCount: 5, targetCount: 12, noFailure: false }).triggered)
    check('F5. controllerAuthorizes still gates',
      !evaluateLowYieldTrigger({ ...base, acceptedCount: 5, targetCount: 12, controllerAuthorizes: false }).triggered)
    check('F6. finalSlotAvailable still gates',
      !evaluateLowYieldTrigger({ ...base, acceptedCount: 5, targetCount: 12, finalSlotAvailable: false }).triggered)
    check('F7. no rejectionCounts at all → no fire (coverageDominated needs totalRej > 0)',
      !evaluateLowYieldTrigger({ ...base, acceptedCount: 5, targetCount: 12, rejectionCounts: {} }).triggered)
  }

  // ── G) COST NEUTRALITY — proven from source, three independent levels ─────────
  console.log('\nG) cost neutrality — no path can spend an extra paid call')
  {
    const gfb = stripComments(read('lib/content/recommendations/generate-from-briefs.ts'))
    check('G1. in-loop: the fallback and the normal refill are mutually exclusive for one slot',
      /const fb = await runLowYieldFallback\(round\)/.test(gfb)
      && /if \(fb === 'ran' \|\| fb === 'blocked'\)/.test(gfb)
      && /if \(!canRunBoundedRefill\(\)\) \{[^}]*break/.test(gfb))
    check('G2. post-loop site still requires an UNUSED third-call strategy + a free slot',
      /thirdCallStrategy === 'not_used'/.test(gfb) && /controller\.callCount < PAID_CALL_CAP/.test(gfb))
    check('G3. the trigger re-checks PAID_CALL_CAP at evaluation time (both fields)',
      /controllerAuthorizes: [^\n]*controller\.callCount < PAID_CALL_CAP/.test(gfb)
      && /finalSlotAvailable: controller\.callCount < PAID_CALL_CAP/.test(gfb))
    check('G4. PAID_CALL_CAP is still 3', /const PAID_CALL_CAP = 3\b/.test(gfb))
    check('G5. round budget unchanged (legacyAttemptRounds / maxSynthesisRounds)',
      /const legacyAttemptRounds = discovery\?\.ran \? 1 : 2/.test(gfb)
      && /const maxSynthesisRounds = Math\.min\(legacyAttemptRounds \+ \(allowRefill \? 1 : 0\), remainingGlobalCalls\)/.test(gfb))
    check('G6. batchSize formula unchanged', /const batchSize = Math\.min\(workingPool\.length - cursor, Math\.max\(4, Math\.ceil\(deficit \* 1\.5\)\)\)/.test(gfb))
    check('G7. canRunBoundedRefill shortfall rule unchanged (>= 3)', /shortfall >= 3/.test(gfb))
  }

  // ── H) FROZEN — no gate, dedup, cannibalisation or seed rule touched ──────────
  console.log('\nH) FROZEN — gates, dedup, cannibalisation and the seed chain intact')
  {
    const gfb = stripComments(read('lib/content/recommendations/generate-from-briefs.ts'))
    const lyf = stripComments(read('lib/content/recommendations/low-yield-fallback.ts'))
    const opp = stripComments(read('lib/content/recommendations/opportunity.ts'))
    const sd = stripComments(read('lib/content/recommendations/semantic-dup.ts'))

    check('H1. fallback output still runs the SAME validatePolished (no filler path)',
      /const r = validatePolished\(polishedT, pair\.brief\)/.test(gfb))
    check('H2. source_only_entity_expansion intact', /return fail\('source_only_entity_expansion', 0, cannib\)/.test(opp))
    check('H3. brief-vs-brief dedup threshold UNCHANGED at >= 0.5 (change B stays closed)',
      /shared \/ union >= 0\.5/.test(sd))
    check('H4. cannibalisation / pending / intra-run dedupe intact',
      /assessNeedCannibalization\(/.test(gfb) && /pending_semantic_duplicate/.test(gfb) && /intra_run_need_duplicate/.test(gfb))
    check('H5. fallback tunables unchanged (seeds 12 / coverage 0.5 / maxSeeds 30)',
      MIN_ELIGIBLE_SEEDS === 12 && COVERAGE_REJECTION_MIN_RATIO === 0.5 && MAX_SEEDS_SENT === 30)
    check('H6. the seed-exclusion chain is untouched (entity-owner + duplicate guards present)',
      /exact_entity_owner/.test(lyf) && /consumed_brief_duplicate/.test(lyf)
      && /published_duplicate/.test(lyf) && /pending_duplicate/.test(lyf))
    // SHAPE C replaced the constant with a supply-scaled quota. The historical value 2
    // survives as the FLOOR (TRIAL_GSC_BASE), so no project can receive fewer trial
    // slots than before; the cap is additive-only and never re-ranks.
    check('H7. GSC trial quota is supply-scaled with the historical 2 as its floor',
      /const TRIAL_GSC_BASE = 2\b/.test(gfb) && /const MAX_TRIAL_GSC_BRIEFS = trialGscBriefQuota\(/.test(gfb))
    check('H8. the ceiling is the ONLY trigger predicate that reads targetCount for a bound',
      /belowAcceptedCeiling: input\.acceptedCount < lowYieldAcceptedCeiling\(input\.targetCount\)/.test(lyf))
  }

  console.log(`\n${pass} passed, ${fail} failed`)
  if (fail > 0) process.exitCode = 1
}
main()
