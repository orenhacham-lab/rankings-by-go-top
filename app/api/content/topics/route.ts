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

export async function GET(request: Request) {
  if (!isContentModuleEnabled()) {
    return Response.json({ error: 'Not found' }, { status: 404 })
  }

  const projectId = new URL(request.url).searchParams.get('projectId')
  const auth = await authContentProject(projectId)
  if ('error' in auth) return Response.json({ error: auth.error }, { status: auth.status })

  // Session client → RLS ensures only the caller's rows are visible.
  const supabase = await createClient()
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

  return Response.json({ topics: data || [] })
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

  const auth = await authContentProject(typeof body.projectId === 'string' ? body.projectId : null)
  if ('error' in auth) return Response.json({ error: auth.error }, { status: auth.status })

  const validated = validateTopicBrief(body)
  if ('error' in validated) {
    return Response.json({ error: validated.error }, { status: 400 })
  }
  const v = validated.value

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
    console.error('[content topics] create failed:', error?.message)
    return Response.json({ error: 'Failed to save topic' }, { status: 500 })
  }

  console.log('[content topics] created', { projectId: auth.project.id, anchors: v.anchors_json.length })
  return Response.json({ topic: data })
}
