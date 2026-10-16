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
 * THEN, THE MONTHLY TOPIC TOP-UP (lib/content/automation/topic-topup.ts): keeps
 * every active, paid project supplied with unused topics for its next month, from
 * the ideas already in its plan first, with the cannibalization check. Isolated the
 * same way, after both; it acts only in Production and only in its daily UTC window
 * (07:00–08:59, the Vercel cron's 07:00 run and cron-job.org's quarter hours), and
 * outside it returns at once without a read or a line. No new cron schedule.
 *
 * ALONGSIDE ALL OF IT, THE COMPANY BLOG'S DAILY ARTICLE (lib/blog/auto/daily-window.ts):
 * one language per run, at most one article a language a day, Production only and only in
 * the UTC window 04:00-06:59, because Vercel's scheduler did not deliver the blog's own
 * three daily jobs while this cron fires every fifteen minutes. Isolated the same way.
 *
 * THEN, THE OUTBOUND RETENTION PASS (lib/outreach/retention-isolated.ts): the 30-day
 * redaction and the 90-day deletion the privacy text promises for a cold-email prospect.
 * It rides this cron, not only its own daily entry in vercel.json, because a daily cron on
 * this plan is best-effort. Production only, idempotent, isolated the same way, and it logs
 * one counts-only line per pass — the only evidence the pass runs at all.
 *
 * THEN, THE OUTBOUND SEND ITSELF (lib/outreach/sender-isolated.ts): at most one cold message
 * per pass, which at a quarter-hour cron is the 5–15 minute spacing the channel's plan
 * requires. OFF unless OUTREACH_SENDING_ENABLED is exactly "true" and the mailbox password is
 * set, Production only, and every gate the plan names is inside it. It logs one line per pass
 * with the outcome and no recipient.
 *
 * ALONGSIDE ALL OF IT, THE SITE MAPPING UPKEEP (lib/content/existing-content/map-upkeep.ts):
 * at most one project per run whose mapping is missing or ageing is mapped, so automatic
 * internal links have pages to point at. Started with the runner, awaited before the emails.
 *
 * LAST OF ALL, THE REMINDER EMAIL. After the top-up, the "articles are waiting for your OK" reminder
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
import { runTopicTopUp, startIsolatedTopUp } from '@/lib/content/automation/topic-topup'
import { runIsolatedReminders } from '@/lib/reminders/isolated'
import { runIsolatedProspectRetention } from '@/lib/outreach/retention-isolated'
import { runIsolatedProspectSend } from '@/lib/outreach/sender-isolated'
import { runIsolatedOnboardingEmails } from '@/lib/onboarding-emails/isolated'
import { runIsolatedWeeklySummaries } from '@/lib/reports/weekly/isolated'
import { checkPublishingStalls, isDailyStallCheckRun } from '@/lib/content/automation/stall-watch'
import { runMapUpkeep, liveEnsure } from '@/lib/content/existing-content/map-upkeep'
import { runBlogDailyWindow, startIsolatedBlogWindow } from '@/lib/blog/auto/daily-window'

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
  const dailyStallCheck = isDailyStallCheckRun(request)
  after(async () => {
    // Map ONE project whose site mapping is missing or ageing, so its articles get internal
    // links (lib/content/existing-content/map-upkeep.ts). It runs ALONGSIDE the runner, not
    // after it: a run that writes an article takes 150-270s, which left a pass placed after
    // it no time at all, and the crawl waits on the merchant's site, not on this process.
    // It touches no table the runner writes, never throws, and its 40s margin is left for
    // the emails below.
    const mapUpkeep = runMapUpkeep(createAdminClient(), { deadlineAt: Date.parse(startedAt) + maxDuration * 1000 - 40_000, ensure: liveEnsure })
    // The company blog's own daily article, ALONGSIDE the runner for the same reason:
    // a content run that publishes takes 150-270s, and Vercel's scheduler did not
    // deliver the blog's own three daily jobs (lib/blog/auto/daily-window.ts). One
    // language per run, at most one article a language a day, Production only and
    // only in its morning UTC window. Isolated below; it never throws.
    const blogWindow = startIsolatedBlogWindow(
      (deadlineAt) => runBlogDailyWindow(createAdminClient(), { env: process.env, deadlineAt }),
      { startedAtMs: Date.parse(startedAt), maxDurationMs: maxDuration * 1000 },
    )
    try {
      const summary = await runAutomation(createAdminClient(), {})
      console.log('[automation-cron] run complete', { startedAt, poolsChecked: summary.poolsChecked, published: summary.published, generated: summary.generated, staleRecovered: summary.staleRecovered, failures: summary.failures, durationMs: summary.durationMs })
    } catch (e) {
      console.error('[automation-cron] run failed', { startedAt, message: e instanceof Error ? e.message : String(e) })
    }
    // Once a day (the Vercel cron's call): email the operator if any queue's
    // articles are more than a day late (lib/content/automation/stall-watch.ts).
    // Read only, and it never throws.
    if (dailyStallCheck) await checkPublishingStalls(createAdminClient())
    // After the runner, never before or around it; resolves whatever the resume does.
    await startIsolatedSeedResume(
      (deadlineAt) => resumeStalledSeedRuns(createAdminClient(), { env: process.env, deadlineAt }),
      { startedAtMs: Date.parse(startedAt), maxDurationMs: maxDuration * 1000 },
    )
    // Last, the monthly topic top-up: Production only, in its daily window, isolated.
    await startIsolatedTopUp(
      (deadlineAt) => runTopicTopUp(createAdminClient(), { env: process.env, deadlineAt }),
      { startedAtMs: Date.parse(startedAt), maxDurationMs: maxDuration * 1000 },
    )
    // The site-mapping pass and the blog article started next to the runner (above) are
    // awaited here, before the emails.
    await mapUpkeep
    await blogWindow
    // Then the outbound-channel retention pass: it empties a prospect's address, name and
    // postal address 30 days after the last message, which the published privacy text
    // promises (lib/outreach/retention-isolated.ts). It rides this cron because a daily
    // Vercel cron on this plan is best-effort, and the promise cannot depend on a job that
    // may silently never fire. Production only, idempotent, milliseconds over a small
    // table, isolated: it never throws, so it cannot change, delay or fail anything above.
    await runIsolatedProspectRetention()
    // Then, OFF unless OUTREACH_SENDING_ENABLED is exactly "true" and the mailbox password is
    // set: at most ONE cold message of the US channel (lib/outreach/sender-isolated.ts). It
    // rides this cron because the plan needs minutes between messages and a daily Vercel cron
    // on this plan gives neither the frequency nor the reliability; one message per quarter
    // hour IS the plan's spacing. Production only. Every gate is inside it — the recipient's
    // 09:00 window, the warm-up quota, the suppression list, the platform and a finding
    // verified against the live page in this pass. Isolated: it never throws.
    await runIsolatedProspectSend()
    // Last of all, and off unless REMINDER_EMAILS_ENABLED is "true": the reminder email for
    // articles waiting for approval (lib/reminders). Isolated; it never throws or rejects.
    await runIsolatedReminders()
    // Then, off unless ONBOARDING_EMAILS_ENABLED is "true": the setup emails for a project
    // whose site is not connected, or that has never published (lib/onboarding-emails). It
    // runs AFTER the reminder so that one email a morning per project is the reminder, not
    // both. Isolated; it never throws or rejects.
    await runIsolatedOnboardingEmails()
    // Then, off unless WEEKLY_SUMMARY_EMAIL_ENABLED is "true" and it is Sunday morning: the
    // weekly summary, for the projects whose owner asked for it (lib/reports/weekly).
    // Isolated; it never throws or rejects.
    await runIsolatedWeeklySummaries()
  })
  return Response.json({ ok: true, accepted: true, startedAt }, { status: 202 })
}

export async function GET(request: Request) { return handle(request) }
export async function POST(request: Request) { return handle(request) }
