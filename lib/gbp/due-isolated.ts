/**
 * The Business Profile post queue, drained by the 15-minute cron.
 *
 * WHY. An article that publishes queues its automatic post at once
 * (./auto-post.ts), with `scheduled_at` = now. Nothing sent it, though, until
 * /api/gbp/cron's single daily pass at 07:30 UTC, so a merchant who published
 * at midday watched the post sit in the queue for the best part of a day while
 * the app had told them every article is posted automatically. On 26 Oct 2026 a
 * post queued at 14:16 was still waiting; the ones that looked instant had all
 * been published inside the 07:00 window by chance.
 *
 * WHY NOT INSIDE THE PUBLISH PATH. ./auto-post.ts is allowed to read a few rows
 * and write one, and nothing else: no call to Google, no call to a model. That
 * rule is there because the article cron stalled in every project for five days
 * in October 2026, and nothing added to that path may ever be able to do it
 * again. A Google post and an AI draft in the middle of a publish is exactly
 * what it forbids. So the queue is drained beside the runner instead, where a
 * slow or failing Google cannot touch an article.
 *
 * WHAT THIS BUYS. cron-job.org calls /api/content/automation/cron every fifteen
 * minutes, so a post now goes up within minutes of its article instead of the
 * next morning. The daily /api/gbp/cron entry stays: a second chance at the same
 * idempotent pass, not a second behaviour. Each post is claimed once
 * (scheduled -> publishing), so overlapping passes cannot post twice.
 *
 * Production only, because Preview shares the Production database and a preview
 * deployment must not post to a merchant's profile on its own schedule.
 * Isolated like the cron's other passengers: its own try/catch, and it never
 * throws, so a failure here cannot change, delay or fail anything else.
 */
import { isGbpPostsEnabled } from './config'

export type IsolatedGbpDueOutcome =
  | { status: 'ran'; attempted: number; published: number; failed: number }
  | { status: 'not_production' | 'feature_off' | 'no_schema' | 'error' }

export async function runIsolatedGbpDue(
  run: () => Promise<{ ok: false } | { ok: true; attempted: number; published: number; failed: number }> = async () => {
    const [{ createAdminClient }, { gbpTablesPresent }, { publishDuePosts }] = await Promise.all([
      import('@/lib/supabase/admin'), import('./store'), import('./publish'),
    ])
    const admin = createAdminClient()
    if (!(await gbpTablesPresent(admin))) return { ok: false }
    return { ok: true, ...(await publishDuePosts(admin)) }
  },
  opts: { env?: Record<string, string | undefined>; enabled?: () => boolean } = {},
): Promise<IsolatedGbpDueOutcome> {
  const env = opts.env ?? process.env
  // Nothing is constructed outside Production, and nothing while the flag is off.
  if (env.VERCEL_ENV !== 'production') return { status: 'not_production' }
  if (!(opts.enabled ?? isGbpPostsEnabled)()) return { status: 'feature_off' }
  try {
    const out = await run()
    if (!out.ok) return { status: 'no_schema' }
    // Logged only when the pass acted: an idle quarter hour is the normal case.
    if (out.attempted > 0) console.log('[gbp-due] pass complete', { attempted: out.attempted, published: out.published, failed: out.failed })
    return { status: 'ran', attempted: out.attempted, published: out.published, failed: out.failed }
  } catch {
    console.error('[gbp-due] pass failed', { reason: 'threw' })
    return { status: 'error' }
  }
}
