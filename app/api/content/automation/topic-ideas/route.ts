/**
 * Content automation — GET /api/content/automation/topic-ideas
 *
 * Phase 3F.3. Returns the project's PENDING persisted topic ideas so they appear
 * after a page refresh without re-generating. Read-only; owner-gated. Falls back
 * to an empty list when the ideas table is not present yet.
 *
 * Query: ?projectId=…
 */

import { authContentProject, isContentAutomationEnabled, isInternalLinkPlanningEnabled } from '@/lib/content/api-auth'
import { loadPendingIdeas, ideaToSuggestion, markIdeasDuplicate } from '@/lib/content/recommendations/topic-idea-store'
import { buildKeywordGuard, partitionPending } from '@/lib/content/recommendations/keyword-guard'
import { getCachedIndex, reassembleReport, isStale, isVersionStale } from '@/lib/content/wordpress-content-index'
import { previewPlannerLinks } from '@/lib/content/internal-link-idea-plan'
import type { ScannedTarget } from '@/lib/content/wordpress-content-scan'

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

  let suggestions = visible.map(ideaToSuggestion)

  // Phase 3F.3.4a — response-only re-enrichment: give existing pending ideas that
  // have NO saved links the CURRENT planner preview (so new category/product
  // targets appear after an index refresh). Never overwrites saved links; never
  // persists; never forces links (attaches a precise no-link reason instead).
  if (isInternalLinkPlanningEnabled()) {
    try {
      const cacheRow = await getCachedIndex(auth.admin, auth.project.id)
      if (cacheRow) {
        const rep = reassembleReport(cacheRow)
        const targets = (rep.targets ?? []) as ScannedTarget[]
        const hosts = rep.hosts ?? []
        const stale = isStale(cacheRow) || isVersionStale(cacheRow)
        const devDebug = process.env.NODE_ENV !== 'production'
        suggestions = suggestions.map((s) => {
          if (s.suggestedInternalLinks?.length) return s
          const preview = targets.length ? previewPlannerLinks({ id: 'preview', title: s.title, primaryKeyword: s.primaryKeyword, secondaryKeywords: s.secondaryKeywords }, targets, hosts, 3, devDebug) : { links: [] as { url: string; anchor: string }[], reason: 'stale_index' as const }
          if (preview.links.length) return { ...s, suggestedInternalLinks: preview.links }
          return { ...s, linkPreviewReason: stale ? 'stale_index' : (preview.reason ?? 'valid_no_match') }
        })
      }
    } catch { /* enrichment is best-effort */ }
  }

  const debug = process.env.NODE_ENV !== 'production' ? { ...guard.counts, scanKeywordSamples: guard.scanSamples, revalidatedHidden: conflictIds.length } : undefined
  return Response.json({ suggestions, meta: { persisted: true, pendingCount: visible.length, revalidatedHidden: conflictIds.length, debug } })
}
