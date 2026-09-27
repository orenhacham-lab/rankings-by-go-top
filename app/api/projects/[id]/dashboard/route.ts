/**
 * GET /api/projects/[id]/dashboard — the dashboard's articles, publishing board,
 * AI-visibility brief, setup facts, activity and account status for one project.
 *
 * proxy.ts does not cover /api/*, so the handler authenticates the user and
 * checks ownership itself; the whole contract lives in lib/dashboard/overview.ts
 * and is exercised by lib/dashboard/__qa__/dashboard-overview.qa.ts. This file
 * only wires the real dependencies in. It is a READ: it reserves, consumes and
 * calls out to nothing.
 */
import { handleDashboardGet, type DashboardDeps } from '@/lib/dashboard/overview'
import { readUsageAllowance } from '@/lib/billing/usage-allowance'
import { getUserEntitlement } from '@/lib/subscription'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function liveDeps(): DashboardDeps {
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

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  return handleDashboardGet(id, liveDeps())
}
