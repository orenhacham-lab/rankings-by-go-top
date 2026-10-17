/**
 * GET /api/projects/[id]/site-links — the Links tab's data for one project.
 *
 * proxy.ts does not cover /api/*, so the handler authenticates the user and
 * checks ownership itself; the whole contract lives in lib/site-links/http.ts
 * and is exercised by lib/site-links/__qa__/site-links.qa.ts. This file only
 * wires the real dependencies in. It is a READ: no provider, no model, no cost.
 */
import { handleSiteLinksGet, type SiteLinksDeps } from '@/lib/site-links/http'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function liveDeps(): SiteLinksDeps {
  return {
    session: async () => {
      const db = await createClient()
      const { data, error } = await db.auth.getUser()
      return { userId: !error && data?.user ? data.user.id : null }
    },
    admin: () => createAdminClient(),
    env: process.env,
  }
}

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  return handleSiteLinksGet(id, liveDeps())
}
