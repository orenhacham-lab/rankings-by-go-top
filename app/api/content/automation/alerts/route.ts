/**
 * Content automation — GET /api/content/automation/alerts?projectId=…
 *
 * Phase 4B.1 — list the project's OPEN failure alerts (persisted, owner-scoped).
 * Read-only. Gated by ENABLE_CONTENT_AUTOMATION + project ownership.
 */

import { authContentProject, isContentAutomationEnabled } from '@/lib/content/api-auth'

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  if (!isContentAutomationEnabled()) return Response.json({ error: 'Not found' }, { status: 404 })
  const url = new URL(request.url)
  const projectId = url.searchParams.get('projectId')

  const auth = await authContentProject(projectId)
  if ('error' in auth) return Response.json({ error: auth.error }, { status: auth.status })

  try {
    const { data, error } = await auth.admin
      .from('content_automation_alerts')
      .select('id, pool_item_id, article_id, topic_id, kind, title, error, attempts, status, created_at, updated_at')
      .eq('project_id', auth.project.id)
      .eq('status', 'open')
      .order('created_at', { ascending: false })
      .limit(50)
    if (error) {
      // Safety A — the migration is a REQUIRED dependency. If the table is
      // missing we must NOT pretend the feature is healthy with an empty list;
      // surface a clear configuration error (503) so a silent final-failure is
      // never hidden just because the alert store isn't there.
      if ((error as { code?: string }).code === '42P01') {
        return Response.json({ error: 'automation_alerts_migration_required', migrationRequired: true }, { status: 503 })
      }
      console.error('[automation-alerts] list failed', { message: error.message })
      return Response.json({ error: 'Failed to load alerts' }, { status: 500 })
    }
    return Response.json({ alerts: data ?? [] })
  } catch (e) {
    console.error('[automation-alerts] list threw', { message: e instanceof Error ? e.message : String(e) })
    return Response.json({ error: 'alerts_unavailable' }, { status: 500 })
  }
}
