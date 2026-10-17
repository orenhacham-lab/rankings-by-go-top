/**
 * Every database read and write of the monthly report.
 *
 * The client is the SERVICE-ROLE client, which bypasses RLS, so every query here
 * filters by the project AND its owner itself:
 *   - the project is read with id AND user_id (loadOwnedProject); nothing else is
 *     read until that row is found;
 *   - a table that carries user_id is filtered by project_id AND user_id;
 *   - a table without one (scan_results, ai_scan_results, the Search Console
 *     tables) is filtered by the owner-verified project, or, for scan_results,
 *     by the ids of the keywords that were read with the owner filter.
 * lib/reports/monthly/__qa__/monthly-report.qa.ts checks every read for this.
 *
 * NO PROVIDER, NO MODEL. Only the app's own tables are read.
 */
import type { ServiceRoleClient } from '@/lib/supabase/admin'
import type { ArticleRow, CheckRow, GscRunRow, MonthInputs, TargetRow } from './aggregate'
import { monthDays, monthKeyFromPeriod, monthRange, periodMonthOf, shiftMonth, type MonthKey } from './period'
import { MONTHLY_REPORT_VERSION, summarize, type MonthlyReportData, type MonthlyReportSummary } from './types'

type Row = Record<string, unknown>
type QueryError = { code?: string; message?: string } | null
type Result = { data: unknown; error: QueryError }

export interface OwnedProject { id: string; user_id: string; created_at: string | null }

/** PostgREST / Postgres "relation does not exist". */
const MISSING_TABLE = new Set(['42P01', 'PGRST205'])
/** The last check before the month is looked for this far back. */
export const BASELINE_LOOKBACK_DAYS = 92
const TARGET_CHUNK = 100
const CHECK_ROWS_CAP = 10_000
const LIST_CAP = 500
export const MONTHS_LISTED = 24

/** A read failed for a reason other than a missing table. Carries a stable code only. */
export class MonthlyReportReadError extends Error {
  constructor(public code: string) { super(code) }
}
/** The report tables are not there (the migration has not been applied). */
export class MonthlyReportUnavailable extends Error {
  constructor() { super('monthly_reports_unavailable') }
}

function isMissing(error: QueryError): boolean {
  return !!error?.code && MISSING_TABLE.has(error.code)
}

/** Rows of an INPUT query: a missing table (a module not installed) is no rows; any other failure stops. */
async function inputRows(q: PromiseLike<Result>, code: string): Promise<Row[]> {
  const { data, error } = await q
  if (error) {
    if (isMissing(error)) return []
    throw new MonthlyReportReadError(code)
  }
  return Array.isArray(data) ? (data as Row[]) : []
}

/** Rows of a REPORT-table query: a missing table means the feature is unavailable. */
async function reportRows(q: PromiseLike<Result>, code: string): Promise<Row[]> {
  const { data, error } = await q
  if (error) {
    if (isMissing(error)) throw new MonthlyReportUnavailable()
    throw new MonthlyReportReadError(code)
  }
  return Array.isArray(data) ? (data as Row[]) : []
}

const str = (v: unknown): string | null => (typeof v === 'string' && v.length > 0 ? v : null)

/** The project, only when `userId` owns it. */
export async function loadOwnedProject(admin: ServiceRoleClient, projectId: string, userId: string): Promise<OwnedProject | null> {
  const { data, error } = await admin.from('projects').select('id, user_id, created_at')
    .eq('id', projectId).eq('user_id', userId).maybeSingle()
  if (error) throw new MonthlyReportReadError('project_read_failed')
  const row = data as Row | null
  if (!row || row.id !== projectId || row.user_id !== userId) return null
  return { id: projectId, user_id: userId, created_at: str(row.created_at) }
}

async function loadRankInputs(admin: ServiceRoleClient, p: OwnedProject, month: MonthKey) {
  const targets = (await inputRows(
    admin.from('tracking_targets').select('id, keyword, engine_type, is_active')
      .eq('project_id', p.id).eq('user_id', p.user_id).eq('is_active', true).limit(LIST_CAP * 4),
    'targets_read_failed',
  )).flatMap((r): TargetRow[] => {
    const id = str(r.id), keyword = str(r.keyword)
    return id && keyword ? [{ id, keyword, engine_type: str(r.engine_type), is_active: r.is_active !== false }] : []
  })

  const { start, end } = monthRange(month)
  const lookback = new Date(start.getTime() - BASELINE_LOOKBACK_DAYS * 86_400_000)
  const checks: CheckRow[] = []
  const ids = targets.map((t) => t.id)
  for (let i = 0; i < ids.length; i += TARGET_CHUNK) {
    const chunk = ids.slice(i, i + TARGET_CHUNK)
    const cols = 'tracking_target_id, position, found, checked_at'
    const [during, before] = await Promise.all([
      inputRows(admin.from('scan_results').select(cols).in('tracking_target_id', chunk)
        .gte('checked_at', start.toISOString()).lt('checked_at', end.toISOString())
        .order('checked_at', { ascending: false }).limit(CHECK_ROWS_CAP), 'checks_read_failed'),
      inputRows(admin.from('scan_results').select(cols).in('tracking_target_id', chunk)
        .gte('checked_at', lookback.toISOString()).lt('checked_at', start.toISOString())
        .order('checked_at', { ascending: false }).limit(CHECK_ROWS_CAP), 'checks_read_failed'),
    ])
    for (const r of [...during, ...before]) {
      const target = str(r.tracking_target_id), at = str(r.checked_at)
      if (!target || !at || !chunk.includes(target)) continue
      checks.push({ tracking_target_id: target, position: typeof r.position === 'number' ? r.position : null, found: typeof r.found === 'boolean' ? r.found : null, checked_at: at })
    }
  }
  return { targets, checks }
}

async function loadArticles(admin: ServiceRoleClient, p: OwnedProject, month: MonthKey): Promise<ArticleRow[]> {
  const { start, end } = monthRange(month)
  const cols = 'id, title, status, published_at, shopify_status, shopify_published_at, wp_post_url, shopify_article_url'
  const owned = () => admin.from('generated_articles').select(cols).eq('project_id', p.id).eq('user_id', p.user_id)
  const [wp, shop] = await Promise.all([
    inputRows(owned().eq('status', 'published').gte('published_at', start.toISOString()).lt('published_at', end.toISOString()).limit(LIST_CAP), 'articles_read_failed'),
    inputRows(owned().eq('shopify_status', 'published').gte('shopify_published_at', start.toISOString()).lt('shopify_published_at', end.toISOString()).limit(LIST_CAP), 'articles_read_failed'),
  ])
  return [...wp, ...shop].flatMap((r): ArticleRow[] => {
    const id = str(r.id)
    return id ? [{
      id, title: str(r.title), status: str(r.status), published_at: str(r.published_at),
      shopify_status: str(r.shopify_status), shopify_published_at: str(r.shopify_published_at),
      wp_post_url: str(r.wp_post_url), shopify_article_url: str(r.shopify_article_url),
    }] : []
  })
}

async function loadAi(admin: ServiceRoleClient, p: OwnedProject, month: MonthKey) {
  const { start, end } = monthRange(month)
  // ai_scan_results has no user_id column: filtered by the owner-verified project.
  const rows = await inputRows(
    admin.from('ai_scan_results').select('mentioned, target_cited')
      .eq('project_id', p.id).eq('status', 'success').eq('excluded_from_score', false)
      .gte('created_at', start.toISOString()).lt('created_at', end.toISOString()).limit(CHECK_ROWS_CAP),
    'ai_read_failed',
  )
  return rows.map((r) => ({ mentioned: r.mentioned === true, target_cited: r.target_cited === true }))
}

async function latestRunEndingIn(admin: ServiceRoleClient, p: OwnedProject, month: MonthKey): Promise<GscRunRow | null> {
  const { startDay, endDay } = monthDays(month)
  const rows = await inputRows(
    admin.from('gsc_sync_runs')
      .select('start_date, end_date, total_clicks, total_impressions, summary_total_clicks, summary_total_impressions')
      .eq('project_id', p.id).eq('window_days', 28).eq('status', 'succeeded')
      .gte('end_date', startDay).lt('end_date', endDay)
      .order('end_date', { ascending: false }).limit(1),
    'gsc_read_failed',
  )
  return (rows[0] as unknown as GscRunRow | undefined) ?? null
}

async function loadGsc(admin: ServiceRoleClient, p: OwnedProject, month: MonthKey): Promise<MonthInputs['gsc']> {
  const property = await inputRows(
    admin.from('project_gsc_properties').select('project_id').eq('project_id', p.id).limit(1),
    'gsc_read_failed',
  )
  if (property.length === 0) return { connected: false, current: null, previous: null }
  const [current, previous] = await Promise.all([
    latestRunEndingIn(admin, p, month),
    latestRunEndingIn(admin, p, shiftMonth(month, -1)),
  ])
  return { connected: true, current, previous }
}

async function loadPlan(admin: ServiceRoleClient, p: OwnedProject, month: MonthKey): Promise<MonthInputs['plan']> {
  const next = monthRange(shiftMonth(month, 1))
  const owned = (table: string, cols: string) => admin.from(table).select(cols).eq('project_id', p.id).eq('user_id', p.user_id)
  const [scheduled, ready, queued, topics, ideas] = await Promise.all([
    inputRows(owned('generated_articles', 'title, scheduled_at').eq('status', 'scheduled')
      .gte('scheduled_at', next.start.toISOString()).lt('scheduled_at', next.end.toISOString())
      .order('scheduled_at', { ascending: true }).limit(LIST_CAP), 'plan_read_failed'),
    inputRows(owned('generated_articles', 'id').eq('status', 'ready').limit(LIST_CAP), 'plan_read_failed'),
    inputRows(owned('article_pool_items', 'id').eq('status', 'queued').limit(LIST_CAP), 'plan_read_failed'),
    inputRows(owned('article_topics', 'topic, created_at').eq('status', 'approved')
      .order('created_at', { ascending: true }).limit(LIST_CAP), 'plan_read_failed'),
    inputRows(owned('content_topic_ideas', 'title, score').eq('status', 'pending').limit(LIST_CAP), 'plan_read_failed'),
  ])
  return {
    scheduled: scheduled.map((r) => ({ title: str(r.title), scheduled_at: str(r.scheduled_at) })),
    readyCount: ready.length,
    queuedCount: queued.length,
    approvedTopics: topics.map((r) => ({ topic: str(r.topic), created_at: str(r.created_at) })),
    approvedCount: topics.length,
    ideas: ideas.map((r) => ({ title: str(r.title), score: typeof r.score === 'number' || typeof r.score === 'string' ? r.score : null })),
    ideasCount: ideas.length,
  }
}

/** Everything one month of `p` is made of. `p` must come from loadOwnedProject or the cron's project read. */
export async function loadMonthInputs(admin: ServiceRoleClient, p: OwnedProject, month: MonthKey): Promise<MonthInputs> {
  const [rank, articles, ai, gsc, plan] = await Promise.all([
    loadRankInputs(admin, p, month),
    loadArticles(admin, p, month),
    loadAi(admin, p, month),
    loadGsc(admin, p, month),
    loadPlan(admin, p, month),
  ])
  return { month, projectCreatedAt: p.created_at, targets: rank.targets, checks: rank.checks, articles, ai, gsc, plan }
}

// ── the report table ──────────────────────────────────────────────────────────

export interface StoredReport {
  month: MonthKey
  generatedAt: string
  generatedBy: 'cron' | 'owner'
  data: MonthlyReportData
}

function toStored(r: Row): StoredReport | null {
  const month = typeof r.period_month === 'string' ? monthKeyFromPeriod(r.period_month) : null
  const data = r.data as MonthlyReportData | null
  const generatedAt = str(r.generated_at)
  if (!month || !generatedAt || !data || typeof data !== 'object' || data.v !== MONTHLY_REPORT_VERSION) return null
  return { month, generatedAt, generatedBy: r.generated_by === 'owner' ? 'owner' : 'cron', data }
}

const REPORT_COLS = 'period_month, generated_by, generated_at, data'

export async function readReport(admin: ServiceRoleClient, p: OwnedProject, month: MonthKey): Promise<StoredReport | null> {
  const rows = await reportRows(
    admin.from('project_monthly_reports').select(REPORT_COLS)
      .eq('project_id', p.id).eq('user_id', p.user_id).eq('period_month', periodMonthOf(month)).limit(1),
    'report_read_failed',
  )
  return rows.length ? toStored(rows[0]) : null
}

export async function listReports(admin: ServiceRoleClient, p: OwnedProject): Promise<{ summaries: MonthlyReportSummary[]; latest: StoredReport | null; byMonth: Map<MonthKey, StoredReport> }> {
  const rows = await reportRows(
    admin.from('project_monthly_reports').select(REPORT_COLS)
      .eq('project_id', p.id).eq('user_id', p.user_id)
      .order('period_month', { ascending: false }).limit(MONTHS_LISTED),
    'report_list_failed',
  )
  const byMonth = new Map<MonthKey, StoredReport>()
  for (const r of rows) {
    const s = toStored(r)
    if (s && !byMonth.has(s.month)) byMonth.set(s.month, s)
  }
  const stored = [...byMonth.values()].sort((a, b) => (a.month < b.month ? 1 : -1))
  return {
    summaries: stored.map((s) => summarize(s.month, s.generatedAt, s.generatedBy, s.data)),
    latest: stored[0] ?? null,
    byMonth,
  }
}

/**
 * Store a finished report. INSERT only: the table grants no UPDATE, and a
 * second report for the same month hits the unique index (23505), which is
 * reported as 'exists' and leaves the first one exactly as it was.
 */
export async function insertReport(
  admin: ServiceRoleClient, p: OwnedProject, month: MonthKey, data: MonthlyReportData, by: 'cron' | 'owner',
): Promise<'created' | 'exists'> {
  const { error } = await admin.from('project_monthly_reports').insert({
    user_id: p.user_id,
    project_id: p.id,
    period_month: periodMonthOf(month),
    generated_by: by,
    schema_version: MONTHLY_REPORT_VERSION,
    data,
  })
  if (!error) return 'created'
  if (error.code === '23505') return 'exists'
  if (isMissing(error)) throw new MonthlyReportUnavailable()
  throw new MonthlyReportReadError('report_insert_failed')
}

// ── preferences ───────────────────────────────────────────────────────────────

export async function readPreferences(admin: ServiceRoleClient, p: OwnedProject): Promise<{ weeklyEmailSummary: boolean }> {
  const rows = await reportRows(
    admin.from('project_report_preferences').select('weekly_email_summary')
      .eq('project_id', p.id).eq('user_id', p.user_id).limit(1),
    'preferences_read_failed',
  )
  // No row = never set = OFF.
  return { weeklyEmailSummary: rows[0]?.weekly_email_summary === true }
}

export async function writePreferences(admin: ServiceRoleClient, p: OwnedProject, weeklyEmailSummary: boolean): Promise<{ weeklyEmailSummary: boolean }> {
  const { error } = await admin.from('project_report_preferences').upsert(
    { project_id: p.id, user_id: p.user_id, weekly_email_summary: weeklyEmailSummary, updated_at: new Date().toISOString() },
    { onConflict: 'project_id' },
  )
  if (error) {
    if (isMissing(error)) throw new MonthlyReportUnavailable()
    throw new MonthlyReportReadError('preferences_write_failed')
  }
  return { weeklyEmailSummary }
}
