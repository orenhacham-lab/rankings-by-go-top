/**
 * /api/projects/[id]/redetect: "detect again with AI" on the settings screen.
 *
 * POST { section: 'business' | 'profile' | 'audience', locale? }
 *   → 200 { ok, section, suggestions }: what the scan's one model call (a2)
 *     answers about the page the latest scan already read. Suggestions only:
 *     nothing is written, the owner confirms them on the screen.
 *
 * proxy.ts does not cover /api/*, so the handler authenticates the user and
 * checks ownership itself; the whole contract (order of checks, codes, the
 * daily cap and the single flight) lives in lib/project-settings/redetect.ts
 * and is exercised by lib/project-settings/__qa__/settings-redetect.qa.ts.
 * This file only wires the real dependencies in.
 */
import { isAdminUser } from '@/lib/auth/admin-role'
import { fetchBusinessInsight } from '@/lib/free-check'
import { newRequestId } from '@/lib/ops/deadline'
import { handleRedetect, type RedetectDeps } from '@/lib/project-settings/redetect'
import { explainAccess } from '@/lib/subscription'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
// One model call of at most 18 seconds, plus a few reads.
export const maxDuration = 60

function liveDeps(): RedetectDeps {
  return {
    session: async () => {
      const db = await createClient()
      const { data, error } = await db.auth.getUser()
      return { userId: !error && data?.user ? data.user.id : null, db }
    },
    admin: () => createAdminClient(),
    isAdmin: (admin, userId) => isAdminUser(admin, userId),
    access: (admin, userId) => explainAccess(userId, admin),
    insight: fetchBusinessInsight,
    requestId: () => newRequestId(),
    now: () => new Date(),
    env: process.env,
  }
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  return handleRedetect(request, id, liveDeps())
}
