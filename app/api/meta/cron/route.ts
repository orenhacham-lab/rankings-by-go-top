/**
 * GET|POST /api/meta/cron — publish the approved posts whose time has come.
 * Bearer CRON_SECRET (fails closed), 404 unless META_POSTS_ENABLED.
 *
 * Not registered in vercel.json: the 15-minute article runner already drains the
 * queue (lib/meta-posts/due-isolated.ts), and a new Vercel cron would add a
 * daily slot the Hobby plan does not have. This route exists for an external
 * caller (cron-job.org) and is idempotent: each post is claimed once.
 */
import { createAdminClient } from '@/lib/supabase/admin'
import { authorizeCronRequest } from '@/lib/auth/cron'
import { isMetaPostsEnabled } from '@/lib/meta-posts/config'
import { metaTablesPresent } from '@/lib/meta-posts/store'
import { publishDuePosts } from '@/lib/meta-posts/publish'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300

async function run(req: Request) {
  const denied = authorizeCronRequest(req, 'meta-cron')
  if (denied) return denied
  if (!isMetaPostsEnabled()) return Response.json({ error: 'Not found' }, { status: 404 })
  const admin = createAdminClient()
  try {
    if (!(await metaTablesPresent(admin))) return Response.json({ ok: true, skipped: 'schema' })
    const published = await publishDuePosts(admin)
    if (published.attempted > 0) console.log('[meta-cron]', published)
    return Response.json({ ok: true, ...published })
  } catch {
    console.error('[meta-cron] pass failed')
    return Response.json({ ok: false, error: 'unexpected' }, { status: 500 })
  }
}
export const GET = run
export const POST = run
