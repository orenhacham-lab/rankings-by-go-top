/** DELETE /api/gbp/posts/[id]?projectId= — cancel a post that is still scheduled. 404 unless GBP_POSTS_ENABLED. */
import { isGbpPostsEnabled } from '@/lib/gbp/config'
import { handleCancelPost } from '@/lib/gbp/http'
import { realGbpDeps } from '@/lib/gbp/route-deps'

export const runtime = 'nodejs'

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!isGbpPostsEnabled()) return Response.json({ error: 'Not found' }, { status: 404 })
  const { id } = await params
  return handleCancelPost(req, id, realGbpDeps)
}
