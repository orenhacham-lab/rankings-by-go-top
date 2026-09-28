/**
 * SEARCH CONSOLE INSIDE THE TABS — the widgets that replaced the Search Console screen.
 *
 * Search Console stopped being a screen of its own and became a data source of the
 * screens that already exist: clicks and top pages on the dashboard, clicks and
 * impressions per keyword in the keywords table, a performance block on "my
 * progress" and recommendations on Topics. The raw opportunity browser is not one of
 * them: it is an internal/dev-only diagnostic, mounted in keyword research only behind
 * NEXT_PUBLIC_GSC_RAW_BROWSER_ENABLED (a merchant-grade presentation is a later package).
 *
 * The rule every one of them follows: a widget that depends on Search Console is
 * always on its screen with its real title. Before Search Console can feed it, it
 * shows one sentence on what will appear there and why it is worth it, and exactly
 * one button, to the Search Console section of the project's settings. The connection
 * never hides it, and it never shows a bare zero. The one exception is Search Console
 * switched off on the server (the status answers 404 "Not found", 'disabled'): the
 * connect routes refuse too, so "connect" would be a dead end, and every widget renders
 * nothing.
 *
 *  A) the status → what a widget shows (the switch's 404 is 'disabled'; any other 404,
 *     like any failed read, is an error: never "not connected" and never hidden);
 *  B) the figures: top pages, per-keyword matching (the engine's normalization), trend;
 *  C) the metrics route's new views are owner-gated, project-filtered and read-only;
 *  D) every widget, in every setup state and both languages, renders its title, its
 *     sentence and exactly one button to settings (the REAL components, first render),
 *     and nothing at all when Search Console is switched off;
 *  E) no merchant screen hides a widget: each is mounted unconditionally, and no screen
 *     reads the connection to decide; the raw opportunity browser stays behind its flag;
 *  F) the copy exists in both languages, one sentence each, English without Hebrew;
 *  G) the two widgets that act and keep their own data: what they report reaches the
 *     screen, and a project switch starts them afresh;
 *  H) switched off, the screens look as they did before Search Console fed them: the
 *     keywords table's volume cell is the volume alone, the dashboard's tile row closes
 *     up, and Topics keeps no separator for a section that is not there.
 *
 * Source guards strip comments first. Every guard has a mutation control that breaks
 * the rule on purpose and shows the guard fails.
 *
 * Run: npx tsx components/gsc/__qa__/gsc-widgets.qa.ts
 */
/* eslint-disable @typescript-eslint/no-require-imports, @typescript-eslint/no-explicit-any */

let pass = 0, fail = 0
function check(name: string, cond: boolean, detail?: string) {
  if (cond) { pass++; console.log(`  ✓ ${name}`) } else { fail++; console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`) }
}

// ── Stubs, installed before anything under test loads ──────────────────────
// The route reads the session through lib/supabase/server and the data through the
// service-role client; both are replaced by in-memory stand-ins (FakeAdmin applies
// real filter semantics). The components call Next's router hooks, which need a
// request outside of Next; those return a plain pathname. Nothing else is replaced.
const Module: any = require('module')
const origLoad = Module._load
let USER: { id: string } | null = null
let ADMIN: any = null
Module._load = function (request: string, parent: any, isMain: boolean) {
  let resolved = request
  try { resolved = String(Module._resolveFilename(request, parent, isMain)) } catch { /* virtual */ }
  if (resolved.endsWith('lib/supabase/server.ts')) return { createClient: async () => ({ auth: { getUser: async () => ({ data: { user: USER } }) } }) }
  if (resolved.endsWith('lib/supabase/admin.ts')) return { createAdminClient: () => ADMIN }
  const real = origLoad.call(this, request, parent, isMain)
  if (request !== 'next/navigation') return real
  return new Proxy(real, {
    get: (t, k) => (k === 'usePathname' ? () => '/dashboard'
      : k === 'useSearchParams' ? () => new URLSearchParams()
      : k === 'useRouter' ? () => ({ push() {}, replace() {}, refresh() {}, back() {}, prefetch() {} })
      : (t as any)[k]),
  })
}

const { readFileSync } = require('fs') as typeof import('fs')
const { join } = require('path') as typeof import('path')
const { createElement, Fragment } = require('react') as typeof import('react')
const { renderToStaticMarkup } = require('react-dom/server') as typeof import('react-dom/server')
const { FakeAdmin } = require('../../../lib/__qa__/_fake-admin')
const { DashboardLanguageProvider } = require('../../../lib/i18n/dashboard/useDashboardLanguage')
const { getDashboardDictionary } = require('../../../lib/i18n/dashboard/getDashboardDictionary')
const { gscStatusView, gscSettingsHref, GSC_SETUP_STATES } = require('../../../lib/gsc/widget-state') as typeof import('../../../lib/gsc/widget-state')
const TM = require('../../../lib/gsc/tab-metrics') as typeof import('../../../lib/gsc/tab-metrics')
const data = require('../gsc-data') as typeof import('../gsc-data')

type SetupState = import('../../../lib/gsc/widget-state').GscSetupState
type Locale = 'he' | 'en'

const ROOT = join(__dirname, '..', '..', '..')
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8')
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1')
const code = (p: string) => strip(read(p))
const HEBREW = /[֐-׿]/
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b)

// ── Status fixtures: one per reason the data is missing, plus the ready one ─
const STATUS_BODY: Record<SetupState, unknown> = {
  not_connected: { ok: true, oauthConfigured: true, connection: null, property: null, windows: {} },
  reauth_required: { ok: true, oauthConfigured: true, connection: { status: 'reauth_required' }, property: null, windows: {} },
  no_property: { ok: true, oauthConfigured: true, connection: { status: 'connected' }, property: null, windows: {} },
  never_synced: { ok: true, oauthConfigured: true, connection: { status: 'connected' }, property: { siteUrl: 'sc-domain:shop.test' }, windows: { 28: null, 90: null } },
}
const READY_BODY = {
  ok: true, oauthConfigured: true, connection: { status: 'connected' }, property: { siteUrl: 'sc-domain:shop.test' },
  windows: { 28: { summaryResyncRequired: false, clicks: 1234, impressions: 56789, ctr: 0.0217, avgPosition: 8.4, startDate: '2026-08-24', endDate: '2026-09-20' }, 90: null },
}

async function main() {
  console.log('Search Console inside the tabs — widgets, not a screen')

  // ── A) status → what a widget shows ─────────────────────────────────────
  console.log('\nA) the status decides one state per widget')
  {
    const v = (status: number, body: unknown) => gscStatusView(status, body).state
    check('A1: no connection → not_connected; a revoked one too',
      v(200, STATUS_BODY.not_connected) === 'not_connected'
      && v(200, { ok: true, connection: { status: 'revoked' }, property: { siteUrl: 'x' }, windows: { 28: {} } }) === 'not_connected')
    // Switched off, the connect routes answer 404 too: "connect" would be a dead end.
    const offIsDisabled = (fn: typeof v) => fn(404, { error: 'Not found' }) === 'disabled'
    check('A2: the feature switched off on the server (404 "Not found") is disabled, not "connect"', offIsDisabled(v))
    check('A2-MUT: the old mapping, 404 → not connected (a dead-end "Connect"), fails A2',
      !offIsDisabled((s, b) => (s === 404 ? 'not_connected' : v(s, b))))
    // Only the switch's own answer: the route also answers 404 when it cannot find the
    // project, or its lookup fails (lib/content/api-auth.ts). That is a failed read.
    const otherNotFound: unknown[] = [{ error: 'Project not found' }, null, {}, { error: 'not found' }, { ok: false, error: 'Not found ' }]
    const otherNotFoundIsError = (fn: typeof v) => otherNotFound.every((b) => fn(404, b) === 'error')
    check('A2b: any other 404 (the project not found, its lookup failed, a page that is not the route) is an error with its retry, not hidden',
      otherNotFoundIsError(v), otherNotFound.map((b) => `${JSON.stringify(b)}:${v(404, b)}`).join(' '))
    check('A2b-MUT: a mapping that hides every 404 as switched off (a failed lookup would empty the screens) fails A2b',
      !otherNotFoundIsError((s, b) => (s === 404 ? 'disabled' : v(s, b))))
    check('A3: connected without a property → no_property; expired without one → reauth_required',
      v(200, STATUS_BODY.no_property) === 'no_property' && v(200, STATUS_BODY.reauth_required) === 'reauth_required')
    check('A4: a property but no 28-day sync → never_synced; expired and never synced → reauth_required',
      v(200, STATUS_BODY.never_synced) === 'never_synced'
      && v(200, { ok: true, connection: { status: 'reauth_required' }, property: { siteUrl: 'x' }, windows: { 28: null } }) === 'reauth_required')
    const ready = gscStatusView(200, READY_BODY)
    check('A5: a sync → ready, with the property totals of that sync',
      ready.state === 'ready' && same(ready.summary, { clicks: 1234, impressions: 56789, ctr: 0.0217, avgPosition: 8.4, startDate: '2026-08-24', endDate: '2026-09-20' }), JSON.stringify(ready))
    const staleAuth = gscStatusView(200, { ...READY_BODY, connection: { status: 'reauth_required' } })
    check('A6: expired access with data already synced still shows that data', staleAuth.state === 'ready')
    const noTotals = gscStatusView(200, { ...READY_BODY, windows: { 28: { summaryResyncRequired: true, clicks: null } } })
    check('A7: a sync without property totals is ready with no summary (never summed from rows)', noTotals.state === 'ready' && noTotals.summary === null)
    const failures: [number, unknown][] = [[500, { ok: false, error: 'gsc_error' }], [200, { ok: false }], [0, null], [401, { error: 'Unauthorized' }], [403, { error: 'Forbidden' }],
      [502, null], [503, { error: 'Service Unavailable' }], [429, { error: 'Too Many Requests' }]]
    const failuresAreErrors = (fn: typeof v) => failures.every(([s, b]) => fn(s, b) === 'error')
    check('A8: any other failed read is an error: never "connect Search Console", never hidden as switched off', failuresAreErrors(v))
    check('A8-MUT: a mapping that shows a failed read as not connected fails A8',
      !failuresAreErrors((s, b) => (s >= 500 ? 'not_connected' : v(s, b))))
    check('A8-MUT2: a mapping that hides every failed read as switched off fails A8',
      !failuresAreErrors((s, b) => (s !== 200 ? 'disabled' : v(s, b))))
    check('A9: the one button goes to the Search Console section of settings, naming the project',
      gscSettingsHref('p1') === '/settings?projectId=p1#search-console'
      && gscSettingsHref('a b') === '/settings?projectId=a%20b#search-console'
      && gscSettingsHref(null) === '/settings#search-console')

    // The premise of 'disabled', against the real route: switched off, it answers 404
    // before it reads anything; switched on, the same owned project without a
    // connection is a 200 that reads as not connected (the 404 is the switch).
    const { GET: statusGET } = require('../../../app/api/gsc/status/route.ts')
    const ask = async () => {
      const res: Response = await statusGET(new Request('http://app.test/api/gsc/status?projectId=p1'))
      return { status: res.status, body: await res.json().catch(() => null) }
    }
    USER = { id: 'u1' }
    ADMIN = new FakeAdmin({ projects: [{ id: 'p1', user_id: 'u1' }], gsc_connections: [], project_gsc_properties: [], gsc_sync_runs: [] })
    delete process.env.GSC_READ_ONLY_ENABLED
    const off = await ask()
    process.env.GSC_READ_ONLY_ENABLED = 'true'
    const on = await ask()
    delete process.env.GSC_READ_ONLY_ENABLED
    type Answer = { status: number; body: unknown }
    const contract = (o: Answer, n: Answer) => o.status === 404 && v(o.status, o.body) === 'disabled' && n.status === 200 && v(n.status, n.body) === 'not_connected'
    check('A10: the real status route, switched off, answers what reads as disabled; switched on, the same project reads as not connected',
      contract(off, on), JSON.stringify({ off, on }))
    check('A10-MUT: a switched-off route that answered with a failed read instead (an error box on every screen) fails A10',
      !contract({ status: 503, body: { ok: false, error: 'disabled' } }, on))
    check('A10-MUT2: a switched-off route that answered another 404 body (not what the mapping reads as the switch) fails A10',
      !contract({ status: 404, body: { error: 'Search Console is off' } }, on))

    // Its other 404s, against the same real route switched on: a project it cannot find,
    // and a project lookup that fails. Both are a failed read, never "switched off".
    process.env.GSC_READ_ONLY_ENABLED = 'true'
    ADMIN = new FakeAdmin({ projects: [], gsc_connections: [], project_gsc_properties: [], gsc_sync_runs: [] })
    const unknownProject = await ask()
    ADMIN = new FakeAdmin({ projects: [{ id: 'p1', user_id: 'u1' }], gsc_connections: [], project_gsc_properties: [], gsc_sync_runs: [] },
      { projects: { select: () => ({ code: '57014', message: 'canceling statement due to statement timeout' }) } })
    const failedLookup = await ask()
    delete process.env.GSC_READ_ONLY_ENABLED
    const readsAsError = (fn: typeof v, answers: Answer[]) => answers.every((a) => a.status === 404 && fn(a.status, a.body) === 'error')
    check('A10b: the real route\'s other 404s (a project it cannot find, a project lookup that fails) read as an error with its retry',
      readsAsError(v, [unknownProject, failedLookup]), JSON.stringify({ unknownProject, failedLookup }))
    check('A10b-MUT: the previous mapping, every 404 → disabled, reads them as switched off and fails A10b',
      !readsAsError((s, b) => (s === 404 ? 'disabled' : v(s, b)), [unknownProject, failedLookup]))
  }

  // ── B) the figures ─────────────────────────────────────────────────────
  console.log('\nB) top pages, per-keyword figures and the trend')
  {
    const pages = TM.topPagesByClicks([
      { page: 'https://s.test/a', clicks: 5 }, { page: 'https://s.test/b', clicks: 7 }, { page: 'https://s.test/a', clicks: 4 },
      { page: 'https://s.test/c', clicks: 0 }, { page: 'https://s.test/d', clicks: 1 }, { page: 'https://s.test/e', clicks: 1 },
      { page: 'https://s.test/f', clicks: 2 }, { page: 'https://s.test/g', clicks: 3 },
    ])
    check('B1: clicks are summed per page, most clicked first, five at most, none without a click',
      same(pages.map((p) => [p.page.slice(-1), p.clicks]), [['a', 9], ['b', 7], ['g', 3], ['f', 2], ['d', 1]]), JSON.stringify(pages))

    const targets = [
      { id: 't1', keyword: 'Running Shoes' }, { id: 't2', keyword: 'running shoes' }, { id: 't3', keyword: 'נַעֲלֵי רִיצָה' },
      { id: 't4', keyword: 'trail sandals' }, { id: 't5', keyword: '  ' },
    ]
    const rows = [
      { query: 'running-shoes', clicks: 3, impressions: 100 }, { query: 'running shoes', clicks: 2, impressions: 50 },
      { query: 'running shoes for women', clicks: 9, impressions: 900 }, { query: 'נעלי ריצה', clicks: 1, impressions: 40 },
    ]
    const figures = TM.keywordFigures(targets, rows)
    check('B2: a keyword gets the sum over every row whose query normalizes to it (punctuation, case, every page)',
      same(figures.t1, { clicks: 5, impressions: 150 }) && same(figures.t2, { clicks: 5, impressions: 150 }), JSON.stringify(figures))
    check('B3: Hebrew niqqud is folded the way the opportunity engine folds it', same(figures.t3, { clicks: 1, impressions: 40 }))
    check('B4: a longer query is another search, and a keyword Google reports nothing for is absent, not zero',
      !('t4' in figures) && !('t5' in figures) && figures.t1.clicks === 5)
    const exactOnly = (ts: typeof targets, rs: typeof rows) => {
      const out: Record<string, { clicks: number; impressions: number }> = {}
      for (const t of ts) for (const r of rs) if (r.query === t.keyword) out[t.id] = { clicks: (out[t.id]?.clicks ?? 0) + r.clicks, impressions: (out[t.id]?.impressions ?? 0) + r.impressions }
      return out
    }
    const matchesLikeTheEngine = (fn: typeof TM.keywordFigures) => {
      const f = fn(targets, rows)
      return same(f.t1, { clicks: 5, impressions: 150 }) && same(f.t3, { clicks: 1, impressions: 40 })
    }
    check('B-MUT: a matcher without the engine\'s normalization fails B2/B3', matchesLikeTheEngine(TM.keywordFigures) && !matchesLikeTheEngine(exactOnly))

    const run = (end: string, start: string, startedAt: string, clicks: number | null, extra: Record<string, unknown> = {}) => ({
      end_date: end, start_date: start, started_at: startedAt, summary_total_clicks: clicks, summary_total_impressions: clicks === null ? null : clicks * 10,
      summary_average_position: 9, summary_aggregation_type: clicks === null ? null : 'byProperty', ...extra,
    })
    const points = TM.trendPoints([
      run('2026-09-20', '2026-08-24', '2026-09-23T05:00:00Z', 120),
      run('2026-09-20', '2026-08-24', '2026-09-23T09:00:00Z', 125), // a manual sync on the same day wins
      run('2026-09-13', '2026-08-17', '2026-09-16T05:00:00Z', null), // no property totals: left out
      run('2026-08-23', '2026-07-27', '2026-08-26T05:00:00Z', 90),
      run('2026-09-06', '2026-08-10', '2026-09-09T05:00:00Z', 100),
      run('2026-08-30', '2026-08-03', '2026-09-02T05:00:00Z', 95, { summary_aggregation_type: 'byPage' }),
    ])
    check('B5: one point per window, oldest first, only runs with property totals, the later sync of a window winning',
      same(points.map((p) => [p.endDate, p.clicks]), [['2026-08-23', 90], ['2026-09-06', 100], ['2026-09-20', 125]]), JSON.stringify(points))
    const prev = TM.previousPeriod(points)
    check('B6: the change compares with the previous 28 days, not an overlapping window', prev?.endDate === '2026-08-23')
    check('B7: no previous period until one ends before the latest starts',
      TM.previousPeriod(points.slice(1)) === null && TM.previousPeriod([]) === null)
    check('B8: at most the configured number of points', TM.trendPoints(Array.from({ length: 40 }, (_, i) => run(`2026-${String(1 + Math.floor(i / 28)).padStart(2, '0')}-${String(1 + (i % 28)).padStart(2, '0')}`, '2025-12-01', `2026-01-01T00:00:${String(i).padStart(2, '0')}Z`, i)), 26).length === 26)

    // The change against the previous period: "up" means better, and for the average
    // position better is LOWER. A change from nothing has no percent.
    type Delta = typeof TM.performanceDelta
    const deltaRules = (fn: Delta) => {
      const clicks = fn('clicks', 1234, 1000)
      const fewer = fn('impressions', 900, 1000)
      const climbed = fn('position', 8.4, 9.1)
      const slipped = fn('position', 9.1, 8.4)
      return !!clicks && clicks.direction === 'up' && clicks.percent && Math.abs(clicks.size - 23.4) < 1e-9
        && !!fewer && fewer.direction === 'down' && Math.abs(fewer.size - 10) < 1e-9
        && !!climbed && climbed.direction === 'up' && !climbed.percent && Math.abs(climbed.size - 0.7) < 1e-9
        && !!slipped && slipped.direction === 'down'
        && fn('clicks', 1002, 1000)?.direction === 'flat' && fn('position', 8.42, 8.4)?.direction === 'flat'
        && fn('clicks', 50, 0) === null && fn('clicks', null, 10) === null && fn('position', 3, null) === null
    }
    check('B9: the change says better or worse (a lower position is better), flat when tiny, nothing from zero', deltaRules(TM.performanceDelta))
    check('B9-MUT: a change that reads a higher position as better fails B9',
      !deltaRules((metric, current, previous) => metric === 'position' ? TM.performanceDelta('clicks', current, previous) : TM.performanceDelta(metric, current, previous)))
  }

  // ── C) the metrics route's new views ───────────────────────────────────
  console.log('\nC) /api/gsc/metrics — pages, keywords, trend: owner-gated, project-filtered, read-only')
  {
    process.env.GSC_READ_ONLY_ENABLED = 'true'
    const { GET } = require('../../../app/api/gsc/metrics/route.ts')
    const runRow = (id: string, project: string, window: number, status: string, end: string, start: string, startedAt: string, clicks: number) => ({
      id, project_id: project, window_days: window, status, start_date: start, end_date: end, started_at: startedAt, truncated: false, latest_available_date: end,
      summary_total_clicks: clicks, summary_total_impressions: clicks * 10, summary_average_position: 7.5, summary_aggregation_type: 'byProperty',
    })
    const metric = (run: string, project: string, query: string, page: string, clicks: number, impressions: number) => ({ sync_run_id: run, project_id: project, query, page, clicks, impressions, ctr: 0, position: 5 })
    const seed = () => ({
      projects: [{ id: 'p1', user_id: 'u1' }, { id: 'p2', user_id: 'u2' }],
      tracking_targets: [{ id: 't1', project_id: 'p1', keyword: 'Running Shoes' }, { id: 't2', project_id: 'p1', keyword: 'wool socks' }, { id: 'tx', project_id: 'p2', keyword: 'running shoes' }],
      gsc_sync_runs: [
        runRow('r-old', 'p1', 28, 'succeeded', '2026-08-23', '2026-07-27', '2026-08-26T05:00:00Z', 90),
        runRow('r-new', 'p1', 28, 'succeeded', '2026-09-20', '2026-08-24', '2026-09-23T05:00:00Z', 120),
        runRow('r-failed', 'p1', 28, 'failed', '2026-09-21', '2026-08-25', '2026-09-24T05:00:00Z', 999),
        runRow('r-90', 'p1', 90, 'succeeded', '2026-09-20', '2026-06-23', '2026-09-23T05:00:00Z', 777),
        runRow('r-other', 'p2', 28, 'succeeded', '2026-09-20', '2026-08-24', '2026-09-23T06:00:00Z', 555),
      ],
      gsc_query_page_metrics: [
        metric('r-new', 'p1', 'running shoes', 'https://s.test/shoes', 7, 300),
        metric('r-new', 'p1', 'running-shoes', 'https://s.test/', 3, 90),
        metric('r-new', 'p1', 'socks', 'https://s.test/socks', 0, 40),
        metric('r-old', 'p1', 'running shoes', 'https://s.test/old', 50, 500),
        metric('r-new', 'p2', 'running shoes', 'https://s.test/stray', 40, 400), // another project's row under this run id
        metric('r-other', 'p2', 'running shoes', 'https://other.test/', 60, 600),
      ],
    })
    const call = async (view: string, projectId = 'p1') => {
      const res: Response = await GET(new Request(`http://app.test/api/gsc/metrics?projectId=${projectId}&window=28&view=${view}`))
      return { status: res.status, body: await res.json() as any }
    }
    USER = { id: 'u1' }
    const tables = seed()
    ADMIN = new FakeAdmin(tables)
    const before = JSON.stringify(tables)

    const pages = await call('pages')
    check('C1: pages → the latest succeeded 28-day sync of THIS project, clicked pages only, most clicked first',
      pages.status === 200 && same(pages.body.pages, [{ page: 'https://s.test/shoes', clicks: 7 }, { page: 'https://s.test/', clicks: 3 }]), JSON.stringify(pages.body))
    const keywords = await call('keywords')
    check('C2: keywords → each of the project\'s keywords matched by normalization, nothing for another project\'s keyword',
      keywords.status === 200 && same(keywords.body.keywords, { t1: { clicks: 10, impressions: 390 } }), JSON.stringify(keywords.body))
    const trend = await call('trend')
    check('C3: trend → this project\'s succeeded 28-day syncs, oldest first (no failed, 90-day or other-project run)',
      trend.status === 200 && same(trend.body.points.map((p: any) => [p.endDate, p.clicks]), [['2026-08-23', 90], ['2026-09-20', 120]]), JSON.stringify(trend.body))
    check('C4: the views changed nothing', JSON.stringify(tables) === before)
    const foreign = await call('pages', 'p2')
    USER = null
    const anonymous = await call('trend')
    check('C5: another user\'s project is refused (403) and a signed-out request too (401)', foreign.status === 403 && anonymous.status === 401, `${foreign.status} ${anonymous.status}`)
    USER = { id: 'u1' }
    ADMIN = new FakeAdmin({ projects: [{ id: 'p1', user_id: 'u1' }], tracking_targets: [], gsc_sync_runs: [], gsc_query_page_metrics: [] })
    const none = await call('pages')
    check('C6: no sync yet → an empty answer the widget reads as "never synced", not an error', none.status === 200 && none.body.run === null)
    ADMIN = new FakeAdmin(seed(), { gsc_query_page_metrics: { select: () => ({ code: '57014', message: 'canceling statement due to statement timeout' }) } })
    const broken = await call('keywords')
    check('C7: a failed read answers with a stable code, never the database\'s text', broken.status === 500 && same(broken.body, { ok: false, error: 'metrics_read_failed' }), JSON.stringify(broken.body))
    delete process.env.GSC_READ_ONLY_ENABLED

    // Every read of the new views names the project: the admin client bypasses RLS.
    const route = code('app/api/gsc/metrics/route.ts')
    // A view's block runs from its `if` to its success answer, so every read inside it counts.
    const block = (src: string, view: string) => src.slice(src.indexOf(`if (view === '${view}')`), src.indexOf('return Response.json({ ok: true', src.indexOf(`if (view === '${view}')`) + 1))
    const filtered = (src: string) => ['trend', 'pages', 'keywords'].every((view) => {
      const b = block(src, view)
      const reads = b.split('.from(').length - 1
      return reads > 0 && (b.match(/\.eq\('project_id', auth\.project\.id\)/g) ?? []).length === reads
    })
    check('C8: every read in the three views is filtered by the authenticated project', filtered(route))
    check('C8-MUT: dropping the filter from the keywords read fails C8',
      !filtered(route.replace(/(if \(view === 'keywords'\)[\s\S]*?\.eq\('sync_run_id', run\.id\)\s*)\.eq\('project_id', auth\.project\.id\)/, '$1')))
    check('C9: the route writes nothing', !/\.(insert|update|upsert|delete)\(/.test(route))
  }

  // ── D) the widgets, first render, every setup state, both languages ────
  console.log('\nD) every widget keeps its title and says what it will show, with ONE button to settings')
  {
    const load = (p: string, named?: string) => { const m = require(join(ROOT, p)); return named ? m[named] : (m.default ?? m) }
    const GscClicksTile = load('components/gsc/GscClicksTile.tsx')
    const GscTopPages = load('components/gsc/GscTopPages.tsx')
    const GscPerformance = load('components/gsc/GscPerformance.tsx')
    const { GscKeywordsNotice, GscKeywordLine, useGscKeywordFigures } = require(join(ROOT, 'components/gsc/GscKeywordFigures.tsx'))
    const GscOpportunities = load('components/content/GscOpportunities.tsx')
    const GscRecommendations = load('components/content/GscRecommendations.tsx')

    function KeywordsHarness({ projectId }: { projectId: string | null }) {
      const view = useGscKeywordFigures(projectId, 't1')
      return createElement(Fragment, null,
        createElement(GscKeywordsNotice, { projectId, view }),
        createElement(GscKeywordLine, { view, targetId: 't1' }))
    }
    type W = { name: string; copy: 'clicks' | 'topPages' | 'performance' | 'keywords' | 'opportunities' | 'recommendations'; el: (projectId: string | null) => unknown }
    const WIDGETS: W[] = [
      { name: 'clicks', copy: 'clicks', el: (projectId) => createElement(GscClicksTile, { projectId }) },
      { name: 'top-pages', copy: 'topPages', el: (projectId) => createElement(GscTopPages, { projectId }) },
      { name: 'performance', copy: 'performance', el: (projectId) => createElement(GscPerformance, { projectId }) },
      { name: 'keywords', copy: 'keywords', el: (projectId) => createElement(KeywordsHarness, { projectId }) },
      { name: 'opportunities', copy: 'opportunities', el: (projectId) => createElement(GscOpportunities, { projectId: projectId ?? '' }) },
      { name: 'recommendations', copy: 'recommendations', el: (projectId) => createElement(GscRecommendations, { projectId: projectId ?? '' }) },
    ]
    const render = (locale: Locale, node: unknown) =>
      renderToStaticMarkup(createElement(DashboardLanguageProvider, { initialLocale: locale, children: node }) as never)
    const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#x27;')
    const text = (html: string) => html.replace(/<[^>]+>/g, ' ').replace(/&[a-z#0-9]+;/gi, ' ')
    const count = (hay: string, needle: string) => hay.split(needle).length - 1
    /** Exactly one interactive element, and it is the link to settings with this label. */
    const oneSettingsButton = (html: string, href: string, label: string) => {
      const anchors = html.match(/<a\b[^>]*>[\s\S]*?<\/a>/g) ?? []
      return anchors.length === 1 && !/<button\b/.test(html)
        && anchors[0].includes(`href="${esc(href)}"`) && anchors[0].replace(/<[^>]+>/g, '') === esc(label)
    }
    /** Every widget rendered nothing at all: no element, no text. */
    const renderedNothing = (htmls: string[]) => htmls.length > 0 && htmls.every((html) => html === '')
    const prime =(projectId: string, status: number, body: unknown) => data.primeGscResponse(data.gscStatusUrl(projectId), { status, body })

    let sample = ''
    for (const locale of ['he', 'en'] as Locale[]) {
      const dict = getDashboardDictionary(locale)
      const w = dict.gscWidgets
      for (const widget of WIDGETS) {
        const failures: string[] = []
        for (const state of GSC_SETUP_STATES) {
          prime('p1', 200, STATUS_BODY[state])
          const html = render(locale, widget.el('p1'))
          if (widget.name === 'clicks' && state === 'not_connected' && locale === 'en') sample = html
          const t = text(html)
          const problems = [
            !html.includes(`data-gsc-widget="${widget.name}"`) && 'no widget marker',
            !html.includes(`data-gsc-state="${state}"`) && `state is not ${state}`,
            !html.includes(esc(w[widget.copy].title)) && 'title missing',
            count(html, esc(w[widget.copy].about)) !== 1 && `sentence shown ${count(html, esc(w[widget.copy].about))} times`,
            !oneSettingsButton(html, '/settings?projectId=p1#search-console', w.actions[state]) && 'not exactly one button to settings',
            /(^|\s)0(\s|$)/.test(t) && 'a bare zero',
            locale === 'en' && HEBREW.test(html) && 'Hebrew in English',
            locale === 'he' && !HEBREW.test(t) && 'no Hebrew in Hebrew',
          ].filter(Boolean)
          if (problems.length) failures.push(`${state}: ${problems.join(', ')}`)
        }
        check(`D1 (${locale}) ${widget.name}: title, one sentence, one button to settings in all four setup states`, failures.length === 0, failures.join(' | '))
      }
      // UX review P1-8: before Search Console gives figures, the performance section on
      // Reports is ONE card. It used to add three tiles that each said "waiting for
      // Search Console" with their own source line: the same placeholder four times.
      const oneCard = (html: string) => !html.includes('data-gsc-tile=') && count(html, esc(w.emptyTile)) === 0 && count(html, esc(w.source28)) === 0
      const perfSetup = GSC_SETUP_STATES.map((state) => { prime('p1', 200, STATUS_BODY[state]); return render(locale, createElement(GscPerformance, { projectId: 'p1' })) })
      check(`D1b (${locale}) performance before Search Console: one card, no "waiting" tiles`, perfSetup.every(oneCard))
      check(`D1b-MUT (${locale}) a "waiting" tile beside the card fails D1b`,
        !oneCard(perfSetup[0].replace('</section>', `<div data-gsc-tile="clicks">${esc(w.emptyTile)}</div></section>`)))
      // Feature switched off on the server: nothing to connect, so nothing at all, not even
      // the title. Then an account with no project yet.
      prime('p1', 404, { error: 'Not found' })
      const off = WIDGETS.map((widget) => render(locale, widget.el('p1')))
      check(`D2 (${locale}) the feature switched off on the server: every widget renders nothing (no title, no button)`,
        renderedNothing(off), off.map((html, i) => `${WIDGETS[i].name}:${html.length}`).join(' '))
      // Control: what the old mapping made of that 404 (not connected) is caught by D2.
      prime('p1', 200, STATUS_BODY.not_connected)
      check(`D2-MUT (${locale}) the widgets as the old mapping drew the 404 ("Connect") fail D2`,
        !renderedNothing(WIDGETS.map((widget) => render(locale, widget.el('p1')))))
      const noProject = WIDGETS.map((widget) => render(locale, widget.el(null)))
      check(`D3 (${locale}) without a project every widget still shows, its button to settings`,
        noProject.every((html, i) => html.includes(esc(w[WIDGETS[i].copy].title)) && oneSettingsButton(html, '/settings#search-console', w.actions.not_connected)))
      // A failed read: the title, the error and a retry; no setup button, no zero.
      prime('p1', 500, { ok: false, error: 'gsc_error' })
      const errored = WIDGETS.map((widget) => render(locale, widget.el('p1')))
      check(`D4 (${locale}) a failed read keeps the title and offers a retry, never "connect"`,
        errored.every((html, i) => html.includes('data-gsc-state="error"') && html.includes(esc(w[WIDGETS[i].copy].title))
          && html.includes(esc(w.loadError)) && !/<a\b/.test(html) && !/(^|\s)0(\s|$)/.test(text(html))),
        errored.map((h, i) => `${WIDGETS[i].name}:${/data-gsc-state="([a-z_]+)"/.exec(h)?.[1]}`).join(' '))
      // A 404 that is not the switch (the project not found, or its lookup failed) is
      // that same failed read, retry included: never hidden as switched off.
      const retry = `>${esc(w.retry)}</button>`
      const asFailedRead = (htmls: string[]) => htmls.every((html, i) => html === errored[i] && html.includes(retry))
      prime('p1', 404, { error: 'Project not found' })
      const notFound = WIDGETS.map((widget) => render(locale, widget.el('p1')))
      check(`D4b (${locale}) a 404 that is not the switch shows every widget as a failed read, with its retry`,
        asFailedRead(notFound), notFound.map((h, i) => `${WIDGETS[i].name}:${/data-gsc-state="([a-z_]+)"/.exec(h)?.[1] ?? 'nothing'}`).join(' '))
      prime('p1', 404, { error: 'Not found' })
      check(`D4b-MUT (${locale}) the widgets as the previous mapping drew that 404 (nothing at all) fail D4b`,
        !asFailedRead(WIDGETS.map((widget) => render(locale, widget.el('p1')))))
      // Still loading (nothing asked yet): the title and a placeholder, nothing to press.
      const loading = WIDGETS.map((widget) => render(locale, widget.el('p-loading')))
      check(`D5 (${locale}) while loading every widget shows its title and no number`,
        loading.every((html, i) => html.includes('data-gsc-state="loading"') && html.includes(esc(w[WIDGETS[i].copy].title))
          && !/<a\b/.test(html) && !/\d/.test(text(html).replace(/28/g, ''))))
    }
    check('D-MUT: a second button, or a button to the retired screen, fails the one-button check',
      oneSettingsButton(sample, '/settings?projectId=p1#search-console', getDashboardDictionary('en').gscWidgets.actions.not_connected)
      && !oneSettingsButton(sample.replace('</a>', '</a><a href="/settings#search-console">Connect</a>'), '/settings?projectId=p1#search-console', getDashboardDictionary('en').gscWidgets.actions.not_connected)
      && !oneSettingsButton(sample.replace('/settings?projectId=p1#search-console', '/content/search-console'), '/settings?projectId=p1#search-console', getDashboardDictionary('en').gscWidgets.actions.not_connected))

    // Ready: the figures render, in the screen's language.
    prime('p-ready', 200, READY_BODY)
    data.primeGscResponse(data.gscMetricsUrl('p-ready', 'pages'), { status: 200, body: { ok: true, run: {}, pages: [{ page: 'https://s.test/', clicks: 700 }, { page: 'https://s.test/%D7%A0%D7%A2%D7%9C%D7%99%D7%99%D7%9D', clicks: 350 }] } })
    data.primeGscResponse(data.gscMetricsUrl('p-ready', 'trend'), { status: 200, body: { ok: true, points: [
      { startDate: '2026-07-27', endDate: '2026-08-23', clicks: 1000, impressions: 50000, position: 9.1 },
      { startDate: '2026-08-24', endDate: '2026-09-20', clicks: 1234, impressions: 56789, position: 8.4 },
    ] } })
    data.primeGscResponse(data.gscMetricsUrl('p-ready', 'keywords'), { status: 200, body: { ok: true, run: {}, keywords: { t1: { clicks: 1500, impressions: 34567 } } } })
    const en = getDashboardDictionary('en').gscWidgets
    const tile = render('en', createElement(GscClicksTile, { projectId: 'p-ready' }))
    check('D6: ready, the clicks tile shows the 28-day total and its source', tile.includes('data-gsc-state="ready"') && tile.includes('1,234') && tile.includes(esc(en.source28)) && !/<a\b/.test(tile))
    const top = render('he', createElement(GscTopPages, { projectId: 'p-ready' }))
    check('D7: ready, top pages name the home page and decode paths, with clicks in words',
      top.includes(getDashboardDictionary('he').gscWidgets.topPages.homePage) && top.includes('/נעליים') && top.includes(esc(getDashboardDictionary('he').gscWidgets.topPages.clicks('700'))))
    const perf = render('en', createElement(GscPerformance, { projectId: 'p-ready' }))
    check('D8: ready, performance shows the three totals and the change against the previous 28 days',
      perf.includes('1,234') && perf.includes('56,789') && perf.includes('8.4') && perf.includes(esc(en.performance.vsPrevious)) && perf.includes('▲ 23%') && perf.includes('▲ 0.7') && !/<a\b/.test(perf))
    const kw = render('en', createElement(KeywordsHarness, { projectId: 'p-ready' }))
    check('D9: ready, the keyword line shows clicks · impressions, compact, with the full figures for screen readers',
      kw.includes('data-gsc-keyword="figures"') && kw.includes('1.5K') && kw.includes('34.6K') && kw.includes(esc(en.keywords.figures('1,500', '34,567'))))
    const kwNone = render('en', createElement(GscKeywordLine, { view: { data: { state: 'ready', data: {} }, retry: () => {} }, targetId: 'zz' }))
    check('D10: a keyword Google reports nothing for shows a dash that says so, not a 0',
      kwNone.includes('data-gsc-keyword="none"') && kwNone.includes(esc(en.keywords.none)) && !/(^|\s)0(\s|$)/.test(text(kwNone)))
  }

  // ── E) no screen hides a widget ─────────────────────────────────────────
  console.log('\nE) every merchant screen mounts its widgets unconditionally; the raw browser stays behind its flag')
  {
    const SCREENS: [string, string[]][] = [
      ['app/(dashboard)/dashboard/page.tsx', ['<GscClicksTile projectId={project.id} />', '<GscTopPages projectId={project.id} />']],
      ['app/(dashboard)/reports/page.tsx', ['<GscPerformance projectId={activeProjectId}']],
      ['components/keywords/ProjectKeywordsPanel.tsx', ['<GscKeywordsNotice projectId={id} view={gscKeywords}', 'gscKeywords={gscKeywords}']],
      ['components/content/workspace/TopicsScreen.tsx', ['<GscRecommendations']],
    ]
    /** The element is there, nothing between it and the previous tag decides whether it
     *  renders, and the screen never reads the connection or a Search Console flag. */
    const unconditional = (src: string, needle: string) => {
      const i = src.indexOf(needle)
      if (i < 0) return false
      const before = src.slice(0, i)
      const gap = before.slice(Math.max(before.lastIndexOf('>'), before.lastIndexOf('}')) + 1)
      return /^\s*$/.test(gap)
    }
    const readsConnection = (src: string) => /NEXT_PUBLIC_GSC_(READ_ONLY|RAW_BROWSER)|\/api\/gsc\/status|useGscStatus|gscStatusView|\.view\.state/.test(src)
    const hidden = (list: [string, string, string][]) => list.filter(([, src, needle]) => !unconditional(src, needle) || readsConnection(src)).map(([p, , n]) => `${p}: ${n}`)
    const all: [string, string, string][] = SCREENS.flatMap(([p, needles]) => needles.map((n) => [p, code(p), n] as [string, string, string]))
    check('E1: the dashboard, reports, keywords and Topics mount their widgets whatever the connection', hidden(all).length === 0, hidden(all).join(' | '))
    const dash = all[0][1]
    check('E1-MUT: a dashboard that shows top pages only when connected fails E1',
      hidden([['dash', dash.replace('<GscTopPages projectId={project.id} />', '{gscConnected && <GscTopPages projectId={project.id} />}'), '<GscTopPages projectId={project.id} />']]).length === 1)
    check('E1-MUT2: a dashboard that puts its tile behind a Search Console flag fails E1',
      hidden([['dash', `${dash}\nconst on = process.env.NEXT_PUBLIC_GSC_READ_ONLY_ENABLED === 'true'`, '<GscClicksTile projectId={project.id} />']]).length === 1)

    // The raw opportunity browser is a diagnostic: on main and on the base branch it was
    // rendered only when NEXT_PUBLIC_GSC_RAW_BROWSER_ENABLED === 'true', and it still is.
    // It is mounted once, in keyword research, and only inside that gate.
    const research = code('app/(dashboard)/keyword-research/page.tsx')
    const behindRawFlag = (src: string) => (src.match(/<GscOpportunities\b/g) ?? []).length === 1
      && /\{process\.env\.NEXT_PUBLIC_GSC_RAW_BROWSER_ENABLED === 'true' && \(\s*<div className="mt-8">\s*<GscOpportunities\b[\s\S]*?\/>\s*<\/div>\s*\)\}/.test(src)
    check('E4: keyword research mounts the raw opportunity browser only behind NEXT_PUBLIC_GSC_RAW_BROWSER_ENABLED, never for merchants', behindRawFlag(research))
    check('E4-MUT: the browser mounted without its gate (merchant-facing, as #77 first had it) fails E4',
      !behindRawFlag(research.replace("process.env.NEXT_PUBLIC_GSC_RAW_BROWSER_ENABLED === 'true' && ", '')))
    check('E4-MUT2: a gate on the Search Console flag production has on, instead of the dev flag, fails E4',
      !behindRawFlag(research.replace('NEXT_PUBLIC_GSC_RAW_BROWSER_ENABLED', 'NEXT_PUBLIC_GSC_READ_ONLY_ENABLED')))
    check('E4-MUT3: a second, ungated mount of the browser fails E4',
      !behindRawFlag(`${research}\nconst extra = <GscOpportunities projectId={selectedProject} />`))

    // The volume cell: GscVolumeCell alone decides whether a line goes under the volume
    // (and, switched off, whether there is a column to stack it in at all).
    const table = code('components/keywords/TrackingTargetsTable.tsx')
    const volumeInCell = (src: string) => /<Td>\s*<GscVolumeCell view=\{gscKeywords\} targetId=\{target\.id\}>\s*\{target\.avg_monthly_searches !== null[\s\S]*?<\/GscVolumeCell>\s*<\/Td>/.test(src)
      && !/<GscKeywordLine\b/.test(src)
    check('E2: the keywords table puts every search volume in the Search Console cell, which alone decides what goes under it', volumeInCell(table))
    check('E2-MUT: a table that stacks the line itself, in a column kept in every state, fails E2',
      !volumeInCell(table.replace('<GscVolumeCell view={gscKeywords} targetId={target.id}>', '<div className="flex flex-col items-start gap-1">')
        .replace('</GscVolumeCell>', '{gscKeywords && <GscKeywordLine view={gscKeywords} targetId={target.id} />}</div>')))

    // The widgets never remove themselves, except when Search Console is switched off on
    // the server; none reads a Search Console flag to decide.
    const widgetFiles = ['components/gsc/GscClicksTile.tsx', 'components/gsc/GscTopPages.tsx', 'components/gsc/GscPerformance.tsx', 'components/gsc/GscKeywordFigures.tsx', 'components/gsc/GscSetupPrompt.tsx', 'components/content/GscOpportunities.tsx', 'components/content/GscRecommendations.tsx']
    const hidesOnlyWhenOff = (src: string) => (src.match(/return null\b/g) ?? []).length === (src.match(/if \((?:[\w.]+\.)?state === 'disabled'\) return null\b/g) ?? []).length
      && !/NEXT_PUBLIC_GSC_(READ_ONLY|RAW_BROWSER)/.test(src)
    const selfHiding = (files: [string, string][]) => files.filter(([, src]) => !hidesOnlyWhenOff(src)).map(([p]) => p)
    const widgetSrc = widgetFiles.map((p) => [p, code(p)] as [string, string])
    check('E3: no widget returns nothing in any state but "switched off", nor reads a Search Console flag', selfHiding(widgetSrc).length === 0, selfHiding(widgetSrc).join(', '))
    check('E3-MUT: a tile that returns null when not connected fails E3',
      selfHiding([['tile', widgetSrc[0][1].replace("if (view.state === 'ready' && view.summary) {", "if (view.state === 'not_connected') return null\n  if (view.state === 'ready' && view.summary) {")]]).length === 1)
    check('E3-MUT2: a widget that hides behind a Search Console flag fails E3',
      selfHiding([['tile', `${widgetSrc[0][1]}\nconst off = process.env.NEXT_PUBLIC_GSC_READ_ONLY_ENABLED !== 'true'`]]).length === 1)
  }

  // ── F) the copy ─────────────────────────────────────────────────────────
  console.log('\nF) the copy, in both languages')
  {
    const he = getDashboardDictionary('he').gscWidgets
    const en = getDashboardDictionary('en').gscWidgets
    const WIDGET_COPY = ['clicks', 'topPages', 'performance', 'keywords', 'opportunities', 'recommendations'] as const
    const oneSentence = (s: string) => typeof s === 'string' && s.length > 20 && /\.$/.test(s) && !/[.!?]\s/.test(s.slice(0, -1))
    const copyOk = (dicts: { title: string; about: string }[][]) => dicts.every((list) => list.every((c) => typeof c.title === 'string' && c.title.length > 0 && oneSentence(c.about)))
    const heList = WIDGET_COPY.map((k) => he[k]), enList = WIDGET_COPY.map((k) => en[k])
    check('F1: every widget has a title and ONE sentence on what it shows and why, in both languages', copyOk([heList, enList]))
    check('F1-MUT: a widget with two sentences fails F1', !copyOk([[...heList.slice(1), { title: 'x', about: 'One sentence. Another one.' }]]))
    check('F2: English has no Hebrew; the Hebrew sentences are Hebrew',
      !HEBREW.test(JSON.stringify(en, (_, v) => (typeof v === 'function' ? v('1', '2') : v))) && heList.every((c) => HEBREW.test(c.about) && HEBREW.test(c.title) || /Search Console/.test(c.title)))
    check('F3: each reason has its own button label, in both languages',
      GSC_SETUP_STATES.every((s) => en.actions[s].length > 0 && he.actions[s].length > 0 && HEBREW.test(he.actions[s]))
      && new Set(GSC_SETUP_STATES.map((s) => en.actions[s])).size === GSC_SETUP_STATES.length)
    const keys = (o: unknown): string[] => (o && typeof o === 'object' ? Object.entries(o as Record<string, unknown>).flatMap(([k, v]) => [k, ...keys(v).map((c) => `${k}.${c}`)]) : [])
    check('F4: the two languages have the same keys', same(keys(he).sort(), keys(en).sort()))
    // Right to left, a number that follows English text joins the English run and is
    // drawn at the far end of the line from the Hebrew words it belongs to
    // ("Search Console · 28 הימים" shows the 28 beside "Console", not beside "הימים").
    const strings = (o: unknown): string[] => (typeof o === 'string' ? [o]
      : typeof o === 'function' ? [String((o as (...a: string[]) => string)('1,234', '5,678'))]
        : o && typeof o === 'object' ? Object.values(o as Record<string, unknown>).flatMap(strings) : [])
    const heStranded = (dict: unknown) => strings(dict).filter((s) => /[A-Za-z][^֐-׿\d]*\d/.test(s))
    check('F6: no Hebrew line puts a number after English text (it would be drawn away from its words)', heStranded(he).length === 0, heStranded(he).join(' | '))
    check('F6-MUT: the source line with the number after "Search Console" fails F6',
      heStranded({ ...he, source28: 'Search Console · 28 הימים האחרונים' }).length === 1)
    check('F5: the old copy that said "on the project page" is gone',
      !/project page/i.test(JSON.stringify(getDashboardDictionary('en').projectDetail.contentSection.gscOpportunities))
      && !/עמוד הפרויקט/.test(JSON.stringify(getDashboardDictionary('he').projectDetail.contentSection.gscOpportunities)))
  }

  // ── G) the widgets that act and keep their own data ─────────────────────
  // Opportunities and recommendations say what happened to a decision, an undo or a
  // created topic ONLY through onToast; and they keep the rows they read in their own
  // state, read by a request nothing cancels. Neither can be shown by a first render.
  console.log('\nG) what the acting widgets report reaches the screen; a project switch starts them afresh')
  {
    /** The element as written, from its tag to its self-closing end. */
    const element = (src: string, name: string) => {
      const i = src.indexOf(`<${name}`)
      return i < 0 ? '' : src.slice(i, src.indexOf('/>', i) + 2)
    }
    /** onToast feeds a toast list that the same screen draws. */
    const reportsBack = (src: string, name: string) => {
      const list = /const (\w+) = useToasts\(\)/.exec(src)?.[1]
      if (!list) return false
      return element(src, name).includes(`onToast={(kind, text) => (kind === 'success' ? ${list}.success(text) : ${list}.error(text))}`)
        && src.includes(`<ToastHost toasts={${list}.toasts} dismiss={${list}.dismiss}`)
    }
    /** Keyed by the same project it is given, so a switch mounts it anew. */
    const keyedByProject = (src: string, name: string) => {
      const el = element(src, name)
      const id = /\bprojectId=\{([^}]+)\}/.exec(el)?.[1]
      return !!id && el.includes(`key={${id}}`)
    }
    const research = code('app/(dashboard)/keyword-research/page.tsx')
    const topics = code('components/content/workspace/TopicsScreen.tsx')
    check('G1: keyword research hands the opportunities a toast, and draws it (a failed decision is not silent)',
      reportsBack(research, 'GscOpportunities'))
    check('G1-MUT: the opportunities mounted without onToast fail G1',
      !reportsBack(research.replace(/\s*onToast=\{\(kind, text\) => \(kind === 'success' \? \w+\.success\(text\) : \w+\.error\(text\)\)\}/, ''), 'GscOpportunities'))
    check('G1-MUT2: a toast list the screen never draws fails G1',
      !reportsBack(research.replace(/<ToastHost [^>]*\/>/, ''), 'GscOpportunities'))
    check('G2: opportunities (keyword research) and recommendations (Topics) are keyed by their project',
      keyedByProject(research, 'GscOpportunities') && keyedByProject(topics, 'GscRecommendations'))
    check('G2-MUT: an opportunities section that outlives a project switch fails G2',
      !keyedByProject(research.replace(' key={selectedProject}', ''), 'GscOpportunities'))
    check('G2-MUT2: recommendations keyed by anything but their project fail G2',
      !keyedByProject(topics.replace('key={projectId}', 'key="recommendations"'), 'GscRecommendations'))
  }

  // ── H) switched off on the server, the screens look as they did before ──
  // Every widget renders nothing (D2); what holds them must not leave a trace either.
  console.log('\nH) switched off, the screens look as they did before Search Console fed them')
  {
    const render = (locale: Locale, node: unknown) =>
      renderToStaticMarkup(createElement(DashboardLanguageProvider, { initialLocale: locale, children: node }) as never)
    const TrackingTargetsTable = require(join(ROOT, 'components/keywords/TrackingTargetsTable.tsx')).default
    const GscRecommendations = require(join(ROOT, 'components/content/GscRecommendations.tsx')).default

    // The keywords table, the REAL component: a keyword with a volume, and one without
    // (its cell offers the retry), with no Search Console view, switched off, and on.
    const TARGETS = [
      { id: 't1', project_id: 'p1', keyword: 'running shoes', engine_type: 'google_search', avg_monthly_searches: 1234, is_active: true, notes: null, created_at: '2026-09-01T00:00:00Z' },
      { id: 't2', project_id: 'p1', keyword: 'wool socks', engine_type: 'google_search', avg_monthly_searches: null, is_active: true, notes: null, created_at: '2026-09-01T00:00:00Z' },
    ]
    const view = (state: unknown) => ({ data: state, retry: () => {} })
    const table = (locale: Locale, gscKeywords?: unknown) =>
      render(locale, createElement(TrackingTargetsTable, { targets: TARGETS, projectId: 'p1', onRetryVolumes: () => {}, gscKeywords }))
    /** The search-volume cell (the third) of every body row. */
    const volumeCells = (html: string) => html.split('<tr').filter((row) => row.includes('<td'))
      .map((row) => [...row.matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/g)][2]?.[1] ?? '')
    /** The volume alone (the number, or its dash or retry), with nothing stacked under it. */
    const bareVolume = (cell: string) => /^<(span|button)\b/.test(cell) && !/<div\b|data-gsc-/.test(cell)
    const looksAsBefore = (off: string, without: string) =>
      off === without && volumeCells(off).length === TARGETS.length && volumeCells(off).every(bareVolume)
    for (const locale of ['he', 'en'] as Locale[]) {
      const without = table(locale)
      const off = table(locale, view({ state: 'disabled' }))
      check(`H1 (${locale}) switched off, the keywords table is the table without Search Console: each volume cell is the volume alone`,
        looksAsBefore(off, without), volumeCells(off).map((c) => c.slice(0, 80)).join(' | '))
      const on = table(locale, view({ state: 'ready', data: { t1: { clicks: 1500, impressions: 34567 } } }))
      check(`H1b (${locale}) switched on, the same cells stack the Search Console box under the volume`,
        volumeCells(on).length === TARGETS.length
        && volumeCells(on).every((c) => c.startsWith('<div class="flex flex-col items-start gap-1">') && /data-gsc-keyword="(figures|none)"/.test(c)))
      if (locale === 'en') {
        const first = volumeCells(off)[0]
        check('H1-MUT: a cell that keeps its stacking column when switched off, with nothing under it, fails H1',
          !looksAsBefore(off.replace(first, `<div class="flex flex-col items-start gap-1">${first}</div>`), without))
      }
    }

    // The dashboard's tile row: one equal column per tile it has, so without the clicks
    // tile the two others share the row as they did, instead of leaving an empty third.
    const dash = code('app/(dashboard)/dashboard/page.tsx')
    const closesUp = (src: string) => {
      const at = src.indexOf('<GscClicksTile')
      const open = src.lastIndexOf('<div className="grid', at)
      const cls = open < 0 ? '' : (/^<div className="([^"]*)"/.exec(src.slice(open))?.[1] ?? '')
      return /(^|\s)sm:grid-flow-col(\s|$)/.test(cls) && /(^|\s)sm:auto-cols-fr(\s|$)/.test(cls) && !/(^|\s)sm:grid-cols-\d/.test(cls)
    }
    check('H2: the dashboard tile row has one equal column per tile, so it closes up when the clicks tile renders nothing', closesUp(dash))
    check('H2-MUT: a fixed three-column row (an empty third when switched off) fails H2',
      !closesUp(dash.replace('sm:grid-flow-col sm:auto-cols-fr', 'sm:grid-cols-3')))

    // Topics: the separator above the recommendations is the section's own, so a section
    // that renders nothing leaves no line behind.
    const topics = code('components/content/workspace/TopicsScreen.tsx')
    const SEPARATOR = 'mt-8 border-t border-line pt-6'
    const ownSeparator = (src: string) => {
      const at = src.indexOf('<GscRecommendations')
      const el = at < 0 ? '' : src.slice(at, src.indexOf('/>', at) + 2)
      const before = src.slice(0, Math.max(0, at)).replace(/\{\}\s*$/, '').trimEnd()
      return el.includes(`className="${SEPARATOR}"`) && !/<div\b[^>]*>$/.test(before)
    }
    check('H3: Topics gives the recommendations their spacing and separator as their own', ownSeparator(topics))
    check('H3-MUT: the separator back on a wrapper around them (a stray line when switched off) fails H3',
      !ownSeparator(topics.replace('<GscRecommendations', `<div className="${SEPARATOR}">\n<GscRecommendations`)))
    data.primeGscResponse(data.gscStatusUrl('p1'), { status: 404, body: { error: 'Not found' } })
    const recOff = render('en', createElement(GscRecommendations, { projectId: 'p1', className: SEPARATOR }))
    data.primeGscResponse(data.gscStatusUrl('p1'), { status: 200, body: STATUS_BODY.not_connected })
    const recOn = render('en', createElement(GscRecommendations, { projectId: 'p1', className: SEPARATOR }))
    check('H3b: …and the section draws them itself: on the section when it shows, nowhere when switched off',
      recOff === '' && new RegExp(`^<section [^>]*class="${SEPARATOR}"`).test(recOn), `${recOff.length} ${recOn.slice(0, 120)}`)
  }

  // A phone (390px) scrolled sideways on Keywords: 481px in English. In a
  // wrapping row, a `flex-1` sentence with no basis gives up all of its width,
  // so the unbreakable "Connect Search Console" button never wraps and runs past
  // the screen's edge. Measured before/after in a browser at 390px.
  console.log('\nI) on a phone, an inline notice wraps instead of running off the screen')
  {
    const inlineSentence = (src: string) => {
      const m = src.match(/<p className=\{cn\('text-sm text-muted', layout === 'inline' && '([^']*)'\)\}/)
      return m ? m[1] : null
    }
    const wraps = (cls: string | null) => !!cls && /\bflex-1\b/.test(cls) && /\bbasis-(?!0\b)[\w[\].]+/.test(cls)
    const prompt = code('components/gsc/GscSetupPrompt.tsx')
    check('I1: an inline prompt\'s sentence keeps a basis, so its button wraps under it', wraps(inlineSentence(prompt)), String(inlineSentence(prompt)))
    check('I1-MUT: the sentence without a basis is caught',
      !wraps(inlineSentence(prompt.replace(/'min-w-0 flex-1 basis-[\w[\].]+'/, "'min-w-0 flex-1'"))))

    const notice = code('components/gsc/GscKeywordFigures.tsx')
    const body = notice.slice(notice.indexOf('export function GscKeywordsNotice'), notice.indexOf('export function GscKeywordLine'))
    const beside = (src: string) => [...src.matchAll(/className="(min-w-0 flex-1[^"]*)"/g)].map((m) => m[1])
    const besideOk = (src: string) => beside(src).length === 4 && beside(src).every(wraps)
    check('I2: every part beside the Keywords notice\'s title keeps a basis, so it drops under the title on a phone', besideOk(body), beside(body).join(' | '))
    check('I2-MUT: one part without a basis is caught', !besideOk(body.replace('min-w-0 flex-1 basis-72', 'min-w-0 flex-1')))
  }

  console.log(`\n${pass} passed, ${fail} failed`)
  if (fail > 0) process.exit(1)
}

main().catch((e) => { console.error(e); process.exit(1) })

export {}
