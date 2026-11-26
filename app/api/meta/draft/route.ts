/** POST /api/meta/draft — see lib/meta-posts/http.ts. 404 unless META_POSTS_ENABLED. */
import { isMetaPostsEnabled } from '@/lib/meta-posts/config'
import { handleDraft } from '@/lib/meta-posts/http'
import { realMetaDeps } from '@/lib/meta-posts/route-deps'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(req: Request) {
  if (!isMetaPostsEnabled()) return Response.json({ error: 'Not found' }, { status: 404 })
  return handleDraft(req, realMetaDeps)
}
