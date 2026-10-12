/**
 * GET|POST /api/gbp/cron — publish the posts whose time has come, then ask Google
 * whether posts under review went live. Bearer CRON_SECRET (fails closed), and
 * 404 unless GBP_POSTS_ENABLED.
 *
 * Registered in vercel.json at 07:30 UTC — half an hour after the article cron
 * at 07:00, so an article that published there and queued an automatic post
 * (lib/gbp/auto-post.ts) goes up on the business profile in the same morning.
 * Until the flag is on this route answers 404 and the pass costs nothing.
 *
 * Once a day, not hourly, because the Vercel plan allows only daily cron jobs
 * (the deploy is refused outright otherwise). A post the merchant SCHEDULED for
 * some other hour therefore waits for the next morning's pass. Calling this URL
 * more often from outside Vercel fixes that without a code change: it is
 * idempotent, each post is claimed once (scheduled -> publishing), and
 * cron-job.org already calls /api/content/automation/cron the same way.
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
