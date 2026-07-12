/**
 * Content automation — PATCH /api/content/automation/alerts/:id
 *
 * Phase 4B.1 — dismiss a failure alert (owner-scoped). Body: { projectId }.
 * Only the alert's owning project is allowed. No other mutation.
 */

import { authContentProject, isContentAutomationEnabled } from '@/lib/content/api-auth'

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!isContentAutomationEnabled()) return Response.json({ error: 'Not found' }, { status: 404 })
  const { id } = await params

  let body: { projectId?: unknown }
  try { body = await request.json() } catch { return Response.json({ error: 'Invalid JSON body' }, { status: 400 }) }
  const projectId = typeof body.projectId === 'string' ? body.projectId : null

  const auth = await authContentProject(projectId)
  if ('error' in auth) return Response.json({ error: auth.error }, { status: auth.status })

  // Scope the update to BOTH the alert id AND the owned project — a caller can
  // never dismiss another project's alert.
  const { error } = await auth.admin
    .from('content_automation_alerts')
    .update({ status: 'dismissed', updated_at: new Date().toISOString() })
    .eq('id', id)
    .eq('project_id', auth.project.id)
  if (error) {
    console.error('[automation-alerts] dismiss failed', { message: error.message })
    return Response.json({ error: 'Failed to dismiss alert' }, { status: 500 })
  }
  return Response.json({ success: true, status: 'dismissed' })
}
