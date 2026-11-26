/**
 * POST /api/meta/deauthorize — Meta's Deauthorize Callback (the person removed the
 * app at Facebook). Verified by signed_request exactly like the deletion
 * callback, and likewise not behind META_POSTS_ENABLED.
 */
import { createAdminClient } from '@/lib/supabase/admin'
import { handleDeauthorize } from '@/lib/meta-posts/http'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(req: Request) {
  return handleDeauthorize(req, { admin: () => createAdminClient() })
}
