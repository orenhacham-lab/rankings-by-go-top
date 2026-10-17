/**
 * The automatic monthly report.
 *
 *  A) aggregation: fixed rows in, exact figures out (rank moves, first page,
 *     articles per channel, AI answers, the Search Console window, the plan);
 *  I) idempotency: a month is made once; re-running it, from the owner or the
 *     cron, never duplicates or rewrites it; the cron is bounded per run;
 *  O) every service-role read filters by the project and its owner, and a row of
 *     another owner never reaches a report; the routes refuse non-owners;
 *  C) the cron fails closed without CRON_SECRET and is wired and scheduled
 *     away from the other crons;
 *  E) an empty month still renders, and every section says why it is empty;
 *  M) the weekly email switch defaults OFF, and the monthly report itself still
 *     reaches no provider (the weekly sender lives in lib/reports/weekly);
 *  P) no provider or model is reached, and nothing Shopify is touched.
 *
 * Every check has a mutation control. Handlers run against FakeAdmin (real filter
 * semantics) through injected dependencies. Run:
 *   npx tsx lib/reports/monthly/__qa__/monthly-report.qa.ts
 */
import { readFileSync, readdirSync, statSync } from 'fs'
import { join, relative } from 'path'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { FakeAdmin } from '../../../__qa__/_fake-admin'
import { authorizeCronRequest } from '../../../auth/cron'
import {
  aggregateArticles, aggregateAi, aggregateGsc, aggregateMonth, aggregatePlan, aggregateRankings,
  type ArticleRow, type CheckRow, type MonthInputs, type TargetRow,
} from '../aggregate'
import { generateMonthlyReport, runMonthlyReportCron, reportableMonth } from '../generate'
import {
  handleMonthlyCron, handleMonthlyGenerate, handleMonthlyGet, handleMonthlyPdf, handlePreferencesGet, handlePreferencesPut,
  type MonthlyCronDeps, type MonthlyRouteDeps,
} from '../http'
import { lastCompleteMonth, monthRange, nextReportAt, periodMonthOf } from '../period'
import { insertReport, loadMonthInputs, readPreferences, type OwnedProject } from '../store'
import type { MonthlyReportData } from '../types'
import { generateMonthlyReportHTML, monthlyReportFileName } from '../pdf'
import MonthlyReportView from '../../../../components/reports/monthly/MonthlyReportView'
import { MonthlyReportsBody } from '../../../../components/reports/monthly/MonthlyReports'
import { MonthlyTeaserBody } from '../../../../components/reports/monthly/MonthlyReportTeaser'
import { WeeklyEmailSwitch } from '../../../../components/reports/monthly/WeeklyEmailCard'
import { monthlyCopy } from '../../../../components/reports/monthly/copy'

let pass = 0, fail = 0
function check(name: string, cond: boolean, detail?: string) {
  if (cond) { pass++; console.log(`  ✓ ${name}`) } else { fail++; console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`) }
}
const ROOT = join(__dirname, '..', '..', '..', '..')
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8')
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\{\/\*[\s\S]*?\*\/\}/g, '').replace(/(^|[^:'"`])\/\/.*$/gm, '$1')

// Every fetch made during this suite is recorded: the report must reach nothing.
const fetched: string[] = []
globalThis.fetch = (async (input: unknown) => { fetched.push(String(input)); throw new Error('network is not allowed in this suite') }) as typeof fetch

const OWNER = 'u-owner', OTHER = 'u-other', ADMIN = 'u-admin'
const P = 'p-owner-1', Q = 'p-other-1'
const NOW = new Date('2026-09-27T10:00:00Z')
const MONTH = '2026-08'
const iso = (s: string) => new Date(s).toISOString()

// ── fixtures ──────────────────────────────────────────────────────────────────

function rankFixture(): { targets: TargetRow[]; checks: CheckRow[] } {
  const t = (id: string, active = true): TargetRow => ({ id, keyword: `kw ${id}`, engine_type: 'google_search', is_active: active })
  const c = (target: string, at: string, position: number | null, found = position !== null): CheckRow => ({ tracking_target_id: target, position, found, checked_at: iso(at) })
  return {
    targets: [t('t1'), t('t2'), t('t3'), t('t4'), t('t5'), t('t6'), t('t7', false), t('t8')],
    checks: [
      c('t1', '2026-07-20', 12), c('t1', '2026-08-05', 8), c('t1', '2026-08-25', 5),   // 12 → 5: +7
      c('t2', '2026-07-28', 3), c('t2', '2026-08-20', 9),                               // 3 → 9: -6
      c('t3', '2026-07-28', null, false), c('t3', '2026-08-20', 40),                    // out → 40: +61
      c('t4', '2026-07-28', 20), c('t4', '2026-08-20', 20),                             // steady
      c('t5', '2026-07-28', 7),                                                         // not checked in August
      c('t6', '2026-08-02', 30), c('t6', '2026-08-29', 25),                             // new in August: 30 → 25: +5
      c('t7', '2026-07-28', 50), c('t7', '2026-08-20', 1),                              // inactive: ignored
      c('t8', '2026-08-10', 2),                                                         // one check: counted, no move
      c('t1', '2026-09-02', 1),                                                         // after the month: ignored
    ],
  }
}

function articleFixture(): ArticleRow[] {
  const a = (id: string, over: Partial<ArticleRow>): ArticleRow => ({
    id, title: `Article ${id}`, status: 'draft', published_at: null, shopify_status: null, shopify_published_at: null,
    wp_post_url: null, shopify_article_url: null, ...over,
  })
  const wp = a('a1', { status: 'published', published_at: iso('2026-08-10T09:00:00Z'), wp_post_url: 'https://site.test/a1' })
  return [
    wp, { ...wp },                                                                       // read twice (both queries): once
    a('a2', { shopify_status: 'published', shopify_published_at: iso('2026-08-03T09:00:00Z'), shopify_article_url: 'https://shop.test/a2' }),
    a('a3', { shopify_status: 'draft', shopify_article_url: 'https://shop.test/a3' }),   // a Shopify draft is not a publication
    a('a4', { status: 'published', published_at: iso('2026-07-31T23:59:59Z') }),         // July
    a('a5', { status: 'published', published_at: null }),                                // no date proves nothing
    a('a6', { status: 'published', published_at: iso('2026-08-31T23:00:00Z'), wp_post_url: 'javascript:alert(1)' }),
  ]
}

const EMPTY_PLAN: MonthInputs['plan'] = { scheduled: [], queuedCount: 0, readyCount: 0, approvedTopics: [], approvedCount: 0, ideas: [], ideasCount: 0 }

function emptyInputs(): MonthInputs {
  return { month: MONTH, projectCreatedAt: '2026-01-01T00:00:00Z', targets: [], checks: [], articles: [], ai: [], gsc: { connected: false, current: null, previous: null }, plan: EMPTY_PLAN }
}

/** The database the loader reads: the owner's rows, and planted rows of another owner in every table. */
function tables(): Record<string, Record<string, unknown>[]> {
  const rank = rankFixture()
  return {
    projects: [
      { id: P, user_id: OWNER, created_at: '2026-06-01T00:00:00Z', is_active: true },
      { id: Q, user_id: OTHER, created_at: '2026-06-01T00:00:00Z', is_active: true },
    ],
    tracking_targets: [
      ...rank.targets.map((t) => ({ ...t, project_id: P, user_id: OWNER })),
      { id: 'x-planted', keyword: 'planted keyword', engine_type: 'google_search', is_active: true, project_id: P, user_id: OTHER },
      { id: 'q1', keyword: 'other project keyword', engine_type: 'google_search', is_active: true, project_id: Q, user_id: OTHER },
    ],
    scan_results: [
      ...rank.checks.map((c) => ({ ...c })),
      { tracking_target_id: 'x-planted', position: 1, found: true, checked_at: iso('2026-08-10') },
      { tracking_target_id: 'x-planted', position: 90, found: true, checked_at: iso('2026-07-10') },
      { tracking_target_id: 'q1', position: 1, found: true, checked_at: iso('2026-08-10') },
    ],
    generated_articles: [
      ...articleFixture().filter((a, i, all) => all.findIndex((b) => b.id === a.id) === i).map((a) => ({ ...a, project_id: P, user_id: OWNER })),
      { id: 'x-art', title: 'Planted article', status: 'published', published_at: iso('2026-08-10'), project_id: P, user_id: OTHER },
      { id: 's1', title: 'Scheduled for September', status: 'scheduled', scheduled_at: iso('2026-09-12T08:00:00Z'), project_id: P, user_id: OWNER },
      { id: 's2', title: 'Scheduled for October', status: 'scheduled', scheduled_at: iso('2026-10-02T08:00:00Z'), project_id: P, user_id: OWNER },
      { id: 'r1', title: 'Ready one', status: 'ready', project_id: P, user_id: OWNER },
      { id: 'x-s', title: 'Planted schedule', status: 'scheduled', scheduled_at: iso('2026-09-12T08:00:00Z'), project_id: P, user_id: OTHER },
    ],
    ai_scan_results: [
      { project_id: P, status: 'success', excluded_from_score: false, mentioned: true, target_cited: true, created_at: iso('2026-08-04') },
      { project_id: P, status: 'success', excluded_from_score: false, mentioned: true, target_cited: false, created_at: iso('2026-08-05') },
      { project_id: P, status: 'success', excluded_from_score: false, mentioned: false, target_cited: false, created_at: iso('2026-08-06') },
      { project_id: P, status: 'success', excluded_from_score: false, mentioned: false, target_cited: false, created_at: iso('2026-08-07') },
      { project_id: P, status: 'success', excluded_from_score: true, mentioned: true, target_cited: true, created_at: iso('2026-08-07') },
      { project_id: P, status: 'failed', excluded_from_score: false, mentioned: true, target_cited: true, created_at: iso('2026-08-07') },
      { project_id: P, status: 'success', excluded_from_score: false, mentioned: true, target_cited: true, created_at: iso('2026-07-07') },
      { project_id: Q, status: 'success', excluded_from_score: false, mentioned: true, target_cited: true, created_at: iso('2026-08-07') },
    ],
    project_gsc_properties: [{ project_id: P, site_url: 'sc-domain:site.test' }],
    gsc_sync_runs: [
      { project_id: P, window_days: 28, status: 'succeeded', start_date: '2026-07-29', end_date: '2026-08-25', total_clicks: 999, total_impressions: 9999, summary_total_clicks: 420, summary_total_impressions: 12000 },
      { project_id: P, window_days: 28, status: 'succeeded', start_date: '2026-07-20', end_date: '2026-08-16', total_clicks: 1, total_impressions: 1 },
      { project_id: P, window_days: 90, status: 'succeeded', start_date: '2026-06-01', end_date: '2026-08-30', total_clicks: 5000, total_impressions: 50000 },
      { project_id: P, window_days: 28, status: 'failed', start_date: '2026-08-03', end_date: '2026-08-30', total_clicks: 7, total_impressions: 7 },
      { project_id: P, window_days: 28, status: 'succeeded', start_date: '2026-07-01', end_date: '2026-07-28', total_clicks: 300, total_impressions: 10000 },
      { project_id: Q, window_days: 28, status: 'succeeded', start_date: '2026-07-29', end_date: '2026-08-26', total_clicks: 77777, total_impressions: 77777 },
    ],
    article_pool_items: [
      { id: 'pi1', project_id: P, user_id: OWNER, status: 'queued' },
      { id: 'pi2', project_id: P, user_id: OWNER, status: 'published' },
      { id: 'pi3', project_id: P, user_id: OTHER, status: 'queued' },
    ],
    article_topics: [
      { topic: 'Approved topic A', created_at: '2026-08-01T00:00:00Z', status: 'approved', project_id: P, user_id: OWNER },
      { topic: 'Suggested topic', created_at: '2026-08-01T00:00:00Z', status: 'suggested', project_id: P, user_id: OWNER },
      { topic: 'Planted topic', created_at: '2026-08-01T00:00:00Z', status: 'approved', project_id: P, user_id: OTHER },
    ],
    content_topic_ideas: [
      { title: 'Idea low', score: '0.2', status: 'pending', project_id: P, user_id: OWNER },
      { title: 'Idea high', score: 0.9, status: 'pending', project_id: P, user_id: OWNER },
      { title: 'Planted idea', score: 1, status: 'pending', project_id: P, user_id: OTHER },
    ],
    project_monthly_reports: [],
    project_report_preferences: [],
  }
}

const OWNED: OwnedProject = { id: P, user_id: OWNER, created_at: '2026-06-01T00:00:00Z' }

/** The unique index on (project_id, period_month), as the database enforces it. */
class UniqueReportsAdmin extends FakeAdmin {
  from(name: string) {
    const q = super.from(name) as unknown as Record<string, unknown>
    if (name !== 'project_monthly_reports') return q as never
    const rows = this.tables[name]
    const insert = (q.insert as (p: unknown) => unknown).bind(q)
    q.insert = (payload: Record<string, unknown>) => {
      if (rows.some((r) => r.project_id === payload.project_id && r.period_month === payload.period_month)) {
        return { then: (resolve: (v: unknown) => unknown) => Promise.resolve({ data: null, error: { code: '23505', message: 'duplicate key value violates unique constraint' } }).then(resolve) }
      }
      return insert(payload)
    }
    return q as never
  }
}

// Every query the report makes, recorded: the table, and each filter with its value.
type Recorded = { table: string; calls: [string, unknown[]][] }
function recording(admin: FakeAdmin, log: Recorded[], opts: { dropUserFilter?: boolean } = {}) {
  return {
    from(table: string) {
      const rec: Recorded = { table, calls: [] }
      log.push(rec)
      const target = admin.from(table) as unknown as Record<string, unknown>
      const proxy: Record<string, unknown> = new Proxy(target, {
        get(t, prop) {
          const v = t[prop as string]
          if (typeof v !== 'function') return v
          return (...args: unknown[]) => {
            rec.calls.push([String(prop), args])
            if (opts.dropUserFilter && prop === 'eq' && args[0] === 'user_id') return proxy
            const out = (v as (...a: unknown[]) => unknown).apply(t, args)
            return out === t ? proxy : out
          }
        },
      })
      return proxy
    },
  }
}

const USER_TABLES = ['tracking_targets', 'generated_articles', 'article_pool_items', 'article_topics', 'content_topic_ideas', 'project_monthly_reports', 'project_report_preferences']
const PROJECT_TABLES = ['ai_scan_results', 'project_gsc_properties', 'gsc_sync_runs']

/** Why each recorded query is (not) owner-filtered; empty = all are. */
function ownerFilterGaps(log: Recorded[], ownerTargets: Set<string>): string[] {
  const gaps: string[] = []
  const eq = (r: Recorded, col: string) => r.calls.filter(([m, a]) => m === 'eq' && a[0] === col).map(([, a]) => a[1])
  for (const r of log) {
    const isWrite = r.calls.some(([m]) => m === 'insert' || m === 'upsert' || m === 'update' || m === 'delete')
    if (r.table === 'projects') {
      if (!(eq(r, 'id').includes(P) && eq(r, 'user_id').includes(OWNER))) gaps.push('projects read without id AND owner')
    } else if (USER_TABLES.includes(r.table)) {
      if (isWrite) continue
      if (!eq(r, 'project_id').includes(P) || !eq(r, 'user_id').includes(OWNER)) gaps.push(`${r.table} read without project AND owner`)
    } else if (PROJECT_TABLES.includes(r.table)) {
      if (!eq(r, 'project_id').includes(P)) gaps.push(`${r.table} read without the owner-verified project`)
    } else if (r.table === 'scan_results') {
      const ins = r.calls.filter(([m, a]) => m === 'in' && a[0] === 'tracking_target_id').map(([, a]) => a[1] as string[])
      if (ins.length === 0 || !ins.every((ids) => ids.every((id) => ownerTargets.has(id)))) gaps.push('scan_results read beyond the owner\'s keywords')
    } else {
      gaps.push(`unexpected table ${r.table}`)
    }
  }
  return gaps
}

function routeDeps(admin: unknown, userId: string | null = OWNER, now = NOW): MonthlyRouteDeps {
  return { userId: async () => userId, admin: () => admin as never, now: () => now }
}
const get = (projectId: string | null, month?: string) =>
  new Request(`https://app.test/api/reports/monthly?${projectId ? `projectId=${projectId}` : ''}${month ? `&month=${month}` : ''}`)
const post = (url: string, body: unknown, method = 'POST') =>
  new Request(`https://app.test${url}`, { method, headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })

const render = (el: Parameters<typeof renderToStaticMarkup>[0]) => renderToStaticMarkup(el)
const textOf = (html: string) => html.replace(/<[^>]+>/g, ' ').replace(/&#x27;|&#39;/g, '\'').replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/\s+/g, ' ')

async function main() {
  console.log('Monthly report QA\n')

  // ── A) aggregation ─────────────────────────────────────────────────────────
  console.log('A) aggregation on fixtures')
  {
    const { targets, checks } = rankFixture()
    const r = aggregateRankings(MONTH, targets, checks)
    check('A1: keywords checked in the month (inactive and unchecked left out) = 6', r.checkedInMonth === 6 && r.tracked === 7, JSON.stringify(r))
    check('A2: first page at the month\'s last check = 3 (5, 9, 2)', r.firstPageEnd === 3)
    check('A3: first page at the baseline = 1 (only 3 was in the top 10)', r.firstPageStart === 1)
    check('A4: climbed, biggest first: kw t3 (+61 from outside), kw t1 (+7), kw t6 (+5)',
      r.improvedCount === 3 && r.improved.map((m) => `${m.keyword}:${m.change}`).join() === 'kw t3:61,kw t1:7,kw t6:5', JSON.stringify(r.improved))
    check('A5: slipped: kw t2, 3 → 9 (-6)', r.droppedCount === 1 && r.dropped[0].keyword === 'kw t2' && r.dropped[0].from === 3 && r.dropped[0].to === 9 && r.dropped[0].change === -6)
    check('A6: one steady keyword; a single check is no move', r.steadyCount === 1 && !r.improved.some((m) => m.keyword === 'kw t8'))
    check('A7: entering the top 100 reads from null to 40', r.improved[0].from === null && r.improved[0].to === 40)
    check('A8: average position end 16.8, start 16.3', r.avgPositionEnd === 16.8 && r.avgPositionStart === 16.3, `${r.avgPositionEnd} / ${r.avgPositionStart}`)
    check('A9: a check after the month does not count (t1 ends at 5, not 1)', !r.improved.some((m) => m.to === 1))
    const mut = aggregateRankings(MONTH, targets, checks.map((c) => ({ ...c, checked_at: c.tracking_target_id === 't1' && c.checked_at.startsWith('2026-09') ? iso('2026-08-31T23:00:00Z') : c.checked_at })))
    check('A-MUT: moving the September check into August changes t1\'s move (A9 can fail)', mut.improved.some((m) => m.keyword === 'kw t1' && m.to === 1))
    check('A10: no keywords → no_keywords; keywords never checked in the month → no_checks',
      aggregateRankings(MONTH, [], []).state === 'no_keywords' && aggregateRankings(MONTH, [targets[4]], checks).state === 'no_checks')

    const a = aggregateArticles(MONTH, articleFixture())
    check('A11: published in August: a2 (Shopify), a1 (WordPress), a6; a draft, July and a dateless row left out',
      a.published === 3 && a.items.map((i) => i.title).join() === 'Article a2,Article a1,Article a6', JSON.stringify(a.items.map((i) => i.title)))
    check('A12: an article read by both queries counts once', a.items.filter((i) => i.title === 'Article a1').length === 1)
    check('A13: channels and links: Shopify link for a2, WordPress for a1, no javascript: link',
      a.items[0].channel === 'shopify' && a.items[0].url === 'https://shop.test/a2' && a.items[1].channel === 'wordpress' && a.items[2].url === null)
    const aMut = aggregateArticles(MONTH, articleFixture().map((x) => (x.id === 'a3' ? { ...x, shopify_status: 'published', shopify_published_at: iso('2026-08-09') } : x)))
    check('A-MUT: a Shopify draft that WAS published would count (A11 can fail)', aMut.published === 4)

    const ai = aggregateAi([{ mentioned: true, target_cited: true }, { mentioned: true, target_cited: false }, { mentioned: false, target_cited: false }, { mentioned: false, target_cited: false }])
    check('A14: AI answers 4, mentions 2 (50%), citations 1', ai.answers === 4 && ai.mentions === 2 && ai.citations === 1 && ai.mentionRate === 50)
    check('A15: no AI answers → no_checks with no rate', aggregateAi([]).state === 'no_checks' && aggregateAi([]).mentionRate === null)

    check('A16: Search Console not connected / connected without a run / with a run',
      aggregateGsc({ connected: false, current: null, previous: null }).state === 'not_connected'
      && aggregateGsc({ connected: true, current: null, previous: null }).state === 'no_data'
      && aggregateGsc({ connected: true, current: { start_date: '2026-07-29', end_date: '2026-08-25', total_clicks: 9, total_impressions: 9, summary_total_clicks: '420', summary_total_impressions: 12000 }, previous: null }).current?.clicks === 420)

    const plan = aggregatePlan(MONTH, { ...EMPTY_PLAN, scheduled: [{ title: 'B', scheduled_at: iso('2026-09-20') }, { title: 'A', scheduled_at: iso('2026-09-02') }], ideas: [{ title: 'low', score: '0.1' }, { title: 'high', score: 3 }], ideasCount: 2 })
    check('A17: the plan looks at the next month, scheduled by date, ideas by score',
      plan.month === '2026-09' && plan.scheduled.map((s) => s.title).join() === 'A,B' && plan.ideas[0].title === 'high' && plan.state === 'ready')
    check('A18: nothing planned → empty', aggregatePlan(MONTH, EMPTY_PLAN).state === 'empty')

    // Through the real loader, over a database that also holds another owner's rows.
    const admin = new FakeAdmin(tables())
    const inputs = await loadMonthInputs(admin as never, OWNED, MONTH)
    const d = aggregateMonth(inputs)
    check('A19: loader + aggregate: the same rank figures as the pure fixture', d.rankings.firstPageEnd === 3 && d.rankings.improvedCount === 3 && d.rankings.droppedCount === 1, JSON.stringify(d.rankings).slice(0, 200))
    check('A20: loader + aggregate: 3 articles, AI 4/2/1 (archived, failed, July and other project left out)',
      d.articles.published === 3 && d.ai.answers === 4 && d.ai.mentions === 2 && d.ai.citations === 1, `${d.articles.published} ${JSON.stringify(d.ai)}`)
    check('A21: Search Console: the 28-day run ending latest in August, summary figures (420 / 12,000), July\'s run as the comparison',
      d.gsc.state === 'ready' && d.gsc.current?.clicks === 420 && d.gsc.current?.impressions === 12000 && d.gsc.current?.endDate === '2026-08-25' && d.gsc.previous?.clicks === 300,
      JSON.stringify(d.gsc))
    check('A22: plan for September: one scheduled (not October\'s), 1 queued, 1 ready, 1 approved topic, 2 ideas',
      d.plan.scheduledCount === 1 && d.plan.scheduled[0].title === 'Scheduled for September' && d.plan.queuedCount === 1 && d.plan.readyCount === 1
      && d.plan.approvedCount === 1 && d.plan.ideasCount === 2 && d.plan.ideas[0].title === 'Idea high', JSON.stringify(d.plan))
    const created = aggregateMonth({ ...emptyInputs(), projectCreatedAt: '2026-08-14T09:00:00Z' })
    check('A23: a project opened mid-month is marked as covered from its first day', created.coversFrom === iso('2026-08-14T09:00:00Z') && aggregateMonth(emptyInputs()).coversFrom === null)
  }

  // ── I) idempotency ─────────────────────────────────────────────────────────
  console.log('\nI) idempotency and bounded work')
  {
    const t = tables()
    const admin = new UniqueReportsAdmin(t)
    const first = await generateMonthlyReport(admin as never, OWNED, MONTH, 'owner', NOW)
    const stored = JSON.stringify(t.project_monthly_reports[0]?.data)
    // The data changes afterwards: the finished report must not follow it.
    t.generated_articles.push({ id: 'late', title: 'Late', status: 'published', published_at: iso('2026-08-20'), project_id: P, user_id: OWNER })
    const second = await generateMonthlyReport(admin as never, OWNED, MONTH, 'cron', NOW)
    check('I1: first run creates, second run finds it: one row, unchanged, generated_by kept',
      first.status === 'created' && second.status === 'exists' && t.project_monthly_reports.length === 1
      && JSON.stringify(t.project_monthly_reports[0].data) === stored && t.project_monthly_reports[0].generated_by === 'owner')
    const raced = await insertReport(admin as never, OWNED, MONTH, aggregateMonth(emptyInputs()), 'cron')
    check('I2: a racing insert for the same month hits the unique index and reports exists', raced === 'exists' && t.project_monthly_reports.length === 1 && JSON.stringify(t.project_monthly_reports[0].data) === stored)
    // MUTATION: a generator that skips the existence check, against a store without the index.
    const plain = new FakeAdmin({ ...tables(), project_monthly_reports: [] })
    await insertReport(plain as never, OWNED, MONTH, aggregateMonth(emptyInputs()), 'cron')
    await insertReport(plain as never, OWNED, MONTH, aggregateMonth(emptyInputs()), 'cron')
    check('I-MUT: without the existence check and the unique index, a month duplicates (I1 can fail)', plain.tables.project_monthly_reports.length === 2)
    const src = strip(read('lib/reports/monthly/store.ts')) + strip(read('lib/reports/monthly/generate.ts'))
    // Each query on the report table, from its .from(...) to the next query or the end of its function.
    const reportQueries = (s: string) => s.split(/\.from\(/).filter((chunk) => chunk.startsWith("'project_monthly_reports'"))
      .map((chunk) => chunk.split(/\n\}/)[0])
    const neverRewrites = (s: string) => reportQueries(s).length >= 4 && reportQueries(s).every((q) => !/\.(update|upsert)\(/.test(q))
    check('I3: nothing in the report code updates or upserts a report', neverRewrites(src))
    check('I-MUT2: an upsert of a report fails I3', !neverRewrites(src + "\nadmin.from('project_monthly_reports').upsert(row)"))
    const mig = strip(read('supabase/migrations/20260928000000_project_monthly_reports.sql').replace(/--.*$/gm, ''))
    const grantsNoUpdate = (s: string) => /GRANT SELECT, INSERT, DELETE ON TABLE public\.project_monthly_reports TO service_role/.test(s)
      && !/GRANT[^;]*UPDATE[^;]*ON TABLE public\.project_monthly_reports/.test(s) && /UNIQUE INDEX IF NOT EXISTS uq_project_monthly_reports_project_month/.test(s)
    check('I4: the migration: one row per project and month, and no UPDATE grant to anyone', grantsNoUpdate(mig))
    check('I-MUT3: granting service_role UPDATE fails I4', !grantsNoUpdate(mig.replace('GRANT SELECT, INSERT, DELETE ON TABLE public.project_monthly_reports', 'GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.project_monthly_reports')))

    check('I5: a month is only reported once it is over, and only for a project that existed in it',
      reportableMonth('2026-09', null, NOW) === 'month_not_over' && reportableMonth(MONTH, '2026-09-01T00:00:00Z', NOW) === 'before_project'
      && reportableMonth(MONTH, '2026-08-31T00:00:00Z', NOW) === 'ok')
    check('I6: last complete month on 27 Sep is August; the next report is 1 Oct 08:30 UTC',
      lastCompleteMonth(NOW) === MONTH && nextReportAt(NOW).toISOString() === '2026-10-01T08:30:00.000Z' && nextReportAt(new Date('2026-10-01T05:00:00Z')).toISOString() === '2026-10-01T08:30:00.000Z')

    // The cron: 5 due projects, 2 per run.
    const many = tables()
    many.projects = [
      ...Array.from({ length: 5 }, (_, i) => ({ id: `pc${i}`, user_id: `uc${i}`, created_at: `2026-0${i + 1}-02T00:00:00Z`, is_active: true })),
      { id: 'p-late', user_id: 'uc-late', created_at: '2026-09-03T00:00:00Z', is_active: true },
      { id: 'p-off', user_id: 'uc-off', created_at: '2026-02-03T00:00:00Z', is_active: false },
    ]
    const cronAdmin = new UniqueReportsAdmin(many)
    const opts = { now: NOW, batchSize: 2, timeBudgetMs: 60_000, concurrency: 2 }
    const runs = []
    for (let i = 0; i < 4; i++) runs.push(await runMonthlyReportCron(cronAdmin as never, opts))
    check('I7: bounded: runs create 2, 2, 1, 0 and the last run has nothing left',
      runs.map((r) => r.created).join() === '2,2,1,0' && runs[3].remaining === 0 && runs[3].alreadyDone === 5, runs.map((r) => `${r.created}/${r.remaining}`).join(' '))
    check('I8: one report per project, never for a project opened after the month or switched off',
      many.project_monthly_reports.length === 5 && !many.project_monthly_reports.some((r) => r.project_id === 'p-late' || r.project_id === 'p-off')
      && many.project_monthly_reports.every((r) => r.period_month === periodMonthOf(MONTH) && r.generated_by === 'cron'))
    check('I9: each report carries its project\'s own owner', many.project_monthly_reports.every((r) => r.user_id === `uc${String(r.project_id).slice(2)}`))
    let tick = 0
    const slow = await runMonthlyReportCron(new UniqueReportsAdmin(tables()) as never, { ...opts, batchSize: 10, timeBudgetMs: 5, concurrency: 1, clock: () => (tick += 10) })
    check('I10: a spent time budget stops starting new projects', slow.stoppedForTime && slow.attempted === 0)
    const missing = new FakeAdmin(tables(), { project_monthly_reports: { select: () => ({ code: '42P01', message: 'relation "project_monthly_reports" does not exist' }) } })
    const unav = await runMonthlyReportCron(missing as never, opts)
    check('I11: before the migration the cron stops quietly as unavailable', unav.state === 'unavailable' && unav.created === 0)
  }

  // ── O) owner filters ───────────────────────────────────────────────────────
  console.log('\nO) every admin read filters by the project and its owner')
  {
    const ownerTargets = new Set(tables().tracking_targets.filter((t) => t.user_id === OWNER && t.project_id === P).map((t) => String(t.id)))
    const log: Recorded[] = []
    const base = new UniqueReportsAdmin(tables())
    const admin = recording(base, log)
    const deps = routeDeps(admin)
    await handleMonthlyGenerate(post('/api/reports/monthly/generate', { projectId: P }), deps)
    await handleMonthlyGet(get(P), deps)
    await handleMonthlyGet(get(P, '2026-07'), deps)
    await handlePreferencesPut(post('/api/reports/monthly/preferences', { projectId: P, weeklyEmailSummary: true }, 'PUT'), deps)
    await handlePreferencesGet(new Request(`https://app.test/api/reports/monthly/preferences?projectId=${P}`), deps)
    const tablesRead = new Set(log.map((r) => r.table))
    check('O1: the routes read all eleven tables the report is made of', [...USER_TABLES, ...PROJECT_TABLES, 'scan_results', 'projects'].every((tb) => tablesRead.has(tb)), [...tablesRead].join())
    const gaps = ownerFilterGaps(log, ownerTargets)
    check(`O2: all ${log.length} recorded queries filter by the project and its owner`, gaps.length === 0, gaps.join('; '))
    const report = base.tables.project_monthly_reports[0]?.data as MonthlyReportData | undefined
    const json = JSON.stringify(report ?? {})
    check('O3: nothing of another owner reached the report (planted keyword, article, schedule, topic, idea, other project\'s clicks)',
      !!report && !/planted|Planted|other project|77777/.test(json) && report.plan.queuedCount === 1, json.slice(0, 160))

    const mutLog: Recorded[] = []
    const mutBase = new UniqueReportsAdmin(tables())
    await handleMonthlyGenerate(post('/api/reports/monthly/generate', { projectId: P }), routeDeps(recording(mutBase, mutLog, { dropUserFilter: true })))
    const mutJson = JSON.stringify(mutBase.tables.project_monthly_reports[0]?.data ?? {})
    check('O-MUT: with the user_id filter dropped from every query, O2 and O3 both catch it',
      ownerFilterGaps(mutLog.map((r) => ({ ...r, calls: r.calls.filter(([m, a]) => !(m === 'eq' && a[0] === 'user_id')) })), ownerTargets).length > 0 && /Planted|planted/.test(mutJson))

    const t = tables()
    t.project_monthly_reports.push({ project_id: P, user_id: OWNER, period_month: '2026-08-01', generated_by: 'cron', generated_at: '2026-09-01T08:31:00Z', data: aggregateMonth(emptyInputs()) })
    const fa = new FakeAdmin(t)
    const status = async (req: Request, userId: string | null) => (await handleMonthlyGet(req, routeDeps(fa, userId))).status
    check('O4: the owner 200; another user 404; an administrator who is not the owner 404; signed out 401',
      (await status(get(P), OWNER)) === 200 && (await status(get(P), OTHER)) === 404 && (await status(get(P), ADMIN)) === 404 && (await status(get(P), null)) === 401)
    check('O5: another user\'s own project answers them, not the owner', (await status(get(Q), OWNER)) === 404 && (await status(get(Q), OTHER)) === 200)
    check('O6: a malformed project id or month is 400', (await status(get('bad id!'), OWNER)) === 400 && (await status(get(P, '2026-13'), OWNER)) === 400)
    const genOther = await handleMonthlyGenerate(post('/api/reports/monthly/generate', { projectId: P }), routeDeps(new FakeAdmin(tables()), OTHER))
    const putOther = await handlePreferencesPut(post('/api/reports/monthly/preferences', { projectId: P, weeklyEmailSummary: true }, 'PUT'), routeDeps(new FakeAdmin(tables()), OTHER))
    check('O7: another user can neither create the owner\'s report nor flip their switch (404)', genOther.status === 404 && putOther.status === 404)
    const broken = new FakeAdmin(tables(), { tracking_targets: { select: () => ({ code: 'XX000', message: 'connection to 10.0.0.3 refused; password=hunter2' }) } })
    const failed = await handleMonthlyGenerate(post('/api/reports/monthly/generate', { projectId: P }), routeDeps(broken))
    const failedBody = await failed.text()
    check('O8: a database failure answers one stable code, never its message', failed.status === 500 && failedBody.includes('"internal"') && !/refused|hunter2|10\.0\.0/.test(failedBody), failedBody)
    const monthGet = await (await handleMonthlyGet(get(P), routeDeps(fa))).json() as { report?: { month: string }; missingMonth: string | null; months: unknown[] }
    check('O9: GET returns the latest report and no missing month once it exists', monthGet.report?.month === MONTH && monthGet.missingMonth === null && monthGet.months.length === 1)
  }

  // ── C) cron auth ───────────────────────────────────────────────────────────
  console.log('\nC) the cron fails closed and is scheduled apart')
  {
    const scheduled: number[] = []
    const cronDeps = (over: Partial<MonthlyCronDeps> = {}): MonthlyCronDeps => ({
      authorize: (r) => authorizeCronRequest(r, 'monthly-report-qa'),
      enabled: () => true,
      admin: () => new FakeAdmin(tables()) as never,
      now: () => NOW,
      schedule: () => { scheduled.push(1) },
      log: () => {},
      ...over,
    })
    const req = (auth?: string) => new Request('https://app.test/api/reports/monthly/cron', { headers: auth ? { authorization: auth } : {} })
    const saved = process.env.CRON_SECRET
    const quiet = console.error
    console.error = () => {}
    delete process.env.CRON_SECRET
    const unset = await handleMonthlyCron(req('Bearer anything'), cronDeps())
    process.env.CRON_SECRET = 'qa-secret'
    const none = await handleMonthlyCron(req(), cronDeps())
    const wrong = await handleMonthlyCron(req('Bearer nope'), cronDeps())
    const countBefore = scheduled.length
    const right = await handleMonthlyCron(req('Bearer qa-secret'), cronDeps())
    const disabled = await handleMonthlyCron(req('Bearer qa-secret'), cronDeps({ enabled: () => false }))
    const disabledUnauth = await handleMonthlyCron(req(), cronDeps({ enabled: () => false }))
    console.error = quiet
    check('C1: no CRON_SECRET configured → 503 and no work scheduled', unset.status === 503 && countBefore === 0)
    check('C2: no or a wrong bearer → 401 and no work scheduled', none.status === 401 && wrong.status === 401 && countBefore === 0)
    check('C3: the right bearer → 202 with the work scheduled after the answer', right.status === 202 && scheduled.length === 1)
    check('C4: the kill switch does nothing, but still only after authorization', disabled.status === 200 && scheduled.length === 1 && disabledUnauth.status === 401)
    delete process.env.CRON_SECRET
    const mutScheduled: number[] = []
    const mut = await handleMonthlyCron(req(), cronDeps({ authorize: () => null, schedule: () => { mutScheduled.push(1) } }))
    check('C-MUT: an authorize that lets everything through fails C1 (it schedules without a secret)', mut.status === 202 && mutScheduled.length === 1)
    if (saved !== undefined) process.env.CRON_SECRET = saved

    const route = strip(read('app/api/reports/monthly/cron/route.ts'))
    const wired = (s: string) => /authorizeCronRequest\(req, 'monthly-report'\)/.test(s) && /schedule: \(task\) => after\(task\)/.test(s) && /handleMonthlyCron\(/.test(s)
    check('C5: the route wires authorizeCronRequest and after()', wired(route))
    check('C-MUT2: a route without authorizeCronRequest fails C5', !wired(route.replace(/authorizeCronRequest\(req, 'monthly-report'\)/, 'null')))
    const crons = (JSON.parse(read('vercel.json')) as { crons: { path: string; schedule: string }[] }).crons
    const apart = (list: typeof crons) => {
      const mine = list.find((c) => c.path === '/api/reports/monthly/cron')
      if (!mine) return false
      const [min, hours, dom] = mine.schedule.split(' ')
      const otherHours = list.filter((c) => c !== mine).map((c) => c.schedule.split(' ')).filter(([m]) => m === '0').map(([, h]) => Number(h))
      // The Vercel plan allows one run a day per cron: a single hour, every day.
      if (!/^\d+$/.test(hours) || dom !== '*') return false
      const hour = Number(hours)
      return min !== '0' && otherHours.every((h) => h < hour)
    }
    check('C6: vercel.json runs it once a day at :30, after 05:00, 06:00 and 07:00', apart(crons), JSON.stringify(crons.at(-1)))
    check('C-MUT4: an hourly range (more than one run a day) fails C6', !apart(crons.map((c) => (c.path === '/api/reports/monthly/cron' ? { ...c, schedule: '30 8-23 1,2 * *' } : c))))
    check('C-MUT3: a schedule on the hour at 07:00 fails C6', !apart(crons.map((c) => (c.path === '/api/reports/monthly/cron' ? { ...c, schedule: '0 7 1 * *' } : c))))
    const owner = ['app/api/reports/monthly/route.ts', 'app/api/reports/monthly/generate/route.ts', 'app/api/reports/monthly/preferences/route.ts'].map((f) => strip(read(f)))
    check('C7: the owner routes all go through the handlers that check the session and ownership', owner.every((s) => /liveMonthlyDeps\(\)/.test(s) && /handle(Monthly|Preferences)\w+\(request, liveMonthlyDeps\(\)\)/.test(s)))
  }

  // ── E) empty month renders ─────────────────────────────────────────────────
  console.log('\nE) an empty month still renders and explains itself')
  {
    const emptyData = aggregateMonth(emptyInputs())
    for (const lang of ['he', 'en'] as const) {
      const c = monthlyCopy(lang)
      const html = render(createElement(MonthlyReportView, { projectId: 'p1', data: emptyData, generatedAt: '2026-09-01T08:31:00Z', generatedBy: 'cron', language: lang, projectLabel: 'site.test' }))
      const txt = textOf(html)
      const explains = (t: string) => [c.noKeywords, c.aiNone, c.gscNotConnected, c.planEmpty].every((s) => t.includes(s)) && t.includes(c.publishedNone(lang === 'he' ? 'אוגוסט' : 'August'))
      check(`E1 (${lang}): every section of an empty month says why and what fills it`, explains(txt), txt.slice(0, 300))
      check(`E2 (${lang}): marked empty, the month named, no NaN/undefined/null shown`,
        html.includes('data-empty-month="true"') && txt.includes(lang === 'he' ? 'אוגוסט 2026' : 'August 2026') && !/NaN|undefined|null/.test(txt))
      check(`E3 (${lang}): all six sections are there`, ['improved', 'dropped', 'published', 'ai', 'gsc', 'plan'].every((s) => html.includes(`data-monthly-section="${s}"`)))
      if (lang === 'he') {
        const readyZero = render(createElement(MonthlyReportView, { projectId: 'p1', data: { ...emptyData, ai: { state: 'ready', answers: 0, mentions: 0, citations: 0, mentionRate: null } }, generatedAt: '2026-09-01T08:31:00Z', generatedBy: 'cron', language: lang, projectLabel: 'x' }))
        check('E-MUT: showing AI zeros instead of the reason fails E1', !explains(textOf(readyZero)))
      }
    }
    const filled = aggregateMonth(await loadMonthInputs(new FakeAdmin(tables()) as never, OWNED, MONTH))
    const fhtml = render(createElement(MonthlyReportView, { projectId: 'p1', data: filled, generatedAt: '2026-09-01T08:31:00Z', generatedBy: 'owner', language: 'he', projectLabel: 'site.test' }))
    const ftxt = textOf(fhtml)
    check('E4: a filled report lists the moves, the articles, the plan, and is not marked empty',
      fhtml.includes('data-empty-month="false"') && ftxt.includes('kw t3') && ftxt.includes('kw t2') && ftxt.includes('Article a1') && ftxt.includes('Scheduled for September') && ftxt.includes('420'))
    const first = render(createElement(MonthlyReportsBody, {
      body: { ok: true, available: true, months: [], report: null, nextReportAt: '2026-10-01T08:30:00.000Z', missingMonth: null },
      language: 'he', projectLabel: 'x', selected: null, onSelect: () => {}, onGenerate: () => {}, generating: 'idle',
    }))
    check('E5: before any report, the section says when the first one comes and what it covers',
      first.includes('data-monthly-first') && textOf(first).includes(monthlyCopy('he').firstTitle('1 באוקטובר')) && textOf(first).includes('ספטמבר 2026'), textOf(first).slice(0, 200))
    const missing = render(createElement(MonthlyReportsBody, {
      body: { ok: true, available: true, months: [], report: null, nextReportAt: '2026-10-01T08:30:00.000Z', missingMonth: MONTH },
      language: 'en', projectLabel: 'x', selected: null, onSelect: () => {}, onGenerate: () => {}, generating: 'idle',
    }))
    check('E6: a missing last month offers "create it now"', missing.includes(`data-monthly-missing="${MONTH}"`) && textOf(missing).includes('Create the August 2026 report'))
    const teaser = render(createElement(MonthlyTeaserBody, { body: { ok: true, available: true, months: [], report: null, nextReportAt: '2026-10-01T08:30:00.000Z', missingMonth: null }, language: 'en' }))
    check('E7: the dashboard teaser before the first report names its date', textOf(teaser).includes('October 1'))
  }

  // ── M) the weekly email ────────────────────────────────────────────────────
  console.log('\nM) the weekly email switch defaults off, and the report reaches no provider')
  {
    const admin = new FakeAdmin(tables())
    check('M1: no preference row reads as OFF', (await readPreferences(admin as never, OWNED)).weeklyEmailSummary === false)
    const got = await (await handlePreferencesGet(new Request(`https://app.test/x?projectId=${P}`), routeDeps(admin))).json() as { weeklyEmailSummary: boolean }
    check('M2: the route answers OFF for a project never set', got.weeklyEmailSummary === false)
    const put = await handlePreferencesPut(post('/api/reports/monthly/preferences', { projectId: P, weeklyEmailSummary: true }, 'PUT'), routeDeps(admin))
    check('M3: the owner turns it on: stored true with the owner on the row', put.status === 200 && admin.tables.project_report_preferences[0]?.weekly_email_summary === true && admin.tables.project_report_preferences[0]?.user_id === OWNER)
    const bad = await handlePreferencesPut(post('/api/reports/monthly/preferences', { projectId: P, weeklyEmailSummary: 'yes' }, 'PUT'), routeDeps(admin))
    check('M4: a non-boolean is refused (400)', bad.status === 400)
    const off = render(createElement(WeeklyEmailSwitch, { on: false, busy: false, onChange: () => {}, language: 'he', note: null }))
    check('M5: the switch renders OFF, and says when the summary goes out', off.includes('aria-checked="false"') && textOf(off).includes(monthlyCopy('he').email.cadence))
    check('M6: the switch no longer claims sending is off, in any language',
      (['he', 'en', 'es', 'pt-BR'] as const).every((l) => !/not switched on|todavía no está activado|ainda não está ativado|עוד לא הופעלה/.test(monthlyCopy(l).email.cadence)))

    const files: string[] = []
    const walk = (dir: string) => {
      for (const f of readdirSync(join(ROOT, dir))) {
        if (f === 'node_modules' || f.startsWith('.')) continue
        const rel = join(dir, f)
        if (statSync(join(ROOT, rel)).isDirectory()) walk(rel)
        else if (/\.(ts|tsx)$/.test(f) && !rel.includes('__qa__')) files.push(rel)
      }
    }
    for (const d of ['app', 'lib', 'components']) walk(d)
    // The sender lives in lib/reports/weekly and is reached ONLY through its isolated
    // wrapper: nothing else in the app may import its run or its live dependencies.
    const importers = (list: { f: string; s: string }[]) => list
      .filter(({ f, s }) => !f.replace(/\\/g, '/').startsWith('lib/reports/weekly/') && /from ['"][^'"]*reports\/weekly\/(run|live|store|email)['"]/.test(s))
      .map(({ f }) => f)
    const sources = files.map((f) => ({ f, s: strip(read(f)) }))
    // lib/reminders/http.ts is the one exception, and only for the unsubscribe write.
    const outside = importers(sources).filter((f) => !f.replace(/\\/g, '/').endsWith('lib/reminders/http.ts'))
    check('M7: only the weekly module and the unsubscribe route reach the weekly sender', outside.length === 0, outside.join())
    check('M-MUT: a cron that imports the run fails M7',
      importers([...sources, { f: 'app/api/x/route.ts', s: "import { runWeeklySummaries } from '@/lib/reports/weekly/run'" }])
        .filter((f) => !f.replace(/\\/g, '/').endsWith('lib/reminders/http.ts')).length === 1)
    const own = files.filter((f) => /lib\/reports\/monthly\/|components\/reports\/monthly\/|app\/api\/reports\/monthly\//.test(f.replace(/\\/g, '/')))
    const mails = (s: string) => /resend|nodemailer|sendgrid|postmark|mailgun|smtp|signup-email/i.test(s)
    check(`M8: none of the report's ${own.length} files reaches an email provider`, own.length >= 12 && own.every((f) => !mails(strip(read(f)))), own.filter((f) => mails(strip(read(f)))).join())
    check('M-MUT2: a monthly file that loads resend fails M8', mails(strip(read('lib/reports/monthly/store.ts')) + "\nconst { Resend } = await import('resend')"))
  }

  // ── R) THE DOWNLOAD (owner, 4 October 2026: "can the monthly report be
  // downloadable?", and does it carry the Search Console figures) ─────────────
  console.log('\nR) the monthly report as a file to keep')
  {
    // A month with something in every section, so the file can be checked for
    // each one — the Search Console figures above all.
    const rank = rankFixture()
    const full = aggregateMonth({
      ...emptyInputs(),
      targets: rank.targets,
      checks: rank.checks,
      articles: articleFixture(),
      ai: [{ mentioned: true, target_cited: true }, { mentioned: true, target_cited: false }, { mentioned: false, target_cited: false }],
      gsc: {
        connected: true,
        current: { start_date: '2026-08-01', end_date: '2026-08-28', total_clicks: 412, total_impressions: 9310 },
        previous: { start_date: '2026-07-04', end_date: '2026-07-31', total_clicks: 301, total_impressions: 8120 },
      },
      plan: { ...EMPTY_PLAN, scheduled: [{ title: 'Next month\'s article', scheduled_at: iso('2026-09-12T08:00:00Z') }], queuedCount: 2, readyCount: 1 },
    })
    const pdfUrl = (projectId: string | null, extra = '') =>
      new Request(`https://app.test/api/reports/monthly/pdf?${projectId ? `projectId=${projectId}` : ''}${extra}`)
    const rendered: string[] = []
    const renderPdf = async (html: string) => { rendered.push(html); return new TextEncoder().encode('%PDF-1.4 ').buffer as ArrayBuffer }
    const withPdf = (admin: unknown, userId: string | null = OWNER) => ({ ...routeDeps(admin, userId), renderPdf })

    const t0 = tables()
    // generated_at is the column's own default in the database, so the stored
    // row is written here the way the loader will read it.
    t0.project_monthly_reports.push({
      project_id: P, user_id: OWNER, period_month: periodMonthOf(MONTH),
      generated_by: 'owner', generated_at: NOW.toISOString(), schema_version: 1, data: full,
    })
    const admin = new UniqueReportsAdmin(t0)
    const res = await handleMonthlyPdf(pdfUrl(P, `&month=${MONTH}`), withPdf(admin))
    check('R1: the owner gets a PDF back, as an attachment named after the month',
      res.status === 200 && res.headers.get('content-type') === 'application/pdf'
      && (res.headers.get('content-disposition') ?? '').includes(monthlyReportFileName(MONTH)),
      [res.status, res.headers.get('content-type'), res.headers.get('content-disposition')].join(' | '))
    check('R2: the file is rendered from the report, not from anything the caller sent', rendered.length === 1 && rendered[0]!.includes('<!DOCTYPE html>'))

    // The owner's question: does the download carry Search Console?
    const he = monthlyCopy('he')
    const html = rendered[0] ?? ''
    const text = textOf(html)
    check('R3: the download carries the Search Console section, with the clicks and the impressions',
      text.includes(he.gscTitle) && text.includes(he.gscClicks) && text.includes(he.gscImpressions), text.slice(0, 200))
    check('R4: and the rest of the report: what climbed, what slipped, what was published, AI visibility and next month\'s plan',
      [he.improvedTitle, he.publishedTitle, he.aiTitle].every((s) => text.includes(s)) && text.includes(he.planSub), text.slice(0, 300))
    check('R5: it says the same words the screen does, from the one dictionary (no second set of copy)',
      text.includes(he.tiles.firstPage) && text.includes(he.tiles.clicks))

    // Ownership, exactly as the other routes: a project that is not the
    // caller's answers 404, never 403, and a signed-out caller 401.
    check('R6: a signed-out caller is refused', (await handleMonthlyPdf(pdfUrl(P), withPdf(admin, null))).status === 401)
    check('R7: another account\'s project answers 404, never 403', (await handleMonthlyPdf(pdfUrl(P), withPdf(admin, 'someone-else'))).status === 404)
    check('R8: a malformed month is refused before anything is read', (await handleMonthlyPdf(pdfUrl(P, '&month=August'), withPdf(admin))).status === 400)
    check('R9: a month with no stored report answers 404, not an empty file', (await handleMonthlyPdf(pdfUrl(P, '&month=2026-01'), withPdf(admin))).status === 404)

    // The renderer is the one thing that can be unavailable; the route answers
    // its own code and never a provider's message.
    const down = await handleMonthlyPdf(pdfUrl(P, `&month=${MONTH}`), { ...routeDeps(admin), renderPdf: async () => null })
    const downBody = await down.text()
    check('R10: a failed render answers one stable code, with no provider detail', down.status === 503 && downBody.includes('unavailable') && !/pdfshift/i.test(downBody), downBody.slice(0, 120))
    check('R11: with no renderer configured at all it is the same answer, not a crash', (await handleMonthlyPdf(pdfUrl(P, `&month=${MONTH}`), routeDeps(admin))).status === 503)

    // The language is only which of the product's own languages the words come
    // in; nothing from the query reaches the page as content.
    const esHtml = generateMonthlyReportHTML({ data: full, projectLabel: 'site.test', generatedAt: NOW.toISOString(), generatedBy: 'owner', language: 'es' })
    check('R12: the file is produced in each of the product\'s languages', esHtml.includes(monthlyCopy('es').gscTitle) && esHtml.includes('lang="es"'))
    const injected = generateMonthlyReportHTML({ data: full, projectLabel: '<script>alert(1)</script>', generatedAt: NOW.toISOString(), generatedBy: 'owner', language: 'he' })
    check('R13: a project name is escaped, never markup in the file', !injected.includes('<script>') && injected.includes('&lt;script&gt;'))
    check('R14: Hebrew is laid out right to left, English is not',
      generateMonthlyReportHTML({ data: full, projectLabel: 'x', generatedAt: NOW.toISOString(), generatedBy: 'owner', language: 'he' }).includes('dir="rtl"')
      && generateMonthlyReportHTML({ data: full, projectLabel: 'x', generatedAt: NOW.toISOString(), generatedBy: 'owner', language: 'en' }).includes('dir="ltr"'))
    const emptyHtml = generateMonthlyReportHTML({ data: aggregateMonth(emptyInputs()), projectLabel: 'x', generatedAt: NOW.toISOString(), generatedBy: 'cron', language: 'he' })
    check('R15: an empty month downloads too, and every section says why it is empty',
      [he.noKeywords, he.aiNone, he.gscNotConnected, he.planEmpty].every((s) => textOf(emptyHtml).includes(s)))
    check('R16: the file name carries no path and no name a browser would mishandle', /^monthly-report-[0-9-]+\.pdf$/.test(monthlyReportFileName('2026-08')) && monthlyReportFileName('../../etc') === 'monthly-report-.pdf')

    const withIcon = generateMonthlyReportHTML({ data: full, projectLabel: 'x', generatedAt: NOW.toISOString(), generatedBy: 'owner', language: 'he', siteIcon: 'https://site.test/icon.png?a=1&b="2' })
    check('R17a: the site icon from the scan sits in the header, escaped, with no referrer',
      /<h1><img class="site-icon" src="https:\/\/site\.test\/icon\.png\?a=1&amp;b=&quot;2" alt="" width="28" height="28" referrerpolicy="no-referrer">/.test(withIcon))
    check('R17b: no icon, no image: the header is as before', !emptyHtml.includes('<img'))

    // The screen offers it: the button is on the report, and it is absent when
    // there is no project to ask about.
    const view = render(createElement(MonthlyReportView, { projectId: P, data: full, generatedAt: NOW.toISOString(), generatedBy: 'owner', language: 'he', projectLabel: 'site.test' }))
    check('R17: the report screen offers the download', view.includes('data-monthly-download') && textOf(view).includes(he.download))
    const noProject = render(createElement(MonthlyReportView, { projectId: null, data: full, generatedAt: NOW.toISOString(), generatedBy: 'owner', language: 'he', projectLabel: 'site.test' }))
    check('R-MUT: with no project there is nothing to download and the button is not offered', !noProject.includes('data-monthly-download'))
  }

  // ── P) no provider, no model, no Shopify ───────────────────────────────────
  console.log('\nP) no provider or model, nothing Shopify')
  {
    check('P1: the whole suite made no network request', fetched.length === 0, fetched.join())
    const PURE = ['aggregate.ts', 'store.ts', 'generate.ts', 'http.ts', 'period.ts', 'types.ts', 'pdf.ts']
    const pure = PURE.map((f) => strip(read(`lib/reports/monthly/${f}`)))
    const server = [...pure, strip(read('lib/reports/monthly/live-deps.ts'))]
    /**
     * What the report's server code may reach: its own files, the Supabase
     * clients, the product's own locale helpers (pure, no provider), and the
     * dashboard dictionary the download renders its words from.
     */
    // The site icon helper is pure too: it reads the stored address and builds an <img>; it fetches nothing.
    const allowed = /^(\.\/[\w-]+|@\/lib\/supabase\/(admin|server)|@\/lib\/i18n\/[\w/-]+|@\/components\/reports\/monthly\/copy|@\/lib\/reports\/report-site-icon)$/
    const imports = (list: string[]) => list.flatMap((s) => [...s.matchAll(/from '([^']+)'/g)].map((m) => m[1])).filter((m) => !allowed.test(m))
    // live-deps is the WIRING: it is the only file allowed to name the thing
    // that leaves the process (the PDF renderer for the download).
    const WIRING_ONLY = '@/lib/export/pdfshift'
    check('P2: the report\'s pure server code imports only its own files, the Supabase clients and the product\'s own words', imports(pure).length === 0, imports(pure).join())
    check('P2a: the one import that leaves the process is in the wiring alone, and it is the PDF renderer the download needs',
      imports(server).length === 1 && imports(server)[0] === WIRING_ONLY && pure.every((s) => !s.includes(WIRING_ONLY)),
      imports(server).join())
    check('P-MUT: importing a model client fails P2', imports([...pure, "import { gemini } from '@/lib/ai-visibility/gemini-semantic-classifier'"]).length === 1)
    check('P-MUT1a: the renderer reached from a pure module fails P2a', imports([...pure, `import { renderPdfFromHtml } from '${WIRING_ONLY}'`]).length === 1)
    const noFetch = (list: string[]) => list.every((s) => !/\bfetch\(|gemini|openai|anthropic|serper|dataforseo|scrapellm/i.test(s))
    check('P3: no fetch and no provider name in the server code', noFetch(server))
    check('P-MUT2: a fetch in the aggregation fails P3', !noFetch([...server, "await fetch('https://api.example')"]))
    const touched = ['components/reports/monthly/MonthlyReports.tsx', 'components/reports/monthly/MonthlyReportView.tsx', 'components/reports/monthly/MonthlyReportTeaser.tsx', 'components/reports/monthly/WeeklyEmailCard.tsx', 'app/api/reports/monthly/cron/route.ts']
      .map((f) => strip(read(f)))
    const shopify = (list: string[]) => list.some((s) => /shopify\//i.test(s) && /from '[^']*shopify/.test(s))
    check('P4: the report imports nothing from the Shopify code', !shopify([...server, ...touched]))
    check('P-MUT3: a Shopify import fails P4', shopify([...server, "import { x } from '@/lib/shopify/billing-guard'"]))
    const embedded = readdirSync(join(ROOT, 'app/shopify'), { recursive: true }) as string[]
    const mentions = embedded.filter((f) => /\.(ts|tsx)$/.test(f)).filter((f) => /reports\/monthly|MonthlyReport|WeeklyEmail/.test(read(join('app/shopify', f))))
    check('P5: no embedded Shopify page mounts the monthly report or the email switch', mentions.length === 0, mentions.map((f) => relative(ROOT, f)).join())
  }

  // Sanity on the calendar used everywhere above.
  const { start, end } = monthRange(MONTH)
  check('Z1: August 2026 is [1 Aug, 1 Sep) in UTC', start.toISOString() === '2026-08-01T00:00:00.000Z' && end.toISOString() === '2026-09-01T00:00:00.000Z')

  console.log(`\n${pass} passed, ${fail} failed`)
  if (fail > 0) process.exit(1)
}
main().catch((e) => { console.error(e); process.exit(1) })

export {}
