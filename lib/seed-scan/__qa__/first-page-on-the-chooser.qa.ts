/**
 * WHAT THE SCAN ALREADY MEASURED, SAID BEFORE THE OWNER COMMITS.
 *
 * MEASURED on a new account on 15 November 2026: the first scan proposed five
 * keywords to track and every one was a broad head term. After the first rank
 * check all five came back "not found", beside a competitor ranking #2 — so a new
 * owner's first screen in the product was five zeros.
 *
 * Stage A already knew. a4 sends a real search per keyword while it looks for
 * competitors and keeps the first page's domains; it used the domains to rank
 * rivals and threw the rest away, including the fact that the owner's own site was
 * not among them. This change carries that one fact onto the chooser, as a
 * boolean — never a position, because the stored list keeps one entry per domain
 * and an index in it is not a rank in Google.
 *
 * Sections:
 *   A  searchQueries — a4 searches the BROADEST keywords, not the first listed
 *   B  firstPageField — the measurement, and who counts as "this site"
 *   C  the snapshot carries it, defensively
 *   D  source guards: a2's mix rule, a4's wiring, the chooser's line
 */
import { readFileSync } from 'fs'
import { join } from 'path'

import { searchQueries, firstPageField, MAX_SEARCHES } from '../steps'
import { readSummary } from '../summary'

let pass = 0, fail = 0
function check(name: string, cond: boolean, detail?: string) {
  if (cond) { pass++; console.log(`  ✓ ${name}`) } else { fail++; console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`) }
}
const read = (p: string) => readFileSync(join(__dirname, p), 'utf8')
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')

const ok = (query: string, domains: string[]) => ({ query, ok: true as const, code: null, domains })

function sectionA() {
  console.log('A) a4 searches the broadest keywords')

  // Once a2 is asked for a MIX, "as listed" stops meaning "broad". Competitor
  // discovery needs head-term SERPs, so the choice is made, not left to order.
  const mixed = [
    'ביטוח רכב לנהג צעיר מחיר',
    'ביטוח רכב',
    'איך לבחור ביטוח חובה',
    'ביטוח דירה',
    'ביטוח רכב לרכב מסחרי בתל אביב',
  ]
  check('A1. the fewest-word phrases are searched', JSON.stringify(searchQueries(mixed)) === JSON.stringify(['ביטוח רכב', 'ביטוח דירה', 'איך לבחור ביטוח חובה']))
  check('A2. at most MAX_SEARCHES of them', searchQueries(mixed).length === MAX_SEARCHES && MAX_SEARCHES === 3)
  check('A3. a tie keeps the model\'s own order', JSON.stringify(searchQueries(['ג ד', 'א ב', 'ה ו'])) === JSON.stringify(['ג ד', 'א ב', 'ה ו']))
  check('A4. nothing in, nothing searched', searchQueries([]).length === 0)
}

function sectionB() {
  console.log('B) the measurement itself')

  const answered = [
    ok('ביטוח רכב', ['wikipedia.org', 'rival.co.il', 'another.co.il']),
    ok('ביטוח דירה', ['rival.co.il', 'www.mysite.co.il']),
  ]
  const field = firstPageField(answered, 'mysite.co.il')
  check('B1. absent from the first page → false; present → true',
    JSON.stringify(field.searchedKeywords) === JSON.stringify([
      { keyword: 'ביטוח רכב', onFirstPage: false },
      { keyword: 'ביטוח דירה', onFirstPage: true },
    ]), JSON.stringify(field.searchedKeywords))

  check('B2. www is the same site', firstPageField([ok('k', ['www.mysite.co.il'])], 'mysite.co.il').searchedKeywords?.[0].onFirstPage === true)
  check('B3. another site that merely ends the same way is not this site',
    firstPageField([ok('k', ['notmysite.co.il'])], 'mysite.co.il').searchedKeywords?.[0].onFirstPage === false)
  check('B4. a search with no query is not reported', firstPageField([ok('', ['mysite.co.il'])], 'mysite.co.il').searchedKeywords === undefined)
  check('B5. no answered search → the field is absent, not false', firstPageField([], 'mysite.co.il').searchedKeywords === undefined)
}

function sectionC() {
  console.log('C) the stored snapshot')

  // The smallest snapshot readSummary accepts: version, domain and url.
  const base = { version: 1, domain: 'mysite.co.il', url: 'https://mysite.co.il/' }
  const stored = { ...base, searchedKeywords: [{ keyword: 'ביטוח רכב', onFirstPage: false }] }
  check('C1. a stored measurement is read back', readSummary(stored)?.searchedKeywords?.[0].onFirstPage === false)
  check('C2. a snapshot from before this field reads back without it', !!readSummary(base) && readSummary(base)?.searchedKeywords === undefined)
  check('C3. junk is dropped, not trusted', (() => {
    const r = readSummary({ ...stored, searchedKeywords: [{ keyword: '', onFirstPage: true }, { onFirstPage: true }, 'x', { keyword: 'k', onFirstPage: 'yes' }] })
    return JSON.stringify(r?.searchedKeywords) === JSON.stringify([{ keyword: 'k', onFirstPage: false }])
  })())
  check('C4. not an array → nothing', readSummary({ ...stored, searchedKeywords: 'all of them' })?.searchedKeywords === undefined)
}

function sectionD() {
  console.log('D) source guards')

  const prompt = strip(read('../../free-check/business-insight.ts'))
  check('D1. a2 is asked for a MIX of broad and specific phrases, by shape', /Return a MIX, never five of a kind/.test(prompt) && /AT MOST 2 may be a broad category phrase/.test(prompt) && /AT LEAST 3 must be specific/.test(prompt))
  // D1-i — the product never tells a merchant how hard a phrase is to win: it has
  // not measured that, and one page of their own site cannot show it.
  check('D1-i. and NOT about difficulty, which nothing here measured', !/(?:difficult|easier|easiest|rank for more easily|winnab)/i.test(prompt))
  check('D1-MUT. control: the guard fails without the rule', (() => {
    const mutant = prompt.replace(/Return a MIX, never five of a kind[^`]*/, '')
    return mutant !== prompt && !/Return a MIX, never five of a kind/.test(mutant)
  })())

  const steps = strip(read('../steps.ts'))
  check('D2. a4 takes its queries from searchQueries', /const queries = searchQueries\(insight\?\.keywords \?\? \[\]\)/.test(steps))
  check('D3. and the summary it finishes with carries the measurement', /withCounters\(\{ \.\.\.ctx\.summary, competitors, \.\.\.firstPageField\(answered, ctx\.summary\.domain\) \}\)/.test(steps))
  check('D3-i. only ANSWERED searches are reported', /const answered = results\.filter\(\(r\) => r\.ok\)/.test(steps))
  check('D2-MUT. control', (() => {
    const mutant = steps.replace(/const queries = searchQueries\(insight\?\.keywords \?\? \[\]\)/, 'const queries = (insight?.keywords ?? []).slice(0, MAX_SEARCHES)')
    return mutant !== steps && !/const queries = searchQueries\(/.test(mutant)
  })())

  const screen = strip(read('../../../components/onboarding/ResearchSummary.tsx'))
  check('D4. the chooser shows the measured line, and says nothing when there is none',
    /checkOf\(keyword\) !== 'unchecked' &&/.test(screen) && /t\.keywords\.checked\[/.test(screen))
  check('D4-MUT. control', (() => {
    const mutant = screen.replace(/checkOf\(keyword\) !== 'unchecked' &&/, 'true &&')
    return mutant !== screen && !/checkOf\(keyword\) !== 'unchecked'/.test(mutant)
  })())

  // D5 — every locale answers, or nine of them render English on the one screen
  // where the owner commits their plan's keyword quota.
  const locales = ['he', 'en', 'es'].map((l) => [l, read(`../../i18n/dashboard/${l}.ts`)] as const)
    .concat(['pt-BR', 'fr', 'it', 'ja', 'de', 'nl', 'pl', 'ko'].map((l) => [l, read(`../../i18n/dashboard/${l}/seed-onboarding.ts`)] as const))
  const missing = locales.filter(([, src]) => !/onFirstPage: /.test(src) || !/notOnFirstPage: /.test(src)).map(([l]) => l)
  check('D5. all eleven locales answer', missing.length === 0, missing.join(','))
}

function main() {
  sectionA()
  sectionB()
  sectionC()
  sectionD()
  console.log(`\n${pass} passed, ${fail} failed`)
  if (fail > 0) process.exit(1)
}
main()

export {}
