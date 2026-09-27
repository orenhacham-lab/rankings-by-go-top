/**
 * /api/projects/[id]/seed — the seeding scan of a project.
 *
 * POST { action: 'start' }         start a run: 'create' for the project's
 *                                  first, 'rescan' after that
 * POST { action: 'claim', token }  seed from the visitor's free check
 * GET                              the latest run, its steps and its snapshot
 *
 * proxy.ts does not cover /api/*, so the handler authenticates the user and
 * checks ownership itself; the whole contract (order of checks, codes, caps)
 * lives in lib/seed-scan/http.ts and is exercised by
 * lib/seed-scan/__qa__/seed-route.qa.ts. This file only wires the real
 * dependencies in.
 *
 * ANSWERS FIRST, WORKS AFTER: POST answers 202 with the run id and stage A
 * runs in `after()`, the same pattern as app/api/content/automation/cron. The
 * progress screen polls GET.
 */
import { after } from 'next/server'
import { isAdminUser } from '@/lib/auth/admin-role'
import { consumeClaimToken } from '@/lib/free-check'
import { getServerLocale } from '@/lib/i18n/server-locale'
import { handleSeedGet, handleSeedPost, type SeedRouteDeps } from '@/lib/seed-scan/http'
import { runStageA } from '@/lib/seed-scan/runner'
import { explainAccess } from '@/lib/subscription'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
// Stage A targets ~45s; the platform clamps this to the plan's maximum.
export const maxDuration = 300

function liveDeps(): SeedRouteDeps {
  return {
    session: async () => {
      const db = await createClient()
      const { data, error } = await db.auth.getUser()
      return { userId: !error && data?.user ? data.user.id : null, db }
    },
    admin: () => createAdminClient(),
    isAdmin: (admin, userId) => isAdminUser(admin, userId),
    access: (admin, userId) => explainAccess(userId, admin),
    consumeClaim: (admin, token, now) => consumeClaimToken(token, admin, now),
    schedule: (task) => after(task),
    runStage: (args) => runStageA(args),
    locale: () => getServerLocale(),
    now: () => new Date(),
    env: process.env,
  }
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  return handleSeedPost(request, id, liveDeps())
}

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  return handleSeedGet(id, liveDeps())
}
