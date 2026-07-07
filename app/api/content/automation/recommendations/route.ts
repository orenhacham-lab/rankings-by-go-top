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
import { loadKnownStrings, insertPendingIdeas, loadPendingIdeas, ideaToSuggestion, normalizeText } from '@/lib/content/recommendations/topic-idea-store'
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
    const known = await loadKnownStrings(auth.admin, auth.project.id)
    if (known === null) return Response.json(result)

    // Phase 3F.3.1 — comprehensive EXACT-normalized known set so an approved idea
    // never reappears regardless of which field the model varies: existing topic
    // titles + primary keywords, generated-article titles, and exact tracked
    // keywords. Exact-normalized only — long-tail variants stay allowed.
    try {
      const { data: topicRows } = await auth.admin.from('article_topics').select('topic, primary_keyword').eq('project_id', auth.project.id)
      for (const t of (topicRows ?? []) as { topic: string; primary_keyword: string | null }[]) { for (const v of [normalizeText(t.topic), normalizeText(t.primary_keyword)]) if (v) known.add(v) }
      const { data: artRows } = await auth.admin.from('generated_articles').select('title').eq('project_id', auth.project.id)
      for (const a of (artRows ?? []) as { title: string | null }[]) { const v = normalizeText(a.title); if (v) known.add(v) }
      const { data: kwRows } = await auth.admin.from('tracking_targets').select('keyword').eq('project_id', auth.project.id)
      for (const r of (kwRows ?? []) as { keyword: string }[]) { const v = normalizeText(r.keyword); if (v) known.add(v) }
    } catch { /* optional signals */ }

    const fresh = result.suggestions.filter((s) => {
      const nt = normalizeText(s.title)
      const nk = normalizeText(s.primaryKeyword)
      if ((nt && known.has(nt)) || (nk && known.has(nk))) return false
      if (nt) known.add(nt)
      if (nk) known.add(nk)
      return true
    })
    await insertPendingIdeas(auth.admin, { projectId: auth.project.id, userId: auth.user.id, batchId: randomUUID(), source, suggestions: fresh })

    const pending = await loadPendingIdeas(auth.admin, auth.project.id)
    if (pending === null) return Response.json(result)
    const suggestions = pending.map(ideaToSuggestion)
    const filteredExisting = result.suggestions.length - fresh.length
    // Precise "nothing new" reason. Keyword-research gets a source-specific
    // message so exhaustion reads as "already saved/approved/rejected", not error.
    const allKnownReason = source === 'keyword_research_url' ? 'kr_all_known' : 'all_known'
    const reason = suggestions.length === 0
      ? (result.meta.reason ?? (result.suggestions.length > 0 ? allKnownReason : undefined))
      : (fresh.length === 0 && result.suggestions.length > 0 ? allKnownReason : undefined)
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
