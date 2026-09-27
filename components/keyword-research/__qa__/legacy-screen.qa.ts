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
 *  L2) the scan hook is still 'loading', or the project list is (the first answer
 *      not in yet): the research screen's skeleton, never today's form. L2 used to
 *      require today's screen here, and that WAS the flash the owner reported: a
 *      project with research showed the open form, in the older look, until its
 *      research replaced it (a Playwright trace of the real build showed it for as
 *      long as the reads took). A merchant with no scan now sees the skeleton,
 *      then today's screen, exactly as L1 holds it;
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
      let html: string
      try {
        html = HARNESS.renderPage(locale, { state, scan, tag, source })
      } catch (err) {
        // A page that cannot render a state does not match it.
        bad.push(`${locale}/${name} (threw ${err instanceof Error ? err.name : typeof err})`)
        continue
      }
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
  // L2: before the first answer, the skeleton in every state, and nothing of today's form.
  const skeletonOnly = (html: string) =>
    html.includes('data-scan-state="loading"') && html.includes('aria-busy="true"') &&
    !html.includes('name="researchType"') && !html.includes('<form') && !html.includes('<table')
  const whilePending = (scan: unknown, resolved: boolean, source?: string, tag = 'current') => {
    const was = HARNESS.H.active
    HARNESS.H.active = { ...was, isResolved: resolved }
    try {
      const bad: string[] = []
      for (const locale of LOCALES) {
        for (const [name, state] of Object.entries(HARNESS.LEGACY_SCENARIOS)) {
          if (!skeletonOnly(HARNESS.renderPage(locale, { state, scan, tag, source }))) bad.push(`${locale}/${name}`)
        }
      }
      return bad
    } finally {
      HARNESS.H.active = was
    }
  }
  const loading = whilePending(LOADING, true)
  check('L2: the scan still loading: the research screen\'s skeleton in every state, never today\'s form (the flash)', loading.length === 0, loading.join(', '))
  const listPending = whilePending(NONE, false)
  check('L2b: the project list still loading: the same skeleton, not today\'s form', listPending.length === 0, listPending.join(', '))

  // L3: every state the scenarios seed is a real state of the page.
  const { names } = HARNESS.loadPage('current')
  const seeded = new Set(Object.values(HARNESS.LEGACY_SCENARIOS).flatMap((s) => Object.keys(s)))
  const lost = [...seeded].filter((n) => !names.includes(n))
  check('L3: every state a scenario seeds is still a useState of the page', lost.length === 0, lost.join(', '))

  console.log('\nMUT) broken copies of the page fail the checks')
  const page = readFileSync(HARNESS.PAGE_PATH, 'utf8')
  // A control whose anchor is gone (the page changed) fails, loudly, instead of passing or crashing.
  const mutate = (from: string, to: string): string | null => (page.includes(from) ? page.replace(from, to) : null)
  const broken = (tag: string, source: string | null) => (source === null ? null : mismatches(NONE, tag, source))
  const header = broken('mut-header', mutate('<div className={`mb-8 ${isRTL ? \'text-right\' : \'text-left\'}`}>', '<div className={`mb-6 ${isRTL ? \'text-right\' : \'text-left\'}`}>'))
  check('L1-MUT: a page whose header spacing changed fails L1', !!header && header.length > 0, header ? undefined : 'anchor missing')
  const extra = broken('mut-extra', mutate('{/* Form */}', '<p>new</p>'))
  check('L1-MUT2: a page that shows one more element with no scan fails L1', !!extra && extra.length > 0, extra ? undefined : 'anchor missing')
  const column = broken('mut-column', mutate('{t.results.lowCpc}', '{null}'))
  check('L1-MUT3: a table that lost a column fails L1 (a results state only)', !!column && column.some((m) => !m.includes('/initial')), column ? undefined : 'anchor missing')
  const flash = mutate('const firstAnswerPending = !projectsResolved || scanView.kind === \'loading\'', 'const firstAnswerPending = false')
  check('L2-MUT: a page that shows today\'s form while the scan loads (the flash) fails L2',
    !!flash && whilePending(LOADING, true, flash, 'mut-flash').length > 0, flash ? undefined : 'anchor missing')
  const listFlash = mutate('const firstAnswerPending = !projectsResolved || scanView.kind === \'loading\'', 'const firstAnswerPending = scanView.kind === \'loading\'')
  check('L2b-MUT: a page that shows today\'s form while the project list loads fails L2b',
    !!listFlash && whilePending(NONE, false, listFlash, 'mut-list-flash').length > 0, listFlash ? undefined : 'anchor missing')
  check('L3-MUT: a state renamed in the page is caught by L3',
    !HARNESS.seedableSource(page.replace(/const \[opportunitiesOpen, setOpportunitiesOpen\]/, 'const [panelOpen, setOpportunitiesOpen]')).names.includes('opportunitiesOpen'))

  console.log(`\n${pass} passed, ${fail} failed`)
  if (fail > 0) process.exit(1)
}
main()

export {}
