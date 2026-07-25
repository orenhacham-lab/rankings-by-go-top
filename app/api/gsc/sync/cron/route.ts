/**
 * Area A — GET/POST /api/gsc/sync/cron — weekly Search Console auto-sync dispatcher.
 *
 * Runs DAILY and syncs only projects whose last successful sync is older than 7 days,
 * in a bounded batch ordered oldest-first (never-synced first). It builds NO new sync
 * engine: each due project is delegated to the EXISTING executeManualSync, so manual
 * and automatic syncs share one implementation and one set of semantics (immutable
 * runs, the unique-active-run concurrency guard, and stale-run recovery all apply).
 *
 * SECURITY — this endpoint has no browser session, so it is authorized ONLY by
 * `Authorization: Bearer <CRON_SECRET>` and FAILS CLOSED: when CRON_SECRET is not
 * configured the route refuses to run (503). It deliberately does NOT copy the
 * "skip the check when the secret is absent" pattern used by an older cron.
 *
 * Never logs or returns tokens; only sanitized error codes reach the response/logs.
 */
import { randomUUID } from 'crypto'
import { createAdminClient } from '@/lib/supabase/admin'
import { isGscReadOnlyEnabled, getGscMaxRowsPerWindow } from '@/lib/gsc/config'
import { getAccessTokenForConnection, makeSyncStore, makeSyncClient, GscServiceError } from '@/lib/gsc/service'
import { executeManualSync } from '@/lib/gsc/sync'
import { GscApiError } from '@/lib/gsc/api'
import { loadAutoSyncCandidates } from '@/lib/gsc/auto-sync-store'
import {
  dispatchAutoSync, getAutoSyncBatchSize, getAutoSyncTimeBudgetMs, getAutoSyncPerProjectReserveMs,
  type AutoSyncCandidate,
} from '@/lib/gsc/auto-sync'
import type { GscConnection } from '@/lib/supabase/types'

export const runtime = 'nodejs'
export const maxDuration = 300
export const dynamic = 'force-dynamic'

/** Bearer CRON_SECRET, required. Returns a Response to send, or null when authorized. */
function authorizeCron(request: Request): Response | null {
  const cronSecret = process.env.CRON_SECRET
  // FAIL CLOSED: an unset secret must never mean "no authentication required".
  if (!cronSecret) {
    console.error('[gsc-auto-sync] refused: CRON_SECRET is not configured')
    return Response.json({ ok: false, error: 'cron_not_configured' }, { status: 503 })
  }
  if (request.headers.get('authorization') !== `Bearer ${cronSecret}`) {
    return Response.json({ ok: false, error: 'unauthorized' }, { status: 401 })
  }
  return null
}

async function handle(request: Request): Promise<Response> {
  if (!isGscReadOnlyEnabled()) return Response.json({ error: 'Not found' }, { status: 404 })
  const denied = authorizeCron(request)
  if (denied) return denied

  const startedMs = Date.now()

  try {
    // Constructed inside the try so a misconfigured environment surfaces as a
    // sanitized 500 instead of an unhandled throw.
    const admin = createAdminClient()
    const candidates = await loadAutoSyncCandidates(admin)

    /**
     * Sync ONE due project through the existing engine. The cron is a system actor
     * acting on the project's own assigned property, so there is no session user to
     * match; ownership is inherent in the data (project → assigned property →
     * that user's connection). Nothing here is taken from a request payload.
     */
    const syncOne = async (c: AutoSyncCandidate) => {
      const { data: connRow, error: connErr } = await admin
        .from('gsc_connections').select('*').eq('id', c.connectionId).maybeSingle()
      if (connErr) throw new GscServiceError('connection_read_failed', 500, 'Could not read the connection.')
      const connection = connRow as GscConnection | null
      if (!connection) throw new GscServiceError('connection_missing', 409, 'The connection no longer exists.')

      const accessToken = await getAccessTokenForConnection(admin, connection)
      const result = await executeManualSync({
        store: makeSyncStore(admin),
        client: makeSyncClient(accessToken, c.siteUrl, getGscMaxRowsPerWindow()),
        projectId: c.projectId,
        connectionId: connection.id,
        siteUrl: c.siteUrl,
        syncGroupId: randomUUID(),
        maxRows: getGscMaxRowsPerWindow(),
        batchSize: 1000,
      })
      const windows = result.windows ?? []
      const failedCount = windows.filter((w) => w.status === 'failed').length
      if (windows.length === 0 || failedCount === windows.length) {
        return { status: 'failed' as const, error: 'all_windows_failed' }
      }
      return failedCount > 0 ? { status: 'partial' as const } : { status: 'succeeded' as const }
    }

    const summary = await dispatchAutoSync({
      candidates,
      syncOne,
      nowMs: startedMs,
      limit: getAutoSyncBatchSize(),
      timeBudgetMs: getAutoSyncTimeBudgetMs(),
      perProjectReserveMs: getAutoSyncPerProjectReserveMs(),
    })

    console.log('[gsc-auto-sync] run complete', {
      candidates: summary.candidates, dueTotal: summary.dueTotal, launched: summary.launched,
      succeeded: summary.succeeded, partial: summary.partial, failed: summary.failed,
      skippedAtRun: summary.skippedAtRun, stoppedForTime: summary.stoppedForTime, durationMs: summary.durationMs,
    })
    return Response.json({ ok: true, ...summary })
  } catch (e) {
    // Only sanitized codes: GscServiceError/GscApiError carry safe codes; anything else
    // is collapsed. The raw message is never returned to the caller.
    const code = e instanceof GscServiceError || e instanceof GscApiError ? e.code
      : e instanceof Error && /^auto_sync_[a-z_]+$/.test(e.message) ? e.message
        : 'auto_sync_failed'
    console.error('[gsc-auto-sync] run failed', { code })
    return Response.json({ ok: false, error: code }, { status: 500 })
  }
}

export async function GET(request: Request) { return handle(request) }
export async function POST(request: Request) { return handle(request) }
