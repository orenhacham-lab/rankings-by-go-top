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
  nextPublishAtWeekdays,
  projectedPublishAt,
  DEFAULT_TIMEZONE,
  DEFAULT_PUBLISH_TIME,
  type Cadence,
} from '@/lib/content/automation/schedule'

const CADENCES: Cadence[] = ['daily', 'weekly', 'monthly', 'custom']
const POOL_SELECT = 'id, project_id, name, cadence, interval_days, publish_time, timezone, is_active, next_publish_at, publish_days'

/** Sanitize an incoming weekday array (0=Sun … 6=Sat), unique + sorted. */
function cleanPublishDays(v: unknown): number[] {
  if (!Array.isArray(v)) return []
  const set = new Set<number>()
  for (const d of v) { const n = Number(d); if (Number.isInteger(n) && n >= 0 && n <= 6) set.add(n) }
  return Array.from(set).sort((a, b) => a - b)
}

/** First/next publish slot honoring weekday schedule when present. */
function firstSlot(publishTime: string, timezone: string, publishDays: number[]): string {
  return publishDays.length ? nextPublishAtWeekdays(publishTime, timezone, publishDays) : computeNextPublishAt(publishTime, timezone)
}

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
    .select('id, topic_id, article_id, status, position, attempts, last_error, scheduled_at, published_at, locked_at, updated_at')
    .eq('pool_id', pool.id)
    .order('position', { ascending: true })
  const items = (itemRows ?? []) as {
    id: string; topic_id: string | null; article_id: string | null; status: string
    position: number; attempts: number; last_error: string | null; scheduled_at: string | null; published_at: string | null
    locked_at: string | null; updated_at: string | null
  }[]

  // Join topic titles.
  const topicIds = Array.from(new Set(items.map((i) => i.topic_id).filter((x): x is string => !!x)))
  const titleById: Record<string, string> = {}
  if (topicIds.length) {
    const { data: topics } = await auth.admin.from('article_topics').select('id, topic').in('id', topicIds)
    for (const t of (topics ?? []) as { id: string; topic: string }[]) titleById[t.id] = t.topic
  }

  // Join WordPress URLs for items whose article was published.
  const articleIds = Array.from(new Set(items.map((i) => i.article_id).filter((x): x is string => !!x)))
  const wpUrlByArticle: Record<string, string | null> = {}
  if (articleIds.length) {
    const { data: arts } = await auth.admin.from('generated_articles').select('id, wp_post_url').in('id', articleIds)
    for (const a of (arts ?? []) as { id: string; wp_post_url: string | null }[]) wpUrlByArticle[a.id] = a.wp_post_url
  }

  // Projected publish dates for still-pending items, in queue order.
  const ptime = pool.publishTime || DEFAULT_PUBLISH_TIME
  const base = pool.nextPublishAt || (pool.isActive ? firstSlot(ptime, pool.timezone, pool.publishDays) : null)
  let pendingIndex = 0
  let weekdayCursor = base // sequential weekday projection cursor
  const dtoItems = items.map((i) => {
    // Phase 3G.9 — every NOT-YET-PUBLISHED working item occupies an upcoming
    // cadence slot: the cron publishes the earliest GENERATED item at each due
    // slot and generates queued items ahead, so 'generated' ("ready") items are
    // the FIRST to consume slots — they must not fall through to scheduled_at
    // (usually null) and display as "not scheduled" while automation is active.
    // failed/skipped/published stay out (they show their own state instead).
    const pending = ['queued', 'scheduled', 'generating', 'generated', 'publishing'].includes(i.status)
    let projected: string | null
    if (!pending || !base) {
      projected = i.published_at ?? i.scheduled_at ?? null
    } else if (pool.publishDays.length) {
      projected = weekdayCursor
      weekdayCursor = weekdayCursor ? nextPublishAtWeekdays(ptime, pool.timezone, pool.publishDays, Date.parse(weekdayCursor) + 60000) : null
    } else {
      projected = projectedPublishAt(base, ptime, pool.timezone, pool.intervalDays, pendingIndex)
    }
    if (pending) pendingIndex++
    return {
      id: i.id,
      topicId: i.topic_id,
      articleId: i.article_id,
      wpPostUrl: (i.article_id && wpUrlByArticle[i.article_id]) || null,
      topicTitle: (i.topic_id && titleById[i.topic_id]) || '—',
      status: i.status,
      position: i.position,
      attempts: i.attempts,
      lastError: i.last_error,
      projectedPublishAt: projected,
    }
  })

  // ── Pool health summary (Phase 3C) — for a visible "queue stuck / publish
  // failed" alert. Computed from the items already loaded; no schema change. ──
  const nowMs = Date.now()
  const STUCK_MS = 45 * 60 * 1000
  const failedItems = items.filter((i) => i.status === 'failed' || i.status === 'quality_check_failed')
  const stuckItems = items.filter((i) => (i.status === 'generating' || i.status === 'publishing') && i.locked_at != null && Date.parse(i.locked_at) < nowMs - STUCK_MS)
  const readyCount = items.filter((i) => i.status === 'generated').length
  const queuedCount = items.filter((i) => i.status === 'queued').length
  const overdue = pool.isActive && !!base && Date.parse(base) < nowMs
  // Most recent error among failed/stuck items (by updated_at).
  const errorCandidates = [...failedItems, ...stuckItems].filter((i) => i.last_error)
    .sort((a, b) => Date.parse(b.updated_at ?? '') - Date.parse(a.updated_at ?? ''))
  const latestError = errorCandidates[0]?.last_error ?? null
  const health = {
    overdue,
    dueAt: base,
    failedCount: failedItems.length,
    stuckCount: stuckItems.length,
    readyCount,
    queuedCount,
    latestError,
    // Needs attention when something failed/stuck, or the queue is overdue with
    // nothing able to publish (empty of ready + queued items).
    needsAttention: failedItems.length > 0 || stuckItems.length > 0 || (overdue && readyCount === 0 && queuedCount === 0),
  }

  return Response.json({ pool: { ...pool, nextPublishAt: base }, items: dtoItems, health })
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
  const name = typeof body.name === 'string' && body.name.trim() ? body.name.trim() : 'תזמון פרסום אוטומטי'

  // Find the project's single pool (to PRESERVE is_active / publish_days that the
  // caller didn't explicitly send — never silently pause an active pool).
  const { data: existing, error: findErr } = await auth.admin
    .from('article_pools')
    .select('id, is_active, publish_days')
    .eq('project_id', auth.project.id)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle()
  if (findErr && isMigrationMissing((findErr as { code?: string }).code)) {
    return Response.json({ error: 'automation_migration_required' }, { status: 503 })
  }
  const prev = existing as { id: string; is_active: boolean; publish_days: number[] | null } | null

  // is_active / publish_days are only changed when explicitly present in the body.
  const isActive = 'isActive' in body ? body.isActive === true : (prev?.is_active ?? false)
  const publishDays = 'publishDays' in body ? cleanPublishDays(body.publishDays) : (Array.isArray(prev?.publish_days) ? prev!.publish_days : [])
  const nextPublishAt = isActive ? firstSlot(publishTime, timezone, publishDays) : null

  const patch = { name, cadence, interval_days: intervalDays, publish_time: publishTime, timezone, is_active: isActive, publish_days: publishDays.length ? publishDays : null, next_publish_at: nextPublishAt, updated_at: new Date().toISOString() }

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
