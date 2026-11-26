/**
 * POST /api/meta/data-deletion — Meta's Data Deletion Request Callback.
 *
 * NOT behind META_POSTS_ENABLED on purpose: a removal request must be honoured
 * even if the feature is switched off, and with it off there is simply nothing
 * to delete. It authenticates itself: the body's signed_request is verified with
 * the app secret (HMAC-SHA256, constant time) and a request that does not verify
 * deletes nothing (/api is outside the proxy matcher, so no other check runs).
 */
import { createAdminClient } from '@/lib/supabase/admin'
import { handleDataDeletion } from '@/lib/meta-posts/http'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(req: Request) {
  return handleDataDeletion(req, { admin: () => createAdminClient() })
}
