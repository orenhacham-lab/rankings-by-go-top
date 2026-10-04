/**
 * Content automation — PATCH /api/content/automation/pools/:id
 *
 * Update cadence/settings and/or pause/resume (is_active). Recomputes
 * next_publish_at when the pool is active. Ownership via the pool's project.
 * Management only — no generation/publishing.
 */

import { isContentAutomationEnabled } from '@/lib/content/api-auth'
import { authPool, toPoolDTO, type PoolRow } from '@/lib/content/automation/api'
import { makeSlotAfter, resolveIntervalDays, DEFAULT_PUBLISH_TIME, DEFAULT_TIMEZONE, type Cadence } from '@/lib/content/automation/schedule'
import { readPublishRhythmForProject } from '@/lib/content/automation/plan-rhythm'

const CADENCES: Cadence[] = ['daily', 'weekly', 'monthly', 'custom']
const POOL_SELECT = 'id, project_id, name, cadence, interval_days, publish_time, timezone, is_active, next_publish_at, publish_days'

function cleanPublishDays(v: unknown): number[] {
  if (!Array.isArray(v)) return []
  const set = new Set<number>()
  for (const d of v) { const n = Number(d); if (Number.isInteger(n) && n >= 0 && n <= 6) set.add(n) }
  return Array.from(set).sort((a, b) => a - b)
}

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

  // WHO MAY CHANGE THE SCHEDULE. Hiding the picker is not enforcement: this is
  // an API route, and the matcher in proxy.ts excludes /api/*. A plan's rhythm
  // already overrode these columns when the runner read them, but a trial's did
  // not — its dates are the ones set when the account opened, and a PATCH could
  // move them. The schedule fields are therefore dropped for anyone whose
  // rhythm is not their own: a paid plan or a trial. Pause and resume, and the
  // queue's own order, are untouched.
  const scheduleRhythm = await readPublishRhythmForProject(auth.admin, pool.project_id, { countThisQueue: !pool.is_active })
  const scheduleIsTheirs = !scheduleRhythm.plan && !scheduleRhythm.trial

  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if (scheduleIsTheirs) {
  if ('cadence' in body && CADENCES.includes(body.cadence as Cadence)) patch.cadence = body.cadence
  if ('intervalDays' in body) {
    const n = typeof body.intervalDays === 'number' ? Math.floor(body.intervalDays) : null
    patch.interval_days = n && n > 0 ? Math.min(365, n) : null
  }
  if ('publishTime' in body && typeof body.publishTime === 'string' && /^\d{1,2}:\d{2}$/.test(body.publishTime)) patch.publish_time = body.publishTime
  if ('timezone' in body && typeof body.timezone === 'string' && body.timezone.trim()) patch.timezone = body.timezone.trim()
  if ('publishDays' in body) { const days = cleanPublishDays(body.publishDays); patch.publish_days = days.length ? days : null }
  }
  if ('name' in body && typeof body.name === 'string' && body.name.trim()) patch.name = body.name.trim()
  if ('isActive' in body) patch.is_active = body.isActive === true

  // Resulting active state + schedule fields → recompute next_publish_at.
  const nextActive = 'is_active' in patch ? (patch.is_active as boolean) : pool.is_active
  const nextTime = (patch.publish_time as string) ?? pool.publish_time ?? DEFAULT_PUBLISH_TIME
  const nextTz = (patch.timezone as string) ?? pool.timezone ?? DEFAULT_TIMEZONE
  const nextDays = 'publish_days' in patch ? ((patch.publish_days as number[] | null) ?? []) : (Array.isArray(pool.publish_days) ? pool.publish_days : [])
  // The plan's rhythm when there is one (read only), else the owner's own
  // schedule; never Friday or Saturday.
  const nextInterval = resolveIntervalDays(((patch.cadence as Cadence) ?? pool.cadence) as Cadence, 'interval_days' in patch ? (patch.interval_days as number | null) : pool.interval_days)
  // A pause clears the slot; a resume recomputes it. A trial keeps the slot it
  // was given when the account opened, since recomputing it from an empty
  // weekday list would quietly move the first article to today.
  const keepStoredSlot = scheduleRhythm.trial && !scheduleRhythm.plan && pool.next_publish_at
  patch.next_publish_at = !nextActive
    ? null
    : keepStoredSlot
      ? pool.next_publish_at
      : makeSlotAfter({ publishTime: nextTime, timeZone: nextTz, perDay: scheduleRhythm.plan?.perDay ?? null, publishDays: nextDays, intervalDays: nextInterval, anchorIso: null, planIntervalDays: scheduleRhythm.plan?.intervalDays ?? null })(Date.now())

  const { data, error } = await auth.admin.from('article_pools').update(patch).eq('id', id).select(POOL_SELECT).single()
  if (error || !data) {
    console.error('[automation-pool] update failed', { message: error?.message })
    return Response.json({ error: 'Failed to update pool' }, { status: 500 })
  }
  return Response.json({ pool: toPoolDTO(data as PoolRow) })
}
