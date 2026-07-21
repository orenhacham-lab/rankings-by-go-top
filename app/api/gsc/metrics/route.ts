/**
 * GET /api/gsc/metrics?projectId=...&window=28|90&view=queries|opportunities|multipage&page=0&pageSize=50
 *
 * Read-only diagnostics over the LATEST SUCCEEDED run for the requested window. Three
 * pure-display views — all server-side paginated:
 *   - queries:       query+page rows, impressions desc.
 *   - opportunities: rows at position 4..20 (pure filter), impressions desc.
 *   - multipage:     queries appearing on >1 distinct page (diagnostic signal only —
 *                    NOT confirmed cannibalization).
 * This endpoint changes no state and produces no recommendation/score/opportunity.
 */
import { authContentProject } from '@/lib/content/api-auth'
import { isGscReadOnlyEnabled } from '@/lib/gsc/config'
import { latestSucceededRun } from '@/lib/gsc/service'
import { GSC_WINDOWS, type GscWindowDays } from '@/lib/gsc/sync'
import { multiPageQueries, type GscMetricRow } from '@/lib/gsc/summary'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const MAX_PAGE_SIZE = 100
const FETCH_CHUNK = 1000

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

  const run = await latestSucceededRun(auth.admin, auth.project.id, windowDays)
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

  return Response.json({ ok: false, error: 'invalid_view' }, { status: 400 })
}
