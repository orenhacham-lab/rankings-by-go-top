/**
 * Content automation — GET/POST /api/content/automation/cron
 *
 * The scheduled runner: recovers stale locks, publishes due generated items, and
 * generates ahead — bounded per run. Protected by CRON_SECRET (same pattern as
 * /api/schedule). Service-role only; no browser session. Idempotent.
 *
 * Vercel cron sends GET with `Authorization: Bearer <CRON_SECRET>`.
 *
 * ONE REAL PASS AN HOUR. cron-job.org still calls this route every fifteen
 * minutes, but only the first call of each hour does the work: the rest are
 * refused by `claimAutomationPass` (lib/content/automation/pass-gate.ts) after a
 * single query and answer 202 like any other call. Every "every fifteen minutes"
 * below therefore now means hourly; Vercel's own daily 07:00 call is never gated.
 * The reason is the Hobby Active-CPU allowance, which this route alone crossed.
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
 * ALONGSIDE ALL OF IT, THE ARTICLE BATCH LANE (lib/content/batch): the first draft
 * of an upcoming queued article, ordered from Gemini's Batch API at half the
 * interactive price and collected on a later pass. Production only, off unless
 * ARTICLE_BATCH_ENABLED is "true", isolated the same way. Nothing in a request ever
 * waits for a batch job: a generation uses a draft only when one is already sitting
 * ready for its exact prompt, and otherwise makes the live call it always made.
 *
 * THEN, THE OUTBOUND RETENTION PASS (lib/outreach/retention-isolated.ts): the 30-day
 * redaction and the 90-day deletion the privacy text promises for a cold-email prospect.
 * It rides this cron, not only its own daily entry in vercel.json, because a daily cron on
 * this plan is best-effort. Production only, idempotent, isolated the same way, and it logs
 * one counts-only line per pass — the only evidence the pass runs at all.
 *
 * THEN, THE OUTBOUND SEND ITSELF (lib/outreach/sender-isolated.ts): at most one cold message
 * per pass, which at a quarter-hour cron is the 5–15 minute spacing the channel's plan
 * requires. FROZEN since 9 Nov 2026 by CHANNEL_FROZEN, and behind that OFF unless
 * OUTREACH_SENDING_ENABLED is exactly "true" and the mailbox password is set, Production only, and every gate the plan names is inside it. It logs one line per pass
 * with the outcome and no recipient.
 *
 * ALONGSIDE ALL OF IT, THE SITE MAPPING UPKEEP (lib/content/existing-content/map-upkeep.ts):
 * at most one project per run whose mapping is missing or ageing is mapped, so automatic
 * internal links have pages to point at. Started with the runner, awaited before the emails.
 *
 * ALONGSIDE ALL OF IT, THE PUBLISHED ARTICLES' INTERNAL LINKS
 * (lib/content/auto-internal-links/heal.ts): a merchant's page can be taken down
 * weeks after the article that links to it went live, and nothing in the product
 * noticed (eleven dead anchors in buy-buy.co.il's published articles, found on
 * 16 November 2026). This pass asks the targets again, takes a dead one's <a>
 * out of the body and sends the article to the site again in place, so the live
 * post loses the 404 anchor too. At most three articles a pass, Production only,
 * isolated the same way.
 *
 * THEN, THE BUSINESS PROFILE POST QUEUE (lib/gbp/due-isolated.ts): the automatic posts whose
 * article has published. Queuing happens in the publish path, but sending never can — that path
 * is forbidden to call Google — so the queue is drained here, every fifteen minutes, instead of
 * once a day at 07:30 UTC. The daily entry stays as a second chance at the same idempotent pass.
 *
 * ALONGSIDE ALL OF IT, THE BLOG COVERS PUBLISHED BEFORE ANYONE LOOKED AT THEM
 * (lib/blog/auto/cover-repair.ts): the image review runs when a cover is MADE, so
 * the articles published before 17 November 2026 still carry whatever came back —
 * the mirrored laptop and the two right hands Oren reported are among them. This
 * pass reviews the covers already live and replaces the faulty ones, a few an
 * hour, at most one replacement per article ever. Production only, isolated the
 * same way; it ends by itself once every cover has been looked at.
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
import { runIsolatedProspectTopUp } from '@/lib/outreach/topup-isolated'
import { runIsolatedOnboardingEmails } from '@/lib/onboarding-emails/isolated'
import { runIsolatedWeeklySummaries } from '@/lib/reports/weekly/isolated'
import { checkPublishingStalls, isDailyStallCheckRun } from '@/lib/content/automation/stall-watch'
import { claimAutomationPass, isUngatedScheduler } from '@/lib/content/automation/pass-gate'
import { runIsolatedShopifySeoBackfill } from '@/lib/shopify/seo-backfill-isolated'
import { runIsolatedSeoBackfillSample } from '@/lib/content/seo-backfill-isolated'
import { runMapUpkeep, liveEnsure } from '@/lib/content/existing-content/map-upkeep'
import { runBlogDailyWindow, startIsolatedBlogWindow } from '@/lib/blog/auto/daily-window'
import { runIsolatedGbpDue } from '@/lib/gbp/due-isolated'
import { runIsolatedArticleBatch } from '@/lib/content/batch/isolated'
import { runIsolatedInlineImageBatch } from '@/lib/content/image-batch/isolated'
import { runLinkHeal, startIsolatedLinkHeal } from '@/lib/content/auto-internal-links/heal'
import { resyncPublishedArticle } from '@/lib/content/auto-internal-links/resync'
import { runIsolatedBlogCoverRepair } from '@/lib/blog/auto/cover-repair-isolated'
import { runIsolatedBlogWeeklyReview } from '@/lib/blog/auto/weekly-review-isolated'

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

  // ONE REAL PASS AN HOUR (lib/content/automation/pass-gate.ts). cron-job.org
  // calls this route every fifteen minutes and this is the only path of the
  // project that burns measurable function time; the quarter-hour rate is what
  // put the team at 175% of the Hobby Active-CPU allowance on 17 Nov 2026. The
  // claim is conditional, so a skipped call costs one query and still answers
  // 202 — a scheduler that sees failures disables the job. It answers `skipped`
  // and NOT `accepted: true`, because nothing was accepted: that word belongs to
  // the one path that schedules the work, which is what the reminder suite's G4
  // asserts is the last thing this handler does. Vercel's own daily scheduler is
  // never gated: it is one call a day and it carries the stall check.
  if (!isUngatedScheduler(request)) {
    const claim = await claimAutomationPass(createAdminClient(), {})
    if (!claim.granted) {
      console.log('[automation-cron] pass skipped', { reason: claim.reason, sinceLastMs: claim.sinceLastMs })
      return Response.json({ ok: true, skipped: claim.reason, startedAt }, { status: 202 })
    }
  }

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
    // Then the Business Profile post queue (lib/gbp/due-isolated.ts): an article that
    // published queued its automatic post with the time set to now, and only the single
    // daily /api/gbp/cron pass sent it, so a post queued at midday waited until the next
    // morning. It rides this cron for the frequency, never the publish path itself, which
    // is forbidden to call Google at all. Production only, isolated: it never throws.
    await runIsolatedGbpDue()
    // Then the automatic internal links of articles ALREADY PUBLISHED
    // (lib/content/auto-internal-links/heal.ts): their targets are asked again, a page
    // that has since been taken down loses its <a> (the words stay), and the live post
    // is updated in place so the customer's article does not keep a 404 anchor. It also
    // sends an article the customer removed a link from, which until now stayed in the
    // published post for good. At most three articles a pass, Production only,
    // isolated: it never throws.
    await startIsolatedLinkHeal(
      (deadlineAt) => runLinkHeal(createAdminClient(), { deadlineAt, env: process.env, deps: { resync: resyncPublishedArticle } }),
      { startedAtMs: Date.parse(startedAt), maxDurationMs: maxDuration * 1000 },
    )
    // Then the batch lane (lib/content/batch): collect the article drafts Gemini's
    // Batch API has finished and order the next few, at 50% of the interactive
    // price. It rides this cron because a draft ordered now is wanted hours from
    // now, not in this run, and the queue keeps an article ready ahead of every
    // slot. Production only, off unless ARTICLE_BATCH_ENABLED is "true", and
    // isolated: two HTTP calls to Google, no model wait, and it never throws, so
    // it cannot change, delay or fail anything above.
    await runIsolatedArticleBatch()
    // Then the IMAGE batch lane (lib/content/image-batch): collect the article
    // BODY images Gemini's Batch API has finished and store them, also at 50% of
    // the interactive price. Nothing is ordered here — the images are ordered at
    // generation time, where their prompts are known, and only for a pool with a
    // day or more before it publishes. Production only, off unless
    // IMAGE_BATCH_ENABLED is "true", and isolated: one HTTP call per job in
    // flight, no model wait, and it never throws.
    await runIsolatedInlineImageBatch()
    // Then the outbound-channel retention pass: it empties a prospect's address, name and
    // postal address 30 days after the last message, which the published privacy text
    // promises (lib/outreach/retention-isolated.ts). It rides this cron because a daily
    // Vercel cron on this plan is best-effort, and the promise cannot depend on a job that
    // may silently never fire. Production only, idempotent, milliseconds over a small
    // table, isolated: it never throws, so it cannot change, delay or fail anything above.
    await runIsolatedProspectRetention()
    // Then, FROZEN since 9 Nov 2026 on ClickBank's contract (CHANNEL_FROZEN in
    // lib/outreach/sender-isolated.ts, which explains why the stop is a constant and not a
    // key), and behind that freeze OFF unless OUTREACH_SENDING_ENABLED is exactly "true" and
    // the mailbox password is set: at most ONE cold message of the US channel. It
    // rides this cron because the plan needs minutes between messages and a daily Vercel cron
    // on this plan gives neither the frequency nor the reliability; one message per quarter
    // hour IS the plan's spacing. Production only. Every gate is inside it — the recipient's
    // 09:00 window, the warm-up quota, the suppression list, the platform and a finding
    // verified against the live page in this pass. Isolated: it never throws.
    await runIsolatedProspectSend()
    // And, off unless OUTREACH_SOURCING_ENABLED is exactly "true": one business added to
    // the prospect list of that same channel (lib/outreach/topup-isolated.ts). It rides
    // this cron for the same reason as the sender, and it is a SEPARATE switch on purpose:
    // the list may be filled and inspected while nothing is being sent, and it keeps
    // filling while sending is off. One business a pass is far below anything that would
    // look like a crawl, and the address only ever comes from the business's own public
    // pages. Production only, isolated: it never throws.
    await runIsolatedProspectTopUp()
    // Then the published blog covers (lib/blog/auto/cover-repair.ts): the review
    // guards covers as they are MADE, so everything published before 17 Nov 2026
    // still carries whatever the image model returned. This pass looks at those
    // covers and replaces the faulty ones — a few an hour, one replacement per
    // article ever, and never leaving an article without a cover. It ends by
    // itself. Production only, isolated: it never throws.
    await runIsolatedBlogCoverRepair(undefined, { startedAtMs: Date.parse(startedAt), maxDurationMs: maxDuration * 1000 })
    // Then the search-engine listing of articles already on merchants' Shopify
    // blogs that never got one: every Shopify publish before 21 Nov 2026 sent no
    // SEO field at all (lib/shopify/seo-backfill.ts). Ten articles a pass, each
    // one read before it is written and the merchant's own value never replaced.
    // It ends by itself. Production only, isolated: it never throws.
    await runIsolatedShopifySeoBackfill(undefined, { startedAtMs: Date.parse(startedAt), maxDurationMs: maxDuration * 1000 })
    // Then a DRY RUN over the WordPress half of the same gap: 337 articles on 21
    // customers' sites have no SEO title or meta description either, and only
    // their live pages can say which fields are missing and which are the
    // merchant's own. It reads ten at random and logs the distribution; it
    // cannot write (lib/content/seo-backfill-isolated.ts). Production only,
    // isolated: it never throws.
    await runIsolatedSeoBackfillSample(undefined, { startedAtMs: Date.parse(startedAt), maxDurationMs: maxDuration * 1000 })
    // Once a week, on Sunday at 06:00 UTC (after the 05:00 GSC sync): the reading
    // of our own blog. The outcome engine and the cannibalisation table were both
    // pure and both unreachable — nothing called them. This logs what they say:
    // which published article to improve rather than replace, and which queries
    // our own pages are splitting between them (measured 21 Nov 2026: eight of
    // our pages on one query, 1,377 impressions). It only reads and only logs —
    // no article, plan row or redirect is touched (lib/blog/auto/weekly-review-isolated.ts).
    // Production only, isolated: it never throws.
    await runIsolatedBlogWeeklyReview(undefined, { startedAtMs: Date.parse(startedAt), maxDurationMs: maxDuration * 1000 })
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
