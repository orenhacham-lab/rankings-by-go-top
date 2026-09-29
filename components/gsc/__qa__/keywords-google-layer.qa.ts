/**
 * Wave 8 — Search Console on the Keywords tab: Google's 28-day average beside our scan.
 *
 * The owner: "in Keywords I still see only live-scan positions that need a scan; I don't
 * see it using Google Search Console data." Root cause: production (main) reads no
 * Search Console on this tab at all; the integration branch showed clicks · impressions
 * in a fixed box under the search volume, a column a phone hides, with no position, no
 * date and no untracked searches. Product rule: our scan (Serper) stays the position of
 * record; Search Console is a separate layer, labelled "Google average, 28 days".
 *
 *  A) the figures: impression-weighted average position per keyword, and the searches
 *     Google shows the site for that no tracked keyword matches (engine normalization)
 *  B) GET /api/gsc/metrics?view=keywords: the new fields, owner-gated, this project's
 *     rows only, even with no keyword tracked yet; the old `keywords` field unchanged
 *  C) "Track it" is the EXISTING add-to-project route: the same plan limit (402), the
 *     same duplicate and ownership checks; only its note names where it came from
 *  D) the section and the card render: rows, show more, empty/loading, both languages,
 *     and the card never claims a connection that does not exist
 *  E) the position of record is still ours: the table's position, change and sort read
 *     our checks only; the section sits under the table, the legend over it
 *
 * Every guard has a mutation control. Run: npx tsx components/gsc/__qa__/keywords-google-layer.qa.ts
 */
/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-require-imports */

let pass = 0
let fail = 0
function check(name: string, ok: boolean, detail = '') {
  if (ok) { pass++; console.log(`  ✓ ${name}`) } else { fail++; console.log(`  ✗ ${name}${detail ? `\n      ${detail}` : ''}`) }
}

// Module seams: the session client, the service-role client and the entitlement.
let USER: { id: string } | null = { id: 'u1' }
let ADMIN: any = null
let SESSION: any = null
let ENTITLEMENT: any = null
const Module = require('module')
const origLoad = Module._load
Module._load = function (request: string, parent: any, isMain: boolean) {
  let resolved = request
  try { resolved = String(Module._resolveFilename(request, parent, isMain)) } catch { /* virtual */ }
  if (resolved.endsWith('lib/supabase/server.ts')) {
    return { createClient: async () => ({ auth: { getUser: async () => ({ data: { user: USER } }) }, from: (t: string) => (SESSION ?? ADMIN).from(t) }) }
  }
  if (resolved.endsWith('lib/supabase/admin.ts')) return { createAdminClient: () => ADMIN }
  if (resolved.endsWith('lib/subscription.ts') || resolved.endsWith('lib/subscription/index.ts')) {
    const real = origLoad.call(this, request, parent, isMain)
    return { ...real, getUserEntitlement: async () => ENTITLEMENT }
  }
  const real = origLoad.call(this, request, parent, isMain)
  if (request !== 'next/navigation') return real
  return new Proxy(real, {
    get: (t, k) => (k === 'usePathname' ? () => '/keywords'
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
const { DashboardLanguageProvider } = require('../../../lib/i18n/dashboard/useDashboardLanguage')
const { getDashboardDictionary } = require('../../../lib/i18n/dashboard/getDashboardDictionary')
const { GSC_SETUP_STATES } = require('../../../lib/gsc/widget-state') as typeof import('../../../lib/gsc/widget-state')
const TM = require('../../../lib/gsc/tab-metrics') as typeof import('../../../lib/gsc/tab-metrics')
const { normalizeQuery } = require('../../../lib/gsc/opportunities/normalize') as typeof import('../../../lib/gsc/opportunities/normalize')

type Locale = 'he' | 'en'
const ROOT = join(__dirname, '..', '..', '..')
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8')
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1')
const code = (p: string) => strip(read(p))
const HEBREW = /[֐-׿]/
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b)
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#x27;')
const text = (html: string) => html.replace(/<[^>]+>/g, ' ').replace(/&[a-z#0-9]+;/gi, ' ')

async function main() {
  console.log('Keywords tab — Google\'s 28-day average beside our scan')

  // ── A) the figures ───────────────────────────────────────────────────────
  console.log('\nA) average position weighted by impressions; untracked searches by the engine\'s normalization')
  {
    const targets = [{ id: 't1', keyword: 'Running-Shoes' }, { id: 't2', keyword: 'wool socks' }, { id: 't3', keyword: 'nothing here' }]
    const rows = [
      { query: 'running shoes', clicks: 7, impressions: 300, position: 4 },
      { query: 'Running Shoes', clicks: 1, impressions: 100, position: 10 },
      { query: 'wool socks', clicks: 0, impressions: 50, position: 20 },
      { query: 'trail sandals', clicks: 12, impressions: 2400, position: 14.2 },
      { query: 'Trail  Sandals', clicks: 0, impressions: 30, position: 30 },
      { query: 'hiking boots', clicks: 30, impressions: 900, position: 3 },
      { query: 'never seen', clicks: 0, impressions: 0, position: 0 },
    ]
    const avg = TM.keywordAverages(targets, rows)
    check('A1: a keyword\'s average position is weighted by impressions ((4×300+10×100)/400 = 5.5), clicks and impressions summed over its spellings',
      same(avg.t1, { clicks: 8, impressions: 400, position: 5.5 }) && same(avg.t2, { clicks: 0, impressions: 50, position: 20 }) && !('t3' in avg), JSON.stringify(avg))
    const unweighted = (rs: typeof rows) => { const m = rs.filter((r) => normalizeQuery(r.query) === 'running shoes'); return m.reduce((s, r) => s + r.position, 0) / m.length }
    check('A1-MUT: the plain mean of the rows (7) is not what A1 accepts', unweighted(rows) !== avg.t1.position)

    const un = TM.untrackedQueries(targets, rows, 2)
    check('A2: untracked = searches no tracked keyword matches, most impressions first, named by the most seen spelling, capped, with the full count',
      same(un.rows.map((r) => [r.query, r.impressions]), [['trail sandals', 2430], ['hiking boots', 900]]) && un.total === 2 && un.queries === 5,
      JSON.stringify(un))
    const exactOnly = (ts: typeof targets, rs: typeof rows) => {
      const tracked = new Set(ts.map((t) => t.keyword))
      return rs.filter((r) => !tracked.has(r.query) && r.impressions > 0).map((r) => r.query)
    }
    check('A2-MUT: matching by the raw text leaks a tracked keyword ("running shoes" for "Running-Shoes") that A2 rejects',
      exactOnly(targets, rows).includes('running shoes') && !un.rows.some((r) => normalizeQuery(r.query) === 'running shoes'))
    check('A3: a search with no impressions is never offered', !TM.untrackedQueries(targets, rows).rows.some((r) => r.impressions <= 0))
    check('A4: keywordFigures (keyword research reads it) is unchanged by the new figures',
      same(TM.keywordFigures(targets, rows), { t1: { clicks: 8, impressions: 400 }, t2: { clicks: 0, impressions: 50 } }))
  }

  // ── B) the route ─────────────────────────────────────────────────────────
  console.log('\nB) /api/gsc/metrics?view=keywords — the new fields, this project only')
  {
    process.env.GSC_READ_ONLY_ENABLED = 'true'
    const { GET } = require('../../../app/api/gsc/metrics/route.ts')
    const run = (id: string, project: string, startedAt: string, finishedAt: string) => ({
      id, project_id: project, window_days: 28, status: 'succeeded', start_date: '2026-08-30', end_date: '2026-09-26', started_at: startedAt, finished_at: finishedAt,
      truncated: false, latest_available_date: '2026-09-26', summary_total_clicks: 10, summary_total_impressions: 100, summary_average_position: 7, summary_aggregation_type: 'byProperty',
    })
    const m = (runId: string, project: string, query: string, page: string, clicks: number, impressions: number, position: number) =>
      ({ sync_run_id: runId, project_id: project, query, page, clicks, impressions, ctr: 0, position })
    const seed = (targets: unknown[]) => ({
      projects: [{ id: 'p1', user_id: 'u1' }, { id: 'p2', user_id: 'u2' }],
      tracking_targets: targets,
      gsc_sync_runs: [run('r1', 'p1', '2026-09-27T05:40:00Z', '2026-09-27T05:41:30Z'), run('r2', 'p2', '2026-09-27T06:00:00Z', '2026-09-27T06:01:00Z')],
      gsc_query_page_metrics: [
        m('r1', 'p1', 'running shoes', 'https://s.test/a', 7, 300, 4),
        m('r1', 'p1', 'running shoes', 'https://s.test/b', 1, 100, 10),
        m('r1', 'p1', 'trail sandals', 'https://s.test/c', 12, 2400, 14.2),
        m('r1', 'p2', 'stray foreign query', 'https://x.test/', 99, 9999, 1), // another project's row under this run id
        m('r2', 'p2', 'other shop query', 'https://x.test/', 50, 5000, 2),
      ],
    })
    const call = async (projectId = 'p1') => {
      const res: Response = await GET(new Request(`http://app.test/api/gsc/metrics?projectId=${projectId}&window=28&view=keywords`))
      return { status: res.status, body: await res.json() as any }
    }
    USER = { id: 'u1' }
    const tables = seed([{ id: 't1', project_id: 'p1', keyword: 'Running Shoes' }, { id: 'tx', project_id: 'p2', keyword: 'trail sandals' }])
    ADMIN = new FakeAdmin(tables)
    const before = JSON.stringify(tables)
    const r = await call()
    check('B1: averages per keyword, untracked searches (this project\'s rows only), counts and the sync\'s finish time',
      r.status === 200 && same(r.body.averages, { t1: { clicks: 8, impressions: 400, position: 5.5 } })
      && same(r.body.untracked.map((q: any) => q.query), ['trail sandals']) && r.body.untrackedTotal === 1 && r.body.queriesTotal === 2
      && r.body.syncedAt === '2026-09-27T05:41:30Z', JSON.stringify(r.body))
    check('B1b: another project\'s keyword ("trail sandals" is tracked in p2) does not hide it here, and p2\'s rows never show',
      !JSON.stringify(r.body).includes('stray foreign query') && !JSON.stringify(r.body).includes('other shop query'))
    check('B2: the old `keywords` field keyword research reads is exactly as before', same(r.body.keywords, { t1: { clicks: 8, impressions: 400 } }))
    check('B3: the read changed nothing', JSON.stringify(tables) === before)

    ADMIN = new FakeAdmin(seed([]))
    const empty = await call()
    check('B4: with no keyword tracked yet, the searches Google shows the site for are still offered (value before any keyword or scan)',
      empty.status === 200 && same(empty.body.untracked.map((q: any) => q.query), ['trail sandals', 'running shoes']) && same(empty.body.averages, {}), JSON.stringify(empty.body))

    const foreign = await call('p2')
    USER = null
    const anon = await call()
    USER = { id: 'u1' }
    check('B5: another user\'s project is refused (403), a signed-out request too (401)', foreign.status === 403 && anon.status === 401, `${foreign.status} ${anon.status}`)

    const route = code('app/api/gsc/metrics/route.ts')
    const kwBlock = (src: string) => src.slice(src.indexOf("if (view === 'keywords')"), src.indexOf("return Response.json({ ok: false, error: 'invalid_view' }"))
    const ownerFiltered = (src: string) => {
      const b = kwBlock(src)
      const reads = b.split('.from(').length - 1
      return reads === 2 && (b.match(/\.eq\('project_id', auth\.project\.id\)/g) ?? []).length === reads
    }
    check('B6: both reads of the keywords view are filtered by the authenticated project (the admin client bypasses RLS)', ownerFiltered(route))
    check('B6-MUT: the metrics read without its project filter fails B6',
      !ownerFiltered(route.replace(/(\.select\('query,clicks,impressions,position'\)\s*\.eq\('sync_run_id', run\.id\)\s*)\.eq\('project_id', auth\.project\.id\)/, '$1')))
    delete process.env.GSC_READ_ONLY_ENABLED
  }

  // ── C) "Track it" is the existing add route ──────────────────────────────
  console.log('\nC) "Track it" goes through the existing add-to-project route and its plan limit, unchanged')
  {
    const { POST } = require('../../../app/api/keyword-research/add-to-project/route.ts')
    const post = async (body: unknown) => {
      const res: Response = await POST(new Request('http://app.test/api/keyword-research/add-to-project', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }))
      return { status: res.status, body: await res.json() as any }
    }
    const base = () => ({
      projects: [{ id: 'p1', user_id: 'u1' }, { id: 'p2', user_id: 'u2' }],
      tracking_targets: [{ id: 'a', project_id: 'p1', keyword: 'running shoes', is_active: true }, { id: 'b', project_id: 'p1', keyword: 'wool socks', is_active: true }],
    })
    const plan = (max: number) => ({ plan: 'starter', isAdmin: false, limits: { maxKeywordsPerProject: max } })
    const body = (keyword: string, extra: Record<string, unknown> = {}) => ({ projectId: 'p1', engineType: 'google_search', language: 'he', source: 'search_console', keywords: [{ keyword }], ...extra })

    USER = { id: 'u1' }
    let t = base(); ADMIN = new FakeAdmin(t); SESSION = ADMIN; ENTITLEMENT = plan(2)
    const full = await post(body('trail sandals'))
    check('C1: at the plan\'s keyword limit, "Track it" is refused (402) and nothing is added', full.status === 402 && t.tracking_targets.length === 2, JSON.stringify(full.body))

    t = base(); ADMIN = new FakeAdmin(t); SESSION = ADMIN; ENTITLEMENT = plan(3)
    const ok = await post(body('Trail Sandals'))
    const row = t.tracking_targets.find((r: any) => r.keyword === 'trail sandals') as any
    check('C2: under the limit it adds the keyword, active, on Google search, noted as coming from Google\'s searches',
      ok.status === 200 && ok.body.added === 1 && !!row && row.is_active === true && row.engine_type === 'google_search'
      && row.user_id === 'u1' && row.notes === 'נוסף מתוך הביטויים שגוגל מציג בהם את האתר', JSON.stringify({ body: ok.body, row }))
    ENTITLEMENT = plan(10)
    const dup = await post(body('RUNNING SHOES'))
    check('C3: a keyword already tracked is not added twice', dup.status === 200 && dup.body.added === 0 && dup.body.skipped === 1)
    const plain = await post(body('hiking boots', { source: undefined }))
    const plainRow = t.tracking_targets.find((r: any) => r.keyword === 'hiking boots') as any
    check('C4: without the source, the note is keyword research\'s, as before', plain.status === 200 && plainRow?.notes === 'נוסף דרך מחקר ביטויים')

    t = base(); ADMIN = new FakeAdmin(t); SESSION = ADMIN; ENTITLEMENT = plan(99)
    const foreign = await post({ ...body('x'), projectId: 'p2' })
    check('C5: another user\'s project is refused, nothing added', foreign.status === 403 && t.tracking_targets.length === 2)

    const route = code('app/api/keyword-research/add-to-project/route.ts')
    const sourceOnlyNames = (src: string) => (src.match(/\bbody\.source\b/g) ?? []).length === 1
      && /const notes = body\.source === 'search_console' \? SEARCH_CONSOLE_NOTES : KEYWORD_RESEARCH_NOTES/.test(src)
      && /const availableSlots = entitlement\.limits\.maxKeywordsPerProject - currentKeywords/.test(src)
    check('C6: the source only picks the note; the limit is the plan\'s maxKeywordsPerProject, as before', sourceOnlyNames(route))
    check('C6-MUT: a source that also loosens the limit fails C6',
      !sourceOnlyNames(route.replace('const availableSlots = entitlement.limits.maxKeywordsPerProject - currentKeywords',
        "const availableSlots = (body.source === 'search_console' ? 999 : entitlement.limits.maxKeywordsPerProject) - currentKeywords")))

    const panel = code('components/keywords/ProjectKeywordsPanel.tsx')
    const trackCall = (src: string) => {
      const i = src.indexOf('const trackGscQuery = useCallback(')
      const b = i < 0 ? '' : src.slice(i, src.indexOf('}, [id, language', i))
      return b.includes("fetch('/api/keyword-research/add-to-project'")
        && /engineType: 'google_search', language, source: 'search_console', keywords: \[\{ keyword: query \}\]/.test(b)
        && /toasts\.error\(response\.status === 402 \? g\.quota : g\.failed\)/.test(b)
        && !/body\??\.(message|error)/.test(b)
    }
    check('C7: the panel\'s "Track it" posts to that route and shows our own words (402 → the plan limit), never the route\'s text', trackCall(panel))
    check('C7-MUT: echoing the route\'s message fails C7',
      !trackCall(panel.replace('toasts.error(response.status === 402 ? g.quota : g.failed)', 'toasts.error(body?.message ?? g.failed)')))
    SESSION = null
  }

  // ── D) the section and the card ─────────────────────────────────────────
  console.log('\nD) the section: rows, more, empty and loading; the card never claims a connection')
  {
    const render = (locale: Locale, node: unknown) =>
      renderToStaticMarkup(createElement(DashboardLanguageProvider, { initialLocale: locale, children: node }) as never)
    const List = require(join(ROOT, 'components/gsc/GscUntrackedQueries.tsx'))
    const { GscKeywordsNotice } = require(join(ROOT, 'components/gsc/GscKeywordFigures.tsx'))
    const rows = Array.from({ length: 11 }, (_, i) => ({ query: `query ${String.fromCharCode(97 + i)}`, clicks: 20 - i, impressions: 1100 - i * 100, position: 5 + i }))
    for (const locale of ['he', 'en'] as Locale[]) {
      const g = getDashboardDictionary(locale).gscWidgets
      const html = render(locale, createElement(List.default, { loading: false, insights: { untracked: rows, untrackedTotal: 40, queriesTotal: 60 }, onTrack: async () => 'added' }))
      const items = (html.match(/<li\b/g) ?? []).length
      check(`D1 (${locale}) the first ${List.UNTRACKED_VISIBLE} searches, each with "${g.untracked.add}", then "show more" and "top N of M"`,
        items === List.UNTRACKED_VISIBLE && (html.match(new RegExp(esc(g.untracked.add), 'g')) ?? []).length === List.UNTRACKED_VISIBLE
        && html.includes(esc(g.untracked.more('3'))) && html.includes(esc(g.untracked.shownOf('8', '40'))) && !html.includes('query i'),
        `${items}`)
      const all = render(locale, createElement(List.default, { loading: false, insights: { untracked: [], untrackedTotal: 0, queriesTotal: 12 } }))
      const none = render(locale, createElement(List.default, { loading: false, insights: { untracked: [], untrackedTotal: 0, queriesTotal: 0 } }))
      check(`D2 (${locale}) empty says why: all tracked vs. Google has shown the site for nothing yet`,
        all.includes(esc(g.untracked.emptyAllTracked)) && none.includes(esc(g.untracked.emptyNone)) && !/(^|\s)0(\s|$)/.test(text(all + none)))
      const loading = render(locale, createElement(List.default, { loading: true, insights: null }))
      check(`D3 (${locale}) loading: placeholders, busy, no number and nothing to press`,
        loading.includes('aria-busy="true"') && loading.includes(esc(g.untracked.loading)) && !/<button\b/.test(loading) && !/\d/.test(text(loading)))
      if (locale === 'he') check('D4 (he) the section is Hebrew', HEBREW.test(text(html)))
      else check('D4 (en) no Hebrew in English', !HEBREW.test(html))

      // The card, per setup state: its own title, one link to settings, nothing that says
      // "connected" when there is no connection.
      const view = (state: string) => ({ data: { state }, retry: () => {} })
      const cards = GSC_SETUP_STATES.map((state) => render(locale, createElement(GscKeywordsNotice, { projectId: 'p1', view: view(state) })))
      const claims = (html: string) => (locale === 'he' ? /מחובר(?!\s*מחדש)|החיבור קיים/ : /\bis connected\b|\bconnected\b(?! again)/i).test(text(html))
      check(`D5 (${locale}) not connected, the card does not claim a connection; every state names its missing step`,
        !claims(cards[0]) && cards.every((html, i) => html.includes(esc(g.connect.titles[GSC_SETUP_STATES[i]])) && html.includes(esc(g.actions[GSC_SETUP_STATES[i]]))
          && (html.match(/<a\b/g) ?? []).length === 1 && !/<button\b/.test(html)))
      check(`D5-MUT (${locale}) a "connected" title on the not-connected card fails D5`,
        claims(cards[0].replace(esc(g.connect.titles.not_connected), locale === 'he' ? 'Search Console מחובר' : 'Search Console is connected')))
    }
  }

  // ── E) our position stays the position of record ────────────────────────
  console.log('\nE) the table\'s position, change and sort read our checks only; the section sits under the table')
  {
    const table = code('components/keywords/TrackingTargetsTable.tsx')
    const oursOnly = (src: string) => /sortTargetsByPosition\(targets, latestResults\)/.test(src)
      && /<PositionChip position=\{result\.position\} found=\{result\.found\}/.test(src)
      && !/\.averages\b|data\.data\b/.test(src)
    check('E1: the position column, its sort and its change come from our checks; Google\'s average is never read by the table', oursOnly(table))
    check('E1-MUT: a position chip fed by Google\'s average fails E1',
      !oursOnly(table.replace('<PositionChip position={result.position}', '<PositionChip position={gscKeywords?.data.state === \'ready\' ? gscKeywords.data.data.averages[target.id]?.position ?? result.position : result.position}')))
    const panel = code('components/keywords/ProjectKeywordsPanel.tsx')
    const placed = (src: string) => {
      const legend = src.indexOf('<GscKeywordsLegend view={gscKeywords}')
      const tbl = src.indexOf('<TrackingTargetsTable')
      const notice = src.indexOf('<GscKeywordsNotice projectId={id} view={gscKeywords} onTrack={trackGscQuery}')
      return legend > 0 && tbl > legend && notice > tbl && src.indexOf('useGscKeywordInsights(id, targetsKey)') > 0
    }
    check('E2: the legend (label and sync date) over the table, the searches section under it, both from one read', placed(panel))
    check('E2-MUT: the section moved above the table fails E2',
      !placed(panel.replace('<GscKeywordsNotice projectId={id} view={gscKeywords} onTrack={trackGscQuery} className="mt-6" />', '')
        .replace('<GscKeywordsLegend view={gscKeywords}', '<GscKeywordsNotice projectId={id} view={gscKeywords} onTrack={trackGscQuery} /><GscKeywordsLegend view={gscKeywords}')))
    // Measured at 390px: a line that cannot wrap widened the keyword column from 120 to
    // 238px and pushed the table 118px past the phone's edge. Every part wraps on its own
    // on a phone; the groups hold together only from `sm` up.
    const fig = code('components/gsc/GscKeywordFigures.tsx')
    const lineBody = (src: string) => src.slice(src.indexOf('export function GscGoogleAverage'), src.indexOf('export function GscKeywordsLegend'))
    const phoneWraps = (src: string) => {
      const b = lineBody(src)
      const groups = [...b.matchAll(/<span className="(inline-flex[^"]*)" aria-hidden="true"/g)].map((mm) => mm[1])
      return groups.length >= 3 && groups.every((c) => !/(^|\s)whitespace-nowrap(\s|$)/.test(c)) && /flex-wrap/.test(b)
    }
    check('E4: on a phone every part of the Google line wraps on its own (no group forced onto one line)', phoneWraps(fig))
    check('E4-MUT: the figures held on one line on a phone too fails E4',
      !phoneWraps(fig.replace('inline-flex flex-wrap items-center gap-x-2 gap-y-0.5 tabular-nums sm:flex-nowrap', 'inline-flex items-center gap-x-2 whitespace-nowrap tabular-nums')))
    const he = getDashboardDictionary('he').gscWidgets
    const en = getDashboardDictionary('en').gscWidgets
    check('E3: the label is exactly "ממוצע גוגל, 28 ימים" / "Google average, 28 days"',
      he.googleAverage.label === 'ממוצע גוגל, 28 ימים' && en.googleAverage.label === 'Google average, 28 days')
  }

  console.log(`\n${pass} passed, ${fail} failed`)
  if (fail > 0) process.exit(1)
}

main().catch((e) => { console.error(e); process.exit(1) })

export {}
