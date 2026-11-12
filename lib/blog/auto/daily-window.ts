/**
 * THE DAILY BLOG RUN, DRIVEN BY THE CRON THAT ACTUALLY FIRES.
 *
 * Vercel's scheduler did not deliver the three daily jobs. 12 Oct 2026: one of
 * three ran (es), 24 minutes after its minute. 13 Oct 2026, with a path of its
 * own per language (PR #193, which removed the query-string cause): only `en`
 * ran, at 04:30 for a 04:20 schedule, while `he` (04:00) and `es` (04:40) left
 * no invocation in the runtime logs at all — and the 05:00 GSC job left none
 * either. Two mornings, two languages published out of six. The pattern is the
 * scheduler, not this code: the same `[locale]` route that wrote the English
 * article is the one the other two languages would have used.
 *
 * So the blog stops depending on it. `/api/content/automation/cron` is called
 * by cron-job.org every fifteen minutes and its runs are all over the logs
 * (33 log records in 45 minutes on the morning this was written), so the blog
 * rides it, the way the monthly topic top-up does: no new schedule, no new
 * route, and twelve chances a morning instead of one.
 *
 * ONE ARTICLE A LANGUAGE A DAY is kept by the two reads here, not by the
 * calendar: a language that already published today (UTC) is done, and a
 * language whose plan row is claimed right now is in flight, so a second
 * invocation leaves both alone. At most ONE language is written per run, so a
 * morning fills one language a quarter of an hour, and the order is REFUSED
 * FEWEST TIMES TODAY, THEN HUNGRIEST: a language that has already burned a pass
 * this morning steps behind the ones that have not been tried, and among equals
 * the language that has gone longest without an article goes first, with the
 * order lib/blog/auto/rotation.ts declares breaking a tie. Until 5 Nov 2026
 * this walked that list in declaration order and it was last-pays-first, which
 * is how Italian and Japanese lost days to the retries of the languages ahead
 * of them; until 12 Nov it went by hunger alone, which is how French — unable
 * to get past the truth limits — took four passes in a row while eight untried
 * languages waited.
 *
 * Production only, and only in WINDOW_HOURS_UTC (04:00-09:59 UTC = 07:00-12:59
 * in Israel). The window held three hours while there were three languages, and
 * a morning really does use them: on 17 Oct the Spanish article failed the
 * quality gate twice and published on the third pass, at 06:47. A fourth
 * language behind a morning like that would have run out of window, so the
 * window grew with it — the last hour is a reserve for retries, not a later
 * publishing time. Outside it this returns at once without a read or a log
 * line.
 */

import type { createAdminClient } from '@/lib/supabase/admin'
import { localesForDay, type BlogAutoLocale } from '@/lib/blog/auto/rotation'
import {
  localesPublishedSince, isLocaleGenerating, lastPublishedByLocale, gateFailuresTodayByLocale,
} from '@/lib/blog/auto/store'
import { runBlogAutoPublish, type BlogAutoSummary } from '@/lib/blog/auto/runner'
import { isBlogAutoPublishEnabled } from '@/lib/blog/auto/cron-run'
import { reportSilentMorning } from '@/lib/blog/auto/silent-morning'
// The hours live in their own module so the silence check can read them without
// importing this one back; re-exported here because every caller and the QA
// suite take them from this path.
export { WINDOW_HOURS_UTC, startOfUtcDay, isInWindow } from '@/lib/blog/auto/window-hours'
import { startOfUtcDay, isInWindow } from '@/lib/blog/auto/window-hours'

type Admin = ReturnType<typeof createAdminClient>


/** Left for the emails that follow in the cron's `after()`. */
export const BLOG_WINDOW_MARGIN_MS = 15_000

export interface BlogWindowResult {
  state: 'disabled' | 'not_production' | 'outside_window' | 'silence_checked' | 'all_done' | 'busy' | 'no_time' | 'ran'
  locale: BlogAutoLocale | null
  summary: BlogAutoSummary | null
}

const RESULT = (state: BlogWindowResult['state'], locale: BlogAutoLocale | null = null): BlogWindowResult => ({
  state, locale, summary: null,
})

/**
 * The first language of the day's order that has neither published today nor a
 * run in flight. `null` means the morning is done, or someone else is writing.
 */
/**
 * The day's languages: the ones REFUSED FEWEST TIMES TODAY first, and among
 * those the hungriest — the one that has gone longest without an article, with
 * the list's own order breaking a tie. A language that has never published
 * sorts first of all.
 *
 * Hunger alone is what keeps the last language in the list from paying for the
 * ones ahead of it. Walking the list in declaration order meant Spanish
 * retrying three times, or French twice, spent the window and Italian, Japanese
 * and German — the last three — simply never got a turn.
 *
 * But hunger alone has its own failure, and 12 Nov 2026 is it. A gate failure
 * ends the pass, because the Gemini call behind it is already spent, so a
 * language that cannot get past the gates costs the whole quarter of an hour.
 * French had not published since 9 Nov, so it sorted first, failed
 * `truth:percentage_claim`, and was first again fifteen minutes later: four
 * passes in a row, 07:46 to 08:32 Israel, while eight untried languages waited.
 * Today's refusals therefore come before hunger: a language that has already
 * burned a pass this morning steps behind the ones that have not been tried.
 * The count resets with the UTC day, so a language that lost a morning is
 * hungriest — and first — the next one.
 */
export function starvationOrder(
  locales: readonly BlogAutoLocale[],
  lastPublished: Record<string, string | undefined>,
  failuresToday: Record<string, number> = {},
): BlogAutoLocale[] {
  return locales
    .map((locale, index) => ({
      locale,
      index,
      at: lastPublished[locale] ?? '',
      failed: failuresToday[locale] ?? 0,
    }))
    .sort((a, b) => (
      a.failed !== b.failed
        ? a.failed - b.failed
        : a.at < b.at ? -1 : a.at > b.at ? 1 : a.index - b.index
    ))
    .map((entry) => entry.locale)
}

/**
 * THE DAY'S REMAINING LANGUAGES, hungriest first — all of them, not just the
 * first.
 *
 * This used to answer with one language, and that is what silenced the whole
 * blog on 10 and 11 Nov 2026. Spanish ran out of plan rows (29 of its keywords
 * are parked as failed and its research found nothing new to add), and Spanish
 * was the hungriest language: every pass of the morning chose it, found an
 * empty queue, ended the pass, and the nine languages behind it — each with a
 * queue of its own — never got a turn. 10 Nov published seven articles and
 * stopped at 05:31, the moment the order reached Spanish; 11 Nov published
 * none at all, because Spanish was first from the opening pass.
 *
 * So the caller gets the queue and walks it: one language that cannot produce
 * an article costs its own slot and nothing more. A language being written
 * right now still stops the pass, because that run is about to write the
 * article this one would duplicate.
 */
export async function localesToWrite(
  admin: Admin,
  nowMs: number,
): Promise<{ locales: BlogAutoLocale[]; busy: boolean }> {
  const startOfDay = startOfUtcDay(nowMs)
  const published = new Set(await localesPublishedSince(admin, startOfDay))
  const lastPublished = await lastPublishedByLocale(admin)
  const failuresToday = await gateFailuresTodayByLocale(admin, startOfDay)
  const out: BlogAutoLocale[] = []
  // localesForDay(), not the whole list: a language whose public tree is still
  // behind its flag has nowhere to publish to, and claiming its slot would end
  // the morning before the languages that do.
  for (const locale of starvationOrder(localesForDay(), lastPublished, failuresToday)) {
    if (published.has(locale)) continue
    if (await isLocaleGenerating(admin, locale)) return { locales: [], busy: true }
    out.push(locale)
  }
  return { locales: out, busy: false }
}

/** The first of them, kept for callers that want only the next language. */
export async function nextLocaleToWrite(
  admin: Admin,
  nowMs: number,
): Promise<{ locale: BlogAutoLocale | null; busy: boolean }> {
  const { locales, busy } = await localesToWrite(admin, nowMs)
  return { locale: locales[0] ?? null, busy }
}

export async function runBlogDailyWindow(
  admin: Admin,
  options: { env: NodeJS.ProcessEnv; now?: number; deadlineAt: number },
): Promise<BlogWindowResult> {
  const now = options.now ?? Date.now()
  if (!isBlogAutoPublishEnabled()) return RESULT('disabled')
  if (options.env.VERCEL_ENV !== 'production') return RESULT('not_production')
  if (!isInWindow(now)) {
    // The one thing that happens outside the window: in its first quarter hour,
    // a morning that published nothing says so (lib/blog/auto/silent-morning.ts).
    // Every other invocation of the day still returns here without a read.
    const silence = await reportSilentMorning(admin, { now })
    return RESULT(silence.state === 'not_checked' ? 'outside_window' : 'silence_checked')
  }

  const { locales, busy } = await localesToWrite(admin, now)
  if (busy) return RESULT('busy')
  if (locales.length === 0) return RESULT('all_done')

  /**
   * A language that produced NOTHING because it had nothing to write is passed
   * over, within the same invocation, in favour of the next hungriest. Only
   * these two reasons: a gate failure (truth, quality, links) has already spent
   * a Gemini call and belongs to the next quarter of an hour's reserve, not to
   * this one.
   */
  const NOTHING_TO_WRITE = new Set(['queue_empty', 'claim_lost'])

  let last: BlogWindowResult = RESULT('all_done')
  for (const locale of locales) {
    // One article takes 78-170s in Production, so a run that cannot finish one
    // leaves it to the next quarter of an hour rather than dying mid-publish.
    if (Date.now() >= options.deadlineAt) return RESULT('no_time', locale)

    const summary = await runBlogAutoPublish(admin, { locale })
    console.log('[blog-window] run complete', {
      locale,
      published: summary.published?.slug ?? null,
      planned: summary.planned,
      topUpAdded: summary.topUpAdded,
      // Without this a language whose research fails reads as a quiet
      // `skipped: 'queue_empty'` forever: French published nothing for four days
      // and the reason (a 404 from the keyword research) was only in the raw
      // runtime log, which this plan keeps for one hour.
      topUpError: summary.topUpError,
      skipped: summary.skipped,
      failure: summary.failure,
      durationMs: summary.durationMs,
    })
    last = { state: 'ran', locale, summary }
    // The pass ends on an article, and on a failure that used its generation.
    if (!summary.skipped || !NOTHING_TO_WRITE.has(summary.skipped)) return last
  }
  // Every remaining language had an empty queue. The top-up ran for each of
  // them on the way through, so the next pass may find rows where this one did
  // not; the last of them is reported, with its topUpError if there was one.
  return last
}

/**
 * The cron's way in: isolated like the top-up's, so whatever the blog does it
 * cannot change, delay or fail the content run that is already done and logged.
 */
export async function startIsolatedBlogWindow(
  task: (deadlineAt: number) => Promise<unknown>,
  window: { startedAtMs: number; maxDurationMs: number },
): Promise<void> {
  const deadlineAt = window.startedAtMs + window.maxDurationMs - BLOG_WINDOW_MARGIN_MS
  if (Date.now() >= deadlineAt) return
  try {
    await task(deadlineAt)
  } catch (e) {
    console.error('[blog-window] failed', { error: e instanceof Error ? e.name : 'unknown' })
  }
}
