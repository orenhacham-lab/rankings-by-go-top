/** GET /api/gbp/reviews — the reviews on the connected profile, read live. 404 unless GBP_POSTS_ENABLED. */
import { isGbpPostsEnabled } from '@/lib/gbp/config'
import { handleListReviews } from '@/lib/gbp/http'
import { realGbpDeps } from '@/lib/gbp/route-deps'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

export async function GET(req: Request) {
  if (!isGbpPostsEnabled()) return Response.json({ error: 'Not found' }, { status: 404 })
  return handleListReviews(req, realGbpDeps)
}
