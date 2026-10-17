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
import { MAX_MONTHLY_SHARE_PER_SITE, monthlyForSite, rateForMonthly, weeklyRhythm } from '@/lib/content/automation/schedule'
import { PLAN_CATALOG } from '@/lib/plans/catalog'

type Admin = ReturnType<typeof createAdminClient>

export interface PublishRhythm {
  allowance: { periodStart: string | null; periodEnd: string; remaining: number; limit: number } | null
  /**
   * `perDay` is the weekly rhythm; it is NULL when the site's share is too
   * small for one and `intervalDays` carries the rate instead (perSiteRate).
   * Exactly one of the two is set.
   */
  plan: {
    code: PlanCode
    monthly: number
    activeQueues: number
    perWeek: number
    perDay: number[] | null
    intervalDays: number | null
    /**
     * THE SPLIT IS THE CUSTOMER'S, THE RHYTHM IS THE PLAN'S.
     *
     * `monthlyShare` is the number this website's owner set for it, null when
     * they have not set one and it takes the even share. `monthlyForThisSite`
     * is what the site actually gets either way, and is what `perWeek`,
     * `perDay` and `intervalDays` above are derived from. `shareRoom` is how
     * much of the account's allowance no OTHER website has claimed, so the
     * screen can say what is left and the write path can refuse more.
     * `multiSite` says whether the plan has more than one website to split
     * between at all; on a one-site plan there is nothing to divide.
     */
    monthlyShare: number | null
    monthlyForThisSite: number
    shareRoom: number
    maxShare: number
    multiSite: boolean
  } | null
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
export async function readPublishRhythm(
  admin: Admin,
  userId: string | null | undefined,
  /** `projectId`: whose share to resolve. Without it the answer is the even split, as before. */
  opts: { countThisQueue?: boolean; projectId?: string | null } = {},
): Promise<PublishRhythm> {
  if (!userId) return NO_RHYTHM
  try {
    const entitlement = await getUserEntitlement(userId, admin as never)
    const trial = entitlement.plan === 'trial' || entitlement.trialActive === true
    const a = await readUsageAllowance(admin as never, { userId, usageType: 'article', limitFor: (l) => l.maxArticlesPerPeriodAccountWide })
    if (a.state !== 'known') return { ...NO_RHYTHM, trial }
    const allowance = a.periodEnd ? { periodStart: a.periodStart, periodEnd: a.periodEnd, remaining: a.remaining, limit: a.limit } : null
    if (!isPlanCode(a.plan) || !(a.limit > 0)) return { allowance, plan: null, trial }
    // One read answers both questions: how many queues share the allowance, and
    // what each of them was given. Paused queues are read too, because the
    // queue being looked at may be the paused one (countThisQueue).
    const { data: rows } = await admin.from('article_pools').select('project_id, monthly_share, is_active').eq('user_id', userId)
    const pools = (rows ?? []) as { project_id: string | null; monthly_share: number | null; is_active: boolean | null }[]
    const active = pools.filter((p) => p.is_active === true)
    const activeQueues = Math.max(1, active.length + (opts.countThisQueue ? 1 : 0))
    const mine = opts.projectId ? pools.find((p) => p.project_id === opts.projectId)?.monthly_share ?? null : null
    // Every other queue that counts in the split. The queue being looked at is
    // never among them, whether it is active or counted as if it were.
    //
    // Without a project there is no "this site", so no queue can be left out of
    // that list and no share can be read: the answer is the plain even split,
    // which is what every caller got before shares existed.
    const otherShares = opts.projectId ? active.filter((p) => p.project_id !== opts.projectId).map((p) => p.monthly_share) : []
    const monthlyForThisSite = opts.projectId
      ? monthlyForSite({ monthlyAllowance: a.limit, otherShares, mine })
      : a.limit / activeQueues
    const rate = rateForMonthly(monthlyForThisSite)
    const claimedByOthers = otherShares.reduce<number>((sum, v) => sum + (typeof v === 'number' && v > 0 ? Math.floor(v) : 0), 0)
    const maxSites = PLAN_CATALOG[a.plan].maxProjects
    return {
      allowance,
      plan: {
        code: a.plan, monthly: a.limit, activeQueues, perWeek: rate.perWeek,
        perDay: rate.intervalDays ? null : weeklyRhythm(rate.perWeek),
        intervalDays: rate.intervalDays,
        monthlyShare: typeof mine === 'number' && mine > 0 ? Math.floor(mine) : null,
        monthlyForThisSite,
        shareRoom: Math.max(0, a.limit - claimedByOthers),
        maxShare: Math.min(MAX_MONTHLY_SHARE_PER_SITE, Math.max(0, a.limit - claimedByOthers)),
        multiSite: typeof maxSites === 'number' ? maxSites > 1 : true,
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
    return await readPublishRhythm(admin, (data as { user_id?: string | null } | null)?.user_id, { ...opts, projectId })
  } catch {
    return NO_RHYTHM
  }
}
