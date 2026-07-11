/**
 * Content automation — /api/content/automation/pools/:id/items
 *
 * POST { topicIds } → add APPROVED topics to the pool queue (status 'queued').
 *   Skips: non-approved / wrong-project topics, and topics already queued in
 *   this pool (returned in `alreadyQueued`). Duplicate topics can't be queued
 *   twice (also enforced by the unique(pool_id, topic_id) index).
 * PUT  { orderedItemIds } → reorder queue items by the given order.
 *
 * No generation/publishing. Gated by ENABLE_CONTENT_AUTOMATION + ownership.
 */

import { isContentAutomationEnabled } from '@/lib/content/api-auth'
import { authPool, isMigrationMissing } from '@/lib/content/automation/api'

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!isContentAutomationEnabled()) return Response.json({ error: 'Not found' }, { status: 404 })
  const { id } = await params

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

  const owned = await authPool(id)
  if ('error' in owned) return Response.json({ error: owned.error }, { status: owned.status })
  const { auth, pool } = owned

  // Only APPROVED topics in THIS project are eligible.
  const { data: topicRows } = await auth.admin
    .from('article_topics')
    .select('id, status')
    .eq('project_id', pool.project_id)
    .in('id', topicIds)
  const approved = new Set(((topicRows ?? []) as { id: string; status: string }[]).filter((t) => t.status === 'approved').map((t) => t.id))

  // Existing items in this pool (dedupe) + current max position.
  const { data: existing } = await auth.admin.from('article_pool_items').select('topic_id, position').eq('pool_id', pool.id)
  const existingRows = (existing ?? []) as { topic_id: string | null; position: number }[]
  const alreadyIn = new Set(existingRows.map((r) => r.topic_id).filter((x): x is string => !!x))
  let position = existingRows.reduce((m, r) => Math.max(m, r.position), -1)

  const alreadyQueued: string[] = []
  const notApproved: string[] = []
  const nowIso = new Date().toISOString()
  const rows: Record<string, unknown>[] = []
  for (const topicId of topicIds) {
    if (!approved.has(topicId)) { notApproved.push(topicId); continue }
    if (alreadyIn.has(topicId)) { alreadyQueued.push(topicId); continue }
    alreadyIn.add(topicId)
    position += 1
    rows.push({
      user_id: auth.user.id,
      project_id: pool.project_id,
      pool_id: pool.id,
      topic_id: topicId,
      article_id: null,
      position,
      status: 'queued',
      updated_at: nowIso,
    })
  }

  if (rows.length === 0) {
    return Response.json({ added: 0, alreadyQueued, notApproved })
  }

  const { data, error } = await auth.admin.from('article_pool_items').insert(rows).select('id')
  if (error) {
    const code = (error as { code?: string }).code
    if (isMigrationMissing(code)) return Response.json({ error: 'automation_migration_required' }, { status: 503 })
    if (code === '23505') {
      // Unique(pool_id, topic_id) race — treat as already queued.
      return Response.json({ added: 0, alreadyQueued: [...alreadyQueued, ...rows.map((r) => r.topic_id as string)], notApproved })
    }
    console.error('[automation-items] insert failed', { code, message: error.message })
    return Response.json({ error: 'Failed to add items' }, { status: 500 })
  }

  return Response.json({ added: ((data ?? []) as unknown[]).length, alreadyQueued, notApproved })
}

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!isContentAutomationEnabled()) return Response.json({ error: 'Not found' }, { status: 404 })
  const { id } = await params

  let body: { orderedItemIds?: unknown }
  try {
    body = await request.json()
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 })
  }
  const ordered = Array.isArray(body.orderedItemIds) ? (body.orderedItemIds as unknown[]).filter((x): x is string => typeof x === 'string') : []
  if (ordered.length === 0) return Response.json({ error: 'no_order' }, { status: 400 })

  const owned = await authPool(id)
  if ('error' in owned) return Response.json({ error: owned.error }, { status: owned.status })
  const { auth, pool } = owned

  // Only reorder items that actually belong to this pool.
  const { data: itemRows } = await auth.admin.from('article_pool_items').select('id').eq('pool_id', pool.id)
  const valid = new Set(((itemRows ?? []) as { id: string }[]).map((r) => r.id))
  const nowIso = new Date().toISOString()
  let pos = 0
  for (const itemId of ordered) {
    if (!valid.has(itemId)) continue
    await auth.admin.from('article_pool_items').update({ position: pos, updated_at: nowIso }).eq('id', itemId).eq('pool_id', pool.id)
    pos += 1
  }
  return Response.json({ success: true })
}
