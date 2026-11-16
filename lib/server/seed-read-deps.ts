/**
 * THE SEEDING-SCAN READ'S LIVE WIRING, light enough for a page to import.
 *
 * `GET /api/projects/[id]/seed` needs five things (SeedReadDeps in lib/seed-scan/http): the
 * caller's own client, the service-role client, the admin check, the clock and
 * the environment. The route builds a much larger object because its POST runs
 * the scan, and importing the route module to reach the read would pull that
 * whole graph — the scan route, the recommendation engine, the keyword tracker
 * — into whatever imports it.
 *
 * So the read's wiring lives here, and both the route and the dashboard layout
 * use it, which is also why a seeded answer cannot drift from the route's.
 *
 * IT LIVES UNDER lib/server, NOT lib/seed-scan, because nothing in lib/seed-scan
 * may build a service-role client for itself: the route and the cron inject it,
 * and `seed-source-guards.qa.ts` enforces that. This is the injection.
 */
import { isAdminUser } from '@/lib/auth/admin-role'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import type { SeedReadDeps } from '@/lib/seed-scan/http'

export function seedReadDeps(): SeedReadDeps {
  return {
    session: async () => {
      const db = await createClient()
      const { data, error } = await db.auth.getUser()
      return { userId: !error && data?.user ? data.user.id : null, db }
    },
    admin: () => createAdminClient(),
    isAdmin: (admin, userId) => isAdminUser(admin, userId),
    now: () => new Date(),
    env: process.env,
  }
}
