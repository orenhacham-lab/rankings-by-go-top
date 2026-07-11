/**
 * Content module — /api/content/topics/:id
 *
 * PATCH  → edit brief fields, OR transition status (approve/reject/suggested).
 * DELETE → hard-delete a brief (UI requires an explicit confirmation).
 *
 * Gated by ENABLE_CONTENT. Ownership is verified via the topic's project_id.
 * Does NOT touch /api/articles or the articles table.
 */

import { authContentProject, isContentModuleEnabled } from '@/lib/content/api-auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { validateTopicBrief } from '@/lib/content/topic-brief'

// Statuses a user may set manually. 'used' is reserved for generation (later).
const USER_SETTABLE_STATUSES = ['suggested', 'approved', 'rejected'] as const

async function loadOwnedTopic(topicId: string) {
  const admin = createAdminClient()
  const { data: topic, error } = await admin
    .from('article_topics')
    .select('id, project_id')
    .eq('id', topicId)
    .maybeSingle()

  if (error) {
    if ((error as { code?: string }).code === '42P01') {
      return { error: 'Content module not initialized', status: 404 as const }
    }
    return { error: 'Failed to load topic', status: 500 as const }
  }
  if (!topic) return { error: 'Topic not found', status: 404 as const }

  const auth = await authContentProject((topic as { project_id: string }).project_id)
  if ('error' in auth) return { error: auth.error, status: auth.status }
  return { admin, auth, topic: topic as { id: string; project_id: string } }
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!isContentModuleEnabled()) {
    return Response.json({ error: 'Not found' }, { status: 404 })
  }
  const { id } = await params

  let body: Record<string, unknown>
  try {
    body = await request.json()
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const owned = await loadOwnedTopic(id)
  if ('error' in owned) return Response.json({ error: owned.error }, { status: owned.status })

  const now = new Date().toISOString()

  // Status-only transition (approve / reject / back to suggested).
  const wantsStatusOnly = typeof body.status === 'string' && !('topic' in body)
  if (wantsStatusOnly) {
    const status = body.status as string
    if (!(USER_SETTABLE_STATUSES as readonly string[]).includes(status)) {
      return Response.json(
        { error: `invalid status (allowed: ${USER_SETTABLE_STATUSES.join(', ')})` },
        { status: 400 }
      )
    }
    const { data, error } = await owned.admin
      .from('article_topics')
      .update({ status, updated_at: now })
      .eq('id', id)
      .select('*')
      .single()
    if (error || !data) {
      console.error('[content topics] status update failed:', error?.message)
      return Response.json({ error: 'Failed to update status' }, { status: 500 })
    }
    return Response.json({ topic: data })
  }

  // Full brief edit — re-validate everything.
  const validated = validateTopicBrief(body)
  if ('error' in validated) {
    return Response.json({ error: validated.error }, { status: 400 })
  }
  const v = validated.value

  // Optional status change alongside an edit.
  const patch: Record<string, unknown> = {
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
    updated_at: now,
  }
  if (typeof body.status === 'string') {
    if (!(USER_SETTABLE_STATUSES as readonly string[]).includes(body.status)) {
      return Response.json({ error: 'invalid status' }, { status: 400 })
    }
    patch.status = body.status
  }

  const { data, error } = await owned.admin
    .from('article_topics')
    .update(patch)
    .eq('id', id)
    .select('*')
    .single()
  if (error || !data) {
    console.error('[content topics] edit failed:', error?.message)
    return Response.json({ error: 'Failed to update topic' }, { status: 500 })
  }
  return Response.json({ topic: data })
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!isContentModuleEnabled()) {
    return Response.json({ error: 'Not found' }, { status: 404 })
  }
  const { id } = await params

  const owned = await loadOwnedTopic(id)
  if ('error' in owned) return Response.json({ error: owned.error }, { status: owned.status })

  const { error } = await owned.admin.from('article_topics').delete().eq('id', id)
  if (error) {
    console.error('[content topics] delete failed:', error.message)
    return Response.json({ error: 'Failed to delete topic' }, { status: 500 })
  }
  return Response.json({ success: true })
}
