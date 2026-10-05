/**
 * GET /api/gsc/export — the Search Console positions report as a file.
 *
 * Read-only over the LATEST SUCCEEDED sync of the requested window, exactly the
 * data the screens already show. It computes nothing new, changes nothing, and
 * does not touch the live rank report's export (lib/export/*), which answers a
 * different question — see lib/gsc/export/sheets.ts for why they stay apart.
 *
 * THE ROUTE AUTHENTICATES ITSELF. proxy.ts excludes /api/*, so there is no
 * middleware behind this: `auth` is the project's owner check, and every read
 * below is filtered by that project even though the service-role client bypasses
 * RLS. A download is the easiest way to hand one customer another's data, so the
 * project id is never trusted for more than naming the project.
 *
 * The answers are stable codes, never provider text:
 *   404 gsc_disabled      Search Console is off on this server
 *   502 pdf_unavailable   the PDF provider refused or is not configured
 *   400 invalid_window / invalid_format
 *   409 no_sync           nothing has been synced for this window yet
 *   500 export_read_failed
 */
import type { ServiceRoleClient } from '@/lib/supabase/admin'
import { gscExportLabels, gscPdfLabels } from './labels'
import { gscExportFileName, gscExportSheets, toCsv, type GscExportInput } from './sheets'
import { generateGscSummaryHTML, gscSummaryFileName } from './pdf-summary'
import { normalizeExportLanguage } from '@/lib/export/i18n'
import { keywordAverages, type KeywordTarget, type QueryPositionRow } from '@/lib/gsc/tab-metrics'

/** A run stores at most 50,000 rows; the read is bounded by the same number. */
export const MAX_EXPORT_ROWS = 50_000
const FETCH_CHUNK = 1_000
export const EXPORT_FORMATS = ['xlsx', 'csv', 'pdf'] as const
export type ExportFormat = (typeof EXPORT_FORMATS)[number]

export interface GscExportRun {
  id: string
  window_days: number
  start_date: string | null
  end_date: string | null
  latest_available_date: string | null
  finished_at: string | null
  truncated: boolean | null
  summary_total_clicks: number | null
  summary_total_impressions: number | null
  summary_total_ctr: number | null
  summary_average_position: number | null
}

export interface GscExportDeps {
  /** Search Console switched on for this server at all. */
  enabled: () => boolean
  /** The project's owner check; anything but `ok` is answered as it comes. */
  auth: (projectId: string | null) => Promise<{ ok: true; admin: ServiceRoleClient; projectId: string; userId: string } | { ok: false; status: number; error: string }>
  /** The latest succeeded run of the window, or null. */
  latestRun: (admin: ServiceRoleClient, projectId: string, windowDays: number) => Promise<GscExportRun | null>
  /** Turns the report's rows into the bytes of a workbook. */
  workbook: (sheets: ReturnType<typeof gscExportSheets>) => Promise<Uint8Array>
  /**
   * HTML to PDF bytes, or null when the provider refuses or is not configured.
   * Injected so the summary can be rendered and read in a QA suite without
   * leaving the process.
   */
  pdf: (html: string) => Promise<ArrayBuffer | null>
  /** The moment printed on the summary, injected so a test can fix it. */
  now: () => Date
  windows: readonly number[]
}

const XLSX_TYPE = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'

function refuse(status: number, error: string): Response {
  return Response.json({ ok: false, error }, { status, headers: { 'cache-control': 'no-store' } })
}

export async function handleGscExport(request: Request, deps: GscExportDeps): Promise<Response> {
  if (!deps.enabled()) return refuse(404, 'gsc_disabled')
  const url = new URL(request.url)
  const auth = await deps.auth(url.searchParams.get('projectId'))
  if (!auth.ok) return refuse(auth.status, auth.error)

  const windowDays = Number(url.searchParams.get('window')) || 28
  if (!deps.windows.includes(windowDays)) return refuse(400, 'invalid_window')
  const format = (url.searchParams.get('format') ?? 'xlsx') as ExportFormat
  if (!EXPORT_FORMATS.includes(format)) return refuse(400, 'invalid_format')
  const labels = gscExportLabels(url.searchParams.get('language'))

  let run: GscExportRun | null
  try {
    run = await deps.latestRun(auth.admin, auth.projectId, windowDays)
  } catch {
    return refuse(500, 'export_read_failed')
  }
  // Nothing synced yet is not an error in the request: the screen offers the
  // download only once there are figures, and this is the server saying the same.
  if (!run) return refuse(409, 'no_sync')

  // The project's own name and address, read as its owner's.
  let projectName = ''
  let domain: string | null = null
  try {
    const { data } = await auth.admin.from('projects').select('name, target_domain').eq('id', auth.projectId).eq('user_id', auth.userId).maybeSingle()
    const row = data as { name?: string | null; target_domain?: string | null } | null
    projectName = row?.name ?? ''
    domain = row?.target_domain ?? null
  } catch {
    return refuse(500, 'export_read_failed')
  }

  let siteUrl: string | null = null
  try {
    const { data } = await auth.admin.from('project_gsc_properties').select('site_url').eq('project_id', auth.projectId).maybeSingle()
    siteUrl = (data as { site_url?: string | null } | null)?.site_url ?? null
  } catch {
    siteUrl = null
  }

  const rows: GscExportInput['rows'] = []
  let capped = false
  for (let offset = 0; offset < MAX_EXPORT_ROWS; offset += FETCH_CHUNK) {
    const { data, error } = await auth.admin
      .from('gsc_query_page_metrics')
      .select('query,page,clicks,impressions,ctr,position')
      .eq('sync_run_id', run.id)
      .eq('project_id', auth.projectId)
      .order('impressions', { ascending: false })
      .order('query', { ascending: true })
      .order('page', { ascending: true })
      .range(offset, offset + FETCH_CHUNK - 1)
    if (error) return refuse(500, 'export_read_failed')
    const batch = (data ?? []) as GscExportInput['rows']
    rows.push(...batch)
    if (batch.length < FETCH_CHUNK) break
    if (rows.length >= MAX_EXPORT_ROWS) { capped = true; break }
  }

  // The tracked keywords, matched to the run's queries the same way every screen
  // matches them, so the file and the Keywords tab cannot disagree.
  let keywords: GscExportInput['keywords'] = []
  try {
    const { data } = await auth.admin.from('tracking_targets').select('id,keyword').eq('project_id', auth.projectId)
    const targets = (data ?? []) as KeywordTarget[]
    const averages = keywordAverages(targets, rows as unknown as QueryPositionRow[])
    keywords = targets
      .filter((target) => !!target.keyword)
      .map((target) => {
        const g = averages[target.id]
        return { keyword: target.keyword, clicks: g?.clicks ?? 0, impressions: g?.impressions ?? 0, position: g?.position ?? null }
      })
      .sort((a, b) => b.impressions - a.impressions || a.keyword.localeCompare(b.keyword))
  } catch {
    keywords = []
  }

  const input: GscExportInput = {
    projectName,
    domain,
    siteUrl,
    windowDays: run.window_days,
    startDate: run.start_date,
    endDate: run.end_date,
    latestAvailableDate: run.latest_available_date,
    syncedAt: run.finished_at,
    totals: run.summary_total_clicks === null && run.summary_total_impressions === null
      ? null
      : {
        clicks: run.summary_total_clicks ?? 0,
        impressions: run.summary_total_impressions ?? 0,
        ctr: run.summary_total_ctr,
        avgPosition: run.summary_average_position,
      },
    rows,
    truncated: run.truncated === true || capped,
    keywords,
    labels,
  }

  const sheets = gscExportSheets(input)
  // The summary names itself differently, so the name is settled per format
  // rather than once: gscExportFileName only knows the two spreadsheets.
  const fileName = format === 'pdf'
    ? gscSummaryFileName(run.window_days, run.end_date)
    : gscExportFileName(run.window_days, run.end_date, format)
  const headers: Record<string, string> = {
    'content-disposition': `attachment; filename="${fileName}"`,
    'cache-control': 'no-store',
  }

  if (format === 'csv') {
    // The queries table is the report; the summary's lines ride above it so the
    // single file still says which window and which property it covers.
    const body = `${toCsv(sheets[0])}\r\n\r\n${toCsv(sheets[1])}`
    // The BOM is what makes Excel read it as UTF-8; without it Hebrew arrives as
    // mojibake on a Windows machine.
    return new Response(`\uFEFF${body}`, { headers: { ...headers, 'content-type': 'text/csv; charset=utf-8' } })
  }

  if (format === 'pdf') {
    // The two-page summary, from the same input the workbook is built from.
    const html = generateGscSummaryHTML({
      ...input,
      pdf: gscPdfLabels(url.searchParams.get('language')),
      language: normalizeExportLanguage(url.searchParams.get('language')),
      generatedAt: deps.now().toISOString().slice(0, 10),
    })
    const pdfBytes = await deps.pdf(html)
    // A provider that refuses is not the customer's fault and not their problem:
    // a stable code, never the provider's text.
    if (!pdfBytes) return refuse(502, 'pdf_unavailable')
    return new Response(pdfBytes, { headers: { ...headers, 'content-type': 'application/pdf' } })
  }

  let bytes: Uint8Array
  try {
    bytes = await deps.workbook(sheets)
  } catch {
    return refuse(500, 'export_read_failed')
  }
  return new Response(bytes as unknown as BodyInit, { headers: { ...headers, 'content-type': XLSX_TYPE } })
}
