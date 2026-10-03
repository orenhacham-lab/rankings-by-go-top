/** GET /api/gbp/status — what the "posts on Google Maps" screen shows. 404 unless GBP_POSTS_ENABLED. */
import { isGbpPostsEnabled } from '@/lib/gbp/config'
import { handleStatus } from '@/lib/gbp/http'
import { realGbpDeps } from '@/lib/gbp/route-deps'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  if (!isGbpPostsEnabled()) return Response.json({ error: 'Not found' }, { status: 404 })
  return handleStatus(req, realGbpDeps)
}
