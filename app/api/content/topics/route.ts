/**
 * Content module — /api/content/topics
 *
 * GET  ?projectId=  → list article briefs/topics for a project (owned).
 * POST { projectId, ...brief } → create a manual brief (status 'suggested').
 *
 * Gated by ENABLE_CONTENT. Auth + project ownership. Session/RLS-scoped reads.
 * No secrets returned. Does NOT touch /api/articles or the articles table.
 */

import { authContentProject, isContentModuleEnabled } from '@/lib/content/api-auth'
import { createClient } from '@/lib/supabase/server'
import { validateTopicBrief } from '@/lib/content/topic-brief'
import { loadPlanSummariesForProject } from '@/lib/content/internal-link-plan-store'
import { isGscReadOnlyEnabled } from '@/lib/gsc/config'
import { loadOverlapIndex } from '@/lib/content/cannibalization/load'
import { checkOverlap, overlapPayload, SITE_AND_PLAN_KINDS } from '@/lib/content/cannibalization/check'

export async function GET(request: Request) {
  if (!isContentModuleEnabled()) {
    return Response.json({ error: 'Not found' }, { status: 404 })
  }

  const projectId = new URL(request.url).searchParams.get('projectId')
  const auth = await authContentProject(projectId)
  if ('error' in auth) return Response.json({ error: auth.error }, { status: auth.status })

  // Session client → RLS ensures only the caller's rows are visible.
  const supabase = await createClient()
  // SPEED: the topics and their saved-plan status are read together (one round trip, not two).
  const planStatusRead = loadPlanSummariesForProject(auth.admin, auth.project.id)
  planStatusRead.catch(() => {}) // an early return below must not leave it unhandled
  const { data, error } = await supabase
    .from('article_topics')
    .select('id, project_id, source, topic, primary_keyword, secondary_keywords, search_intent, target_audience, status, anchors_json, brief_notes, language, tone_of_voice, desired_word_count, cta_preference, created_at, updated_at')
    .eq('project_id', auth.project.id)
    .order('created_at', { ascending: false })

  if (error) {
    // 42P01 = table missing (migration not run yet) → empty, not a 500.
    if ((error as { code?: string }).code === '42P01') {
      return Response.json({ topics: [], migrationPending: true })
    }
    console.error('[content topics] list failed:', error.message)
    return Response.json({ error: 'Failed to load topics' }, { status: 500 })
  }

  // ONE-SHOT saved-plan status for every topic (no N+1) so the row link badges are TRUTHFUL
  // after a full page refresh — not just within the session that saved them.
  const planStatus = await planStatusRead
  return Response.json({ topics: data || [], planStatus })
}

export async function POST(request: Request) {
  if (!isContentModuleEnabled()) {
    return Response.json({ error: 'Not found' }, { status: 404 })
  }

  let body: Record<string, unknown>
  try {
    body = await request.json()
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  console.log('[content-topics] create topic request', { hasBody: !!body, projectIdPresent: typeof body.projectId === 'string' })

  const auth = await authContentProject(typeof body.projectId === 'string' ? body.projectId : null)
  console.log('[content-topics] project ownership ok', !('error' in auth))
  if ('error' in auth) return Response.json({ error: auth.error }, { status: auth.status })

  const validated = validateTopicBrief(body)
  console.log('[content-topics] validation ok', !('error' in validated))
  if ('error' in validated) {
    return Response.json({ error: validated.error }, { status: 400 })
  }
  const v = validated.value

  // The cannibalization check (lib/content/cannibalization). A manual path WARNS and
  // never blocks: the topic is created either way, and the answer carries `overlap`
  // (the existing page, and where "improve it" goes) for the screen to say so. Read
  // alongside the insert; the new topic is excluded, so it is never its own match.
  const overlapIndex = loadOverlapIndex(auth.admin, { projectId: auth.project.id, userId: auth.user.id }, { gsc: isGscReadOnlyEnabled() })
    .catch(() => null)

  const { data, error } = await auth.admin
    .from('article_topics')
    .insert({
      user_id: auth.user.id,
      project_id: auth.project.id,
      source: 'manual',
      status: 'suggested',
      topic: v.topic,
      primary_keyword: v.primary_keyword,
      secondary_keywords: v.secondary_keywords,
      search_intent: v.search_intent,
      target_audience: v.target_audience,
      language: v.language,
      tone_of_voice: v.tone_of_voice,
      desired_word_count: v.desired_word_count,
      cta_preference: v.cta_preference,
      brief_notes: v.brief_notes,
      anchors_json: v.anchors_json,
      updated_at: new Date().toISOString(),
    })
    .select('*')
    .single()

  if (error || !data) {
    const code = (error as { code?: string })?.code
    console.error('[content-topics] supabase insert error', { code, message: error?.message })
    // 42703 = undefined_column, 42P01 = undefined_table → the Phase 2A brief
    // migration (20260703_add_topic_brief_fields.sql) has not been applied.
    if (code === '42703' || code === '42P01') {
      return Response.json(
        { error: 'Content module not fully migrated on the server. The brief fields migration must be run.' },
        { status: 503 }
      )
    }
    return Response.json({ error: 'Failed to save topic' }, { status: 500 })
  }

  console.log('[content-topics] created topic id', { id: (data as { id: string }).id, anchors: v.anchors_json.length })
  const index = await overlapIndex
  const overlap = index ? overlapPayload(checkOverlap(index, { title: v.topic, keyword: v.primary_keyword }, { kinds: SITE_AND_PLAN_KINDS, excludeTopicIds: [(data as { id: string }).id] })) : null
  return Response.json({ topic: data, overlap })
}
