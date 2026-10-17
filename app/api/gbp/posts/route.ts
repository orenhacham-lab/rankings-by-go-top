/** POST /api/gbp/posts — schedule a post, or publish it now. 404 unless GBP_POSTS_ENABLED. */
import { isGbpPostsEnabled } from '@/lib/gbp/config'
import { handleCreatePost } from '@/lib/gbp/http'
import { realGbpDeps } from '@/lib/gbp/route-deps'

export const runtime = 'nodejs'
export const maxDuration = 60

export async function POST(req: Request) {
  if (!isGbpPostsEnabled()) return Response.json({ error: 'Not found' }, { status: 404 })
  return handleCreatePost(req, realGbpDeps)
}
