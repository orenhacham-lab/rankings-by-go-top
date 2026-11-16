/**
 * THE SEARCH CONSOLE STATUS, BUILT ONCE AND SERVED TWO WAYS.
 *
 * `GET /api/gsc/status` answers the question every Search Console widget asks
 * first: is this project connected, to which property, and what did the latest
 * finished sync measure. The metrics the dashboard shows are read ONLY once that
 * answer says "ready" — a real dependency, not an ordering accident — so on a
 * measured dashboard load the status was one browser round trip and the metrics
 * another behind it.
 *
 * What that round trip costs is almost entirely transport, not work: measured
 * from Oren's browser against production on 16.11.2026, `GET /api/version`,
 * which authenticates nothing and reads nothing, took 510-650ms, while
 * `/api/gsc/status` took 648-740ms. So removing a WAVE is worth about half a
 * second, and removing a request from a wave that already runs in parallel is
 * worth almost nothing.
 *
 * The dashboard layout already runs in the database's own region and already
 * builds the project list there. It can therefore build this answer too and hand
 * it to the client, where `primeGscResponse` serves it as if the browser had just
 * fetched it — so the status costs no wave at all and the metrics start with
 * everything else.
 *
 * The route is unchanged in what it answers, and is still the only path for every
 * other screen, for a project the seeded answer was not built for, and for the
 * settings panel's own refresh. Ownership is NOT assumed here: the route checks it
 * (authContentProject) and the layout passes a project from its own owner-filtered
 * list, exactly as it does for the list itself.
 */
import { isGscOAuthConfigured } from '@/lib/gsc/config'
import { isAdminUser } from '@/lib/auth/admin-role'
import { loadUserConnection, loadProjectProperty, loadSyncState, latestSucceededRun, sanitizeConnection, GscServiceError } from '@/lib/gsc/service'
import { GSC_WINDOWS, type GscWindowDays } from '@/lib/gsc/sync'
import type { GscSyncRun } from '@/lib/supabase/types'
import type { ServiceRoleClient } from '@/lib/supabase/admin'

/**
 * Summary card built ONLY from the authoritative property-level summary (FIX 8) — never from
 * summing the query+page detail rows. A run that predates the summary migration (or a run with
 * an unexpected aggregation) has no summary and returns summaryResyncRequired=true; the UI then
 * shows a resync prompt instead of misleading detail-row sums. rows_fetched (query/page row
 * count) is always returned separately.
 */
export function summaryCard(run: GscSyncRun | null) {
  if (!run) return null
  const base = {
    runId: run.id,
    windowDays: run.window_days,
    startDate: run.start_date,
    endDate: run.end_date,
    latestAvailableDate: run.latest_available_date,
    rowsFetched: run.rows_fetched,
    truncated: run.truncated,
    finishedAt: run.finished_at,
  }
  // No authoritative property summary → resync required (never fall back to detail-row sums).
  if (run.summary_total_clicks === null || run.summary_aggregation_type !== 'byProperty') {
    return { ...base, summaryResyncRequired: true, clicks: null, impressions: null, ctr: null, avgPosition: null }
  }
  return {
    ...base,
    summaryResyncRequired: false,
    clicks: Number(run.summary_total_clicks),
    impressions: Number(run.summary_total_impressions ?? 0),
    ctr: Number(run.summary_total_ctr ?? 0),
    avgPosition: run.summary_average_position == null ? null : Number(run.summary_average_position),
  }
}

/** What the route answers: the body, and the status it answers with. */
export type GscStatusAnswer = { status: number; body: unknown }

/**
 * The status of an ALREADY ownership-checked project, as the route answers it.
 *
 * SPEED: the reads depend only on the project and the user, so they go out
 * together instead of one round trip each. The windows are read alongside the
 * property; they are used, and a failure of theirs counts, only when the project
 * has a property, exactly as before.
 */
export async function buildGscStatus(admin: ServiceRoleClient, projectId: string, userId: string): Promise<GscStatusAnswer> {
  try {
    const oauthConfigured = isGscOAuthConfigured()
    const runsRead = Promise.all(GSC_WINDOWS.map((w) => latestSucceededRun(admin, projectId, w as GscWindowDays)))
      .then((runs) => ({ runs }), (error: unknown) => ({ error }))
    // Started with the reads below and awaited after them: whether a sync is running
    // (the automatic one after linking) and whether the latest one failed.
    const syncRead = loadSyncState(admin, projectId).catch(() => null)
    const [connectionRead, propertyRead, runsResult] = await Promise.allSettled([
      loadUserConnection(admin, userId),
      loadProjectProperty(admin, projectId),
      runsRead,
    ])
    // Failures surface in the order the reads used to run: connection, property, windows.
    if (connectionRead.status === 'rejected') throw connectionRead.reason
    if (propertyRead.status === 'rejected') throw propertyRead.reason
    const connection = connectionRead.value
    const property = propertyRead.value

    const windows: Record<string, ReturnType<typeof summaryCard>> = {}
    if (property) {
      const read = runsResult.status === 'fulfilled' ? runsResult.value : { error: runsResult.reason }
      if ('error' in read) throw read.error
      const runs = read.runs
      GSC_WINDOWS.forEach((w, i) => { windows[String(w)] = summaryCard(runs[i]) })
    }
    // Why it is unavailable (server configuration) is for an administrator to read; a merchant
    // sees only that it is unavailable. The role comes from profiles via the service-role client.
    // (Only read when OAuth is not configured, so it costs nothing in production.)
    const opsDetail = !oauthConfigured && await isAdminUser(admin, userId)

    const sync = property ? await syncRead : null

    return {
      status: 200,
      body: {
        ok: true,
        oauthConfigured,
        opsDetail,
        connection: sanitizeConnection(connection),
        property: property ? { siteUrl: property.site_url, permissionLevel: property.permission_level, selectedAt: property.selected_at } : null,
        windows,
        sync,
      },
    }
  } catch (e) {
    // A DB read failure must NOT be shown as "no connection / no property / empty windows".
    if (e instanceof GscServiceError) return { status: e.status, body: { ok: false, error: e.code } }
    return { status: 500, body: { ok: false, error: 'gsc_error' } }
  }
}
