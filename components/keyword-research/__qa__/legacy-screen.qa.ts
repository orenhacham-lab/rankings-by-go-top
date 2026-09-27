/**
 * NO SCAN, TODAY'S SCREEN — keyword research without a seeding scan looks exactly
 * as it did before the scan fed it.
 *
 * Most merchants have no scan: the flag is off, or the project predates it. For
 * them the tab must not change at all, and that is asserted here against a golden
 * capture of the page as it was before (fixtures/legacy-screen.json, captured from
 * app/(dashboard)/keyword-research/page.tsx at f44468d): the REAL page's first
 * render, in both languages, in nine states of today's screen (empty, results,
 * rows selected with the opportunities panel open, a keyword added, add and AI
 * errors, a search error, the keyword+URL form while searching, few results,
 * filtered and sorted). Each state is reached by seeding the page's own useState
 * values by name (_page-harness.ts), so the same state renders on both versions.
 *
 *  L1) the scan hook says 'none' (no scan, flag off, a read that failed): every
 *      state is byte for byte the golden capture;
 *  L2) the scan hook is still 'loading' (its first answer not in yet): the same,
 *      so a merchant with no scan never sees anything else, not even a flash;
 *  L3) the harness reaches every state it claims (a state name the page lost
 *      would silently render the default).
 *
 * Mutation controls load a deliberately broken copy of the page in memory and show
 * the check fails; scripts that mutate the real file run separately (see the PR).
 *
 * Run:      npx tsx components/keyword-research/__qa__/legacy-screen.qa.ts
 * Capture:  npx tsx components/keyword-research/__qa__/legacy-screen.qa.ts --capture <page source> <label>
 */
/* eslint-disable @typescript-eslint/no-require-imports */
const { readFileSync, writeFileSync } = require('fs') as typeof import('fs')
const { join } = require('path') as typeof import('path')
const { createHash } = require('crypto') as typeof import('crypto')
const HARNESS = require('./_page-harness') as typeof import('./_page-harness')

let pass = 0, fail = 0
function check(name: string, cond: boolean, detail?: string) {
  if (cond) { pass++; console.log(`  ✓ ${name}`) } else { fail++; console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`) }
}

const FIXTURE = join(__dirname, 'fixtures', 'legacy-screen.json')
const LOCALES: HARNESS_Locale[] = ['he', 'en']
type HARNESS_Locale = 'he' | 'en'
const sha = (s: string) => createHash('sha256').update(s).digest('hex')
const NONE = { view: { kind: 'none' }, reloadTracked() {}, retry() {} }
const LOADING = { view: { kind: 'loading' }, reloadTracked() {}, retry() {} }

type Golden = { capturedFrom: string; scenarios: Record<string, { sha256: string; length: number }> }

function capture(sourcePath: string, label: string) {
  const source = readFileSync(sourcePath, 'utf8')
  const golden: Golden = { capturedFrom: label, scenarios: {} }
  for (const locale of LOCALES) {
    for (const [name, state] of Object.entries(HARNESS.LEGACY_SCENARIOS)) {
      const html = HARNESS.renderPage(locale, { state, scan: NONE, tag: 'capture', source })
      golden.scenarios[`${locale}/${name}`] = { sha256: sha(html), length: html.length }
    }
  }
  writeFileSync(FIXTURE, `${JSON.stringify(golden, null, 2)}\n`)
  console.log(`captured ${Object.keys(golden.scenarios).length} states from ${label}`)
}

/** Every state of today's screen, rendered by the page built from `source` (default: the page now). */
function mismatches(scan: unknown, tag: string, source?: string): string[] {
  const golden = JSON.parse(readFileSync(FIXTURE, 'utf8')) as Golden
  const bad: string[] = []
  for (const locale of LOCALES) {
    for (const [name, state] of Object.entries(HARNESS.LEGACY_SCENARIOS)) {
      const html = HARNESS.renderPage(locale, { state, scan, tag, source })
      const want = golden.scenarios[`${locale}/${name}`]
      if (!want || want.sha256 !== sha(html)) {
        bad.push(`${locale}/${name} (${html.length} chars, golden ${want?.length ?? 'missing'})`)
        if (process.env.QA_DUMP_DIR) writeFileSync(join(process.env.QA_DUMP_DIR, `legacy-${tag}-${locale}-${name}.html`), html)
      }
    }
  }
  return bad
}

function main() {
  const at = process.argv.indexOf('--capture')
  if (at >= 0) {
    capture(process.argv[at + 1], process.argv[at + 2] ?? process.argv[at + 1])
    return
  }
  const golden = JSON.parse(readFileSync(FIXTURE, 'utf8')) as Golden
  console.log(`Keyword research without a scan is today's screen (golden: ${golden.capturedFrom})\n`)

  console.log('L) every state of today\'s screen, byte for byte')
  const none = mismatches(NONE, 'current')
  check(`L1: no scan — all ${LOCALES.length * Object.keys(HARNESS.LEGACY_SCENARIOS).length} states match the golden capture`, none.length === 0, none.join(', '))
  const loading = mismatches(LOADING, 'current')
  check('L2: the scan still loading — the same states, the same markup (no flash of anything new)', loading.length === 0, loading.join(', '))

  // L3: every state the scenarios seed is a real state of the page.
  const { names } = HARNESS.loadPage('current')
  const seeded = new Set(Object.values(HARNESS.LEGACY_SCENARIOS).flatMap((s) => Object.keys(s)))
  const lost = [...seeded].filter((n) => !names.includes(n))
  check('L3: every state a scenario seeds is still a useState of the page', lost.length === 0, lost.join(', '))

  console.log('\nMUT) broken copies of the page fail the checks')
  const page = readFileSync(HARNESS.PAGE_PATH, 'utf8')
  const mutate = (from: string, to: string) => {
    if (!page.includes(from)) throw new Error(`mutation anchor missing: ${from}`)
    return page.replace(from, to)
  }
  check('L1-MUT: a page whose header spacing changed fails L1',
    mismatches(NONE, 'mut-header', mutate('<div className={`mb-8 ${isRTL ? \'text-right\' : \'text-left\'}`}>', '<div className={`mb-6 ${isRTL ? \'text-right\' : \'text-left\'}`}>')).length > 0)
  check('L1-MUT2: a page that shows one more element with no scan fails L1',
    mismatches(NONE, 'mut-extra', mutate('{/* Form */}', '<p>new</p>')).length > 0)
  check('L1-MUT3: a table that lost a column fails L1 (a results state only)',
    mismatches(NONE, 'mut-column', mutate('{t.results.lowCpc}', '{null}')).some((m) => !m.includes('/initial')))
  check('L3-MUT: a state renamed in the page is caught by L3',
    !HARNESS.seedableSource(page.replace(/const \[opportunitiesOpen, setOpportunitiesOpen\]/, 'const [panelOpen, setOpportunitiesOpen]')).names.includes('opportunitiesOpen'))

  console.log(`\n${pass} passed, ${fail} failed`)
  if (fail > 0) process.exit(1)
}
main()

export {}
