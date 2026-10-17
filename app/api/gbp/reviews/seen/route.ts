/** POST /api/gbp/reviews/seen — the owner read the list, so nothing is "new" any more. 404 unless GBP_POSTS_ENABLED. */
import { isGbpPostsEnabled } from '@/lib/gbp/config'
import { handleMarkReviewsSeen } from '@/lib/gbp/http'
import { realGbpDeps } from '@/lib/gbp/route-deps'

export const runtime = 'nodejs'

export async function POST(req: Request) {
  if (!isGbpPostsEnabled()) return Response.json({ error: 'Not found' }, { status: 404 })
  return handleMarkReviewsSeen(req, realGbpDeps)
}
