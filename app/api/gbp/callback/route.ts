/**
 * GET /api/gbp/callback — Google's redirect target. Consumes the one-time state,
 * exchanges the code with the PKCE verifier, stores the encrypted refresh token,
 * and returns to a FIXED path (/maps-posts?projectId=<from the state>).
 */
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { isGbpPostsEnabled } from '@/lib/gbp/config'
import { handleCallback } from '@/lib/gbp/http'
import { realGbpDeps } from '@/lib/gbp/route-deps'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  if (!isGbpPostsEnabled()) return Response.json({ error: 'Not found' }, { status: 404 })
  return handleCallback(req, {
    ...realGbpDeps,
    sessionUserId: async () => {
      const supabase = await createClient()
      const { data: { user } } = await supabase.auth.getUser()
      return user?.id ?? null
    },
    admin: () => createAdminClient(),
  })
}
