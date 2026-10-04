/**
 * NO SCAN — keyword research for a project without a seeding scan.
 *
 * Part B of the UX review: every project, old or new, opens on the same research
 * screen. A project with no scan (the flag off, or it predates the scan) used to
 * open on the older form; it now opens on the research screen's empty start (U1),
 * or on its own research when it has some (U4). The older form is one click away
 * (U2) and a research run from the start takes the screen like any other (U3).
 *
 * The form itself is still asserted byte for byte against a golden capture
 * (fixtures/legacy-screen.json) where it is still the screen: with no project in
 * view (the hook's 'none'). That capture was taken again when the screen's header
 * became the shared one (components/layout/Header, the design tokens); everything
 * under it is the page as it was at f44468d, restyled in wave 7 (rows that enter
 * once, a hover start bar, a volume bar under each figure: the same elements and
 * text once classes, styles and that decorative bar are set aside). It was taken
 * again on 4 October 2026 when Spanish and Portuguese joined the research
 * languages and their markets joined the countries: seven new <option> elements,
 * the same +241 (he) / +247 (en) characters in every one of the eighteen states,
 * which is what said the re-capture hid nothing else. It is the REAL page's first render,
 * in both languages, in nine states (empty, results, rows selected with the
 * opportunities panel open, a keyword added, add and AI errors, a search error,
 * the keyword+URL form while searching, few results, filtered and sorted). Each
 * state is reached by seeding the page's own useState values by name
 * (_page-harness.ts), so the same state renders on both versions.
 *
 *  L1) the scan hook says 'none' (no project in view): every state is byte for
 *      byte the golden capture;
 *  L2) the scan hook is still 'loading', or the project list is (the first answer
 *      not in yet): the research screen's skeleton, never today's form. L2 used to
 *      require today's screen here, and that WAS the flash the owner reported: a
 *      project with research showed the open form, in the older look, until its
 *      research replaced it (a Playwright trace of the real build showed it for as
 *      long as the reads took). A merchant with no scan now sees the skeleton,
 *      then today's screen, exactly as L1 holds it;
 *  L3) the harness reaches every state it claims (a state name the page lost
 *      would silently render the default);
 *  U1) no scan and no research ('unseeded'): the empty start (one keyword field),
 *      the older form folded away, no second "new research" bar; the header is
 *      the shared one, in the tokens (no raw slate); no Search Console source
 *      (there is no research for Google's keywords to join);
 *  U2) the start's "search by web address" opens the older form, whole;
 *  U3) a research run from the start takes the screen: the overview of it, the
 *      table, the form folded, the start gone;
 *  U4) no scan, but research of the project's own: the same overview, and its
 *      source said as it is (a manual research, and its date), not "from a scan".
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
const UNSEEDED = { view: { kind: 'unseeded', seedKeywords: [], domain: null, tracked: [] }, reloadTracked() {}, retry() {} }
const OWN_RESEARCH = {
  view: {
    kind: 'seeded', running: false, steps: [], seedKeywords: [], domain: null, tracked: [],
    research: {
      market: { country: 'IL', language: 'he' }, fetchedAt: '2026-08-18T09:00:00Z', truncated: false, tracked: [],
      sources: { scan: false, manualAt: '2026-08-18T09:00:00Z' },
      keywords: [
        { keyword: 'רופא שיניים בחיפה', avgMonthlySearches: 880, competition: 'MEDIUM', competitionIndex: 50, lowTopOfPageBid: 2, highTopOfPageBid: 9, currency: 'ILS', origins: ['manual'], competitors: [], relevant: true },
        { keyword: 'השתלות שיניים חיפה', avgMonthlySearches: 390, competition: 'HIGH', competitionIndex: 80, lowTopOfPageBid: 6, highTopOfPageBid: 21, currency: 'ILS', origins: ['manual'], competitors: [], relevant: true },
      ],
    },
  },
  reloadTracked() {}, retry() {},
}

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

  console.log('\nU) no scan: the research screen, never the older form as the screen')
  // The older form's wrapper, folded (hidden) or open, and the screen's other parts, read from the markup.
  const formFolded = (html: string) => /<div hidden=""[^>]*><form/.test(html)
  const formShown = (html: string) => /<div class="[^"]*"><form/.test(html) && !formFolded(html)
  const startShown = (html: string) => html.includes('data-research-start=""')
  const unseeded = (source?: string, tag = 'current') => {
    const bad: string[] = []
    for (const locale of LOCALES) {
      const initial = HARNESS.renderPage(locale, { state: {}, scan: UNSEEDED, tag, source })
      const head = initial.slice(0, initial.indexOf('data-research-start'))
      if (!startShown(initial) || !formFolded(initial) || initial.includes('data-research-form="collapsed"') || !initial.includes('text-title') || /slate-|text-3xl/.test(head)) bad.push(`${locale}/initial`)
      if (initial.includes('data-gsc-widget') || initial.includes('data-chip="google"')) bad.push(`${locale}/search-console`)
      const loading = HARNESS.renderPage(locale, { state: { keyword: 'נעלי ריצה', loading: true }, scan: UNSEEDED, tag, source })
      if (!startShown(loading) || !formFolded(loading)) bad.push(`${locale}/searching`)
      const failed = HARNESS.renderPage(locale, { state: { error: 'SEARCH FAILED' }, scan: UNSEEDED, tag, source })
      if (!startShown(failed) || !formFolded(failed) || !failed.includes('SEARCH FAILED')) bad.push(`${locale}/error`)
    }
    return bad
  }
  const u1 = unseeded()
  check('U1: no scan and no research: the empty start, the older form folded away (also while searching and after an error), one way in, the shared header, no Search Console source', u1.length === 0, u1.join(', '))
  const opened = LOCALES.filter((locale) => {
    const html = HARNESS.renderPage(locale, { state: { formChoice: true }, scan: UNSEEDED })
    return !(formShown(html) && !startShown(html) && html.includes('data-research-form="open"') && html.includes('name="researchType"'))
  })
  check('U2: asked for, the older form opens whole, with the way to fold it again, and the start steps aside', opened.length === 0, opened.join(', '))
  const ran = LOCALES.filter((locale) => {
    const html = HARNESS.renderPage(locale, { state: { results: HARNESS.LEGACY_RESULTS }, scan: UNSEEDED })
    return !(html.includes('data-scan-overview="manual"') && html.includes('id="research-table"') && formFolded(html) && !startShown(html) && html.includes('data-research-form="collapsed"'))
  })
  check('U3: a research run from the start takes the screen: its overview, the table, the form folded behind "new research", the start gone', ran.length === 0, ran.join(', '))
  const own = (source?: string, tag = 'current') => LOCALES.filter((locale) => {
    const html = HARNESS.renderPage(locale, { state: {}, scan: OWN_RESEARCH, tag, source })
    const line = locale === 'he' ? 'מקור: מחקר ידני מ-' : 'Source: manual research from '
    return !(html.includes('data-scan-overview="scan"') && html.includes(line) && formFolded(html) && !startShown(html) && !html.includes(locale === 'he' ? 'מסריקה של' : 'from a scan')
      && html.includes('data-gsc-widget="keyword-research"'))
  })
  const u4 = own()
  check('U4: no scan, but research of the project\'s own: the same overview, its source said as it is (a manual research and its date), never "from a scan", with its Search Console source', u4.length === 0, u4.join(', '))

  console.log('\nMUT) broken copies of the page fail the checks')
  const page = readFileSync(HARNESS.PAGE_PATH, 'utf8')
  // A control whose anchor is gone (the page changed) fails, loudly, instead of passing or crashing.
  const mutate = (from: string, to: string): string | null => (page.includes(from) ? page.replace(from, to) : null)
  const broken = (tag: string, source: string | null) => (source === null ? null : mismatches(NONE, tag, source))
  const header = broken('mut-header', mutate('const header = <Header title={t.title} subtitle={t.subtitle}>{siteChip}</Header>', 'const header = <Header title={t.title}>{siteChip}</Header>'))
  check('L1-MUT: a page whose header lost its line fails L1', !!header && header.length > 0, header ? undefined : 'anchor missing')
  const extra = broken('mut-extra', mutate('{/* Form */}', '<p>new</p>'))
  check('L1-MUT2: a page that shows one more element with no scan fails L1', !!extra && extra.length > 0, extra ? undefined : 'anchor missing')
  // The table's headers are one list since the P1-4 rewrite; dropping an entry drops a column.
  const column = broken('mut-column', mutate("['lowCpc', t.results.lowCpc, 'hidden lg:table-cell'],", ''))
  check('L1-MUT3: a table that lost a column fails L1 (a results state only)', !!column && column.some((m) => !m.includes('/initial')), column ? undefined : 'anchor missing')
  const flash = mutate('const firstAnswerPending = !projectsResolved || scanView.kind === \'loading\'', 'const firstAnswerPending = false')
  check('L2-MUT: a page that shows today\'s form while the scan loads (the flash) fails L2',
    !!flash && whilePending(LOADING, true, flash, 'mut-flash').length > 0, flash ? undefined : 'anchor missing')
  const listFlash = mutate('const firstAnswerPending = !projectsResolved || scanView.kind === \'loading\'', 'const firstAnswerPending = scanView.kind === \'loading\'')
  check('L2b-MUT: a page that shows today\'s form while the project list loads fails L2b',
    !!listFlash && whilePending(NONE, false, listFlash, 'mut-list-flash').length > 0, listFlash ? undefined : 'anchor missing')
  const legacyForm = mutate('(unseeded ? false : (!(model.mode', '(false ? false : (!(model.mode')
  check('U1-MUT: a page that opens the older form for a project with no scan (the old fallback) fails U1',
    !!legacyForm && unseeded(legacyForm, 'mut-legacy-form').length > 0, legacyForm ? undefined : 'anchor missing')
  const noStart = mutate('{researchStartShown && (', '{false && (')
  check('U1-MUT2: a page without the empty start fails U1', !!noStart && unseeded(noStart, 'mut-no-start').length > 0, noStart ? undefined : 'anchor missing')
  const oldHeader = mutate('const header = <Header title={t.title} subtitle={t.subtitle}>{siteChip}</Header>', 'const header = (<div className="mb-8"><h1 className="text-3xl font-bold mb-2 dark:text-slate-100">{t.title}</h1><p className="text-slate-600">{t.subtitle}</p></div>)')
  check('U1-MUT3: the older header (raw slate, text-3xl) fails U1', !!oldHeader && unseeded(oldHeader, 'mut-old-header').length > 0, oldHeader ? undefined : 'anchor missing')
  const gscOnStart = mutate('const gscSource = scanMode && !unseeded', 'const gscSource = scanMode')
  check('U1-MUT4: a page that shows the Search Console source on the empty start fails U1',
    !!gscOnStart && unseeded(gscOnStart, 'mut-gsc-start').length > 0, gscOnStart ? undefined : 'anchor missing')
  const gscNowhere = mutate('const gscSource = scanMode && !unseeded', 'const gscSource = false')
  check('U4-MUT2: a page that drops the Search Console source from research of the project\'s own fails U4',
    !!gscNowhere && own(gscNowhere, 'mut-gsc-nowhere').length > 0, gscNowhere ? undefined : 'anchor missing')
  const scanLine = mutate('          sourceOverride={sourceOverride}\n', '')
  check('U4-MUT: an overview that says "from a scan" of research the project ran by hand fails U4',
    !!scanLine && own(scanLine, 'mut-scan-line').length > 0, scanLine ? undefined : 'anchor missing')
  check('L3-MUT: a state renamed in the page is caught by L3',
    !HARNESS.seedableSource(page.replace(/const \[opportunitiesOpen, setOpportunitiesOpen\]/, 'const [panelOpen, setOpportunitiesOpen]')).names.includes('opportunitiesOpen'))

  console.log(`\n${pass} passed, ${fail} failed`)
  if (fail > 0) process.exit(1)
}
main()

export {}
