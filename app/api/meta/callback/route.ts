/**
 * GET /api/meta/callback — Facebook's redirect target. Consumes the one-time
 * state, exchanges the code, stores the encrypted token, and returns to a FIXED
 * path (/social-posts?projectId=<from the state>). 404 unless META_POSTS_ENABLED.
 */
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { isMetaPostsEnabled } from '@/lib/meta-posts/config'
import { handleCallback } from '@/lib/meta-posts/http'
import { realMetaDeps } from '@/lib/meta-posts/route-deps'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  if (!isMetaPostsEnabled()) return Response.json({ error: 'Not found' }, { status: 404 })
  return handleCallback(req, {
    ...realMetaDeps,
    sessionUserId: async () => {
      const supabase = await createClient()
      const { data: { user } } = await supabase.auth.getUser()
      return user?.id ?? null
    },
    admin: () => createAdminClient(),
  })
}
