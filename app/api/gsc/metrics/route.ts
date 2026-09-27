/**
 * GET /api/gsc/metrics?projectId=...&window=28|90&view=queries|opportunities|multipage|pages|keywords|trend&page=0&pageSize=50
 *
 * Read-only diagnostics over the LATEST SUCCEEDED run for the requested window. Three
 * pure-display views — all server-side paginated:
 *   - queries:       query+page rows, impressions desc.
 *   - opportunities: rows at position 4..20 (pure filter), impressions desc.
 *   - multipage:     queries appearing on >1 distinct page (diagnostic signal only —
 *                    NOT confirmed cannibalization).
 * And three for the screens Search Console feeds (lib/gsc/tab-metrics.ts):
 *   - pages:    the project's top pages by clicks (dashboard).
 *   - keywords: each tracked keyword's clicks and impressions (keywords table).
 *   - trend:    the authoritative totals of every succeeded sync of the window, oldest
 *               first ("my progress"). Needs no latest run, so it is answered first.
 * Every read is filtered by the authenticated project: the admin client bypasses RLS.
 * This endpoint changes no state and produces no recommendation/score/opportunity.
 */
import { authContentProject } from '@/lib/content/api-auth'
import { isGscReadOnlyEnabled } from '@/lib/gsc/config'
import { latestSucceededRun, GscServiceError } from '@/lib/gsc/service'
import { GSC_WINDOWS, type GscWindowDays } from '@/lib/gsc/sync'
import { multiPageQueries, type GscMetricRow } from '@/lib/gsc/summary'
import { keywordFigures, topPagesByClicks, trendPoints, type KeywordTarget, type PageClicksRow, type QueryFiguresRow, type RunSummaryRow } from '@/lib/gsc/tab-metrics'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const MAX_PAGE_SIZE = 100
const FETCH_CHUNK = 1000
/** Runs read for the trend: enough for its points even when a window was synced twice. */
const TREND_RUN_LIMIT = 60
/** Top pages shown on the dashboard. */
const TOP_PAGES = 5
/** Upper bound on the rows one widget request reads (a run stores at most 50,000). The top
 *  pages read the clicked rows only, most clicked first, so the bound cuts the tail. */
const PAGES_MAX_ROWS = 20_000
const KEYWORDS_MAX_ROWS = 50_000

export async function GET(request: Request) {
  if (!isGscReadOnlyEnabled()) return Response.json({ error: 'Not found' }, { status: 404 })
  const url = new URL(request.url)
  const projectId = url.searchParams.get('projectId')
  const auth = await authContentProject(projectId)
  if ('error' in auth) return Response.json({ error: auth.error }, { status: auth.status })

  const windowDays = Number(url.searchParams.get('window')) as GscWindowDays
  if (!GSC_WINDOWS.includes(windowDays)) return Response.json({ ok: false, error: 'invalid_window' }, { status: 400 })
  const view = url.searchParams.get('view') ?? 'queries'
  const page = Math.max(0, Number(url.searchParams.get('page')) || 0)
  const pageSize = Math.min(MAX_PAGE_SIZE, Math.max(1, Number(url.searchParams.get('pageSize')) || 50))

  // trend: every succeeded sync of this window, the project's own only, oldest first.
  if (view === 'trend') {
    const { data, error } = await auth.admin
      .from('gsc_sync_runs')
      .select('start_date,end_date,started_at,summary_total_clicks,summary_total_impressions,summary_average_position,summary_aggregation_type')
      .eq('project_id', auth.project.id)
      .eq('window_days', windowDays)
      .eq('status', 'succeeded')
      .order('started_at', { ascending: false })
      .limit(TREND_RUN_LIMIT)
    if (error) return Response.json({ ok: false, error: 'metrics_read_failed' }, { status: 500 })
    return Response.json({ ok: true, view, points: trendPoints((data ?? []) as RunSummaryRow[]) })
  }

  let run
  try {
    run = await latestSucceededRun(auth.admin, auth.project.id, windowDays)
  } catch (e) {
    // A DB failure must NOT masquerade as "no run / empty metrics".
    if (e instanceof GscServiceError) return Response.json({ ok: false, error: e.code }, { status: e.status })
    return Response.json({ ok: false, error: 'metrics_read_failed' }, { status: 500 })
  }
  if (!run) return Response.json({ ok: true, run: null, rows: [], total: 0, page, pageSize })

  const runMeta = { runId: run.id, windowDays: run.window_days, startDate: run.start_date, endDate: run.end_date, truncated: run.truncated, latestAvailableDate: run.latest_available_date }

  // queries / opportunities: paginate directly in SQL (impressions desc) with an exact count.
  if (view === 'queries' || view === 'opportunities') {
    let q = auth.admin
      .from('gsc_query_page_metrics')
      .select('query,page,clicks,impressions,ctr,position', { count: 'exact' })
      .eq('sync_run_id', run.id)
    if (view === 'opportunities') q = q.gte('position', 4).lte('position', 20)
    const from = page * pageSize
    const { data, count, error } = await q.order('impressions', { ascending: false }).order('query', { ascending: true }).range(from, from + pageSize - 1)
    if (error) return Response.json({ ok: false, error: 'metrics_read_failed' }, { status: 500 })
    return Response.json({ ok: true, run: runMeta, view, rows: data ?? [], total: count ?? 0, page, pageSize })
  }

  // multipage: an aggregate over the whole (already row-capped) run. Fetch in chunks,
  // group in memory, then paginate the aggregated result.
  if (view === 'multipage') {
    const rows: GscMetricRow[] = []
    for (let offset = 0; ; offset += FETCH_CHUNK) {
      const { data, error } = await auth.admin
        .from('gsc_query_page_metrics')
        .select('query,page,clicks,impressions,ctr,position')
        .eq('sync_run_id', run.id)
        .range(offset, offset + FETCH_CHUNK - 1)
      if (error) return Response.json({ ok: false, error: 'metrics_read_failed' }, { status: 500 })
      const batch = (data ?? []) as GscMetricRow[]
      rows.push(...batch)
      if (batch.length < FETCH_CHUNK) break
    }
    const all = multiPageQueries(rows)
    const from = page * pageSize
    return Response.json({ ok: true, run: runMeta, view, rows: all.slice(from, from + pageSize), total: all.length, page, pageSize })
  }

  // pages: the clicked rows of the run, most clicked first, summed per page.
  if (view === 'pages') {
    const rows: PageClicksRow[] = []
    for (let offset = 0; offset < PAGES_MAX_ROWS; offset += FETCH_CHUNK) {
      const { data, error } = await auth.admin
        .from('gsc_query_page_metrics')
        .select('page,clicks')
        .eq('sync_run_id', run.id)
        .eq('project_id', auth.project.id)
        .gt('clicks', 0)
        .order('clicks', { ascending: false }).order('query', { ascending: true }).order('page', { ascending: true })
        .range(offset, offset + FETCH_CHUNK - 1)
      if (error) return Response.json({ ok: false, error: 'metrics_read_failed' }, { status: 500 })
      const batch = (data ?? []) as PageClicksRow[]
      rows.push(...batch)
      if (batch.length < FETCH_CHUNK) break
    }
    return Response.json({ ok: true, run: runMeta, view, pages: topPagesByClicks(rows, TOP_PAGES) })
  }

  // keywords: the project's tracked keywords matched to the run's queries.
  if (view === 'keywords') {
    const { data: targetRows, error: targetsError } = await auth.admin
      .from('tracking_targets')
      .select('id,keyword')
      .eq('project_id', auth.project.id)
    if (targetsError) return Response.json({ ok: false, error: 'metrics_read_failed' }, { status: 500 })
    const targets = (targetRows ?? []) as KeywordTarget[]
    const rows: QueryFiguresRow[] = []
    for (let offset = 0; targets.length > 0 && offset < KEYWORDS_MAX_ROWS; offset += FETCH_CHUNK) {
      const { data, error } = await auth.admin
        .from('gsc_query_page_metrics')
        .select('query,clicks,impressions')
        .eq('sync_run_id', run.id)
        .eq('project_id', auth.project.id)
        .order('query', { ascending: true }).order('page', { ascending: true })
        .range(offset, offset + FETCH_CHUNK - 1)
      if (error) return Response.json({ ok: false, error: 'metrics_read_failed' }, { status: 500 })
      const batch = (data ?? []) as QueryFiguresRow[]
      rows.push(...batch)
      if (batch.length < FETCH_CHUNK) break
    }
    return Response.json({ ok: true, run: runMeta, view, keywords: keywordFigures(targets, rows) })
  }

  return Response.json({ ok: false, error: 'invalid_view' }, { status: 400 })
}
