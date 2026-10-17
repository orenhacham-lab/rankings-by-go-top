/** POST /api/gbp/image/generate — an AI photo for a post written from a topic. 404 unless GBP_POSTS_ENABLED. */
import { isGbpPostsEnabled } from '@/lib/gbp/config'
import { handleGenerateImage } from '@/lib/gbp/http'
import { realGbpDeps } from '@/lib/gbp/route-deps'

export const runtime = 'nodejs'
// The concept call and up to three image models, each bounded at 60 s.
export const maxDuration = 300

export async function POST(req: Request) {
  if (!isGbpPostsEnabled()) return Response.json({ error: 'Not found' }, { status: 404 })
  return handleGenerateImage(req, realGbpDeps)
}
