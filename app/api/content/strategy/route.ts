/**
 * GET /api/content/strategy?projectId= — the rows the content strategy tab's board is
 * built from. Read-only; the whole contract (gate, auth, owner filters, codes) lives in
 * lib/content/strategy/http.ts and is exercised by
 * lib/content/strategy/__qa__/content-strategy-route.qa.ts. This file only wires the
 * real dependencies in.
 */
import { authContentProject, isContentModuleEnabled } from '@/lib/content/api-auth'
import { handleStrategyGet } from '@/lib/content/strategy/http'
import { getUserEntitlement } from '@/lib/subscription'

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  return handleStrategyGet(request, {
    enabled: () => isContentModuleEnabled(),
    auth: (projectId) => authContentProject(projectId),
    // The top-up's own condition, read from the same place it reads it.
    entitled: async (userId, admin) => {
      const e = await getUserEntitlement(userId, admin)
      return e.isAdmin || e.hasActiveSubscription
    },
  })
}
