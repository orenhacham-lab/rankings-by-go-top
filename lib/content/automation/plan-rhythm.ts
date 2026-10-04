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
import { getUserEntitlement } from '@/lib/subscription'
import { isPlanCode, type PlanCode } from '@/lib/plans/catalog'
import { perSiteRate, weeklyRhythm } from '@/lib/content/automation/schedule'

type Admin = ReturnType<typeof createAdminClient>

export interface PublishRhythm {
  allowance: { periodStart: string | null; periodEnd: string; remaining: number; limit: number } | null
  /**
   * `perDay` is the weekly rhythm; it is NULL when the site's share is too
   * small for one and `intervalDays` carries the rate instead (perSiteRate).
   * Exactly one of the two is set.
   */
  plan: { code: PlanCode; monthly: number; activeQueues: number; perWeek: number; perDay: number[] | null; intervalDays: number | null } | null
  /**
   * THE TRIAL DOES NOT CHOOSE ITS OWN RHYTHM (owner, 4 October 2026: "a trial
   * account should have no option to pick the cadence or to create an article;
   * it all runs on the schedule its plan gives it").
   *
   * A trial has no plan rhythm — its whole allowance is one article, and its
   * dates were set when the account opened (the first the next working day,
   * the second a week later). Before this flag it fell into the same branch as
   * an admin, so the screen offered it the owner's cadence picker and the
   * PATCH route accepted what came back, which could move those two dates.
   * `plan` stays null on purpose, so NOTHING about the scheduling changes:
   * this only says who is allowed to change it.
   */
  trial: boolean
}

export const NO_RHYTHM: PublishRhythm = { allowance: null, plan: null, trial: false }

/** `countThisQueue`: the screen of a paused queue counts it as if it ran. */
export async function readPublishRhythm(admin: Admin, userId: string | null | undefined, opts: { countThisQueue?: boolean } = {}): Promise<PublishRhythm> {
  if (!userId) return NO_RHYTHM
  try {
    const entitlement = await getUserEntitlement(userId, admin as never)
    const trial = entitlement.plan === 'trial' || entitlement.trialActive === true
    const a = await readUsageAllowance(admin as never, { userId, usageType: 'article', limitFor: (l) => l.maxArticlesPerPeriodAccountWide })
    if (a.state !== 'known') return { ...NO_RHYTHM, trial }
    const allowance = a.periodEnd ? { periodStart: a.periodStart, periodEnd: a.periodEnd, remaining: a.remaining, limit: a.limit } : null
    if (!isPlanCode(a.plan) || !(a.limit > 0)) return { allowance, plan: null, trial }
    const { count } = await admin.from('article_pools').select('id', { count: 'exact', head: true }).eq('user_id', userId).eq('is_active', true)
    const activeQueues = Math.max(1, (count ?? 0) + (opts.countThisQueue ? 1 : 0))
    const rate = perSiteRate(a.limit, activeQueues)
    return {
      allowance,
      plan: {
        code: a.plan, monthly: a.limit, activeQueues, perWeek: rate.perWeek,
        perDay: rate.intervalDays ? null : weeklyRhythm(rate.perWeek),
        intervalDays: rate.intervalDays,
      },
      trial,
    }
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
