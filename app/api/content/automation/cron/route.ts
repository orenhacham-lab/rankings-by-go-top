/**
 * Content automation — GET/POST /api/content/automation/cron
 *
 * The scheduled runner: recovers stale locks, publishes due generated items, and
 * generates ahead — bounded per run. Protected by CRON_SECRET (same pattern as
 * /api/schedule). Service-role only; no browser session. Idempotent.
 *
 * Vercel cron sends GET with `Authorization: Bearer <CRON_SECRET>`.
 *
 * ANSWERS FIRST, WORKS AFTER. The run is scheduled with `after()` and the
 * route returns 202 immediately. An external scheduler (cron-job.org) gives
 * up after 30 seconds, while one generation takes ~20–110s (measured in
 * Production on 25 Sep: two items published in 20s and 105s, both reported as
 * FAILED by cron-job.org because it had already disconnected). A scheduler
 * that repeatedly sees failures disables the job, so the answer must not
 * depend on how long the work takes. The work itself is unchanged and still
 * bounded by maxDuration; the per-item locks in the runner keep overlapping
 * runs from generating or publishing the same item twice. The outcome is in
 * the `[automation-cron] run complete` log line, as before.
 *
 * THEN, THE SEEDING SCAN'S STALLED RUNS. Once the runner has finished and
 * logged, the same `after()` continues up to two seed runs whose worker is gone
 * (lib/seed-scan/resume.ts). That part is isolated: its own try/catch and its
 * own deadline inside what is left of maxDuration, and it never throws, so it
 * cannot change, delay or fail the runner's result.
 *
 * LAST, THE REMINDER EMAIL. After both, the "articles are waiting for your OK" reminder
 * (lib/reminders): OFF unless REMINDER_EMAILS_ENABLED is exactly "true", and then only at
 * 09:00 Asia/Jerusalem, Sunday to Thursday. Isolated the same way: it cannot change, delay
 * or fail anything above.
 */

import { after } from 'next/server'
import { isContentAutomationEnabled } from '@/lib/content/api-auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { runAutomation } from '@/lib/content/automation/runner'
import { authorizeCronRequest } from '@/lib/auth/cron'
import { resumeStalledSeedRuns, startIsolatedSeedResume } from '@/lib/seed-scan/resume'
import { runIsolatedReminders } from '@/lib/reminders/isolated'

// Generation can take a while; request a generous budget (platform clamps to the
// plan's max — e.g. 60s on Hobby, up to 300s on Pro).
export const maxDuration = 300
export const dynamic = 'force-dynamic'

async function handle(request: Request): Promise<Response> {
  // The content-automation kill switch stops the seed resume below as well: a
  // stalled seed run waits (its project blocked from a new scan meanwhile)
  // until automation is back on, or is superseded once MAX_RESUME_AGE_MS
  // (24h, lib/seed-scan/store.ts) has passed.
  if (!isContentAutomationEnabled()) return Response.json({ error: 'Not found' }, { status: 404 })

  // Bearer CRON_SECRET, required — refuses when the secret is unset.
  const denied = authorizeCronRequest(request, 'automation-cron')
  if (denied) return denied

  const startedAt = new Date().toISOString()
  after(async () => {
    try {
      const summary = await runAutomation(createAdminClient(), {})
      console.log('[automation-cron] run complete', { startedAt, poolsChecked: summary.poolsChecked, published: summary.published, generated: summary.generated, staleRecovered: summary.staleRecovered, failures: summary.failures, durationMs: summary.durationMs })
    } catch (e) {
      console.error('[automation-cron] run failed', { startedAt, message: e instanceof Error ? e.message : String(e) })
    }
    // After the runner, never before or around it; resolves whatever the resume does.
    await startIsolatedSeedResume(
      (deadlineAt) => resumeStalledSeedRuns(createAdminClient(), { env: process.env, deadlineAt }),
      { startedAtMs: Date.parse(startedAt), maxDurationMs: maxDuration * 1000 },
    )
    // Last of all, and off unless REMINDER_EMAILS_ENABLED is "true": the reminder email for
    // articles waiting for approval (lib/reminders). Isolated; it never throws or rejects.
    await runIsolatedReminders()
  })
  return Response.json({ ok: true, accepted: true, startedAt }, { status: 202 })
}

export async function GET(request: Request) { return handle(request) }
export async function POST(request: Request) { return handle(request) }
