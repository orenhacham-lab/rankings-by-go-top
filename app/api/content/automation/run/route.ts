/**
 * Content automation — POST /api/content/automation/run
 *
 * Ownership-gated manual trigger of the automation runner, scoped to ONE
 * project's pool (for "run automation now" in the UI / testing). Same runner as
 * the cron, so behavior is identical — just project-scoped and session-gated
 * instead of CRON_SECRET-gated.
 */

import { authContentProject, isContentAutomationEnabled } from '@/lib/content/api-auth'
import { runAutomation } from '@/lib/content/automation/runner'

export const maxDuration = 300

export async function POST(request: Request) {
  if (!isContentAutomationEnabled()) return Response.json({ error: 'Not found' }, { status: 404 })

  let body: { projectId?: unknown }
  try {
    body = await request.json()
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 })
  }
  const projectId = typeof body.projectId === 'string' ? body.projectId : null
  const auth = await authContentProject(projectId)
  if ('error' in auth) return Response.json({ error: auth.error }, { status: auth.status })

  const summary = await runAutomation(auth.admin, { projectId: auth.project.id })
  return Response.json({ ok: true, ...summary })
}
