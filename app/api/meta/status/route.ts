/** GET /api/meta/status — see lib/meta-posts/http.ts. 404 unless META_POSTS_ENABLED. */
import { isMetaPostsEnabled } from '@/lib/meta-posts/config'
import { handleStatus } from '@/lib/meta-posts/http'
import { realMetaDeps } from '@/lib/meta-posts/route-deps'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  if (!isMetaPostsEnabled()) return Response.json({ error: 'Not found' }, { status: 404 })
  return handleStatus(req, realMetaDeps)
}
