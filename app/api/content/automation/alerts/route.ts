/**
 * Content automation — GET /api/content/automation/alerts?projectId=…
 *
 * Phase 4B.1 — list the project's ACTIVE failure alerts (persisted, owner-scoped).
 * Read-only. Gated by ENABLE_CONTENT_AUTOMATION + project ownership.
 *
 * The decision lives in lib/content/automation/load-active-alerts, shared with
 * /api/content/overview, so the two endpoints cannot disagree about whether a
 * project has an open problem — they did, and the Content Hub and the automation
 * panel showed different answers for the same project at the same moment.
 *
 * The response carries a typed `reasonCode`, never the stored `error` string:
 * that column may hold a raw provider/GraphQL detail, which belongs in server
 * logs, not in a public API response or on a merchant's screen.
 */

import { authContentProject, isContentAutomationEnabled } from '@/lib/content/api-auth'
import { loadActiveAlerts } from '@/lib/content/automation/load-active-alerts'

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  if (!isContentAutomationEnabled()) return Response.json({ error: 'Not found' }, { status: 404 })
  const url = new URL(request.url)
  const projectId = url.searchParams.get('projectId')

  const auth = await authContentProject(projectId)
  if ('error' in auth) return Response.json({ error: auth.error }, { status: auth.status })

  const result = await loadActiveAlerts(auth.admin as never, auth.project.id)
  if (!result.ok) {
    // Safety A — the migration is a REQUIRED dependency. If the table is missing
    // we must NOT pretend the feature is healthy with an empty list; surface a
    // clear configuration error (503) so a silent final-failure is never hidden.
    if (result.reason === 'migration_required') {
      return Response.json({ error: 'automation_alerts_migration_required', migrationRequired: true }, { status: 503 })
    }
    return Response.json({ error: 'alerts_unavailable' }, { status: 500 })
  }
  return Response.json({ alerts: result.alerts })
}
