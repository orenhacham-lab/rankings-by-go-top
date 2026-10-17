/**
 * /api/projects/[id]/seed — the seeding scan of a project.
 *
 * POST { action: 'start' }         start a run: 'create' for the project's
 *                                  first, 'rescan' after that
 * POST { action: 'claim', token }  seed from the visitor's free check
 * POST { action: 'continue',       stage B of the latest run, after tracking
 *        keywords }                the chosen seed keywords
 * GET                              the latest run, its steps and its snapshot
 *
 * proxy.ts does not cover /api/*, so the handler authenticates the user and
 * checks ownership itself; the whole contract (order of checks, codes, caps)
 * lives in lib/seed-scan/http.ts and is exercised by
 * lib/seed-scan/__qa__/seed-route.qa.ts and seed-continue.qa.ts. This file
 * only wires the real dependencies in.
 *
 * ANSWERS FIRST, WORKS AFTER: POST answers 202 with the run id and the stage
 * runs in `after()`, the same pattern as app/api/content/automation/cron. The
 * progress screen polls GET. The work stops at WORK_WINDOW_MS, before the
 * platform's limit, and hands anything left to the cron.
 *
 * AS THE MERCHANT. `continue` tracks the keywords with the keywords tab's own
 * server action, and stage B's content plan (b4) and first rank check (b6)
 * call the content tab's and the keywords tab's own routes in-process, with
 * this request's session: their auth, entitlement and quota checks all apply.
 */
import { after } from 'next/server'
import { createBulkTrackingTargetsAction } from '@/app/actions/tracking-targets'
import { POST as recommendationsPost } from '@/app/api/content/automation/recommendations/route'
import { POST as scanPost } from '@/app/api/scan/route'
import { isAdminUser } from '@/lib/auth/admin-role'
import { consumeClaimToken } from '@/lib/free-check'
import { getServerLocale } from '@/lib/i18n/server-locale'
import { handleSeedGet, handleSeedPost, type SeedRouteDeps } from '@/lib/seed-scan/http'
import { callRouteInProcess } from '@/lib/seed-scan/in-process'
import { runSeedStage } from '@/lib/seed-scan/runner'
import { addSeedKeywords } from '@/lib/seed-scan/tracking'
import { explainAccess } from '@/lib/subscription'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { getUserEntitlement } from '@/lib/subscription'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
// Stage A targets ~45s, stage B at most WORK_WINDOW_MS; the platform clamps
// this to the plan's maximum.
export const maxDuration = 300

/** The work stops starting steps that could not end before this, from the request's start. */
const WORK_WINDOW_MS = 275_000

function liveDeps(): SeedRouteDeps {
  const requestStartedAt = Date.now()
  return {
    session: async () => {
      const db = await createClient()
      const { data, error } = await db.auth.getUser()
      return { userId: !error && data?.user ? data.user.id : null, db }
    },
    admin: () => createAdminClient(),
    isAdmin: (admin, userId) => isAdminUser(admin, userId),
    siteAllowance: async (admin, userId) => {
      try {
        return (await getUserEntitlement(userId, admin)).limits.maxProjects
      } catch {
        return 0
      }
    },
    access: (admin, userId) => explainAccess(userId, admin),
    consumeClaim: (admin, token, now) => consumeClaimToken(token, admin, now),
    schedule: (task) => after(task),
    runStage: (args) =>
      runSeedStage({
        ...args,
        deadlineAt: requestStartedAt + WORK_WINDOW_MS,
        stageB: {
          // The content tab's own request: the hybrid engine, standard quality.
          contentPlan: (input) =>
            callRouteInProcess(recommendationsPost, '/api/content/automation/recommendations', {
              projectId: input.projectId,
              source: 'hybrid',
              clientRequestId: `seed-${input.runId}`,
              qualityMode: 'standard',
            }),
          // The keywords tab's "check" button for one keyword.
          rankCheck: (input) => callRouteInProcess(scanPost, '/api/scan', { projectId: input.projectId, targetId: input.targetId }),
        },
      }),
    addKeywords: ({ admin, scope, keywords, targetDomain }) => addSeedKeywords(admin, scope, { keywords, targetDomain }, createBulkTrackingTargetsAction),
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
