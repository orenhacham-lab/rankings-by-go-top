/**
 * Making a monthly report: for one project (the owner's "create last month's
 * report now"), and for every due project (the cron on the 1st).
 *
 * IDEMPOTENT. A month that already has a report is never recomputed and never
 * rewritten: the existing row is found first and the work stops; a race between
 * two runs ends at the unique index, and the loser reports 'exists'. The table
 * grants no UPDATE at all (the migration), so this holds even if a caller forgot.
 *
 * BOUNDED. One cron invocation reports on at most `batchSize` projects and stops
 * starting new ones when its time budget is spent. The cron runs once a day
 * (vercel.json), and each run picks up the projects still missing the month,
 * so any number of projects is covered over the following days.
 *
 * NO PROVIDER, NO MODEL: aggregates of stored rows only (store.ts, aggregate.ts).
 */
import type { ServiceRoleClient } from '@/lib/supabase/admin'
import { aggregateMonth } from './aggregate'
import { lastCompleteMonth, monthKeyOf, monthRange, periodMonthOf, type MonthKey } from './period'
import { insertReport, loadMonthInputs, MonthlyReportReadError, MonthlyReportUnavailable, readReport, type OwnedProject } from './store'
import type { MonthlyReportData } from './types'

export type GenerateOutcome =
  | { status: 'created'; data: MonthlyReportData }
  | { status: 'exists' }
  /** The month has not ended yet: a report is only made for a finished month. */
  | { status: 'month_not_over' }
  /** The project did not exist yet during that month. */
  | { status: 'before_project' }

/** Whether `month` can have a report for a project created at `createdAt`, at `now`. */
export function reportableMonth(month: MonthKey, createdAt: string | null, now: Date): 'ok' | 'month_not_over' | 'before_project' {
  const { end } = monthRange(month)
  if (month >= monthKeyOf(now) || end.getTime() > now.getTime()) return 'month_not_over'
  const created = createdAt ? Date.parse(createdAt) : NaN
  if (Number.isFinite(created) && created >= end.getTime()) return 'before_project'
  return 'ok'
}

export async function generateMonthlyReport(
  admin: ServiceRoleClient, project: OwnedProject, month: MonthKey, by: 'cron' | 'owner', now: Date,
): Promise<GenerateOutcome> {
  const when = reportableMonth(month, project.created_at, now)
  if (when !== 'ok') return { status: when }
  // Already made: stop before reading anything else.
  if (await readReport(admin, project, month)) return { status: 'exists' }
  const data = aggregateMonth(await loadMonthInputs(admin, project, month))
  const stored = await insertReport(admin, project, month, data, by)
  return stored === 'created' ? { status: 'created', data } : { status: 'exists' }
}

// ── the cron ──────────────────────────────────────────────────────────────────

export const DEFAULT_BATCH_SIZE = 60
export const DEFAULT_TIME_BUDGET_MS = 240_000
export const DEFAULT_CONCURRENCY = 4
/** The most projects one run looks at when choosing its batch. */
export const CANDIDATE_CAP = 5_000

export interface CronSummary {
  month: MonthKey
  state: 'ran' | 'unavailable'
  candidates: number
  alreadyDone: number
  due: number
  attempted: number
  created: number
  existed: number
  skipped: number
  failed: number
  stoppedForTime: boolean
  remaining: number
  durationMs: number
}

function envInt(v: string | undefined, fallback: number, min: number, max: number): number {
  const n = Number(v)
  return Number.isInteger(n) && n >= min && n <= max ? n : fallback
}

export function cronLimits(env: Record<string, string | undefined> = process.env) {
  return {
    batchSize: envInt(env.MONTHLY_REPORT_BATCH_SIZE, DEFAULT_BATCH_SIZE, 1, 500),
    timeBudgetMs: envInt(env.MONTHLY_REPORT_TIME_BUDGET_MS, DEFAULT_TIME_BUDGET_MS, 5_000, 280_000),
    concurrency: envInt(env.MONTHLY_REPORT_CONCURRENCY, DEFAULT_CONCURRENCY, 1, 10),
  }
}

export async function runMonthlyReportCron(
  admin: ServiceRoleClient,
  opts: { now: Date; batchSize: number; timeBudgetMs: number; concurrency: number; clock?: () => number; log?: (msg: string, fields: Record<string, unknown>) => void },
): Promise<CronSummary> {
  const clock = opts.clock ?? Date.now
  const started = clock()
  const month = lastCompleteMonth(opts.now)
  const { end } = monthRange(month)
  const summary: CronSummary = {
    month, state: 'ran', candidates: 0, alreadyDone: 0, due: 0, attempted: 0,
    created: 0, existed: 0, skipped: 0, failed: 0, stoppedForTime: false, remaining: 0, durationMs: 0,
  }

  // The system actor's one cross-tenant read: which projects exist. Every read
  // about a project after this is filtered by that project's own owner.
  const { data: projectRows, error: projectErr } = await admin.from('projects')
    .select('id, user_id, created_at').eq('is_active', true).lt('created_at', end.toISOString())
    .order('created_at', { ascending: true }).limit(CANDIDATE_CAP)
  if (projectErr) throw new MonthlyReportReadError('projects_read_failed')

  const { data: doneRows, error: doneErr } = await admin.from('project_monthly_reports')
    .select('project_id').eq('period_month', periodMonthOf(month)).limit(CANDIDATE_CAP * 2)
  if (doneErr) {
    if (doneErr.code === '42P01' || doneErr.code === 'PGRST205') {
      summary.state = 'unavailable'
      summary.durationMs = clock() - started
      return summary
    }
    throw new MonthlyReportReadError('reports_read_failed')
  }
  const done = new Set(((doneRows as { project_id: string }[] | null) ?? []).map((r) => r.project_id))

  const candidates: OwnedProject[] = ((projectRows as Record<string, unknown>[] | null) ?? []).flatMap((r) =>
    typeof r.id === 'string' && typeof r.user_id === 'string' && r.user_id
      ? [{ id: r.id, user_id: r.user_id, created_at: typeof r.created_at === 'string' ? r.created_at : null }]
      : [])
  summary.candidates = candidates.length
  const due = candidates.filter((p) => !done.has(p.id))
  summary.alreadyDone = candidates.length - due.length
  summary.due = due.length

  const batch = due.slice(0, opts.batchSize)
  let next = 0
  const worker = async () => {
    while (next < batch.length) {
      if (clock() - started >= opts.timeBudgetMs) { summary.stoppedForTime = true; return }
      const project = batch[next++]
      summary.attempted++
      try {
        const outcome = await generateMonthlyReport(admin, project, month, 'cron', opts.now)
        if (outcome.status === 'created') summary.created++
        else if (outcome.status === 'exists') summary.existed++
        else summary.skipped++
      } catch (e) {
        summary.failed++
        // A stable code only, never a database or provider message.
        const code = e instanceof MonthlyReportReadError ? e.code : e instanceof MonthlyReportUnavailable ? 'unavailable' : 'report_failed'
        opts.log?.('[monthly-report] project failed', { projectId: project.id, code })
      }
    }
  }
  await Promise.all(Array.from({ length: Math.max(1, Math.min(opts.concurrency, batch.length)) }, worker))

  summary.remaining = Math.max(0, due.length - summary.created - summary.existed - summary.skipped)
  summary.durationMs = clock() - started
  return summary
}
