/**
 * Tell the operator when scheduled articles stop going out.
 *
 * From 7 to 11 October 2026 no article was written or published in any
 * project, and nothing said so: the runner logged an idle count every quarter
 * hour and the only witness was the owner reading his queues four days later.
 * Whatever the next cause is, its symptom is the same one, so this watches the
 * symptom rather than a cause: an active queue whose publish slot passed more
 * than a day ago while it still has work in it.
 *
 * A queue held by its owner's account (allowance spent, Shopify plan not
 * chosen, no site connected to publish to) is not a stall: it is by design and
 * the owner already sees it. It is left out so the email only ever means
 * "something is broken".
 *
 * Read only. Runs once a day from the Vercel cron (see the cron route).
 */
import type { createAdminClient } from '@/lib/supabase/admin'
import { deliverOperatorEmail, type AlertDeps, type DeliverResult } from '@/lib/notifications/operator-alerts'
import { loadActivePlatform } from '@/lib/content/platform/load-active-platform'

type Admin = ReturnType<typeof createAdminClient>

export const STALL_AFTER_MS = 24 * 60 * 60 * 1000
/** The owner's account holds these, not a bug. */
export const OWNER_HELD_REASONS = new Set(['quota_exceeded', 'billing_required'])

export type StalledPool = { poolId: string; projectName: string; overdueHours: number }

type PoolRow = { id: string; project_id: string; next_publish_at: string | null }
type ItemRow = { pool_id: string; status: string; last_error: string | null; position: number }

/** Pure: which pools are stalled at `nowMs`. */
export function findStalledPools(
  pools: PoolRow[], items: ItemRow[], names: Map<string, string>, nowMs: number,
): StalledPool[] {
  const out: StalledPool[] = []
  for (const p of pools) {
    if (!p.next_publish_at) continue
    const late = nowMs - Date.parse(p.next_publish_at)
    if (!(late > STALL_AFTER_MS)) continue
    const work = items.filter((i) => i.pool_id === p.id && (i.status === 'queued' || i.status === 'generated'))
      .sort((a, b) => a.position - b.position)
    if (work.length === 0) continue
    if (work[0].last_error && OWNER_HELD_REASONS.has(work[0].last_error)) continue
    out.push({ poolId: p.id, projectName: names.get(p.project_id) ?? p.project_id, overdueHours: Math.floor(late / 3_600_000) })
  }
  return out.sort((a, b) => b.overdueHours - a.overdueHours)
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!))

export function buildStallAlertHtml(stalled: StalledPool[]): string {
  const rows = stalled.map((s) => `<li>${esc(s.projectName)}: באיחור של ${Math.floor(s.overdueHours / 24)} ימים ו-${s.overdueHours % 24} שעות</li>`).join('')
  return `<div dir="rtl" style="font-family:Arial,sans-serif"><p>מאמרים מתוזמנים לא יצאו בזמן ב-${stalled.length} פרויקטים:</p><ul>${rows}</ul><p>זה לא חשבון שנגמרה לו המכסה. משהו בכתיבה או בפרסום נתקע ושווה לבדוק היום.</p></div>`
}

/** Reads the queues and emails the operator when any are stalled. Never throws. */
export async function checkPublishingStalls(
  admin: Admin, opts: { nowMs?: number; deps?: AlertDeps; platform?: (admin: Admin, projectId: string) => Promise<{ platform: string }> } = {},
): Promise<{ stalled: StalledPool[]; alert: DeliverResult | null }> {
  try {
    const nowMs = opts.nowMs ?? Date.now()
    const { data: pools } = await admin.from('article_pools').select('id, project_id, next_publish_at').eq('is_active', true)
    const poolRows = (pools ?? []) as PoolRow[]
    const late = poolRows.filter((p) => p.next_publish_at && nowMs - Date.parse(p.next_publish_at) > STALL_AFTER_MS)
    if (late.length === 0) return { stalled: [], alert: null }
    const { data: items } = await admin.from('article_pool_items').select('pool_id, status, last_error, position')
      .in('pool_id', late.map((p) => p.id)).in('status', ['queued', 'generated'])
    const { data: projects } = await admin.from('projects').select('id, name').in('id', late.map((p) => p.project_id))
    const names = new Map(((projects ?? []) as { id: string; name: string | null }[]).map((p) => [p.id, p.name ?? p.id]))
    const found = findStalledPools(late, (items ?? []) as ItemRow[], names, nowMs)
    // A project with no publishing platform (or two in conflict) waits on its owner.
    const platformOf = opts.platform ?? loadActivePlatform
    const projectOf = new Map(late.map((p) => [p.id, p.project_id]))
    const stalled: StalledPool[] = []
    for (const s of found) {
      const r = await platformOf(admin, projectOf.get(s.poolId) ?? '').catch(() => null)
      if (r && (r.platform === 'none' || r.platform === 'conflict')) continue
      stalled.push(s)
    }
    if (stalled.length === 0) return { stalled, alert: null }
    console.error('[automation-stall] scheduled articles are overdue', { count: stalled.length, worstHours: stalled[0].overdueHours })
    const alert = await deliverOperatorEmail({ subject: `התראה: מאמרים מתוזמנים לא יצאו ב-${stalled.length} פרויקטים`, html: buildStallAlertHtml(stalled) }, opts.deps)
    return { stalled, alert }
  } catch (e) {
    console.error('[automation-stall] check failed', { message: e instanceof Error ? e.message.slice(0, 200) : 'unknown' })
    return { stalled: [], alert: null }
  }
}

/** The Vercel cron's daily call is the one that checks: once a day, not every quarter hour. */
export function isDailyStallCheckRun(request: Request): boolean {
  return (request.headers.get('user-agent') ?? '').toLowerCase().startsWith('vercel-cron')
}
