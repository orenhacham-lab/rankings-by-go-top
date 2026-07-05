/**
 * Content automation — PATCH /api/content/automation/pools/:id
 *
 * Update cadence/settings and/or pause/resume (is_active). Recomputes
 * next_publish_at when the pool is active. Ownership via the pool's project.
 * Management only — no generation/publishing.
 */

import { isContentAutomationEnabled } from '@/lib/content/api-auth'
import { authPool, toPoolDTO, type PoolRow } from '@/lib/content/automation/api'
import { computeNextPublishAt, DEFAULT_PUBLISH_TIME, DEFAULT_TIMEZONE, type Cadence } from '@/lib/content/automation/schedule'

const CADENCES: Cadence[] = ['daily', 'weekly', 'monthly', 'custom']
const POOL_SELECT = 'id, project_id, name, cadence, interval_days, publish_time, timezone, is_active, next_publish_at'

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!isContentAutomationEnabled()) return Response.json({ error: 'Not found' }, { status: 404 })
  const { id } = await params

  let body: Record<string, unknown>
  try {
    body = await request.json()
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const owned = await authPool(id)
  if ('error' in owned) return Response.json({ error: owned.error }, { status: owned.status })
  const { auth, pool } = owned

  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if ('cadence' in body && CADENCES.includes(body.cadence as Cadence)) patch.cadence = body.cadence
  if ('intervalDays' in body) {
    const n = typeof body.intervalDays === 'number' ? Math.floor(body.intervalDays) : null
    patch.interval_days = n && n > 0 ? Math.min(365, n) : null
  }
  if ('publishTime' in body && typeof body.publishTime === 'string' && /^\d{1,2}:\d{2}$/.test(body.publishTime)) patch.publish_time = body.publishTime
  if ('timezone' in body && typeof body.timezone === 'string' && body.timezone.trim()) patch.timezone = body.timezone.trim()
  if ('name' in body && typeof body.name === 'string' && body.name.trim()) patch.name = body.name.trim()
  if ('isActive' in body) patch.is_active = body.isActive === true

  // Resulting active state + schedule fields → recompute next_publish_at.
  const nextActive = 'is_active' in patch ? (patch.is_active as boolean) : pool.is_active
  const nextTime = (patch.publish_time as string) ?? pool.publish_time ?? DEFAULT_PUBLISH_TIME
  const nextTz = (patch.timezone as string) ?? pool.timezone ?? DEFAULT_TIMEZONE
  patch.next_publish_at = nextActive ? computeNextPublishAt(nextTime, nextTz) : null

  const { data, error } = await auth.admin.from('article_pools').update(patch).eq('id', id).select(POOL_SELECT).single()
  if (error || !data) {
    console.error('[automation-pool] update failed', { message: error?.message })
    return Response.json({ error: 'Failed to update pool' }, { status: 500 })
  }
  return Response.json({ pool: toPoolDTO(data as PoolRow) })
}
