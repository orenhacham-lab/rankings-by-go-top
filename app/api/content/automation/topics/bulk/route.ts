/**
 * Content automation — POST /api/content/automation/topics/bulk
 *
 * Create article_topics from approved recommendation suggestions (bulk). Each
 * row is source-tagged with suggestion_reason/score. Server-side dedupe skips
 * any suggestion that matches an existing topic/article. Does NOT schedule or
 * generate anything (Phase 4+).
 *
 * Gated by ENABLE_CONTENT_AUTOMATION + project ownership.
 */

import { authContentProject, isContentAutomationEnabled } from '@/lib/content/api-auth'
import { encodeBriefSections } from '@/lib/content/brief-notes'
import { ExistingCorpus } from '@/lib/content/recommendations/dedupe'
import type { ArticleTopicSource } from '@/lib/supabase/types'

const ALLOWED_SOURCES: ArticleTopicSource[] = ['keyword', 'project_data', 'keyword_research_url']
const ALLOWED_STATUS = ['suggested', 'approved'] as const
const MAX_TOPICS = 100

interface IncomingTopic {
  title?: unknown
  primaryKeyword?: unknown
  secondaryKeywords?: unknown
  searchIntent?: unknown
  recommendedWordCount?: unknown
  angle?: unknown
  source?: unknown
  suggestionReason?: unknown
  suggestionScore?: unknown
}

export async function POST(request: Request) {
  if (!isContentAutomationEnabled()) return Response.json({ error: 'Not found' }, { status: 404 })

  let body: { projectId?: unknown; topics?: unknown; status?: unknown }
  try {
    body = await request.json()
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const projectId = typeof body.projectId === 'string' ? body.projectId : null
  const auth = await authContentProject(projectId)
  if ('error' in auth) return Response.json({ error: auth.error }, { status: auth.status })

  const status = ALLOWED_STATUS.includes(body.status as (typeof ALLOWED_STATUS)[number])
    ? (body.status as (typeof ALLOWED_STATUS)[number])
    : 'approved'
  const incoming = Array.isArray(body.topics) ? (body.topics as IncomingTopic[]).slice(0, MAX_TOPICS) : []
  if (incoming.length === 0) return Response.json({ error: 'no_topics' }, { status: 400 })

  // Project language + existing-content corpus for server-side dedupe.
  const { data: proj } = await auth.admin.from('projects').select('language').eq('id', auth.project.id).maybeSingle()
  const language = (proj as { language?: string } | null)?.language ?? null

  const corpus = new ExistingCorpus()
  const { data: topicRows } = await auth.admin
    .from('article_topics')
    .select('topic, primary_keyword, secondary_keywords')
    .eq('project_id', auth.project.id)
  for (const t of (topicRows ?? []) as { topic: string; primary_keyword: string | null; secondary_keywords: string[] | null }[]) {
    corpus.add(t.topic); corpus.add(t.primary_keyword)
    for (const s of t.secondary_keywords ?? []) corpus.add(s)
  }
  const { data: articleRows } = await auth.admin.from('generated_articles').select('title, slug').eq('project_id', auth.project.id)
  for (const a of (articleRows ?? []) as { title: string; slug: string | null }[]) { corpus.add(a.title); corpus.add(a.slug) }

  const nowIso = new Date().toISOString()
  const rows: Record<string, unknown>[] = []
  const seenInBatch = new Set<string>()
  let skipped = 0

  for (const it of incoming) {
    const title = String(it.title ?? '').trim()
    const primaryKeyword = String(it.primaryKeyword ?? '').trim()
    if (!title || !primaryKeyword) { skipped++; continue }
    const batchKey = primaryKeyword.toLowerCase()
    if (seenInBatch.has(batchKey)) { skipped++; continue }
    if (corpus.isDuplicate(primaryKeyword) || corpus.isDuplicate(title)) { skipped++; continue }
    seenInBatch.add(batchKey)

    const source: ArticleTopicSource = ALLOWED_SOURCES.includes(it.source as ArticleTopicSource)
      ? (it.source as ArticleTopicSource)
      : 'project_data'
    const secondary = Array.isArray(it.secondaryKeywords)
      ? (it.secondaryKeywords as unknown[]).map((s) => String(s).trim()).filter(Boolean)
      : []
    const angle = String(it.angle ?? '').trim()
    const score = typeof it.suggestionScore === 'number' && Number.isFinite(it.suggestionScore) ? it.suggestionScore : null

    rows.push({
      user_id: auth.user.id,
      project_id: auth.project.id,
      source,
      status,
      topic: title,
      primary_keyword: primaryKeyword,
      secondary_keywords: secondary,
      search_intent: String(it.searchIntent ?? '').trim() || null,
      target_audience: null,
      language,
      desired_word_count: typeof it.recommendedWordCount === 'number' ? it.recommendedWordCount : null,
      brief_notes: angle ? encodeBriefSections({ articleAngle: angle, mustInclude: '', mustAvoid: '' }) : null,
      anchors_json: [],
      suggestion_reason: String(it.suggestionReason ?? '').trim() || null,
      suggestion_score: score,
      updated_at: nowIso,
    })
  }

  if (rows.length === 0) return Response.json({ created: 0, skipped, ids: [], topics: [] })

  // Return id + topic + primary_keyword of the created rows so the caller can
  // offer the Phase 2F.1 internal-link planning step without refetching all
  // topics or inferring which ones are new.
  const { data, error } = await auth.admin.from('article_topics').insert(rows).select('id, topic, primary_keyword')
  if (error) {
    const code = (error as { code?: string }).code
    if (code === '42P01') return Response.json({ error: 'Content module not initialized' }, { status: 404 })
    if (code === '42703' || code === '23514') {
      // Missing column / CHECK violation → the automation migration isn't applied.
      return Response.json({ error: 'automation_migration_required' }, { status: 503 })
    }
    console.error('[automation-topics-bulk] insert failed', { code, message: error.message })
    return Response.json({ error: 'Failed to create topics' }, { status: 500 })
  }

  const createdRows = (data ?? []) as { id: string; topic: string; primary_keyword: string | null }[]
  const ids = createdRows.map((r) => r.id)
  return Response.json({ created: ids.length, skipped, ids, topics: createdRows })
}
