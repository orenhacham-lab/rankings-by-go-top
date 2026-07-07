/**
 * Content automation — POST /api/content/automation/recommendations
 *
 * Generate topic-idea suggestions for a project from one source
 * ('keyword' | 'project_data' | 'keyword_research_url'). Read-only: nothing is
 * persisted here — the caller approves selected ideas via the bulk route.
 *
 * Gated by ENABLE_CONTENT_AUTOMATION + project ownership.
 */

import { authContentProject, isContentAutomationEnabled } from '@/lib/content/api-auth'
import { generateRecommendations } from '@/lib/content/recommendations/engine'
import type { RecommendationSource } from '@/lib/content/recommendations/types'
import { loadKnownFingerprints, insertPendingIdeas, loadPendingIdeas, ideaToSuggestion, topicIdeaFingerprint } from '@/lib/content/recommendations/topic-idea-store'
import { randomUUID } from 'crypto'

const SOURCES: RecommendationSource[] = ['keyword', 'project_data', 'keyword_research_url', 'site_scan']

export async function POST(request: Request) {
  if (!isContentAutomationEnabled()) return Response.json({ error: 'Not found' }, { status: 404 })

  let body: Record<string, unknown>
  try {
    body = await request.json()
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const projectId = typeof body.projectId === 'string' ? body.projectId : null
  const source = typeof body.source === 'string' ? (body.source as RecommendationSource) : null
  const keyword = typeof body.keyword === 'string' ? body.keyword.trim() : ''

  const auth = await authContentProject(projectId)
  if ('error' in auth) return Response.json({ error: auth.error }, { status: auth.status })

  if (!source || !SOURCES.includes(source)) {
    return Response.json({ error: 'invalid_source', allowed: SOURCES }, { status: 400 })
  }
  if (source === 'keyword' && !keyword) {
    return Response.json({ error: 'keyword_required' }, { status: 400 })
  }

  try {
    const result = await generateRecommendations(auth.admin, {
      userId: auth.user.id,
      projectId: auth.project.id,
      source,
      keyword,
    })

    // Phase 3F.3 — persist NEW ideas as pending and return the project's active
    // pending set (so ideas survive refresh and "find more" appends). Best-effort:
    // if the ideas table is missing (migration not applied) fall back to the
    // previous session-only response with no regression.
    const known = await loadKnownFingerprints(auth.admin, auth.project.id)
    if (known === null) return Response.json(result)

    // Also treat existing project keywords (tracking_targets) as "known" so a
    // topic identical to a tracked keyword is not re-offered.
    try {
      const { data: kwRows } = await auth.admin.from('tracking_targets').select('keyword').eq('project_id', auth.project.id)
      for (const r of (kwRows ?? []) as { keyword: string }[]) { const fp = topicIdeaFingerprint(r.keyword, null); if (fp) known.add(fp) }
    } catch { /* keyword table optional */ }

    const fresh = result.suggestions.filter((s) => {
      const fp = topicIdeaFingerprint(s.primaryKeyword, s.title)
      if (!fp || known.has(fp)) return false
      known.add(fp)
      return true
    })
    await insertPendingIdeas(auth.admin, { projectId: auth.project.id, userId: auth.user.id, batchId: randomUUID(), source, suggestions: fresh })

    const pending = await loadPendingIdeas(auth.admin, auth.project.id)
    if (pending === null) return Response.json(result)
    const suggestions = pending.map(ideaToSuggestion)
    const filteredExisting = result.suggestions.length - fresh.length
    const reason = suggestions.length === 0
      ? (result.meta.reason ?? undefined)
      : (fresh.length === 0 && result.suggestions.length > 0 ? 'all_known' : undefined)
    return Response.json({
      suggestions,
      meta: { ...result.meta, persisted: true, newlySaved: fresh.length, filteredExisting, pendingCount: suggestions.length, reason },
    })
  } catch (e) {
    if ((e as { code?: string })?.code === '42P01') return Response.json({ error: 'Content module not initialized' }, { status: 404 })
    console.error('[automation-recommendations] failed', { message: (e as Error)?.message })
    return Response.json({ error: 'Failed to generate recommendations' }, { status: 500 })
  }
}
