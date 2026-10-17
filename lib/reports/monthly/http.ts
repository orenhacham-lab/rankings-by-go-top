/**
 * The monthly report's routes, with their dependencies injected so the QA suite
 * runs the real handlers against FakeAdmin. The files under app/api/reports/monthly
 * only wire the real dependencies in.
 *
 *   GET  /api/reports/monthly?projectId=[&month=YYYY-MM]   the months and one report
 *   POST /api/reports/monthly/generate  { projectId }       last month's report, now
 *   GET  /api/reports/monthly/preferences?projectId=        the weekly-email switch
 *   PUT  /api/reports/monthly/preferences  { projectId, weeklyEmailSummary }
 *   GET|POST /api/reports/monthly/cron                      the 1st's run (CRON_SECRET)
 *   GET  /api/reports/monthly/pdf?projectId=[&month=][&lang=] the same report, to keep
 *
 * proxy.ts does not cover /api/*, so each handler checks everything itself, in
 * this order: a signed-in user, a well-formed project id, and that THIS user owns
 * the project (read with id AND user_id through the service-role client). An
 * administrator who is not the owner is refused like anyone else: the report is
 * owner-only, as its RLS policy. A project that is not the caller's answers 404,
 * never 403, so a project id cannot be probed.
 *
 * Failures answer one stable code, never a database or provider message.
 * When the report tables are not there yet (the migration is not applied),
 * the reads answer { available: false } and the screen shows nothing.
 */
import type { ServiceRoleClient } from '@/lib/supabase/admin'
import { generateMonthlyReport, reportableMonth, runMonthlyReportCron, cronLimits } from './generate'
import { isMonthKey, lastCompleteMonth, nextReportAt, type MonthKey } from './period'
import {
  listReports, loadOwnedProject, readPreferences, readReport, writePreferences,
  MonthlyReportUnavailable, type OwnedProject, type StoredReport,
} from './store'
import type { MonthlyReportSummary } from './types'
import { generateMonthlyReportHTML, monthlyReportFileName } from './pdf'
import { normalizeDashboardUiLocale } from '@/lib/i18n/dashboard/locale'
import { reportSiteIcon } from '@/lib/reports/report-site-icon'
import type { PublicLocale } from '@/lib/i18n/locales'

export interface MonthlyRouteDeps {
  /** The signed-in user's id, or null. */
  userId: () => Promise<string | null>
  admin: () => ServiceRoleClient
  now: () => Date
  /**
   * Rendering the download's HTML to a PDF. Injected because it is the one step
   * that leaves the process (PDFShift, already a disclosed sub-processor for the
   * ranking report), so the QA suite exercises the whole route without it.
   * Resolves to null when it is not configured or the render fails: the route
   * then answers its own code, never a provider's message.
   */
  renderPdf?: (html: string) => Promise<ArrayBuffer | null>
}

export type MonthlyErrorCode = 'invalid_request' | 'unauthorized' | 'not_found' | 'internal' | 'unavailable'

export interface MonthlyGetResponse {
  ok: true
  available: boolean
  months: MonthlyReportSummary[]
  report: StoredReport | null
  /** When the next automatic report is made. */
  nextReportAt: string
  /** The finished month that has no report yet, when the project existed during it. */
  missingMonth: MonthKey | null
}

const NO_STORE = { 'cache-control': 'no-store' }
const UUIDISH = /^[0-9a-zA-Z-]{8,64}$/

function refuse(status: number, code: MonthlyErrorCode): Response {
  return Response.json({ ok: false, code }, { status, headers: NO_STORE })
}
function ok(body: unknown, status = 200): Response {
  return Response.json(body, { status, headers: NO_STORE })
}

type Owned = { admin: ServiceRoleClient; project: OwnedProject } | { refusal: Response }

async function owned(deps: MonthlyRouteDeps, projectId: unknown): Promise<Owned> {
  let userId: string | null
  try {
    userId = await deps.userId()
  } catch {
    return { refusal: refuse(401, 'unauthorized') }
  }
  if (!userId) return { refusal: refuse(401, 'unauthorized') }
  if (typeof projectId !== 'string' || !UUIDISH.test(projectId)) return { refusal: refuse(400, 'invalid_request') }
  try {
    const admin = deps.admin()
    const project = await loadOwnedProject(admin, projectId, userId)
    if (!project) return { refusal: refuse(404, 'not_found') }
    return { admin, project }
  } catch {
    return { refusal: refuse(500, 'internal') }
  }
}

function missingMonthOf(project: OwnedProject, has: (m: MonthKey) => boolean, now: Date): MonthKey | null {
  const last = lastCompleteMonth(now)
  return !has(last) && reportableMonth(last, project.created_at, now) === 'ok' ? last : null
}

export async function handleMonthlyGet(request: Request, deps: MonthlyRouteDeps): Promise<Response> {
  const url = new URL(request.url)
  const o = await owned(deps, url.searchParams.get('projectId'))
  if ('refusal' in o) return o.refusal
  const monthParam = url.searchParams.get('month')
  if (monthParam !== null && !isMonthKey(monthParam)) return refuse(400, 'invalid_request')
  const now = deps.now()
  try {
    const { summaries, latest, byMonth } = await listReports(o.admin, o.project)
    const report = monthParam ? byMonth.get(monthParam) ?? (await readReport(o.admin, o.project, monthParam)) : latest
    const body: MonthlyGetResponse = {
      ok: true,
      available: true,
      months: summaries,
      report: report ?? null,
      nextReportAt: nextReportAt(now).toISOString(),
      missingMonth: missingMonthOf(o.project, (m) => byMonth.has(m), now),
    }
    return ok(body)
  } catch (e) {
    if (e instanceof MonthlyReportUnavailable) {
      return ok({ ok: true, available: false, months: [], report: null, nextReportAt: nextReportAt(now).toISOString(), missingMonth: null } satisfies MonthlyGetResponse)
    }
    return refuse(500, 'internal')
  }
}

/**
 * GET /api/reports/monthly/pdf — the stored monthly report as a PDF to keep.
 *
 * The same stored snapshot the screen shows, rendered from the same dictionary
 * (./pdf), so a downloaded report and the screen can never disagree. The
 * Search Console section is part of it, which the older ranking-report download
 * has never had.
 *
 * `lang` only chooses which of the product's own languages the words come in; an
 * unknown value falls back to Hebrew, and nothing from the query reaches the
 * page as content.
 */
export async function handleMonthlyPdf(request: Request, deps: MonthlyRouteDeps): Promise<Response> {
  const url = new URL(request.url)
  const o = await owned(deps, url.searchParams.get('projectId'))
  if ('refusal' in o) return o.refusal
  const monthParam = url.searchParams.get('month')
  if (monthParam !== null && !isMonthKey(monthParam)) return refuse(400, 'invalid_request')
  const language: PublicLocale = normalizeDashboardUiLocale(url.searchParams.get('lang')) ?? 'he'

  let report: StoredReport | null
  let projectLabel = ''
  let siteIcon: string | null = null
  try {
    if (monthParam) {
      report = await readReport(o.admin, o.project, monthParam)
    } else {
      report = (await listReports(o.admin, o.project)).latest
    }
    const { data } = await o.admin.from('projects').select('name, target_domain').eq('id', o.project.id).eq('user_id', o.project.user_id).maybeSingle()
    projectLabel = typeof (data as { name?: unknown } | null)?.name === 'string' ? (data as { name: string }).name : ''
    const target = (data as { target_domain?: unknown } | null)?.target_domain
    siteIcon = await reportSiteIcon(o.admin, o.project.id, typeof target === 'string' ? target : null)
  } catch (e) {
    return refuse(e instanceof MonthlyReportUnavailable ? 404 : 500, e instanceof MonthlyReportUnavailable ? 'unavailable' : 'internal')
  }
  if (!report) return refuse(404, 'not_found')

  const html = generateMonthlyReportHTML({
    data: report.data,
    projectLabel,
    generatedAt: report.generatedAt,
    generatedBy: report.generatedBy,
    language,
    siteIcon,
  })

  const pdf = deps.renderPdf ? await deps.renderPdf(html).catch(() => null) : null
  if (!pdf) return refuse(503, 'unavailable')
  return new Response(pdf, {
    status: 200,
    headers: {
      ...NO_STORE,
      'content-type': 'application/pdf',
      'content-disposition': `attachment; filename="${monthlyReportFileName(report.month)}"`,
    },
  })
}

async function jsonBody(request: Request): Promise<Record<string, unknown> | null> {
  try {
    const body = await request.json()
    return body && typeof body === 'object' && !Array.isArray(body) ? (body as Record<string, unknown>) : null
  } catch {
    return null
  }
}

/**
 * The owner's "create last month's report now": for a project whose last month
 * has no report (created mid-month, or before this feature). Always the last
 * finished month, never one the caller names, and never a rewrite.
 */
export async function handleMonthlyGenerate(request: Request, deps: MonthlyRouteDeps): Promise<Response> {
  const body = await jsonBody(request)
  if (!body) {
    // Still refuse an anonymous caller first.
    const who = await deps.userId().catch(() => null)
    return who ? refuse(400, 'invalid_request') : refuse(401, 'unauthorized')
  }
  const o = await owned(deps, body.projectId)
  if ('refusal' in o) return o.refusal
  const now = deps.now()
  const month = lastCompleteMonth(now)
  try {
    const outcome = await generateMonthlyReport(o.admin, o.project, month, 'owner', now)
    if (outcome.status === 'before_project' || outcome.status === 'month_not_over') {
      return ok({ ok: false, code: 'not_reportable', month }, 409)
    }
    const report = await readReport(o.admin, o.project, month)
    return ok({ ok: true, status: outcome.status, month, report }, outcome.status === 'created' ? 201 : 200)
  } catch (e) {
    if (e instanceof MonthlyReportUnavailable) return refuse(404, 'unavailable')
    return refuse(500, 'internal')
  }
}

export async function handlePreferencesGet(request: Request, deps: MonthlyRouteDeps): Promise<Response> {
  const o = await owned(deps, new URL(request.url).searchParams.get('projectId'))
  if ('refusal' in o) return o.refusal
  try {
    return ok({ ok: true, ...(await readPreferences(o.admin, o.project)) })
  } catch (e) {
    if (e instanceof MonthlyReportUnavailable) return refuse(404, 'unavailable')
    return refuse(500, 'internal')
  }
}

export async function handlePreferencesPut(request: Request, deps: MonthlyRouteDeps): Promise<Response> {
  const body = await jsonBody(request)
  if (!body) {
    const who = await deps.userId().catch(() => null)
    return who ? refuse(400, 'invalid_request') : refuse(401, 'unauthorized')
  }
  const o = await owned(deps, body.projectId)
  if ('refusal' in o) return o.refusal
  if (typeof body.weeklyEmailSummary !== 'boolean') return refuse(400, 'invalid_request')
  try {
    // Stored only. Nothing sends an email today (lib/reports/monthly/weekly-email.ts).
    return ok({ ok: true, ...(await writePreferences(o.admin, o.project, body.weeklyEmailSummary)) })
  } catch (e) {
    if (e instanceof MonthlyReportUnavailable) return refuse(404, 'unavailable')
    return refuse(500, 'internal')
  }
}

// ── the cron ──────────────────────────────────────────────────────────────────

export interface MonthlyCronDeps {
  /** authorizeCronRequest: null when authorized, else the Response to send. */
  authorize: (request: Request) => Response | null
  enabled: () => boolean
  admin: () => ServiceRoleClient
  now: () => Date
  /** next/server after(): the work runs once the 202 is sent. */
  schedule: (task: () => Promise<void>) => void
  log: (msg: string, fields: Record<string, unknown>) => void
  env?: Record<string, string | undefined>
}

export async function handleMonthlyCron(request: Request, deps: MonthlyCronDeps): Promise<Response> {
  // Authorization first, before anything else is looked at: it fails closed.
  const denied = deps.authorize(request)
  if (denied) return denied
  if (!deps.enabled()) return Response.json({ ok: true, skipped: 'disabled' }, { status: 200 })
  const now = deps.now()
  deps.schedule(async () => {
    try {
      const summary = await runMonthlyReportCron(deps.admin(), { now, ...cronLimits(deps.env), log: deps.log })
      deps.log('[monthly-report] run complete', { ...summary })
    } catch (e) {
      const code = e instanceof Error && /^[a-z_]+$/.test(e.message) ? e.message : 'run_failed'
      deps.log('[monthly-report] run failed', { code })
    }
  })
  return Response.json({ ok: true, accepted: true, month: lastCompleteMonth(now) }, { status: 202 })
}
