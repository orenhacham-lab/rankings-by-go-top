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
import { insertPendingIdeas, loadPendingIdeas, ideaToSuggestion, normalizeText } from '@/lib/content/recommendations/topic-idea-store'
import { buildKeywordGuard } from '@/lib/content/recommendations/keyword-guard'
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

    // Phase 3F.3.1b — gentle EXACT primary-keyword + exact-title guard. Blocks a
    // suggestion whose normalized primary keyword already exists (project keyword,
    // topic keyword, generated-article topic keyword, persisted-idea keyword, or a
    // RELIABLE WordPress/site-scan focus keyword) OR whose exact normalized title
    // already exists. No fuzzy / contains / token-overlap — long-tail stays allowed.
    const guard = await buildKeywordGuard(auth.admin, auth.project.id)
    let filteredPrimaryKeywordExists = 0
    let filteredTitleExists = 0
    const fresh = result.suggestions.filter((s) => {
      const nt = normalizeText(s.title)
      const nk = normalizeText(s.primaryKeyword)
      if (nk && guard.keywords.has(nk)) { filteredPrimaryKeywordExists++; return false }
      if (nt && guard.titles.has(nt)) { filteredTitleExists++; return false }
      if (nk) guard.keywords.add(nk) // avoid intra-batch primary-keyword dupes
      if (nt) guard.titles.add(nt)
      return true
    })

    await insertPendingIdeas(auth.admin, { projectId: auth.project.id, userId: auth.user.id, batchId: randomUUID(), source, suggestions: fresh })

    const filteredExisting = result.suggestions.length - fresh.length
    const debug = process.env.NODE_ENV !== 'production'
      ? { ...guard.counts, filteredPrimaryKeywordExistsCount: filteredPrimaryKeywordExists, filteredTitleExistsCount: filteredTitleExists }
      : undefined

    const pending = await loadPendingIdeas(auth.admin, auth.project.id)
    // No ideas table yet (migration not applied): still return the GUARD-FILTERED
    // list session-only, so the keyword guard works even before persistence.
    if (pending === null) {
      return Response.json({ suggestions: fresh, meta: { ...result.meta, persisted: false, newlySaved: fresh.length, filteredExisting, debug } })
    }

    const suggestions = pending.map(ideaToSuggestion)
    // Precise "nothing new" reason.
    const allKnownReason = source === 'keyword_research_url' ? 'kr_all_known' : 'all_known'
    const emptyBecause = filteredPrimaryKeywordExists > 0 && filteredTitleExists === 0 ? 'primary_keyword_exists' : allKnownReason
    const reason = suggestions.length === 0
      ? (result.meta.reason ?? (result.suggestions.length > 0 ? emptyBecause : undefined))
      : (fresh.length === 0 && result.suggestions.length > 0 ? emptyBecause : undefined)
    return Response.json({
      suggestions,
      meta: { ...result.meta, persisted: true, newlySaved: fresh.length, filteredExisting, pendingCount: suggestions.length, reason, debug },
    })
  } catch (e) {
    if ((e as { code?: string })?.code === '42P01') return Response.json({ error: 'Content module not initialized' }, { status: 404 })
    console.error('[automation-recommendations] failed', { message: (e as Error)?.message })
    return Response.json({ error: 'Failed to generate recommendations' }, { status: 500 })
  }
}
