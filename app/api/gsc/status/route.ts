/**
 * GET /api/gsc/status?projectId=... — diagnostics header state for the project.
 *
 * Read-only. Returns the sanitized connection (NEVER the token), the assigned property,
 * and the latest SUCCEEDED 28-day and 90-day runs with summary cards computed from the
 * precomputed run aggregates (no metric-row re-scan). This endpoint changes no state.
 */
import { authContentProject } from '@/lib/content/api-auth'
import { isGscReadOnlyEnabled, isGscOAuthConfigured } from '@/lib/gsc/config'
import { loadUserConnection, loadProjectProperty, latestSucceededRun, sanitizeConnection, GscServiceError } from '@/lib/gsc/service'
import { GSC_WINDOWS, type GscWindowDays } from '@/lib/gsc/sync'
import type { GscSyncRun } from '@/lib/supabase/types'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/** Summary card from a run's precomputed aggregates. ctr = clicks/impressions;
 *  avgPosition = weighted_position_sum/impressions (impression-weighted). */
function summaryCard(run: GscSyncRun | null) {
  if (!run) return null
  const clicks = Number(run.total_clicks ?? 0)
  const impressions = Number(run.total_impressions ?? 0)
  const weighted = Number(run.weighted_position_sum ?? 0)
  return {
    runId: run.id,
    windowDays: run.window_days,
    startDate: run.start_date,
    endDate: run.end_date,
    latestAvailableDate: run.latest_available_date,
    rowsFetched: run.rows_fetched,
    truncated: run.truncated,
    finishedAt: run.finished_at,
    clicks,
    impressions,
    ctr: impressions > 0 ? clicks / impressions : 0,
    avgPosition: impressions > 0 ? weighted / impressions : 0,
  }
}

export async function GET(request: Request) {
  if (!isGscReadOnlyEnabled()) return Response.json({ error: 'Not found' }, { status: 404 })
  const projectId = new URL(request.url).searchParams.get('projectId')
  const auth = await authContentProject(projectId)
  if ('error' in auth) return Response.json({ error: auth.error }, { status: auth.status })

  try {
    const connection = await loadUserConnection(auth.admin, auth.user.id)
    const property = await loadProjectProperty(auth.admin, auth.project.id)

    const windows: Record<string, ReturnType<typeof summaryCard>> = {}
    if (property) {
      const runs = await Promise.all(GSC_WINDOWS.map((w) => latestSucceededRun(auth.admin, auth.project.id, w as GscWindowDays)))
      GSC_WINDOWS.forEach((w, i) => { windows[String(w)] = summaryCard(runs[i]) })
    }

    return Response.json({
      ok: true,
      oauthConfigured: isGscOAuthConfigured(),
      connection: sanitizeConnection(connection),
      property: property ? { siteUrl: property.site_url, permissionLevel: property.permission_level, selectedAt: property.selected_at } : null,
      windows,
    })
  } catch (e) {
    // A DB read failure must NOT be shown as "no connection / no property / empty windows".
    if (e instanceof GscServiceError) return Response.json({ ok: false, error: e.code }, { status: e.status })
    return Response.json({ ok: false, error: 'gsc_error' }, { status: 500 })
  }
}
