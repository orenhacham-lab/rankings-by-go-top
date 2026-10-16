/**
 * PATCH /api/gbp/auto-post — the owner's switch: an article that publishes to
 * their site also becomes a post on their Google Business Profile.
 *
 * proxy.ts does not cover /api/*, so the handler authenticates itself and proves
 * the caller owns the project. 404 while the feature is off.
 */
import { handleSetAutoPost } from '@/lib/gbp/http'
import { realGbpDeps } from '@/lib/gbp/route-deps'
import { isGbpPostsEnabled } from '@/lib/gbp/config'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function PATCH(req: Request) {
  if (!isGbpPostsEnabled()) return Response.json({ error: 'Not found' }, { status: 404 })
  return handleSetAutoPost(req, realGbpDeps)
}
