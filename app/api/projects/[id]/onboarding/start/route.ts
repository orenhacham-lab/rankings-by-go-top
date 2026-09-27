/**
 * POST /api/projects/[id]/onboarding/start — the first research of a project,
 * seeded from the merchant's free check when the project is that site.
 *
 * The whole contract (order of checks, the claim cookie, what is passed back)
 * lives in lib/onboarding/start.ts and runs under test in
 * lib/onboarding/__qa__/onboarding-start.qa.ts; this file only wires the real
 * dependencies in. proxy.ts does not cover /api/*, so the handler
 * authenticates the user and checks ownership itself.
 *
 * The run is started by the seed route's own POST, called in-process with this
 * request's session: its checks all apply, and its stage-A work is scheduled
 * with `after()` on THIS request, so this route carries the same time budget.
 */
import { POST as seedPost } from '@/app/api/projects/[id]/seed/route'
import { isAdminUser } from '@/lib/auth/admin-role'
import { peekSeedClaim } from '@/lib/onboarding/claim-peek'
import { handleOnboardingStart, type OnboardingStartDeps } from '@/lib/onboarding/start'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
// The seed route's stage A runs in after() of this request; same budget as that route.
export const maxDuration = 300

/** A host that never leaves the process: the seed handler is called directly, nothing is fetched. */
const INTERNAL_ORIGIN = 'http://seed.internal'

function liveDeps(projectId: string): OnboardingStartDeps {
  return {
    session: async () => {
      const db = await createClient()
      const { data, error } = await db.auth.getUser()
      return { userId: !error && data?.user ? data.user.id : null, db }
    },
    admin: () => createAdminClient(),
    isAdmin: (admin, userId) => isAdminUser(admin, userId),
    peekClaim: (admin, token, now) => peekSeedClaim(admin, token, now),
    seed: (body) =>
      seedPost(
        new Request(new URL(`/api/projects/${encodeURIComponent(projectId)}/seed`, INTERNAL_ORIGIN), {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(body),
        }),
        { params: Promise.resolve({ id: projectId }) },
      ),
    now: () => new Date(),
    env: process.env,
  }
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  return handleOnboardingStart(request, id, liveDeps(id))
}
