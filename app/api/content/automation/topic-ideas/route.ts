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
import { loadPendingIdeas, ideaToSuggestion, markIdeasDuplicate } from '@/lib/content/recommendations/topic-idea-store'
import { buildKeywordGuard, partitionPending } from '@/lib/content/recommendations/keyword-guard'

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  if (!isContentAutomationEnabled()) return Response.json({ error: 'Not found' }, { status: 404 })

  const url = new URL(request.url)
  const projectId = url.searchParams.get('projectId')
  const auth = await authContentProject(projectId)
  if ('error' in auth) return Response.json({ error: auth.error }, { status: auth.status })

  const pending = await loadPendingIdeas(auth.admin, auth.project.id)
  if (pending === null) return Response.json({ suggestions: [], meta: { persisted: false } })

  // Phase 3F.3.1c — revalidate persisted pending ideas against the current exact
  // keyword/title guard, so pre-guard rows that now conflict are hidden (and
  // marked 'duplicate') on load, not just on the next generation.
  const guard = await buildKeywordGuard(auth.admin, auth.project.id)
  const { visible, conflictIds } = partitionPending(pending, guard)
  if (conflictIds.length > 0) await markIdeasDuplicate(auth.admin, auth.project.id, conflictIds)

  const debug = process.env.NODE_ENV !== 'production' ? { ...guard.counts, scanKeywordSamples: guard.scanSamples, revalidatedHidden: conflictIds.length } : undefined
  return Response.json({ suggestions: visible.map(ideaToSuggestion), meta: { persisted: true, pendingCount: visible.length, revalidatedHidden: conflictIds.length, debug } })
}
