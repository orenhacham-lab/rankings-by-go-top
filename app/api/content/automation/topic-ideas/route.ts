/**
 * Content automation — GET /api/content/automation/topic-ideas
 *
 * Phase 3F.3. Returns the project's PENDING persisted topic ideas so they appear
 * after a page refresh without re-generating. Read-only; owner-gated. Falls back
 * to an empty list when the ideas table is not present yet.
 *
 * Query: ?projectId=…
 */

import { authContentProject, isContentAutomationEnabled } from '@/lib/content/api-auth'
import { loadPendingIdeas, ideaToSuggestion } from '@/lib/content/recommendations/topic-idea-store'

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  if (!isContentAutomationEnabled()) return Response.json({ error: 'Not found' }, { status: 404 })

  const url = new URL(request.url)
  const projectId = url.searchParams.get('projectId')
  const auth = await authContentProject(projectId)
  if ('error' in auth) return Response.json({ error: auth.error }, { status: auth.status })

  const pending = await loadPendingIdeas(auth.admin, auth.project.id)
  if (pending === null) return Response.json({ suggestions: [], meta: { persisted: false } })
  return Response.json({ suggestions: pending.map(ideaToSuggestion), meta: { persisted: true, pendingCount: pending.length } })
}
