/**
 * The research tab's competitive view: the share math, the source labels, the dedupe
 * of our check's keywords with Search Console's queries, the keyword → page map, the
 * view's states, and the route's owner filters.
 *
 *   S  share of visibility = Σ monthly searches × CTR(position), per site, over the
 *      SAME keywords for every site (those whose latest check recorded the competitors)
 *   B  who is ahead per keyword, and per competitor
 *   D  one row per keyword whatever the number of sources (normalized text)
 *   M  the page behind each keyword; "competing" and "no page" only on evidence
 *   L  every ranking figure carries ONE label of its source, and the two differ
 *   V  never a flash of the wrong state: a skeleton until both answers are in
 *   R  GET /api/keyword-research/competitive reads the owner's project only
 *
 * Mutation controls on the real files: lib/keyword-research/__qa__/competitive-mutations.mjs.
 *
 * Run: npx tsx lib/keyword-research/__qa__/competitive.qa.ts
 */
/* eslint-disable @typescript-eslint/no-require-imports, @typescript-eslint/no-explicit-any */
import { readFileSync } from 'fs'
import { join } from 'path'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import {
  buildCompetitiveModel, ctrAt, CTR_BY_POSITION, gscQueries, isCompeting, rankingKey,
  type CompetitiveInput, type CompetitiveTarget, type GscQueryPageRow,
} from '../competitive'
import { handleCompetitiveGet, type CompetitiveRouteDeps } from '../competitive-route'
import { competitiveScreen, filterMapping, filterRankings, mappingFlagKey } from '../../../components/keyword-research/competitive/competitive-view'
import { FakeAdmin } from '../../__qa__/_fake-admin'
import type { CompetitorPositionRow } from '../../competitors/comparison'

let pass = 0, fail = 0
function check(name: string, cond: boolean, detail?: string) {
  if (cond) { pass++; console.log(`  ✓ ${name}`) } else { fail++; console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`) }
}
const ROOT = join(__dirname, '..', '..', '..')
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\{\/\*[\s\S]*?\*\/\}/g, '').replace(/(^|[^:'"`\\])\/\/.*$/gm, '$1')
const src = (rel: string) => strip(readFileSync(join(ROOT, rel), 'utf8'))
const near = (a: number, b: number, eps = 1e-6) => Math.abs(a - b) < eps

const AT = '2026-09-21T03:03:30.000Z'
const EARLIER = '2026-09-14T03:03:30.000Z'
const target = (id: string, keyword: string, volume: number | null, position: number | null, at: string | null = AT, url: string | null = null): CompetitiveTarget =>
  ({ id, keyword, volume, check: at ? { checkedAt: at, found: position != null, position, url } : null })
const pos = (targetId: string, domain: string, position: number | null, at = AT): CompetitorPositionRow =>
  ({ tracking_target_id: targetId, competitor_domain: domain, position, url: position ? `https://${domain}/` : null, checked_at: at })
const COMPETITORS = [{ name: 'A', domain: 'a.co.il' }, { name: 'B', domain: 'b.co.il' }]

async function main() {
  // ── S) the share math ────────────────────────────────────────────────────
  console.log('\nS) share of visibility')
  {
    const monotone = CTR_BY_POSITION.every((v, i) => i === 0 || v <= CTR_BY_POSITION[i - 1])
    check('S1: the CTR curve covers 1-20, never rises, and is 0 outside the top 20 or without a position',
      CTR_BY_POSITION.length === 20 && monotone && ctrAt(1) === 0.28 && ctrAt(10) === 0.023 && ctrAt(21) === 0 && ctrAt(0) === 0 && ctrAt(null) === 0 && ctrAt(2.5) === 0)

    // k1: 1000/mo, you 1, A 3, B out.  k2: 500/mo, you out, A 1, B 10.
    const input: CompetitiveInput = {
      ownDomain: 'mine.co.il',
      targets: [target('t1', 'ביטוי אחד', 1000, 1), target('t2', 'ביטוי שתיים', 500, null)],
      competitors: COMPETITORS,
      rows: [pos('t1', 'a.co.il', 3), pos('t1', 'b.co.il', null), pos('t2', 'a.co.il', 1), pos('t2', 'b.co.il', 10)],
      gsc: null,
    }
    const m = buildCompetitiveModel(input)
    const s = m.share!
    const [own, a, b] = s.sites
    const total = 280 + 250 + 11.5
    check('S2: estimated clicks = Σ searches × CTR(position): you 280, A 1000×11% + 500×28% = 250, B 500×2.3% ≈ 12',
      own.own && own.clicks === 280 && a.domain === 'a.co.il' && a.clicks === 250 && b.domain === 'b.co.il' && b.clicks === 12,
      JSON.stringify(s.sites.map((x) => [x.domain, x.clicks])))
    check('S3: shares are each site\'s part of the total and add up to 100%',
      near(own.share, 280 / total) && near(a.share, 250 / total) && near(b.share, 11.5 / total) && near(s.sites.reduce((n, x) => n + x.share, 0), 1))
    check('S4: average position counts only the keywords a site ranks on, with the "of N" beside it',
      own.avgPosition === 1 && own.ranked === 1 && a.avgPosition === 2 && a.ranked === 2 && b.avgPosition === 10 && b.ranked === 1 && s.keywords === 2 && s.weighted === 2)

    // t3 was checked before the competitors were added: none of its rows are of that check.
    const m2 = buildCompetitiveModel({
      ...input,
      targets: [...input.targets, target('t3', 'ביטוי שלוש', 9000, 1, EARLIER)],
      rows: [...input.rows, pos('t3', 'a.co.il', 2)],
    })
    check('S5: a keyword whose check did not record the competitors (rows of another day) is left out for every site',
      m2.share!.keywords === 2 && m2.share!.sites[0].clicks === 280 && m2.battles.every((x) => x.targetId !== 't3'))

    const m3 = buildCompetitiveModel({ ...input, targets: [target('t1', 'ביטוי אחד', null, 1), target('t2', 'ביטוי שתיים', 0, null)] })
    check('S6: keywords without a search volume weigh nothing and are counted apart (no invented share)',
      m3.share!.weighted === 0 && m3.share!.sites.every((x) => x.clicks === 0 && x.share === 0) && m3.share!.keywords === 2)

    const none = buildCompetitiveModel({ ...input, competitors: [], rows: [] })
    const notRec = buildCompetitiveModel({ ...input, rows: [] })
    check('S7: no competitors → no share; competitors with nothing recorded → "not recorded", never a 0% share',
      none.competitorsState === 'none' && none.share === null && notRec.competitorsState === 'not_recorded' && notRec.share === null)
    check('MUTATION CONTROL: weighting by searches alone (no CTR) would give A 1,500, not 250',
      1000 + 500 !== a.clicks)
  }

  // ── B) who is ahead ─────────────────────────────────────────────────────
  console.log('\nB) who is ahead, per keyword and per competitor')
  {
    const m = buildCompetitiveModel({
      ownDomain: 'mine.co.il',
      targets: [target('w', 'win', 100, 2), target('l', 'loss', 100, 8), target('o', 'out', 100, null), target('n', 'nobody', 100, null)],
      competitors: COMPETITORS,
      rows: [pos('w', 'a.co.il', 5), pos('w', 'b.co.il', null), pos('l', 'a.co.il', 3), pos('l', 'b.co.il', 12),
        pos('o', 'a.co.il', null), pos('o', 'b.co.il', 4), pos('n', 'a.co.il', null), pos('n', 'b.co.il', null)],
      gsc: null,
    })
    const by = new Map(m.battles.map((b) => [b.targetId, b]))
    check('B1: ahead of every competitor → win; one competitor above → loss; you out and one in → loss; nobody → none',
      by.get('w')!.outcome === 'win' && by.get('l')!.outcome === 'loss' && by.get('o')!.outcome === 'loss' && by.get('n')!.outcome === 'none'
      && m.counts.wins === 1 && m.counts.losses === 2 && m.counts.none === 1)
    const a = m.records.find((r) => r.domain === 'a.co.il')!, b = m.records.find((r) => r.domain === 'b.co.il')!
    check('B2: per competitor, "you ahead" counts a competitor below you or outside the top 20 while you rank',
      a.wins === 1 && a.losses === 1 && a.compared === 4 && b.wins === 2 && b.losses === 1, JSON.stringify(m.records))
    check('B3: losses first in the table (what needs work), and the best competitor is named with its position',
      m.battles[0].outcome === 'loss' && by.get('l')!.best?.domain === 'a.co.il' && by.get('l')!.best?.position === 3)
  }

  // ── D) dedupe ───────────────────────────────────────────────────────────
  console.log('\nD) one row per keyword')
  {
    const gsc: GscQueryPageRow[] = [
      { query: 'אינסטלטור בתל-אביב', page: 'https://x.co.il/', clicks: 10, impressions: 100, position: 4 },
      { query: 'אינסטלטור  בתל אביב', page: 'https://x.co.il/tlv', clicks: 5, impressions: 300, position: 8 },
      { query: 'Leak Detection', page: 'https://x.co.il/leak', clicks: 3, impressions: 50, position: 12 },
      { query: 'leak detection', page: 'https://x.co.il/leak', clicks: 1, impressions: 50, position: 14 },
    ]
    const m = buildCompetitiveModel({
      ownDomain: 'x.co.il',
      targets: [target('t1', 'אינסטלטור בתל אביב', 2400, 6), target('t1b', 'אינסטלטור בתל אביב ', 2400, 9, EARLIER)],
      competitors: [], rows: [], gsc,
    })
    const tlv = m.rankings.filter((r) => r.key === rankingKey('אינסטלטור בתל אביב'))
    check('D1: a tracked keyword and its Search Console query (punctuation / spacing apart) are ONE row with both numbers',
      tlv.length === 1 && tlv[0].scan?.position === 6 && tlv[0].gsc !== null && tlv[0].gsc.impressions === 400, JSON.stringify(m.rankings))
    check('D2: two tracked targets of the same keyword → one row, from the latest check', tlv[0].scan?.targetId === 't1' && m.rankingCounts.tracked === 1)
    const leak = m.rankings.filter((r) => r.key === 'leak detection')
    check('D3: Search Console queries that differ only in case are merged: summed clicks and impressions, impression-weighted position',
      leak.length === 1 && leak[0].gsc!.clicks === 4 && leak[0].gsc!.impressions === 100 && leak[0].gsc!.position === 13 && leak[0].scan === null)
    check('D4: counts: 2 rows, 1 tracked, 1 only from Search Console; the filters split them without overlap',
      m.rankingCounts.all === 2 && m.rankingCounts.gscOnly === 1 && filterRankings(m.rankings, 'tracked').length === 1 && filterRankings(m.rankings, 'gsc').length === 1
      && filterRankings(m.rankings, 'all').length === 2)
    check('D5: the tlv query\'s weighted position is (4×100 + 8×300) / 400 = 7', tlv[0].gsc!.position === 7)
    check('MUTATION CONTROL: keyed by raw text, the two spellings would be two rows',
      new Set(gsc.map((g) => g.query)).size === 4 && gscQueries(gsc).length === 2)
  }

  // ── M) mapping ──────────────────────────────────────────────────────────
  console.log('\nM) the page behind each keyword')
  {
    const split: GscQueryPageRow[] = [
      { query: 'דוד שמש', page: 'https://x.co.il/a', clicks: 5, impressions: 60, position: 5 },
      { query: 'דוד שמש', page: 'https://x.co.il/b', clicks: 3, impressions: 40, position: 9 },
      { query: 'סתימה', page: 'https://x.co.il/c', clicks: 9, impressions: 95, position: 3 },
      { query: 'סתימה', page: 'https://x.co.il/d', clicks: 0, impressions: 5, position: 40 },
    ]
    const q = gscQueries(split)
    const boiler = q.find((x) => x.key === 'דוד שמש')!, clog = q.find((x) => x.key === 'סתימה')!
    check('M1: two pages each with ≥15% of a query\'s impressions compete; a 5% stray page does not', isCompeting(boiler) && !isCompeting(clog))
    check('M1b: below 20 impressions nothing competes (one stray view must not decide)',
      !isCompeting({ impressions: 10, pages: [{ url: 'a', impressions: 5, clicks: 0, share: 0.5 }, { url: 'b', impressions: 5, clicks: 0, share: 0.5 }] }))
    const withGsc = buildCompetitiveModel({
      ownDomain: 'x.co.il', competitors: [], rows: [], gsc: split,
      targets: [target('t1', 'דוד שמש', 1600, 7), target('t2', 'איתור נזילות', 3600, null), target('t3', 'לא נבדק', 100, null, null), target('t4', 'עם כתובת', 100, 4, AT, 'https://x.co.il/services')],
    })
    const row = (k: string) => withGsc.mapping.find((r) => r.keyword === k)!
    check('M2: a keyword Search Console shows on two pages is "competing", from Search Console, with both pages',
      row('דוד שמש').flag === 'competing' && row('דוד שמש').source === 'gsc' && row('דוד שמש').pages.length === 2)
    check('M3: "no page" only on evidence: checked and not in the top 20 → no page (Search Console confirms); never checked → unknown',
      row('איתור נזילות').flag === 'no_page' && row('איתור נזילות').confirmedByGsc && mappingFlagKey(row('איתור נזילות')) === 'no_page'
      && row('לא נבדק').flag === 'unknown')
    check('M4: without Search Console data our check\'s ranking URL is the page, labelled as ours', row('עם כתובת').source === 'scan' && row('עם כתובת').pages[0].url === 'https://x.co.il/services')
    const noGsc = buildCompetitiveModel({ ownDomain: 'x.co.il', competitors: [], rows: [], gsc: null, targets: [target('t2', 'איתור נזילות', 3600, null)] })
    check('M5: without Search Console, "no page" is said as "none in the top 20", not "no page on Google"',
      mappingFlagKey(noGsc.mapping[0]) === 'no_page_top20')
    check('M6: the filters: no page / competing', filterMapping(withGsc.mapping, 'competing').length === withGsc.mappingCounts.competing && withGsc.mappingCounts.competing >= 1
      && filterMapping(withGsc.mapping, 'no_page').length === withGsc.mappingCounts.noPage)
  }

  // ── L) the source labels ────────────────────────────────────────────────
  console.log('\nL) one label of its source per figure')
  {
    const { dashboardHe } = require('../../i18n/dashboard/he')
    const { dashboardEn } = require('../../i18n/dashboard/en')
    const he = dashboardHe.researchCompetitive, en = dashboardEn.researchCompetitive
    check('L1: Hebrew labels: our check says "הבדיקה שלנו" and its date; Search Console says Search Console and 28 days; they share no word',
      he.source.scan('21 בספט׳ 2026').includes('הבדיקה שלנו') && he.source.scan('X').includes('X') && he.source.gsc.includes('Search Console') && he.source.gsc.includes('28')
      && !he.source.gsc.includes('הבדיקה שלנו') && !he.source.scan('X').includes('Search Console'))
    check('L2: English labels likewise', en.source.scan('X').startsWith('Our check') && en.source.gsc.includes('Search Console') && !en.source.gsc.includes('Our check'))
    check('L3: the method of the share is one plain line in both languages, naming the searches × click rate estimate',
      /חיפושים בחודש × אחוז ההקלקה/.test(he.share.method) && /monthly searches × the average click rate/.test(en.share.method))

    const { DashboardLanguageProvider } = require('../../i18n/dashboard/useDashboardLanguage')
    const Rankings = require('../../../components/keyword-research/competitive/ExistingRankings').default
    const model = buildCompetitiveModel({
      ownDomain: 'x.co.il', competitors: [], rows: [],
      gsc: [{ query: 'גוגל בלבד', page: 'https://x.co.il/g', clicks: 3, impressions: 90, position: 6.4 }, { query: 'שניהם', page: 'https://x.co.il/b', clicks: 1, impressions: 50, position: 9 }],
      targets: [target('t1', 'שניהם', 100, 5)],
    })
    const render = (gsc: string) => renderToStaticMarkup(createElement(DashboardLanguageProvider, { initialLocale: 'he' },
      createElement(Rankings, { model, gsc, gscRun: { startDate: '2026-08-24', endDate: '2026-09-20' }, projectId: 'p1', onTrack() {}, tracking: new Set(), justTracked: new Set() })))
    const html = render('ready')
    const head = html.slice(html.indexOf('<thead'), html.indexOf('</thead>'))
    check('L4: the position columns are labelled once each in the header: exact = our check, average = Search Console',
      (head.match(/data-source="scan"/g) ?? []).length === 1 && (head.match(/data-source="gsc"/g) ?? []).length === 1
      && head.indexOf('data-source="scan"') < head.indexOf('data-source="gsc"'), head.slice(0, 400))
    check('L5: every figure carries its source on its own too (the value\'s title; the stacked phone label)',
      html.includes(`title="${he.source.gsc}"`) && html.includes(`data-label="${he.rankings.colScan} · ${he.source.scanShort}"`) && html.includes(`data-label="${he.rankings.colGsc} · ${he.source.gscShort}"`)
      && /title="הבדיקה שלנו · /.test(html))
    check('L6: a query only Search Console knows offers "track precisely"; a tracked one says it is tracked',
      (html.match(/data-track-precisely/g) ?? []).length === 1 && (html.match(/data-ranking-tracked/g) ?? []).length === 1)
    const off = render('not_connected')
    check('L7: without Search Console: its column is gone, and one sentence with one connect button takes its place',
      !/data-source="gsc"/.test(off.slice(off.indexOf('<thead'), off.indexOf('</thead>'))) && off.includes('data-competitive-gsc="not_connected"') && off.includes(he.rankings.gscAbout))
    const standing = src('components/keyword-research/competitive/CompetitorStanding.tsx')
    check('L8: the share and the ahead/behind tiles are labelled as our check (never unlabelled)',
      /<SourceTag source="scan" date=\{date\} \/>/.test(standing) && /source=\{source\}/.test(standing) && /const source = dict\.source\.scan\(date\)/.test(standing))
  }

  // ── V) the view's states ────────────────────────────────────────────────
  console.log('\nV) never a flash of the wrong state')
  {
    const data: any = { ok: true, ownDomain: 'x', gscEnabled: true, gscRun: null, competitorsManageable: true, competitorDomains: [], model: buildCompetitiveModel({ ownDomain: 'x', targets: [], competitors: [], rows: [], gsc: null }) }
    check('V1: while Search Console\'s status is on its way, the view is loading (no "connect" flash)',
      competitiveScreen({ state: 'ready', data }, { state: 'loading' }).state === 'loading')
    check('V2: while the route is on its way, loading, whatever Search Console says', competitiveScreen({ state: 'loading' }, { state: 'not_connected' }).state === 'loading')
    check('V3: a failed read is an error (with its retry), never an empty state',
      competitiveScreen({ state: 'error' }, { state: 'ready', summary: null }).state === 'error' && competitiveScreen({ state: 'ready', data }, { state: 'error' }).state === 'error')
    const off = competitiveScreen({ state: 'ready', data: { ...data, gscEnabled: false } }, { state: 'loading' })
    check('V4: Search Console switched off on the server: ready at once, with no prompt to connect', off.state === 'ready' && off.gsc === 'disabled')
    const synced = competitiveScreen({ state: 'ready', data }, { state: 'ready', summary: null })
    const withRun = competitiveScreen({ state: 'ready', data: { ...data, gscRun: { startDate: 'a', endDate: 'b' } } }, { state: 'ready', summary: null })
    check('V5: connected with no sync yet → "never synced"; with a sync → ready; not connected → its setup state',
      synced.state === 'ready' && synced.gsc === 'never_synced' && withRun.state === 'ready' && withRun.gsc === 'ready'
      && (competitiveScreen({ state: 'ready', data }, { state: 'not_connected' }) as any).gsc === 'not_connected')
  }

  // ── R) the route ────────────────────────────────────────────────────────
  console.log('\nR) the route reads the owner\'s project only')
  {
    const U = 'user-1', P = 'proj-1', OTHER_U = 'user-2', OTHER_P = 'proj-2'
    const seed = () => new FakeAdmin({
      projects: [{ id: P, user_id: U, target_domain: 'mine.co.il' }, { id: OTHER_P, user_id: OTHER_U, target_domain: 'theirs.co.il' }],
      tracking_targets: [
        { id: 't1', project_id: P, keyword: 'ביטוי', engine_type: 'google_search', avg_monthly_searches: 1000, is_active: true },
        { id: 't-maps', project_id: P, keyword: 'ביטוי', engine_type: 'google_maps', avg_monthly_searches: 1000, is_active: true },
        { id: 'tx', project_id: OTHER_P, keyword: 'זר', engine_type: 'google_search', avg_monthly_searches: 50, is_active: true },
      ],
      scan_results: [
        { tracking_target_id: 't1', found: true, position: 4, result_url: 'https://mine.co.il/p', checked_at: AT },
        { tracking_target_id: 't1', found: true, position: 9, result_url: 'https://mine.co.il/p', checked_at: EARLIER },
      ],
      ai_visibility_competitors: [
        { project_id: P, user_id: U, name: 'A', domain: 'a.co.il', is_active: true },
        { project_id: P, user_id: U, name: 'Old', domain: 'old.co.il', is_active: false },
      ],
      keyword_competitor_positions: [
        // A row forged under another owner for the same target must never be read (it comes first, so it would win).
        { project_id: P, user_id: OTHER_U, tracking_target_id: 't1', competitor_domain: 'a.co.il', position: 1, url: 'https://a.co.il/x', checked_at: AT },
        { project_id: P, user_id: U, tracking_target_id: 't1', competitor_domain: 'a.co.il', position: 2, url: 'https://a.co.il/', checked_at: AT },
      ],
      gsc_sync_runs: [
        { id: 'run-1', project_id: P, window_days: 28, status: 'succeeded', start_date: '2026-08-24', end_date: '2026-09-20', started_at: AT },
        { id: 'run-x', project_id: OTHER_P, window_days: 28, status: 'succeeded', start_date: '2026-08-24', end_date: '2026-09-20', started_at: AT },
      ],
      gsc_query_page_metrics: [
        { sync_run_id: 'run-1', project_id: P, query: 'ביטוי', page: 'https://mine.co.il/p', clicks: 5, impressions: 200, position: 5.5 },
        { sync_run_id: 'run-1', project_id: P, query: 'רק בגוגל', page: 'https://mine.co.il/g', clicks: 1, impressions: 40, position: 11 },
        // Another project's row filed under this run id must never be read.
        { sync_run_id: 'run-1', project_id: OTHER_P, query: 'סוד של אחרים', page: 'https://theirs.co.il/', clicks: 99, impressions: 9999, position: 1 },
      ],
    })
    const deps = (admin: any, userId: string | null = U, gsc = true): CompetitiveRouteDeps =>
      ({ session: async () => ({ userId }), admin: () => admin, gscEnabled: () => gsc, competitorsManageable: () => true })
    const get = async (admin: any, projectId = P, userId: string | null = U, gsc = true) => {
      const res = await handleCompetitiveGet(new Request(`http://x/api/keyword-research/competitive?projectId=${projectId}`), deps(admin, userId, gsc))
      return { status: res.status, body: await res.json() as any }
    }
    const anon = await get(seed(), P, null)
    const foreign = await get(seed(), OTHER_P)
    check('R1: no session → 401; another user\'s project → 404, nothing read', anon.status === 401 && foreign.status === 404 && !JSON.stringify(foreign.body).includes('זר'))
    const ok = await get(seed())
    const m = ok.body.model
    check('R2: the owner gets the model: organic keywords only (Maps is another page), from the latest check',
      ok.status === 200 && m.rankingCounts.tracked === 1 && m.rankings.find((r: any) => r.scan)?.scan.position === 4, JSON.stringify(m.rankings))
    check('R3: competitor rows are read for this owner only (a forged row of another owner is ignored); inactive competitors are not compared',
      m.battles.length === 1 && m.battles[0].best?.position === 2 && ok.body.competitorDomains.join() === 'a.co.il')
    check('R4: Search Console rows are this project\'s only, from its latest 28-day sync',
      !JSON.stringify(m).includes('סוד של אחרים') && m.rankingCounts.gscOnly === 1 && ok.body.gscRun?.endDate === '2026-09-20')
    const noGsc = await get(seed(), P, U, false)
    check('R5: Search Console switched off → no Search Console read and no figures', noGsc.status === 200 && noGsc.body.gscEnabled === false && noGsc.body.model.rankingCounts.gscOnly === 0 && noGsc.body.gscRun === null)
    const broken = new FakeAdmin((seed() as any).tables, { scan_results: { select: () => ({ code: 'XX000', message: 'relation "secret" leaked' }) } })
    const err = await get(broken)
    check('R6: a failed read answers 500 with a code only (nothing the database said)', err.status === 500 && err.body.error === 'read_failed' && !JSON.stringify(err.body).includes('secret'))
    const route = src('lib/keyword-research/competitive-route.ts')
    check('R7: every admin read of the route is scoped: projects by owner, targets / positions / Search Console by project',
      /from\('projects'\)[\s\S]{0,120}\.eq\('user_id', userId\)/.test(route)
      && /from\('keyword_competitor_positions'\)[\s\S]{0,200}\.eq\('project_id', projectId\)\s*\.eq\('user_id', userId\)/.test(route)
      && /from\('gsc_query_page_metrics'\)[\s\S]{0,200}\.eq\('project_id', projectId\)/.test(route)
      && /from\('ai_visibility_competitors'\)[\s\S]{0,200}\.eq\('user_id', userId\)/.test(route))
    const page = src('app/(dashboard)/keyword-research/page.tsx')
    // Mounted in the landscape's own slot: a new sibling slot would shift React's ids on the
    // screen without a scan, which legacy-screen.qa.ts holds byte for byte.
    const mountsOnce = (p: string) => (p.match(/<CompetitiveResearch\b/g) ?? []).length === 1
      && /\{landscapeOn && scanOn\?\.kind === 'seeded' && activeProjectId && \(\s*<>\s*<ResearchLandscape\b[^>]*\/>\s*<CompetitiveResearch\b/.test(p)
    check('R8: the research page mounts the section once, in the landscape\'s slot, with the scan\'s research on screen', mountsOnce(page))
    check('R8-MUT: a mount in a slot of its own fails R8', !mountsOnce(page.replace(/<CompetitiveResearch\b/, '</>)}\n      {landscapeOn && (<CompetitiveResearch')))
  }

  console.log(`\n${pass} passed, ${fail} failed`)
  if (fail > 0) process.exit(1)
}

main().catch((e) => { console.error(e); console.log(`\n${pass} passed, ${fail + 1} failed`); process.exit(1) })
export {}
