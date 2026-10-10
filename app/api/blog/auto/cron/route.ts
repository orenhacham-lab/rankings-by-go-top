/**
 * The public blog's daily article — GET/POST /api/blog/auto/cron
 *
 * Writes and publishes at most ONE article per run on gotopseo.com, in the
 * language today's rotation calls for (lib/blog/auto/rotation.ts). Protected by
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
import { runBlogAutoPublish } from '@/lib/blog/auto/runner'

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
  after(async () => {
    try {
      const summary = await runBlogAutoPublish(createAdminClient(), {})
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
    } catch (e) {
      console.error('[blog-auto-cron] run failed', { startedAt, message: e instanceof Error ? e.message : String(e) })
    }
  })
  return Response.json({ ok: true, accepted: true, startedAt }, { status: 202 })
}

export async function GET(request: Request) { return handle(request) }
export async function POST(request: Request) { return handle(request) }
