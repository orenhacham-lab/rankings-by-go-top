/**
 * THE RATE WE ARE BOUND BY. The affiliate AGREEMENT, in all ten languages, and
 * the partner dashboard's copy.
 *
 * lib/i18n/public/__qa__/affiliates-page.qa.ts already holds the marketing page
 * to lib/affiliate/terms.ts. It does not reach the agreement or the dashboard,
 * and on 11.11.2026 that gap had cost us something real: terms.ts, the
 * commission engine, the table defaults and the marketing page all said 35%,
 * while the agreement promised 30% in every one of its ten languages and the
 * dashboard told prospective partners 30% in nine. The binding document said
 * one number, the page that made them sign up said another, and we paid the
 * higher one.
 *
 * So this suite guards the documents the other suite does not:
 *
 *   A) every agreement states EXACTLY the two rates in terms.ts and no other
 *      percentage, in all ten languages
 *   B) the dashboard's copy states the base rate, and never another rate
 *
 * The strictness in A is deliberate. "Contains 35%" would pass a document that
 * also still said 30% somewhere, which is the failure mode we actually had, so
 * the set of percentages in the document must match the set in terms.ts.
 *
 * Every guard has a MUTATION CONTROL.
 */
import { readFileSync } from 'fs'
import { join } from 'path'
import { AFFILIATE_TERMS } from '../terms'
import { AFFILIATE_DASHBOARD_COPY } from '../../i18n/public/affiliate-dashboard'

let pass = 0, fail = 0
function check(name: string, cond: boolean, detail?: string) {
  if (cond) { pass++; console.log(`  ✓ ${name}`) } else { fail++; console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`) }
}
const ROOT = join(__dirname, '..', '..', '..')
const read = (rel: string) => readFileSync(join(ROOT, rel), 'utf8')
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')

/** Every percentage in a text, as a set of numbers. French and Italian put a space before the sign. */
const percents = (text: string): Set<number> =>
  new Set((text.match(/(\d+)\s?%/g) ?? []).map((m) => Number(m.replace(/\D/g, ''))))
const same = (a: Set<number>, b: Set<number>) => a.size === b.size && [...a].every((n) => b.has(n))

/** The ten places the agreement is published. Two are hand-written JSX, eight are Markdown. */
const AGREEMENTS = [
  'app/(legal)/affiliate-terms/page.tsx',
  'app/(public)/en/affiliate-terms/page.tsx',
  ...['de', 'es', 'fr', 'it', 'ja', 'nl', 'pl', 'pt-BR'].map((l) => `content/legal/${l}/affiliate-terms.md`),
]

const EXPECTED = new Set([AFFILIATE_TERMS.baseRate, AFFILIATE_TERMS.topRate])

console.log('A) the agreement names the rates in terms.ts, and no others')
{
  const offenders = AGREEMENTS.filter((rel) => !same(percents(strip(read(rel))), EXPECTED))
  check(`A1: all ${AGREEMENTS.length} agreement documents state exactly ${[...EXPECTED].join('% and ')}%`,
    offenders.length === 0, offenders.join(', '))

  /* A1-MUT: the text we actually shipped until 11.11.2026 — the base rate replaced
     by the stale 30% — must fail the same predicate on every document. */
  const mutated = AGREEMENTS.map((rel) =>
    strip(read(rel)).replace(new RegExp(`${AFFILIATE_TERMS.baseRate}(\\s?)%`), '30$1%'))
  check('A1-MUT: a document that still promised 30% is caught',
    mutated.every((text) => !same(percents(text), EXPECTED)))

  /* A1-MUT2: a document carrying BOTH the new rate and a leftover old one is caught,
     which "contains 35%" would not have been. */
  check('A1-MUT2: a document carrying the new rate AND a leftover 30% is caught',
    AGREEMENTS.every((rel) => !same(percents(`${strip(read(rel))} 30%`), EXPECTED)))
}

console.log('\nB) the dashboard tells a visitor the rate we are bound by')
{
  const bodies = Object.entries(AFFILIATE_DASHBOARD_COPY)
    .map(([lang, copy]) => [lang, (copy as { notPartnerBody?: string }).notPartnerBody ?? ''] as const)
  const stating = bodies.filter(([, body]) => /\d+\s?%/.test(body))
  check('B0: at least one language states a rate there, so this guard has something to hold',
    stating.length > 0)

  const wrong = stating.filter(([, body]) => !same(percents(body), new Set([AFFILIATE_TERMS.baseRate])))
  check(`B1: every dashboard body that names a rate names ${AFFILIATE_TERMS.baseRate}%, and only that`,
    wrong.length === 0, wrong.map(([l]) => l).join(', '))

  /* B1-MUT: the nine bodies that said 30% until 11.11.2026 must fail it. */
  check('B1-MUT: a dashboard body promising 30% is caught',
    stating.every(([, body]) =>
      !same(percents(body.replace(new RegExp(`${AFFILIATE_TERMS.baseRate}(\\s?)%`), '30$1%')),
        new Set([AFFILIATE_TERMS.baseRate]))))
}

console.log(`\n${pass} passed, ${fail} failed`)
if (fail > 0) process.exitCode = 1

export {}
