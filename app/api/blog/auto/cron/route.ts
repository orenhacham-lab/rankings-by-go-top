/**
 * The public blog's daily article — GET/POST /api/blog/auto/cron
 *
 * Writes and publishes ONE article per language on gotopseo.com. The scheduler
 * calls it once per language — `?locale=he|en|es` — because one article takes
 * far longer than a third of the invocation's budget; a call that names no
 * language covers every language itself, within a time budget. Protected by
 * CRON_SECRET, service-role only, no browser session, idempotent.
 *
 * OFF UNLESS BLOG_AUTO_PUBLISH_ENABLED IS EXACTLY "true". This route publishes
 * to the company's own public site, so merging it must not start publishing:
 * the switch is a deliberate, separate decision, and until it is flipped the
 * route answers 404 exactly as if it did not exist.
 *
 * ANSWERS FIRST, WORKS AFTER, for the same reason the content-automation cron
 * does: one generation plus its cover image takes far longer than a scheduler
 * waits, and a scheduler that keeps seeing failures disables the job. The
 * outcome is in the `[blog-auto-cron] run complete` log line.
 */

import { after } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { authorizeCronRequest } from '@/lib/auth/cron'
import { runBlogAutoPublish, runBlogAutoPublishAllLocales } from '@/lib/blog/auto/runner'
import { isBlogAutoLocale } from '@/lib/blog/auto/rotation'

export const maxDuration = 300
export const dynamic = 'force-dynamic'

/** The kill switch. Anything but the exact string "true" is off. */
export function isBlogAutoPublishEnabled(): boolean {
  return process.env.BLOG_AUTO_PUBLISH_ENABLED === 'true'
}

async function handle(request: Request): Promise<Response> {
  if (!isBlogAutoPublishEnabled()) return Response.json({ error: 'Not found' }, { status: 404 })

  const denied = authorizeCronRequest(request, 'blog-auto-cron')
  if (denied) return denied

  const startedAt = new Date().toISOString()
  // One language per call when the scheduler names one; every language when it
  // does not. An unrecognized value is ignored rather than refused: the run is
  // the scheduler's, and a typo must not cost the blog its articles.
  const asked = new URL(request.url).searchParams.get('locale')
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
      console.error('[blog-auto-cron] run failed', { startedAt, locale, message: e instanceof Error ? e.message : String(e) })
    }
  })
  return Response.json({ ok: true, accepted: true, startedAt, locale }, { status: 202 })
}

export async function GET(request: Request) { return handle(request) }
export async function POST(request: Request) { return handle(request) }
