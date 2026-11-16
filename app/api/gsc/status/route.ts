/**
 * GET /api/gsc/status?projectId=... — diagnostics header state for the project.
 *
 * Read-only. Returns the sanitized connection (NEVER the token), the assigned property,
 * and the latest SUCCEEDED 28-day and 90-day runs with summary cards computed from the
 * precomputed run aggregates (no metric-row re-scan). This endpoint changes no state.
 *
 * THE ANSWER ITSELF now lives in lib/gsc/status.ts, because the dashboard layout
 * builds the same answer in-region and hands it to the client, so a first
 * dashboard load no longer spends a round trip on it — and the metrics that wait
 * on it no longer spend another. This route is unchanged for every other caller:
 * every other screen, the settings panel's refresh, and a project the seeded
 * answer was not built for.
 */
import { authContentProject } from '@/lib/content/api-auth'
import { isGscReadOnlyEnabled } from '@/lib/gsc/config'
import { buildGscStatus } from '@/lib/gsc/status'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  if (!isGscReadOnlyEnabled()) return Response.json({ error: 'Not found' }, { status: 404 })
  const projectId = new URL(request.url).searchParams.get('projectId')
  const auth = await authContentProject(projectId)
  if ('error' in auth) return Response.json({ error: auth.error }, { status: auth.status })

  const { status, body } = await buildGscStatus(auth.admin, auth.project.id, auth.user.id)
  return Response.json(body, { status })
}
