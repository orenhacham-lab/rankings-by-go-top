/**
 * THE DAILY BLOG RUN'S REQUEST HANDLER, shared by both of its routes.
 *
 * `/api/blog/auto/cron/<locale>` is what the scheduler calls — one job per
 * language, each on its own path. The first attempt used one path and a
 * `?locale=` query string, and on 12 Oct 2026 only ONE of the three jobs ran
 * (Spanish): Vercel's cron configuration is keyed by path, and its own
 * documentation parameterizes a job through a path segment, never a query
 * string. `/api/blog/auto/cron` is kept for a call by hand: with `?locale=` it
 * writes that language, and with nothing it covers every language itself,
 * within a time budget.
 *
 * ANSWERS FIRST, WORKS AFTER, for the same reason the content-automation cron
 * does: one generation plus its cover image takes far longer than a scheduler
 * waits, and a scheduler that keeps seeing failures disables the job. The
 * outcome is in the `[blog-auto-cron] run complete` log line.
 *
 * OFF UNLESS BLOG_AUTO_PUBLISH_ENABLED IS EXACTLY "true": this publishes to the
 * company's own public site, so the switch is a deliberate, separate decision,
 * and until it is flipped every route here answers 404 as if it did not exist.
 */

import { after } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { authorizeCronRequest } from '@/lib/auth/cron'
import { runBlogAutoPublish, runBlogAutoPublishAllLocales } from '@/lib/blog/auto/runner'
import { isBlogAutoLocale } from '@/lib/blog/auto/rotation'

/** The kill switch. Anything but the exact string "true" is off. */
export function isBlogAutoPublishEnabled(): boolean {
  return process.env.BLOG_AUTO_PUBLISH_ENABLED === 'true'
}

/**
 * `asked` is the language the caller named, from its path or its query string.
 * An unrecognized value is ignored rather than refused — the run is the
 * scheduler's, and a typo must not cost the blog its articles — and a call that
 * names no language covers them all.
 */
export async function handleBlogAutoCron(request: Request, asked: string | null): Promise<Response> {
  if (!isBlogAutoPublishEnabled()) return Response.json({ error: 'Not found' }, { status: 404 })

  const denied = authorizeCronRequest(request, 'blog-auto-cron')
  if (denied) return denied

  const startedAt = new Date().toISOString()
  const locale = isBlogAutoLocale(asked) ? asked : null

  after(async () => {
    try {
      const admin = createAdminClient()
      const summaries = locale
        ? [await runBlogAutoPublish(admin, { locale })]
        : await runBlogAutoPublishAllLocales(admin, {})
      for (const summary of summaries) {
        console.log('[blog-auto-cron] run complete', {
          startedAt,
          locale: summary.locale,
          published: summary.published?.slug ?? null,
          planned: summary.planned,
          topUpAdded: summary.topUpAdded,
          staleRecovered: summary.staleRecovered,
          skipped: summary.skipped,
          failure: summary.failure,
          durationMs: summary.durationMs,
        })
      }
    } catch (e) {
      console.error('[blog-auto-cron] run failed', {
        startedAt, locale, message: e instanceof Error ? e.message : String(e),
      })
    }
  })
  return Response.json({ ok: true, accepted: true, startedAt, locale }, { status: 202 })
}
