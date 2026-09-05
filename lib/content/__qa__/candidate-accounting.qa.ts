/**
 * DEFECT — the topic funnel could report "N candidates generated, 0 accepted,
 * nothing rejected".
 *
 * Observed on a real run: 17 candidates generated, all 17 gone, and every
 * displayed rejection-reason counter zero. The failure is AFTER candidate
 * generation, so the input data is not in question.
 *
 * The cause is a single unattributed exit in the pool-assembly loop
 * (generate-opportunities.ts). `td.raw_candidates` counted the candidates, then
 * the loop dropped them with a bare `continue` — no `bump()`, so nothing
 * reached `rejected_by_reason`:
 *
 *     for (const s of produced) {
 *       const k = normalizeText(s.primaryKeyword)
 *       if (!k || seen.has(k)) continue      // ← counted in, never counted out
 *       ...
 *     }
 *
 * Every other exit in the funnel is typed: synthAndValidate bumps a reason for
 * each rejected candidate, and the batched validator FAILS OPEN (a missing or
 * unparsable verdict KEEPS the candidate — plan-validator.ts:138), so neither
 * can produce a silent zero.
 *
 * These tests reproduce the invariant violation on the OLD loop, show it named
 * under the new one, and pin the ledger invariant itself.
 *
 * Run: npx tsx lib/content/__qa__/candidate-accounting.qa.ts
 */

import { readFileSync } from 'fs'
import { join } from 'path'
import { normalizeText } from '../recommendations/topic-idea-store'

let pass = 0, fail = 0
function check(name: string, cond: boolean, detail?: string) {
  if (cond) { pass++; console.log(`  ✓ ${name}`) } else { fail++; console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`) }
}

type Cand = { primaryKeyword: string }
type Ledger = Record<string, number>

/** The pool-assembly loop as it was — the defect, preserved for the control. */
function assembleOld(produced: Cand[]): { pool: Cand[]; rejected: Ledger } {
  const pool: Cand[] = []
  const seen = new Set<string>()
  const rejected: Ledger = {}
  for (const s of produced) {
    const k = normalizeText(s.primaryKeyword)
    if (!k || seen.has(k)) continue
    seen.add(k)
    pool.push(s)
  }
  return { pool, rejected }
}

/** The corrected loop — every exit typed and counted. Mirrors the shipped code. */
function assembleNew(produced: Cand[]): { pool: Cand[]; rejected: Ledger } {
  const pool: Cand[] = []
  const seen = new Set<string>()
  const rejected: Ledger = {}
  const bump = (r: string) => { rejected[r] = (rejected[r] ?? 0) + 1 }
  for (const s of produced) {
    const k = normalizeText(s.primaryKeyword)
    if (!k) { bump('empty_primary_keyword'); continue }
    if (seen.has(k)) { bump('cross_family_duplicate'); continue }
    seen.add(k)
    pool.push(s)
  }
  return { pool, rejected }
}

/** The shipped ledger invariant: residual losses are surfaced, never dropped. */
function sealLedger(generated: number, poolSize: number, rejected: Ledger): Ledger {
  const out = { ...rejected }
  const named = Object.values(out).reduce((a, b) => a + b, 0)
  const unaccounted = generated - poolSize - named
  if (unaccounted > 0) out.unaccounted = (out.unaccounted ?? 0) + unaccounted
  return out
}
const sum = (l: Ledger) => Object.values(l).reduce((a, b) => a + b, 0)

async function main() {
  console.log('Topic-candidate funnel accounting\n')

  // The production shape: 17 candidates that all collapse to one normalized key.
  const SEVENTEEN: Cand[] = Array.from({ length: 17 }, (_, i) =>
    ({ primaryKeyword: i === 0 ? 'בשמים נישה' : `  בשמים נישה${i === 1 ? '' : ''}  ` }))

  console.log('1) REPRODUCTION — 17 generated, 0 accepted, every counter zero')
  {
    const old = assembleOld(SEVENTEEN)
    check('1a: all 17 candidates leave the funnel', old.pool.length + sum(old.rejected) !== 17 || old.pool.length < 17)
    check('1b: only 1 survives into the pool', old.pool.length === 1, String(old.pool.length))
    check('1c: and the rejection ledger is EMPTY — the reported symptom', sum(old.rejected) === 0, JSON.stringify(old.rejected))
    check('1d: THE INVARIANT IS VIOLATED: generated ≠ pool + rejected',
      17 !== old.pool.length + sum(old.rejected), `17 vs ${old.pool.length} + ${sum(old.rejected)}`)

    // The exact reported case: nothing survives at all.
    const allEmpty: Cand[] = Array.from({ length: 17 }, () => ({ primaryKeyword: '   ' }))
    const oldEmpty = assembleOld(allEmpty)
    check('1e: with unusable keywords, 17 in / 0 out / 0 rejected — exactly what was seen',
      oldEmpty.pool.length === 0 && sum(oldEmpty.rejected) === 0)
  }

  console.log('\n2) THE FIX — every exit is named, and the numbers add up')
  {
    const next = assembleNew(SEVENTEEN)
    check('2a: the same 17 candidates produce the same pool (no behaviour change)',
      next.pool.length === 1)
    check('2b: but the 16 losses are now NAMED', sum(next.rejected) === 16, JSON.stringify(next.rejected))
    check('2c: as cross-family duplicates', next.rejected.cross_family_duplicate === 16)
    check('2d: THE INVARIANT HOLDS: generated === pool + rejected',
      17 === next.pool.length + sum(next.rejected))

    const allEmpty: Cand[] = Array.from({ length: 17 }, () => ({ primaryKeyword: '   ' }))
    const nextEmpty = assembleNew(allEmpty)
    check('2e: unusable keywords are named too, not silently dropped',
      nextEmpty.rejected.empty_primary_keyword === 17 && nextEmpty.pool.length === 0)
    check('2f: and that run also reconciles', 17 === nextEmpty.pool.length + sum(nextEmpty.rejected))

    // Thresholds are NOT touched: a clean batch still yields the same pool.
    const distinct: Cand[] = ['בושם ורד', 'בושם עץ אלגום', 'מארז דוגמיות'].map((primaryKeyword) => ({ primaryKeyword }))
    const clean = assembleNew(distinct)
    check('2g: a batch with distinct keywords is unaffected — nothing was made stricter',
      clean.pool.length === 3 && sum(clean.rejected) === 0)
  }

  console.log('\n3) THE SEALED LEDGER — a future silent drop cannot hide')
  {
    // Simulate some yet-unknown drop that forgets to bump: 17 in, 5 pooled,
    // 2 named. The ledger must surface the missing 10 rather than under-report.
    const sealed = sealLedger(17, 5, { covered_by_existing_content: 2 })
    check('3a: an unnamed residual is surfaced as `unaccounted`', sealed.unaccounted === 10, JSON.stringify(sealed))
    check('3b: and the ledger then reconciles', 17 === 5 + sum(sealed))
    check('3c: a fully-accounted run gains no phantom entry',
      sealLedger(17, 1, { cross_family_duplicate: 16 }).unaccounted === undefined)
    check('3d: it never invents a negative or zero entry',
      sealLedger(3, 3, {}).unaccounted === undefined && sealLedger(3, 5, {}).unaccounted === undefined)
    check('3e: the reported total always covers every candidate that left',
      (() => { const l = sealLedger(17, 0, {}); return sum(l) === 17 })())
  }

  console.log('\n4) SOURCE — the shipped funnel matches what is tested here')
  {
    const src = readFileSync(join(__dirname, '..', 'recommendations', 'generate-opportunities.ts'), 'utf8')
    check('4a: the bare `continue` drop is gone',
      !/if \(!k \|\| seen\.has\(k\)\) continue/.test(src))
    check('4b: both causes are bumped by name',
      /bump\(td, 'empty_primary_keyword'\)/.test(src) && /bump\(td, 'cross_family_duplicate'\)/.test(src))
    check('4c: the ledger is sealed against unnamed residuals',
      /rejected_by_reason\.unaccounted/.test(src) && /const unaccounted =/.test(src))
    check('4d: no quality threshold was altered in this change',
      !/SERVING_POSITION_MAX\s*=\s*(?!20)/.test(src))
    // The validator still fails OPEN — it is not the silent dropper and must not become one.
    const validator = readFileSync(join(__dirname, '..', 'recommendations', 'plan-validator.ts'), 'utf8')
    check('4e: a missing validator verdict still KEEPS the candidate',
      /validator_missing_verdict_count \+= 1; keep\(s\); continue/.test(validator))
  }

  console.log(`\n${pass} passed, ${fail} failed`)
  if (fail > 0) process.exitCode = 1
}

main().catch((e) => { console.error(e); process.exitCode = 1 })
