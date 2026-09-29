/**
 * GET /api/projects/[id]/waiting — the counts behind the dashboard's "waiting for you"
 * card and the sidebar's count pills. proxy.ts does not cover /api/*, so the handler
 * authenticates and checks ownership itself (lib/nudges/waiting.ts). A READ: it writes,
 * sends and calls out to nothing.
 */
import { handleWaitingGet, type WaitingDeps } from '@/lib/nudges/waiting'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function liveDeps(): WaitingDeps {
  return {
    session: async () => {
      const db = await createClient()
      const { data, error } = await db.auth.getUser()
      return { userId: !error && data?.user ? data.user.id : null, db }
    },
    admin: () => createAdminClient(),
    env: process.env,
  }
}

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  return handleWaitingGet(id, liveDeps())
}
