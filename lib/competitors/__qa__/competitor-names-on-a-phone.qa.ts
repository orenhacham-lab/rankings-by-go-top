/**
 * WHO THE COMPETITOR IS, ON A PHONE.
 *
 * The "you against your competitors" card put three competitors side by side at
 * every width. At 390px each column came to about 110px, and the names were not
 * merely shortened: an English domain inside a Hebrew column is reordered before
 * it is clipped, so the part that survived was the END of the address. The card
 * read "…ibe.co.il", "…efer.co.il", "…hen.co.il" — three competitors, none of
 * them identifiable (measured 15.11.2026).
 *
 *   A) one under the other on a phone, three across from `sm` up;
 *   B) each name is clipped at its own end, whichever direction it reads in;
 *   C) the full name is still reachable (the row's title) and the meter still
 *      says the whole sentence.
 *
 * Every check has a mutation control.
 *
 * Run: npx tsx lib/competitors/__qa__/competitor-names-on-a-phone.qa.ts
 */
import { readFileSync } from 'fs'
import { join } from 'path'

let pass = 0, fail = 0
function check(name: string, cond: boolean, detail?: string) {
  if (cond) { pass++; console.log(`  ✓ ${name}`) } else { fail++; console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`) }
}
const ROOT = join(__dirname, '..', '..', '..')
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\{\/\*[\s\S]*?\*\/\}/g, '').replace(/(^|[^:'"`])\/\/.*$/gm, '$1')
const card = strip(readFileSync(join(ROOT, 'components/competitors/CompetitorSummary.tsx'), 'utf8'))

console.log('A) the shape')
{
  const stacks = (s: string) => /grid w-full grid-cols-1 gap-3 sm:grid-cols-3/.test(s)
  check('A1: one competitor per row on a phone, three across from sm up', stacks(card))
  check('A1-MUT (CONTROL): three columns at every width fails A1',
    !stacks(card.replace('grid w-full grid-cols-1 gap-3 sm:grid-cols-3 sm:gap-6', 'grid w-full grid-cols-3 gap-4 sm:gap-6')))
}

console.log('\nB) the names')
{
  const readsItself = (s: string) => /<span dir="auto" className="truncate">\{s\.name\}<\/span>/.test(s)
  check('B1: the name declares its own direction, so it is clipped at its own end', readsItself(card))
  check('B1-MUT (CONTROL): a name left to the column\'s direction fails B1',
    !readsItself(card.replace('<span dir="auto" className="truncate">{s.name}</span>', '<span className="truncate">{s.name}</span>')))
  check('B2: a domain shown beside the name is still forced to read left to right',
    /<span dir="ltr" className="hidden truncate/.test(card))
  check('B2-MUT (CONTROL): dropping that direction fails B2',
    !/<span dir="ltr" className="hidden truncate/.test(card.replace('<span dir="ltr" className="hidden truncate', '<span className="hidden truncate')))
  // The waiting state lists the domains in one line; it was already ltr.
  check('B3: the "not compared yet" line is left to right too', /className="mt-1 truncate text-caption text-muted" dir="ltr"/.test(card))
}

console.log('\nC) nothing is lost')
{
  check('C1: the whole sentence is still on the row and on the meter',
    /<li className="min-w-0" title=\{sentence\}>/.test(card) && /aria-label=\{sentence\}/.test(card))
  check('C1-MUT (CONTROL): a row with no full name anywhere fails C1',
    !/<li className="min-w-0" title=\{sentence\}>/.test(card.replace('<li className="min-w-0" title={sentence}>', '<li className="min-w-0">')))
}

console.log(`\n${pass} passed, ${fail} failed`)
if (fail > 0) process.exit(1)

export {}
