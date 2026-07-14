/**
 * Content automation — POST /api/content/automation/pools/:id/approve-and-queue
 *
 * The AUTHORITATIVE manual-topic "approve links + add to queue" server operation.
 * Manual topics are created status='suggested'; the review panel saved/approved the
 * link plan (client, before this call) but never transitioned the TOPIC. This
 * endpoint, in ONE ownership-checked step, promotes ONLY manual+suggested topics to
 * 'approved' (preserving every other field — a status-only update) and then adds the
 * approved topics to the EXISTING pool, reusing the same enqueue semantics as
 * pools/:id/items (dedupe, position, unique(pool_id, topic_id)).
 *
 * It never creates a second topic or pool, never promotes a non-manual topic (the
 * plain items route stays strict for those), and never marks a topic 'used'.
 *
 * No generation/publishing. Gated by ENABLE_CONTENT_AUTOMATION + ownership.
 */

import { randomUUID } from 'crypto'
import { isContentAutomationEnabled } from '@/lib/content/api-auth'
import { authPool, isMigrationMissing } from '@/lib/content/automation/api'
import { selectManualTopicsToApprove, approvedTopicIds, partitionForQueue, type TopicStatusRow } from '@/lib/content/automation/approve-queue'

export const runtime = 'nodejs'

type Stage = 'authorize' | 'load_topics' | 'approve' | 'enqueue'

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!isContentAutomationEnabled()) return Response.json({ error: 'Not found' }, { status: 404 })
  const { id } = await params
  const diagnosticId = randomUUID()
  let stage: Stage = 'authorize'

  const fail = (error: string, httpStatus: number): Response => {
    console.error('[approve-and-queue] failed', { diagnosticId, poolId: id, stage, error })
    return Response.json({ ok: false, error, reason: error, stage, diagnosticId }, { status: httpStatus })
  }

  let body: { topicIds?: unknown }
  try {
    body = await request.json()
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 })
  }
  const topicIds = Array.isArray(body.topicIds)
    ? Array.from(new Set((body.topicIds as unknown[]).filter((x): x is string => typeof x === 'string' && !!x))).slice(0, 200)
    : []
  if (topicIds.length === 0) return Response.json({ error: 'no_topics' }, { status: 400 })

  // 1) Ownership of the pool + its project.
  stage = 'authorize'
  const owned = await authPool(id)
  if ('error' in owned) {
    if (owned.error === 'automation_migration_required') return fail('automation_migration_required', 503)
    if (owned.status === 404) return fail('manual_topic_not_found', 404)
    return fail('manual_topic_ownership_failed', owned.status === 403 ? 403 : owned.status)
  }
  const { auth, pool } = owned

  // 2) Load the requested topics IN THIS PROJECT (ownership-scoped by project_id).
  stage = 'load_topics'
  const { data: topicRows, error: loadErr } = await auth.admin
    .from('article_topics')
    .select('id, status, source')
    .eq('project_id', pool.project_id)
    .in('id', topicIds)
  if (loadErr) {
    if (isMigrationMissing((loadErr as { code?: string }).code)) return fail('automation_migration_required', 503)
    return fail('manual_topic_not_found', 500)
  }
  const rows = (topicRows ?? []) as TopicStatusRow[]
  if (rows.length === 0) return fail('manual_topic_not_found', 404)

  // 3) Promote ONLY manual + suggested topics (skip already-approved — idempotent).
  //    A status-only update preserves source/title/keywords/brief_notes/tone/word-
  //    count/cta/language. The WHERE guards (project + source=manual + status=
  //    suggested) make a genuinely non-approved auto topic impossible to promote here.
  stage = 'approve'
  const toApprove = selectManualTopicsToApprove(rows)
  if (toApprove.length > 0) {
    const { data: updated, error: updErr } = await auth.admin
      .from('article_topics')
      .update({ status: 'approved', updated_at: new Date().toISOString() })
      .eq('project_id', pool.project_id)
      .eq('source', 'manual')
      .eq('status', 'suggested')
      .in('id', toApprove)
      .select('id, status')
    if (updErr) return fail('manual_topic_approval_failed', 500)
    const nowApproved = new Set(((updated ?? []) as { id: string; status: string }[]).filter((r) => r.status === 'approved').map((r) => r.id))
    // Verify the server row is actually approved before enqueue (authoritative).
    if (!toApprove.every((tid) => nowApproved.has(tid))) return fail('manual_topic_approval_failed', 500)
  }

  // 4) Enqueue the approved topics into the EXISTING pool (same semantics as items).
  stage = 'enqueue'
  const approved = approvedTopicIds(rows, toApprove)
  const { data: existing } = await auth.admin.from('article_pool_items').select('topic_id, position').eq('pool_id', pool.id)
  const existingRows = (existing ?? []) as { topic_id: string | null; position: number }[]
  const alreadyIn = new Set(existingRows.map((r) => r.topic_id).filter((x): x is string => !!x))
  const { toQueue, alreadyQueued, notApproved } = partitionForQueue(topicIds, approved, alreadyIn)

  let position = existingRows.reduce((m, r) => Math.max(m, r.position), -1)
  const nowIso = new Date().toISOString()
  const insertRows = toQueue.map((topicId) => ({
    user_id: auth.user.id,
    project_id: pool.project_id,
    pool_id: pool.id,
    topic_id: topicId,
    article_id: null,
    position: ++position,
    status: 'queued',
    updated_at: nowIso,
  }))

  if (insertRows.length === 0) {
    return Response.json({ ok: true, added: 0, alreadyQueued, notApproved, approved: toApprove, diagnosticId })
  }
  const { data, error } = await auth.admin.from('article_pool_items').insert(insertRows).select('id')
  if (error) {
    const code = (error as { code?: string }).code
    if (isMigrationMissing(code)) return fail('automation_migration_required', 503)
    if (code === '23505') {
      // unique(pool_id, topic_id) race → treat as already queued (idempotent success).
      return Response.json({ ok: true, added: 0, alreadyQueued: [...alreadyQueued, ...toQueue], notApproved, approved: toApprove, diagnosticId })
    }
    return fail('queue_insert_failed', 500)
  }
  return Response.json({ ok: true, added: ((data ?? []) as unknown[]).length, alreadyQueued, notApproved, approved: toApprove, diagnosticId })
}
