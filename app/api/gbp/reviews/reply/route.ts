/**
 * PUT    /api/gbp/reviews/reply — publish or edit the business's reply.
 * DELETE /api/gbp/reviews/reply — remove it.
 * 404 unless GBP_POSTS_ENABLED.
 */
import { isGbpPostsEnabled } from '@/lib/gbp/config'
import { handleReplyToReview, handleDeleteReviewReply } from '@/lib/gbp/http'
import { realGbpDeps } from '@/lib/gbp/route-deps'

export const runtime = 'nodejs'
export const maxDuration = 60

const notFound = () => Response.json({ error: 'Not found' }, { status: 404 })

export async function PUT(req: Request) {
  if (!isGbpPostsEnabled()) return notFound()
  return handleReplyToReview(req, realGbpDeps)
}

export async function DELETE(req: Request) {
  if (!isGbpPostsEnabled()) return notFound()
  return handleDeleteReviewReply(req, realGbpDeps)
}
