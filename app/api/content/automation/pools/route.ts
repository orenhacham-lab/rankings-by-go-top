/**
 * Content automation — /api/content/automation/pools
 *
 * GET  ?projectId=  → { pool, items } for the project's single automation pool
 *                     (queue items joined with topic titles + projected dates).
 * POST { projectId, ...cadence } → create OR update the project's pool (one per
 *                     project in v1). Recomputes next_publish_at when active.
 *
 * Management only — no generation, no publishing, no cron. Gated by
 * ENABLE_CONTENT_AUTOMATION + project ownership.
 */

import { authContentProject, isContentAutomationEnabled } from '@/lib/content/api-auth'
import { toPoolDTO, isMigrationMissing, type PoolRow } from '@/lib/content/automation/api'
import {
  computeNextPublishAt,
  projectedPublishAt,
  DEFAULT_TIMEZONE,
  DEFAULT_PUBLISH_TIME,
  type Cadence,
} from '@/lib/content/automation/schedule'

const CADENCES: Cadence[] = ['daily', 'weekly', 'monthly', 'custom']
const POOL_SELECT = 'id, project_id, name, cadence, interval_days, publish_time, timezone, is_active, next_publish_at'

export async function GET(request: Request) {
  if (!isContentAutomationEnabled()) return Response.json({ error: 'Not found' }, { status: 404 })

  const projectId = new URL(request.url).searchParams.get('projectId')
  const auth = await authContentProject(projectId)
  if ('error' in auth) return Response.json({ error: auth.error }, { status: auth.status })

  const { data: poolRow, error } = await auth.admin
    .from('article_pools')
    .select(POOL_SELECT)
    .eq('project_id', auth.project.id)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle()
  if (error) {
    if (isMigrationMissing((error as { code?: string }).code)) return Response.json({ error: 'automation_migration_required' }, { status: 503 })
    return Response.json({ error: 'Failed to load pool' }, { status: 500 })
  }
  if (!poolRow) return Response.json({ pool: null, items: [] })

  const pool = toPoolDTO(poolRow as PoolRow)

  const { data: itemRows } = await auth.admin
    .from('article_pool_items')
    .select('id, topic_id, article_id, status, position, attempts, last_error, scheduled_at, published_at')
    .eq('pool_id', pool.id)
    .order('position', { ascending: true })
  const items = (itemRows ?? []) as {
    id: string; topic_id: string | null; article_id: string | null; status: string
    position: number; attempts: number; last_error: string | null; scheduled_at: string | null; published_at: string | null
  }[]

  // Join topic titles.
  const topicIds = Array.from(new Set(items.map((i) => i.topic_id).filter((x): x is string => !!x)))
  const titleById: Record<string, string> = {}
  if (topicIds.length) {
    const { data: topics } = await auth.admin.from('article_topics').select('id, topic').in('id', topicIds)
    for (const t of (topics ?? []) as { id: string; topic: string }[]) titleById[t.id] = t.topic
  }

  // Projected publish dates for still-pending items, in queue order.
  const base = pool.nextPublishAt || (pool.isActive ? computeNextPublishAt(pool.publishTime || DEFAULT_PUBLISH_TIME, pool.timezone) : null)
  let pendingIndex = 0
  const dtoItems = items.map((i) => {
    const pending = ['queued', 'scheduled'].includes(i.status)
    const projected = pending && base ? projectedPublishAt(base, pool.publishTime || DEFAULT_PUBLISH_TIME, pool.timezone, pool.intervalDays, pendingIndex) : (i.published_at ?? i.scheduled_at ?? null)
    if (pending) pendingIndex++
    return {
      id: i.id,
      topicId: i.topic_id,
      topicTitle: (i.topic_id && titleById[i.topic_id]) || '—',
      status: i.status,
      position: i.position,
      attempts: i.attempts,
      lastError: i.last_error,
      projectedPublishAt: projected,
    }
  })

  return Response.json({ pool: { ...pool, nextPublishAt: base }, items: dtoItems })
}

export async function POST(request: Request) {
  if (!isContentAutomationEnabled()) return Response.json({ error: 'Not found' }, { status: 404 })

  let body: Record<string, unknown>
  try {
    body = await request.json()
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const projectId = typeof body.projectId === 'string' ? body.projectId : null
  const auth = await authContentProject(projectId)
  if ('error' in auth) return Response.json({ error: auth.error }, { status: auth.status })

  const cadence: Cadence = CADENCES.includes(body.cadence as Cadence) ? (body.cadence as Cadence) : 'weekly'
  const intervalDaysRaw = typeof body.intervalDays === 'number' ? Math.floor(body.intervalDays) : null
  const intervalDays = intervalDaysRaw && intervalDaysRaw > 0 ? Math.min(365, intervalDaysRaw) : null
  const publishTime = typeof body.publishTime === 'string' && /^\d{1,2}:\d{2}$/.test(body.publishTime) ? body.publishTime : DEFAULT_PUBLISH_TIME
  const timezone = typeof body.timezone === 'string' && body.timezone.trim() ? body.timezone.trim() : DEFAULT_TIMEZONE
  const isActive = body.isActive === true
  const name = typeof body.name === 'string' && body.name.trim() ? body.name.trim() : 'תזמון פרסום אוטומטי'

  const nextPublishAt = isActive ? computeNextPublishAt(publishTime, timezone) : null

  // Upsert the project's single pool.
  const { data: existing, error: findErr } = await auth.admin
    .from('article_pools')
    .select('id')
    .eq('project_id', auth.project.id)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle()
  if (findErr && isMigrationMissing((findErr as { code?: string }).code)) {
    return Response.json({ error: 'automation_migration_required' }, { status: 503 })
  }

  const patch = { name, cadence, interval_days: intervalDays, publish_time: publishTime, timezone, is_active: isActive, next_publish_at: nextPublishAt, updated_at: new Date().toISOString() }

  let poolRow: PoolRow | null = null
  if (existing) {
    const { data, error } = await auth.admin.from('article_pools').update(patch).eq('id', (existing as { id: string }).id).select(POOL_SELECT).single()
    if (error) return Response.json({ error: 'Failed to update pool' }, { status: 500 })
    poolRow = data as PoolRow
  } else {
    const { data, error } = await auth.admin
      .from('article_pools')
      .insert({ user_id: auth.user.id, project_id: auth.project.id, ...patch })
      .select(POOL_SELECT)
      .single()
    if (error) {
      if (isMigrationMissing((error as { code?: string }).code)) return Response.json({ error: 'automation_migration_required' }, { status: 503 })
      return Response.json({ error: 'Failed to create pool' }, { status: 500 })
    }
    poolRow = data as PoolRow
  }

  return Response.json({ pool: toPoolDTO(poolRow) })
}
