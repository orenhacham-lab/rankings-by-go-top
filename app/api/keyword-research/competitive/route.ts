/**
 * GET /api/keyword-research/competitive?projectId=… — where the project stands
 * against its competitors, the page behind each keyword, and its rankings from our
 * check and from Search Console, one row per keyword. Read-only: no Serper, no
 * Google API, no model.
 *
 * proxy.ts does not cover /api/*, so the handler authenticates the user and checks
 * ownership itself; the contract (checks, codes, owner filters) lives in
 * lib/keyword-research/competitive-route.ts and is exercised by
 * lib/keyword-research/__qa__/competitive.qa.ts. This file only wires the real
 * dependencies in.
 */
import { handleCompetitiveGet } from '@/lib/keyword-research/competitive-route'
import { isGscReadOnlyEnabled } from '@/lib/gsc/config'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  return handleCompetitiveGet(request, {
    session: async () => {
      const db = await createClient()
      const { data, error } = await db.auth.getUser()
      return { userId: !error && data?.user ? data.user.id : null }
    },
    admin: () => createAdminClient(),
    gscEnabled: () => isGscReadOnlyEnabled(),
    competitorsManageable: () => process.env.ENABLE_AI_VISIBILITY === 'true',
  })
}
