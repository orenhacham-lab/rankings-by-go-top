/**
 * GET|POST /api/gbp/cron — publish the posts whose time has come, then ask Google
 * whether posts under review went live. Bearer CRON_SECRET (fails closed), and
 * 404 unless GBP_POSTS_ENABLED. Not registered anywhere yet: turning the feature
 * on includes adding this URL to the scheduler (see the w7-gbp report).
 */
import { createAdminClient } from '@/lib/supabase/admin'
import { authorizeCronRequest } from '@/lib/auth/cron'
import { isGbpPostsEnabled } from '@/lib/gbp/config'
import { gbpTablesPresent } from '@/lib/gbp/store'
import { publishDuePosts, refreshReviewStates } from '@/lib/gbp/publish'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300

async function run(req: Request) {
  const denied = authorizeCronRequest(req, 'gbp-cron')
  if (denied) return denied
  if (!isGbpPostsEnabled()) return Response.json({ error: 'Not found' }, { status: 404 })
  const admin = createAdminClient()
  try {
    if (!(await gbpTablesPresent(admin))) return Response.json({ ok: true, skipped: 'schema' })
    const published = await publishDuePosts(admin)
    const reviewed = await refreshReviewStates(admin)
    if (published.attempted > 0 || reviewed > 0) console.log('[gbp-cron]', { ...published, reviewed })
    return Response.json({ ok: true, ...published, reviewed })
  } catch {
    console.error('[gbp-cron] pass failed')
    return Response.json({ ok: false, error: 'unexpected' }, { status: 500 })
  }
}

export const GET = run
export const POST = run
