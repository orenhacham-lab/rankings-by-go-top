/**
 * Content automation — POST /api/content/automation/topic-ideas/reject
 *
 * Phase 3F.3. Durably rejects pending topic ideas by id: they leave the active
 * list and their fingerprints are remembered so the same idea is not suggested
 * again. Owner-gated. Creates/generates/publishes/inserts nothing.
 *
 * Body: { projectId, ideaIds: string[] }.
 */

import { authContentProject, isContentAutomationEnabled } from '@/lib/content/api-auth'
import { rejectIdeas } from '@/lib/content/recommendations/topic-idea-store'

export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
  if (!isContentAutomationEnabled()) return Response.json({ error: 'Not found' }, { status: 404 })

  let body: { projectId?: unknown; ideaIds?: unknown }
  try { body = await request.json() } catch { return Response.json({ error: 'Invalid JSON body' }, { status: 400 }) }
  const projectId = typeof body.projectId === 'string' ? body.projectId : null
  const ideaIds = Array.isArray(body.ideaIds) ? body.ideaIds.filter((x): x is string => typeof x === 'string') : []

  const auth = await authContentProject(projectId)
  if ('error' in auth) return Response.json({ error: auth.error }, { status: auth.status })
  if (ideaIds.length === 0) return Response.json({ error: 'no_ideas' }, { status: 400 })

  const rejected = await rejectIdeas(auth.admin, auth.project.id, ideaIds)
  return Response.json({ ok: true, rejected })
}
