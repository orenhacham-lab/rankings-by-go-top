/**
 * THE PUBLISHING RHYTHM AN ACCOUNT'S PLAN GIVES IT — read only.
 *
 * One read for the runner, the pool routes and the schedule screen, so the
 * date the screen shows is the date the runner keeps:
 *  - `allowance`: what is left of the article allowance this cycle (the ledger
 *    that enforces it, via readUsageAllowance). Drives the cycle-end spread.
 *  - `plan`: the weekly rhythm (monthly allowance ÷ 4, shared by the account's
 *    active queues) for a paid plan. Null for an admin (unmetered), a trial, an
 *    unreadable entitlement or a zero allowance: the owner's own schedule then
 *    applies, still without Friday and Saturday.
 * Nothing here writes; a failed read is "no rhythm", never an error.
 */

import type { createAdminClient } from '@/lib/supabase/admin'
import { readUsageAllowance } from '@/lib/billing/usage-allowance'
import { isPlanCode, type PlanCode } from '@/lib/plans/catalog'
import { articlesPerWeekFor, weeklyRhythm } from '@/lib/content/automation/schedule'

type Admin = ReturnType<typeof createAdminClient>

export interface PublishRhythm {
  allowance: { periodStart: string | null; periodEnd: string; remaining: number; limit: number } | null
  plan: { code: PlanCode; monthly: number; activeQueues: number; perWeek: number; perDay: number[] } | null
}

export const NO_RHYTHM: PublishRhythm = { allowance: null, plan: null }

/** `countThisQueue`: the screen of a paused queue counts it as if it ran. */
export async function readPublishRhythm(admin: Admin, userId: string | null | undefined, opts: { countThisQueue?: boolean } = {}): Promise<PublishRhythm> {
  if (!userId) return NO_RHYTHM
  try {
    const a = await readUsageAllowance(admin as never, { userId, usageType: 'article', limitFor: (l) => l.maxArticlesPerPeriodAccountWide })
    if (a.state !== 'known') return NO_RHYTHM
    const allowance = a.periodEnd ? { periodStart: a.periodStart, periodEnd: a.periodEnd, remaining: a.remaining, limit: a.limit } : null
    if (!isPlanCode(a.plan) || !(a.limit > 0)) return { allowance, plan: null }
    const { count } = await admin.from('article_pools').select('id', { count: 'exact', head: true }).eq('user_id', userId).eq('is_active', true)
    const activeQueues = Math.max(1, (count ?? 0) + (opts.countThisQueue ? 1 : 0))
    const perWeek = articlesPerWeekFor(a.limit, activeQueues)
    return { allowance, plan: { code: a.plan, monthly: a.limit, activeQueues, perWeek, perDay: weeklyRhythm(perWeek) } }
  } catch {
    return NO_RHYTHM
  }
}

/** The rhythm for a project, through its owner (the allowance is the owner's). */
export async function readPublishRhythmForProject(admin: Admin, projectId: string, opts: { countThisQueue?: boolean } = {}): Promise<PublishRhythm> {
  try {
    const { data } = await admin.from('projects').select('user_id').eq('id', projectId).maybeSingle()
    return await readPublishRhythm(admin, (data as { user_id?: string | null } | null)?.user_id, opts)
  } catch {
    return NO_RHYTHM
  }
}
