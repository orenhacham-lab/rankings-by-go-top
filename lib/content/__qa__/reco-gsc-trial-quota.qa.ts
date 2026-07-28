/**
 * SHAPE C — the round-1 GSC trial quota scales with the project's Search Console supply.
 *
 * DEFECT: the quota was the constant 2, so participation was independent of supply.
 * Measured on nagler: supportingCandidateCount 312, addedAsNewBriefCount 29,
 * consumedGscBriefCount exactly 2. Every GSC brief ranked below the examined window
 * (28 of 58), so the round-1 append was the only way in and it was capped at two.
 *
 * THE THREE CONDITIONS, each asserted here:
 *  1. ADDITIVE — the quota feeds only the append at the END of composeSynthesisBatch,
 *     which extends the batch PAST batchSize. naturalBatch is built first and kept
 *     whole, so raising the quota can never displace a keyword-research brief.
 *     Section B proves it by comparing the natural prefix element-by-element.
 *  2. SELF-SCALING — one slot per SUPPORTING_PER_SLOT, floored at the historical 2,
 *     capped at TRIAL_GSC_MAX and at what the project actually has.
 *  3. NO-GSC PROJECTS BYTE-IDENTICAL — real array equality (same length, same element
 *     REFERENCES, same order), not an approximation. Section D.
 */
import { readFileSync } from 'fs'
import { join } from 'path'
import {
  composeSynthesisBatch, trialGscBriefQuota,
  TRIAL_GSC_BASE, TRIAL_GSC_MAX, SUPPORTING_PER_SLOT,
} from '../recommendations/generate-from-briefs'
import type { OpportunityBrief } from '../recommendations/opportunity-brief'

let pass = 0, fail = 0
function check(n: string, c: boolean, d?: string) { if (c) { pass++; console.log(`  ✓ ${n}`) } else { fail++; console.log(`  ✗ ${n}${d?` — ${d}`:''}`) } }
const ROOT = join(__dirname, '..', '..', '..')
const read = (r: string) => readFileSync(join(ROOT, r), 'utf8')
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')

const mk = (id: string): OpportunityBrief => ({ opportunityId: id, subject: id, searchNeed: 'question', family: 'informational', sourceEvidence: [{ kind: id.startsWith('gsc:') ? 'gsc' : 'keyword_research', text: id }], alignedDemandQuery: null, demandVolumeSource: null, intendedIntent: 'informational', intendedPageType: 'article', existingContentGap: true, relatedEntities: [], publishedCoverage: [], confidence: 0.5, briefScore: 0.5 } as unknown as OpportunityBrief)
/** Same array identity test used for the byte-identical proof. */
const sameArray = (a: OpportunityBrief[], b: OpportunityBrief[]) => a.length === b.length && a.every((x, i) => x === b[i])

function main() {
  console.log('Shape C — scaled GSC trial quota\n')

  console.log('A) the quota function')
  check(`A1. nagler (312 supporting, 29 available) -> ${trialGscBriefQuota(312, 29)} (was the constant 2)`,
    trialGscBriefQuota(312, 29) === Math.min(TRIAL_GSC_MAX, 29, Math.max(TRIAL_GSC_BASE, Math.floor(312 / SUPPORTING_PER_SLOT))))
  check('A2. a thin-GSC project (6 supporting) keeps the historical floor of 2',
    trialGscBriefQuota(6, 29) === TRIAL_GSC_BASE)
  check('A3. NEVER below the historical value — no project regresses',
    [0, 1, 6, 49, 50, 312, 2449].every((s) => trialGscBriefQuota(s, 99) >= TRIAL_GSC_BASE))
  check('A4. capped at TRIAL_GSC_MAX however large the supply', trialGscBriefQuota(999999, 999) === TRIAL_GSC_MAX)
  check('A5. never more than the project actually has', trialGscBriefQuota(999999, 3) === 3)
  check('A6. no GSC briefs at all -> 0 (nothing to append)', trialGscBriefQuota(312, 0) === 0)
  check('A7. monotonic non-decreasing in supply',
    [0, 10, 50, 100, 200, 400].map((s) => trialGscBriefQuota(s, 99)).every((v, i, a) => i === 0 || v >= a[i - 1]))
  check('A8. hostile inputs do not throw or go negative',
    trialGscBriefQuota(NaN, 5) === TRIAL_GSC_BASE && trialGscBriefQuota(-100, 5) === TRIAL_GSC_BASE && trialGscBriefQuota(312, -1) === 0)

  console.log('\nB) ADDITIVE — the natural prefix is never disturbed')
  {
    const pool = [...Array.from({ length: 20 }, (_, i) => mk(`kr${i}`)), ...Array.from({ length: 10 }, (_, i) => mk(`gsc:g${i}`))]
    const base = { workingPool: pool, cursor: 0, batchSize: 18, round: 1, consumedIds: new Set<string>(), e3aTrialActive: true }
    const q2 = composeSynthesisBatch({ ...base, consumedIds: new Set(), maxTrialGscBriefs: 2 })
    const q8 = composeSynthesisBatch({ ...base, consumedIds: new Set(), maxTrialGscBriefs: 8 })
    check('B1. the first batchSize elements are IDENTICAL at quota 2 and quota 8',
      sameArray(q2.batch.slice(0, 18), q8.batch.slice(0, 18)))
    check('B2. …and equal the untouched pool prefix (nothing displaced)',
      sameArray(q8.batch.slice(0, 18), pool.slice(0, 18)))
    check('B3. the batch GROWS past batchSize — the quota only appends',
      q2.batch.length === 18 + 2 && q8.batch.length === 18 + 8, `${q2.batch.length} / ${q8.batch.length}`)
    check('B4. nextCursor is unaffected by the quota (no extra consumption of the ranked list)',
      q2.nextCursor === q8.nextCursor)
    check('B5. every appended brief is GSC-origin and none was already in the natural batch',
      q8.appendedIds.every((id) => id.startsWith('gsc:')) && new Set([...q8.batch.map((b) => b.opportunityId)]).size === q8.batch.length)
  }

  console.log('\nC) the append is round-1 only (unchanged)')
  {
    const pool = [...Array.from({ length: 20 }, (_, i) => mk(`kr${i}`)), ...Array.from({ length: 10 }, (_, i) => mk(`gsc:g${i}`))]
    const r2 = composeSynthesisBatch({ workingPool: pool, cursor: 18, batchSize: 18, round: 2, consumedIds: new Set(pool.slice(0, 18).map((b) => b.opportunityId)), e3aTrialActive: true, maxTrialGscBriefs: 8 })
    check('C1. round 2 appends nothing regardless of quota', r2.appendedIds.length === 0)
  }

  console.log('\nD) NO-GSC PROJECTS — real array equality')
  {
    const noGsc = Array.from({ length: 30 }, (_, i) => mk(`kr${i}`))
    // e3aTrialActive false — the early-return path, which never reads the quota.
    const off2 = composeSynthesisBatch({ workingPool: noGsc, cursor: 0, batchSize: 18, round: 1, consumedIds: new Set(), e3aTrialActive: false, maxTrialGscBriefs: 2 })
    const off8 = composeSynthesisBatch({ workingPool: noGsc, cursor: 0, batchSize: 18, round: 1, consumedIds: new Set(), e3aTrialActive: false, maxTrialGscBriefs: 8 })
    check('D1. e3aTrialActive=false: batch is array-identical at quota 2 vs 8', sameArray(off2.batch, off8.batch))
    check('D2. …and array-identical to the plain slice (same references, same order)',
      sameArray(off8.batch, noGsc.slice(0, 18)))
    check('D3. …with identical cursor, exhausted, naturalGscCount and appendedIds',
      off2.nextCursor === off8.nextCursor && off2.exhausted === off8.exhausted
      && off2.naturalGscCount === off8.naturalGscCount && JSON.stringify(off2.appendedIds) === JSON.stringify(off8.appendedIds))
    // A GSC-free pool with the trial nominally ON — appended must still be empty.
    const on8 = composeSynthesisBatch({ workingPool: noGsc, cursor: 0, batchSize: 18, round: 1, consumedIds: new Set(), e3aTrialActive: true, maxTrialGscBriefs: 8 })
    check('D4. a GSC-free pool appends nothing even with the trial active and quota 8',
      on8.appendedIds.length === 0 && sameArray(on8.batch, noGsc.slice(0, 18)))
    check('D5. שופ לייט shape (GSC נבדקו 0): the quota itself is 0', trialGscBriefQuota(0, 0) === 0)
  }

  console.log('\nE) source contract')
  {
    const gfb = strip(read('lib/content/recommendations/generate-from-briefs.ts'))
    check('E1. the quota is computed from the project\'s own GSC diagnostics',
      /const MAX_TRIAL_GSC_BRIEFS = trialGscBriefQuota\(\s*snapshot\.gscInput\.supportingCandidateCount \?\? 0,\s*snapshot\.gscInput\.addedAsNewBriefCount \?\? 0,\s*\)/.test(gfb))
    check('E2. the literal constant 2 is gone from the call site', !/const MAX_TRIAL_GSC_BRIEFS = 2/.test(gfb))
    check('E3. composeSynthesisBatch still appends AFTER naturalBatch (additive shape intact)',
      /const batch = \[\.\.\.naturalBatch, \.\.\.appended\]/.test(gfb))
    check('E4. the append is still gated on round === 1', /if \(round === 1\) \{/.test(gfb))
    check('E5. the early return for an inactive trial is untouched',
      /if \(!e3aTrialActive\) \{[\s\S]{0,260}return \{ batch, nextCursor: cursor \+ batchSize/.test(gfb))
    check('E6. no per-project branching — the quota is a pure function of two numbers',
      /export function trialGscBriefQuota\(supportingCandidateCount: number, addedAsNewBriefCount: number\): number/.test(gfb))
    check('E7. PAID_CALL_CAP untouched — the quota changes batch SIZE, never call COUNT',
      /const PAID_CALL_CAP = 3/.test(gfb) && (gfb.match(/await generateRecommendationJSON\(/g) ?? []).length === 3)
    check('E8. the output budget already scales with batch length', /synthesisOutputBudget\(batch\.length\)/.test(gfb))
  }

  console.log(`\n${pass} passed, ${fail} failed`)
  if (fail > 0) process.exitCode = 1
}
main()
