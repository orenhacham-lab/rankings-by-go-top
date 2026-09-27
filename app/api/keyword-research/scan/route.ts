/**
 * GET /api/keyword-research/scan?projectId=… — the seeding scan's keyword research
 * of a project, read from the cache the scan wrote. No Google Ads, Serper or model
 * call.
 *
 * proxy.ts does not cover /api/*, so the handler authenticates the user and checks
 * ownership itself; the whole contract (order of checks, codes, owner filters)
 * lives in lib/keyword-research/scan-route.ts and is exercised by
 * lib/keyword-research/__qa__/scan-route.qa.ts. This file only wires the real
 * dependencies in.
 */
import { isAdminUser } from '@/lib/auth/admin-role'
import { buildSiteVocabulary } from '@/lib/content/recommendations/engine'
import { handleScanResearchGet } from '@/lib/keyword-research/scan-route'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  return handleScanResearchGet(request, {
    session: async () => {
      const db = await createClient()
      const { data, error } = await db.auth.getUser()
      return { userId: !error && data?.user ? data.user.id : null, db }
    },
    admin: () => createAdminClient(),
    isAdmin: (admin, userId) => isAdminUser(admin, userId),
    vocabulary: (admin, projectId, extras, userId) => buildSiteVocabulary(admin, projectId, extras, userId),
    env: process.env,
  })
}
