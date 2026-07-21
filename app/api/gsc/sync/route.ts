/**
 * POST /api/gsc/sync — MANUAL Search Console sync (no cron/queue). Fetches the latest 28
 * and 90 complete-day windows (query+page) and stores each as a separate immutable run.
 * Concurrency is rejected by the DB unique-active-run constraint. Returns sanitized summary.
 */
import { randomUUID } from 'crypto'
import { authContentProject } from '@/lib/content/api-auth'
import { isGscReadOnlyEnabled, getGscMaxRowsPerWindow } from '@/lib/gsc/config'
import { authorizeProjectGsc, getAccessTokenForConnection, makeSyncStore, makeSyncClient, GscServiceError } from '@/lib/gsc/service'
import { executeManualSync } from '@/lib/gsc/sync'
import { GscApiError } from '@/lib/gsc/api'

export const runtime = 'nodejs'
export const maxDuration = 300
export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
  if (!isGscReadOnlyEnabled()) return Response.json({ error: 'Not found' }, { status: 404 })
  const projectId = (await request.json().catch(() => ({})))?.projectId as string | undefined
  const auth = await authContentProject(projectId ?? null)
  if ('error' in auth) return Response.json({ error: auth.error }, { status: auth.status })

  try {
    const { property, connection } = await authorizeProjectGsc(auth.admin, auth.project.id, auth.user.id)
    const accessToken = await getAccessTokenForConnection(auth.admin, connection)
    const result = await executeManualSync({
      store: makeSyncStore(auth.admin),
      client: makeSyncClient(accessToken, property.site_url, getGscMaxRowsPerWindow()),
      projectId: auth.project.id,
      connectionId: connection.id,
      siteUrl: property.site_url,
      syncGroupId: randomUUID(),
      maxRows: getGscMaxRowsPerWindow(),
      batchSize: 1000,
    })
    const allFailed = result.windows.length > 0 && result.windows.every((w) => w.status === 'failed')
    return Response.json({ ok: !allFailed, ...result }, { status: allFailed ? 502 : 200 })
  } catch (e) {
    if (e instanceof GscServiceError) return Response.json({ ok: false, error: e.code }, { status: e.status })
    if (e instanceof GscApiError) return Response.json({ ok: false, error: e.code }, { status: e.httpStatus || 502 })
    return Response.json({ ok: false, error: 'sync_failed' }, { status: 500 })
  }
}
