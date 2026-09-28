/**
 * The AI-visibility tab (W6d, plan section 5): the overview rows around the
 * existing tool, for every project: one without a seeding scan gets the same
 * rows from its own checks, and a placeholder offering the mapping where only
 * the scan can know (part B of the UX review, 27.09).
 *
 *   A) the seed GET, answered by the REAL handler (lib/seed-scan/http.ts) over a
 *      FakeAdmin, read into the page's state: seeded, questions still coming,
 *      failed, a locked store, and every way to have no scan
 *   B) row 5, AI readiness: measured, locked (never a failure), pending, missing
 *   C) rows 1, 2 and 4 from the tool's own runs: the tool's score, the change
 *      since the previous check, the engines, the last check, recent activity
 *   D) the rows rendered, in Hebrew and English
 *   E) source guards: every project gets the overview; the tool's additions are off by
 *      default; opening the tab spends nothing; competitors are managed in
 *      settings; no raw error text; the copy's place in the dictionaries
 *
 * Run: npx tsx components/ai-visibility/__qa__/ai-visibility-overview.qa.ts
 */
/* eslint-disable @typescript-eslint/no-require-imports, @typescript-eslint/no-explicit-any */

let pass = 0, fail = 0
function check(name: string, cond: boolean, detail?: string) {
  if (cond) { pass++; console.log(`  ✓ ${name}`) } else { fail++; console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`) }
}

// next/navigation needs a request outside of Next; nothing else is replaced.
const Module: any = require('module')
const origLoad = Module._load
Module._load = function (request: string, parent: any, isMain: boolean) {
  const real = origLoad.call(this, request, parent, isMain)
  if (request !== 'next/navigation') return real
  return new Proxy(real, {
    get: (t, k) => (k === 'usePathname' ? () => '/ai-visibility'
      : k === 'useSearchParams' ? () => new URLSearchParams()
      : k === 'useRouter' ? () => ({ push() {}, replace() {}, refresh() {}, back() {}, prefetch() {} })
      : (t as any)[k]),
  })
}

const { readFileSync } = require('fs') as typeof import('fs')
const { join } = require('path') as typeof import('path')
const { createElement } = require('react') as typeof import('react')
const { renderToStaticMarkup } = require('react-dom/server') as typeof import('react-dom/server')
const { FakeAdmin } = require('../../../lib/__qa__/_fake-admin')
const { handleSeedGet } = require('../../../lib/seed-scan/http') as typeof import('../../../lib/seed-scan/http')
const { DashboardLanguageProvider } = require('../../../lib/i18n/dashboard/useDashboardLanguage')
const { getDashboardDictionary } = require('../../../lib/i18n/dashboard/getDashboardDictionary')
const M = require('../overview-model') as typeof import('../overview-model')
const { OverviewOpeningCard, OverviewStatusBar, RecentActivity, formatWhen } = require('../OverviewRows') as typeof import('../OverviewRows')
const ReadinessCard = (require('../ReadinessCard') as typeof import('../ReadinessCard')).default

type Row = Record<string, unknown>
type Locale = 'he' | 'en'

const ROOT = join(__dirname, '..', '..', '..')
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8')
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1').replace(/\{\s*\}/g, '{}')
const code = (p: string) => strip(read(p))

const USER = '11111111-1111-4111-8111-111111111111'
const OTHER_USER = '22222222-2222-4222-8222-222222222222'
const PROJECT = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const NOW = new Date('2026-09-27T10:00:00.000Z')
const ago = (min: number) => new Date(NOW.getTime() - min * 60_000).toISOString()

// ── Fixtures: a seed run as the pipeline stores it ─────────────────────────
function geoMeasured(ok: Record<string, boolean>) {
  const signals = ['schema', 'faq', 'robots', 'llms'].map((id) => ({ id, ok: ok[id] ?? false, title: `t-${id}`, detail: `d-${id}` }))
  return { state: 'measured', unavailableReason: null, passed: signals.filter((s) => s.ok).length, total: 4, signals }
}
function summary(over: Row = {}): Row {
  return {
    version: 1, source: 'scan', domain: 'shop.test', url: 'https://shop.test/', scannedAt: ago(30), locale: 'he',
    storefrontLocked: false, business: null, audiences: [], seedKeywords: ['running shoes'], topics: [], findings: [],
    findingsOmitted: 0, geo: geoMeasured({ schema: true, faq: false, robots: true, llms: true }),
    competitors: [
      { domain: 'rival.test', validated: true, seenIn: 2, source: 'search' },
      { domain: 'guess.test', validated: false, seenIn: 0, source: 'model' },
    ],
    sitemapUrlCount: 12, sitemapTruncated: false, ...over,
  }
}
function run(over: Row = {}): Row {
  return {
    id: 'run-1', project_id: PROJECT, user_id: USER, trigger: 'create', stage: 'b', status: 'done',
    summary: summary(), error_code: null, lease_expires_at: null, started_at: ago(40), finished_at: ago(20), created_at: ago(40), ...over,
  }
}
function step(stepId: string, status: string, over: Row = {}): Row {
  return { run_id: 'run-1', project_id: PROJECT, user_id: USER, step: stepId, status, item_count: null, detail: {}, error_code: null, started_at: ago(35), finished_at: status === 'done' ? ago(25) : null, ...over }
}
const stepsA = () => ['a1', 'a2', 'a3', 'a4'].map((s) => step(s, 'done'))
const stepsB = (b5: string, b5Count: number | null = null) =>
  ['b1', 'b2', 'b3', 'b4'].map((s) => step(s, 'done')).concat([step('b5', b5, { item_count: b5Count }), step('b6', b5 === 'done' ? 'done' : 'pending')])

async function seedGet(o: { runs?: Row[]; steps?: Row[]; flag?: boolean; userId?: string | null; ownerId?: string } = {}) {
  const tables: Record<string, Row[]> = {
    projects: [{ id: PROJECT, user_id: o.ownerId ?? USER, target_domain: 'shop.test', name: 'Shop' }],
    project_seed_runs: o.runs ?? [],
    project_seed_steps: o.steps ?? [],
  }
  const fake = new FakeAdmin(tables)
  const deps = {
    session: async () => ({ userId: o.userId === undefined ? USER : o.userId, db: fake }),
    admin: () => fake,
    isAdmin: async () => false,
    now: () => NOW,
    env: o.flag === false ? {} : { ENABLE_SEED_SCAN: 'true' },
  } as unknown as import('../../../lib/seed-scan/http').SeedRouteDeps
  const res = await handleSeedGet(PROJECT, deps)
  const body = await res.json().catch(() => null)
  return { status: res.status, body, state: M.readSeedState(res.status, body) }
}

// ── The runs as GET /api/ai-visibility/runs returns them ───────────────────
function aiRun(id: string, completedMinAgo: number, results: Row[], status = 'completed'): Row {
  return { id, createdAt: ago(completedMinAgo + 1), startedAt: ago(completedMinAgo + 1), completedAt: status === 'running' ? null : ago(completedMinAgo), status, results }
}
function res(engine: string, mentioned: boolean, cited = false, over: Row = {}): Row {
  return { id: `r-${Math.random()}`, engine, promptId: 'p1', promptText: 'best running shoes in tel aviv?', status: 'success', mentioned, targetCited: cited, displayMentioned: mentioned, displayCited: cited, excludedFromScore: false, ...over }
}

async function main() {
  console.log('AI visibility tab — the overview around the tool (W6d)')

  // ── A) the seed GET → the page's state ───────────────────────────────────
  console.log('\nA) the real seed GET, read into the page state')
  {
    const off = await seedGet({ flag: false, runs: [run()], steps: [...stepsA(), ...stepsB('done', 8)] })
    check('the scan\'s flag off answers 404, and the page keeps today\'s tool (none)', off.status === 404 && off.state.kind === 'none', `${off.status} ${off.state.kind}`)
    const empty = await seedGet()
    check('a project without a seed run (an older project) is none', empty.status === 200 && empty.state.kind === 'none', `${empty.status} ${empty.state.kind}`)
    const theirs = await seedGet({ ownerId: OTHER_USER, runs: [run({ user_id: OTHER_USER })] })
    check('another owner\'s project is refused (404) and shows nothing of theirs', theirs.status === 404 && theirs.state.kind === 'none', `${theirs.status}`)
    const anon = await seedGet({ userId: null, runs: [run()] })
    check('signed out is refused (401) and shows nothing', anon.status === 401 && anon.state.kind === 'none')
    check('an unreadable answer is none, never a half-built overview',
      M.readSeedState(200, null).kind === 'none' && M.readSeedState(500, { ok: true, run: {} }).kind === 'none' && M.readSeedState(200, { ok: false, code: 'internal' }).kind === 'none')

    const seeded = await seedGet({ runs: [run()], steps: [...stepsA(), ...stepsB('done', 8)] })
    const s = seeded.state
    check('a finished run is seeded, with the questions b5 suggested', s.kind === 'seeded' && s.questionsSuggested === 8, JSON.stringify(s).slice(0, 200))
    check('…with only the competitors the scan validated', s.kind === 'seeded' && JSON.stringify(s.scanCompetitors) === '["rival.test"]', s.kind === 'seeded' ? JSON.stringify(s.scanCompetitors) : '')
    check('…and it needs no more reads', !M.shouldPollSeed(s))

    const pendingB = await seedGet({ runs: [run({ status: 'running', lease_expires_at: ago(-5), finished_at: null })], steps: [...stepsA(), ...stepsB('running')] })
    check('stage B running before b5 settled: the questions are coming, and the page reads again',
      pendingB.state.kind === 'questions_pending' && M.shouldPollSeed(pendingB.state), pendingB.state.kind)
    const pendingA = await seedGet({ runs: [run({ stage: 'a', status: 'running', lease_expires_at: ago(-5), finished_at: null, summary: summary({ geo: { state: 'pending' } }) })], steps: stepsA().map((r, i) => (i > 1 ? { ...r, status: 'pending' } : r)) })
    check('stage A still running is questions_pending too', pendingA.state.kind === 'questions_pending', pendingA.state.kind)
    const b5Done = await seedGet({ runs: [run({ status: 'running', lease_expires_at: ago(-5), finished_at: null })], steps: [...stepsA(), ...stepsB('done', 6).map((r) => (r.step === 'b6' ? { ...r, status: 'running' } : r))] })
    check('stage B still running but b5 done: seeded, with its 6 questions, and no more reads', b5Done.state.kind === 'seeded' && (b5Done.state as any).questionsSuggested === 6 && !M.shouldPollSeed(b5Done.state), b5Done.state.kind)
    const b5Failed = await seedGet({ runs: [run({ status: 'partial' })], steps: [...stepsA(), ...stepsB('failed')] })
    check('b5 failed in a partial run: seeded, no count of questions', b5Failed.state.kind === 'seeded' && (b5Failed.state as any).questionsSuggested === null)

    const failed = await seedGet({ runs: [run({ stage: 'a', status: 'failed', summary: null, error_code: 'site_unreachable' })], steps: stepsA().map((r) => ({ ...r, status: 'failed', error_code: 'site_unreachable' })) })
    check('a failed run is failed, with no geo and nothing invented', failed.state.kind === 'failed' && (failed.state as any).geo === null)
  }

  // ── B) readiness (row 5) ─────────────────────────────────────────────────
  console.log('\nB) AI readiness: the four checks, and not-checked is never failed')
  {
    const st = (over: Row = {}) => M.readSeedState(200, { ok: true, run: { status: 'done', stage: 'b', steps: [], summary: summary(over) } })
    const measured = M.readinessView(st())!
    check('measured: four rows, in the scan\'s order, schema/faq/robots/llms',
      measured.state === 'measured' && measured.rows.map((r) => r.id).join(',') === 'schema,faq,robots,llms')
    check('…each pass or fail as measured, 3 of 4 passing',
      measured.rows.map((r) => r.status).join(',') === 'pass,fail,pass,pass' && measured.passed === 3 && measured.total === 4)
    check('the llms.txt check is shown (row 5 keeps it)', measured.rows.some((r) => r.id === 'llms'))

    const locked = M.readinessView(st({ storefrontLocked: true, geo: { state: 'unavailable', unavailableReason: 'storefront_locked', passed: 0, total: 0, signals: [] } }))!
    check('a locked store: state locked, every check not_checked, none failed',
      locked.state === 'locked' && locked.rows.every((r) => r.status === 'not_checked') && locked.rows.length === 4)
    const lockedWithSignals = M.readinessView(st({ storefrontLocked: true, geo: geoMeasured({}) }))!
    check('…even when failing signals were stored for the password page, nothing shows as failed',
      lockedWithSignals.state === 'locked' && !lockedWithSignals.rows.some((r) => r.status === 'fail'))
    const lockedByGeo = M.readinessView(st({ geo: { state: 'unavailable', unavailableReason: 'storefront_locked', signals: [] } }))!
    check('…and the geo reason alone is enough to say locked', lockedByGeo.state === 'locked')

    const pending = M.readinessView({ kind: 'questions_pending', geo: { state: 'pending', unavailableReason: null, passed: 0, total: 0, signals: [] }, scannedAt: null, storefrontLocked: false, scanCompetitors: [], questionsSuggested: null })!
    check('stage A before a3: pending, no failure', pending.state === 'pending' && pending.rows.every((r) => r.status === 'pending'))
    const missing = M.readinessView({ kind: 'failed', geo: null, scannedAt: null, storefrontLocked: false, scanCompetitors: [], questionsSuggested: null })!
    check('a failed scan: missing, every check not_checked, none failed', missing.state === 'missing' && missing.rows.every((r) => r.status === 'not_checked'))
    check('no readiness without a scan', M.readinessView({ kind: 'none' }) === null && M.readinessView({ kind: 'loading' }) === null)
  }

  // ── C) rows 1, 2 and 4 from the tool's runs ──────────────────────────────
  console.log('\nC) the checks: the tool\'s score, the change, the engines, recent activity')
  {
    const runs = M.readRuns([
      aiRun('newest', 5, [res('perplexity', true, true)]),
      aiRun('failed', 30, [res('grok', false, false, { status: 'error' })], 'failed'),
      aiRun('mid', 60, [res('chatgpt', true)]),
      aiRun('old', 120, [res('gemini', false), res('chatgpt', false, false, { excludedFromScore: true })]),
      aiRun('legacy', 200, [res('google_ai_overview', true)]),
    ])
    const o = M.buildOverview(runs)
    // The tool: every successful, non-archived answer counts (4); mentions only
    // from its engines: perplexity + chatgpt = 2; 2/4 = 50.
    check('the score is the tool\'s: supported mentions over every successful, non-archived answer',
      o.answers === 4 && o.mentions === 2 && o.citations === 1 && o.score === 50, JSON.stringify({ a: o.answers, m: o.mentions, c: o.citations, s: o.score }))
    // Before the newest counted check (perplexity): chatgpt 1 of 3 = 33 → +17.
    check('the change is against the score before the newest counted check (+17 points)', o.change?.points === 17, JSON.stringify(o.change))
    check('…named by the check before it (a failed check in between is skipped)', o.change?.since === ago(60), String(o.change?.since))
    check('engines checked: those with a successful answer, in the tool\'s order, legacy engines left out',
      o.enginesChecked.join(',') === 'chatgpt,perplexity,gemini', o.enginesChecked.join(','))
    check('the last check is the newest finished one', o.lastCheckAt === ago(5) && !o.running)
    check('recent activity: newest first, at most five', o.recent.length === 5 && o.recent[0].id === 'newest' && o.recent[4].id === 'legacy')
    check('…each with its outcome: cited, failed, mentioned, not mentioned',
      o.recent.slice(0, 4).map((r) => r.outcome).join(',') === 'cited,failed,mentioned,not_mentioned', o.recent.map((r) => r.outcome).join(','))
    check('…and its question and engine', o.recent[0].question === 'best running shoes in tel aviv?' && o.recent[0].engine === 'perplexity')
    check('the trend is the score after each counted check, oldest first, ending at the score (0, 0, 33, 50)',
      o.trend.map((p) => p.score).join(',') === '0,0,33,50' && o.trend[3].at === ago(5), o.trend.map((p) => p.score).join(','))
    const many = M.buildOverview(M.readRuns(Array.from({ length: 15 }, (_, i) => aiRun(`r${i}`, 100 - i, [res('chatgpt', i % 2 === 0)]))))
    check('…at most the last twelve checks', many.trend.length === M.TREND_POINTS && many.trend[11].score === many.score)

    const running = M.buildOverview(M.readRuns([aiRun('go', 0, [], 'running'), aiRun('done', 10, [res('chatgpt', false)])]))
    check('a dispatched check is running; the last check stays the finished one', running.running && running.lastCheckAt === ago(10) && running.recent[0].outcome === 'running')
    const one = M.buildOverview(M.readRuns([aiRun('only', 3, [res('chatgpt', true)])]))
    check('one check: a score, no change yet', one.score === 100 && one.change === null)
    const none = M.buildOverview([])
    check('no checks: no score, no change, empty activity', none.score === null && none.change === null && none.recent.length === 0 && none.lastCheckAt === null)
    const down = M.buildOverview(M.readRuns([aiRun('b', 1, [res('chatgpt', false)]), aiRun('a', 9, [res('gemini', true)])]))
    check('a drop is negative (100 → 50: −50)', down.change?.points === -50)
    check('malformed runs are dropped, not thrown on', M.readRuns([null, 3, { id: '' }, { id: 'x', results: 'no' }]).length === 1 && M.readRuns('x').length === 0)
    check('an older payload without display fields falls back to the raw flags',
      M.readRuns([{ id: 'x', status: 'completed', results: [{ engine: 'chatgpt', status: 'success', mentioned: true, targetCited: true }] }])[0].results[0].displayCited === true)
  }

  // ── D) rendered ──────────────────────────────────────────────────────────
  console.log('\nD) the rows, rendered in Hebrew and English')
  {
    const render = (locale: Locale, node: unknown) =>
      renderToStaticMarkup(createElement(DashboardLanguageProvider, { initialLocale: locale, children: node }) as never)
    const text = (html: string) => html.replace(/<[^>]+>/g, ' ').replace(/&#x27;/g, '\'').replace(/&[a-z#0-9]+;/gi, ' ').replace(/\s+/g, ' ')
    // The reviewer's store: a Shopify development store behind its password page.
    const lockedView = M.readinessView(M.readSeedState(200, { ok: true, run: { status: 'done', stage: 'b', steps: [],
      summary: summary({ storefrontLocked: true, geo: { state: 'unavailable', unavailableReason: 'storefront_locked', passed: 0, total: 0, signals: [] } }) } }))!
    const measuredView = M.readinessView(M.readSeedState(200, { ok: true, run: { status: 'done', stage: 'b', steps: [], summary: summary() } }))!
    const settings = M.settingsHref(PROJECT)
    for (const locale of ['he', 'en'] as Locale[]) {
      const c = getDashboardDictionary(locale).aiVisibilityOverview
      const locked = text(render(locale, createElement(ReadinessCard, { view: lockedView, scannedAt: ago(30), settingsHref: settings })))
      check(`${locale}: a locked store says "${c.readinessLockedTitle}"`, locked.includes(c.readinessLockedTitle))
      check(`${locale}: …and never "${c.statusFail}"`, !locked.includes(c.statusFail) && locked.split(c.statusNotChecked).length - 1 >= 4)
      const measured = render(locale, createElement(ReadinessCard, { view: measuredView, scannedAt: ago(30), settingsHref: settings }))
      const mt = text(measured)
      check(`${locale}: measured shows 3/4, every check's why and how, and links to settings`,
        mt.includes(c.readinessPassed(3, 4)) && (['schema', 'faq', 'robots', 'llms'] as const).every((id) => mt.includes(c.checks[id].why) && mt.includes(c.checks[id].fix))
        && measured.includes(`href="${settings.replace(/&/g, '&amp;')}"`) && !/<button\b/.test(measured))
      // tailwind-merge treats text-caption and text-ok as one group; a merged chip loses its size and renders huge.
      const chips = measured.match(/<span class="[^"]*rounded-pill[^"]*"/g) ?? []
      check(`${locale}: every readiness chip keeps its caption size next to its colour`,
        chips.length === 5 && chips.every((s) => s.includes('text-caption') && /text-(ok|warn|muted|info)\b/.test(s)), chips.join(' '))

      const ov = M.buildOverview(M.readRuns([aiRun('n', 5, [res('perplexity', true, true)]), aiRun('m', 60, [res('chatgpt', false)])]))
      const card = render(locale, createElement(OverviewOpeningCard, { overview: ov, questionsPending: false, questionsSuggested: 8, onChooseQuestions: () => {} }))
      check(`${locale}: the opening card asks "${c.heroTitle}" and shows the score 50, mentions, citations and +50 points`,
        text(card).includes(c.heroTitle) && /data-ai-opening="ready"/.test(card) && /text-\[3\.5rem\][^"]*">50<\/span>/.test(card) && text(card).includes(c.changePoints(50)) && card.includes('data-ai-change="up"')
        && /<span class="[^"]*\btext-section\b[^"]*\btext-emerald-300\b[^"]*">/.test(card))
      const targets = card.match(/<button type="button" class="h-full flex-1[^>]*>/g) ?? []
      check(`${locale}: …with the score trend drawn (0 → 50 on a 0-100 scale), one hover target per check naming its score`,
        card.includes('data-ai-trend="2"') && /<path d="M4\.00,92\.00 L96\.00,50\.00"/.test(card) && targets.length === 2
        && targets[1].includes(`aria-label="${c.trendPoint(50, formatWhen(ago(5), locale))}"`), targets.join(' '))
      const oneCheck = render(locale, createElement(OverviewOpeningCard, { overview: M.buildOverview(M.readRuns([aiRun('only', 3, [res('chatgpt', true)])])), questionsPending: false, questionsSuggested: null, onChooseQuestions: () => {} }))
      check(`${locale}: …and no trend from a single check`, !oneCheck.includes('data-ai-trend'))
      const empty = text(render(locale, createElement(OverviewOpeningCard, { overview: M.buildOverview([]), questionsPending: false, questionsSuggested: 8, onChooseQuestions: () => {} })))
      check(`${locale}: with no check yet it names the scan's 8 questions and offers to choose one`, empty.includes(c.emptyBodyQuestions(8)) && empty.includes(c.chooseQuestions))
      check(`${locale}: …and says what a check will measure instead of empty figures`,
        empty.includes(c.emptyWhatYouGet) && [c.scoreHelp, c.mentionsHelp, c.citationsHelp].every((h) => empty.includes(h)) && !empty.includes(c.ofAnswers(0)))
      const pendingCard = text(render(locale, createElement(OverviewOpeningCard, { overview: M.buildOverview([]), questionsPending: true, questionsSuggested: null, onChooseQuestions: () => {} })))
      check(`${locale}: while b5 runs it says the questions are being prepared`, pendingCard.includes(c.emptyBodyPending))
      const errCard = text(render(locale, createElement(OverviewOpeningCard, { overview: 'error', questionsPending: false, questionsSuggested: null, onChooseQuestions: () => {} })))
      check(`${locale}: a failed read of the checks is our own sentence`, errCard.includes(c.loadFailed))

      const bar = text(render(locale, createElement(OverviewStatusBar, { overview: ov, questionsPending: true })))
      check(`${locale}: the status bar names engines checked (2 of 6), the last check and the next one`,
        bar.includes(c.enginesCount(2, 6)) && bar.includes(c.lastCheck) && bar.includes(c.nextCheckManual) && bar.includes(c.questionsPendingNote))
      const act = text(render(locale, createElement(RecentActivity, { overview: ov })))
      check(`${locale}: recent activity shows each check's outcome`, act.includes(c.outcome.cited) && act.includes(c.outcome.not_mentioned))
    }
  }

  // ── E) source guards ─────────────────────────────────────────────────────
  console.log('\nE) source guards')
  {
    const PAGE = 'app/(dashboard)/ai-visibility/page.tsx'
    const SECTION = 'components/ai-visibility/AIVisibilitySection.tsx'
    const page = code(PAGE)
    const section = code(SECTION)

    // Part B of the UX review: EVERY project gets the new tab. No scan no longer means the
    // older tool on its own; the overview's props are passed whatever the scan says.
    check('every project gets the overview rows: the overview props are passed unconditionally, no early return of the bare tool',
      /const overviewProps = \{\s*overviewMode: true,/.test(page)
      && !/seed\.kind === 'none'\s*\?\s*\{\}/.test(page)
      && !/if \(seed\.kind === 'none'\) \{\s*return tool\s*\}/.test(page)
      && /const tool = <AIVisibilitySection \{\.\.\.toolProps\} projectKeywords=\{projectKeywords\} \{\.\.\.overviewProps\} \/>/.test(page)
      && page.split('<AIVisibilitySection').length === 2)
    check('…and without a scan, the readiness card gives way to the mapping placeholder, offered only when the mapping can be',
      /seed\.kind === 'none' && mapping\.mapping\.available === true/.test(page) && /<MappingPlaceholder control=\{mapping\}/.test(page)
      && /readiness && seed\.kind !== 'none' && <ReadinessCard/.test(page))
    const propsBlock = page.match(/const toolProps = \{([\s\S]*?)\n  \}/)?.[1] ?? ''
    const keys = propsBlock.split('\n').map((l) => l.trim().split(':')[0].replace(',', '')).filter(Boolean).sort().join(',')
    // projectKeywords is passed by name (the memoized array reviewer-hardening B11 pins), so it is not in toolProps.
    check('…and toolProps plus projectKeywords are exactly the props the tab passed before W6d', keys === 'initialTab,projectBrandAliases,projectBrandName,projectCity,projectCountry,projectDomain,projectDomainAliases,projectId,projectLanguage', keys)
    check('the overview additions of the tool are off unless passed',
      /overviewMode = false,/.test(section) && /openQueriesWhenEmpty = false,/.test(section) && /suggestionsRefreshKey = 0,/.test(section)
      && /\{competitorsSlot \?\? \(\s*<CompetitorsPanel/.test(section)
      && /globalMetrics && !overviewMode && \(\s*<AIVisibilityScoreCard/.test(section) && /\{!overviewMode && \(\s*<div className="flex items-center justify-between gap-4">/.test(section))
    check('the tool keeps loading results for the project alone (the callback rides a ref)',
      /onRunsLoadedRef\.current\?\.\(/.test(section) && /\}, \[projectId\]\)\s*useEffect\(\(\) => \{\s*let cancelled = false\s*fetch\(`\/api\/projects\/\$\{projectId\}\/ai-profile`\)/.test(section))
    check('the tool\'s engines and the overview\'s are the same list',
      section.includes(`const SUPPORTED_ENGINES = ${JSON.stringify(M.OVERVIEW_ENGINES).replace(/"/g, '\'').replace(/,/g, ', ')} as const`))

    // Opening the tab spends nothing: the new code only reads.
    const NEW = [PAGE, 'components/ai-visibility/OverviewRows.tsx', 'components/ai-visibility/ReadinessCard.tsx', 'components/ai-visibility/CompetitorsReadOnly.tsx', 'components/ai-visibility/useSeedPageState.ts', 'components/ai-visibility/overview-model.ts']
    const writes = NEW.filter((p) => /method:\s*['"](POST|PUT|PATCH|DELETE)['"]/.test(code(p)))
    check('none of the new code sends a write (no POST/PUT/PATCH/DELETE)', writes.length === 0, writes.join(', '))
    const fetched = NEW.flatMap((p) => [...code(p).matchAll(/fetch\(\s*`([^`]+)`/g)].map((m) => m[1]))
    check('the only reads are the seed run and the competitors list',
      fetched.length === 2 && fetched.some((u) => /\/api\/projects\/\$\{encodeURIComponent\(projectId\)\}\/seed$/.test(u)) && fetched.some((u) => /\/ai-visibility\/competitors$/.test(u)), fetched.join(' | '))
    check('no model, dispatch or rescan route is named by the new code',
      !NEW.some((p) => /enriched-suggestions|generate-ai-questions|\/api\/ai-visibility\/runs|action:\s*'start'/.test(code(p))))

    // Competitors: shown here, managed in settings.
    check('competitors are added and removed in settings (#competitors), an internal link',
      M.competitorsSettingsHref('p 1') === '/settings?projectId=p%201#competitors' && /manageHref=\{competitorsSettingsHref\(project\.id\)\}/.test(page))
    const ro = code('components/ai-visibility/CompetitorsReadOnly.tsx')
    check('the competitors view has no editor (no input, no delete, no write)', !/<input\b|Trash|method:/.test(ro) && /href=\{manageHref\}/.test(ro))

    // No raw text from a provider or the database reaches the screen.
    const rawText = NEW.filter((p) => /body\??\.error|errorMessage|error_message|errorCode|\.message\b/.test(code(p)))
    check('no error text from a route or the database is rendered by the new code', rawText.length === 0, rawText.join(', '))

    // The copy: both languages, same keys, placed right after projectDetail.
    const shape = (v: unknown): unknown => (v && typeof v === 'object' ? Object.fromEntries(Object.entries(v).sort().map(([k, x]) => [k, shape(x)])) : typeof v)
    const he = getDashboardDictionary('he').aiVisibilityOverview
    const en = getDashboardDictionary('en').aiVisibilityOverview
    check('the Hebrew and English copy have the same keys and shapes', JSON.stringify(shape(he)) === JSON.stringify(shape(en)))
    check('Hebrew copy is Hebrew and English copy is not', /[֐-׿]/.test(he.heroTitle) && !/[֐-׿]/.test(JSON.stringify(en)))
    check('the locked-store sentence is the plan\'s', he.readinessLockedTitle === 'לא נבדק, החנות נעולה בסיסמה' && en.readinessLockedTitle === 'Not checked, the store is password protected')
    for (const f of ['lib/i18n/dashboard/he.ts', 'lib/i18n/dashboard/en.ts']) {
      const src = read(f)
      const at = src.indexOf('\n  aiVisibilityOverview: {')
      const before = src.lastIndexOf('\n  projectDetail: {', at)
      const between = src.slice(before + 1, at)
      const nextTop = src.indexOf('\n  trackingTargetForm: {', at)
      check(`${f}: the section sits directly after projectDetail, not at the end`,
        at > 0 && before > 0 && !/\n  [a-zA-Z]+: \{/.test(between.slice(between.indexOf('\n'))) && nextTop > at && nextTop < src.length - 2000)
    }
  }

  console.log(`\n${pass} passed, ${fail} failed`)
  if (fail > 0) process.exit(1)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})

export {}
