/** DELETE /api/gbp/connection — disconnect Google (revoke + delete). 404 unless GBP_POSTS_ENABLED. */
import { isGbpPostsEnabled } from '@/lib/gbp/config'
import { handleDisconnect } from '@/lib/gbp/http'
import { realGbpDeps } from '@/lib/gbp/route-deps'

export const runtime = 'nodejs'

export async function DELETE(req: Request) {
  if (!isGbpPostsEnabled()) return Response.json({ error: 'Not found' }, { status: 404 })
  return handleDisconnect(req, realGbpDeps)
}
