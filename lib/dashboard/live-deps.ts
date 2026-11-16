/**
 * The real dependencies the dashboard's read is wired to, in one place.
 *
 * `handleDashboardGet` is pure logic over these; the route used to own this
 * wiring. The dashboard's own layout now builds the SAME answer in-region and
 * hands it to the screen, so the wiring lives here and the two cannot drift
 * apart: a seeded answer that differed from the route's would be a screen that
 * changes when it is refreshed.
 */
import type { DashboardDeps } from './overview'
import { readUsageAllowance } from '@/lib/billing/usage-allowance'
import { getUserEntitlement } from '@/lib/subscription'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'

export function liveDeps(): DashboardDeps {
  return {
    session: async () => {
      const db = await createClient()
      const { data, error } = await db.auth.getUser()
      return { userId: !error && data?.user ? data.user.id : null, db }
    },
    admin: () => createAdminClient(),
    entitlement: async (admin, userId) => {
      const e = await getUserEntitlement(userId, admin)
      return {
        plan: e.plan,
        isAdmin: e.isAdmin,
        trialActive: e.trialActive,
        trialEndsAt: e.trialEndsAt,
        maxKeywordsPerProject: e.limits.maxKeywordsPerProject,
      }
    },
    articleAllowance: async (admin, userId) => {
      const a = await readUsageAllowance(admin, {
        userId,
        usageType: 'article',
        limitFor: (limits) => limits.maxArticlesPerPeriodAccountWide,
      })
      if (a.state === 'known') return { state: 'known', used: a.used, limit: a.limit }
      return a.state === 'unmetered' ? { state: 'unmetered' } : { state: 'unknown' }
    },
    now: () => new Date(),
    env: process.env,
  }
}
