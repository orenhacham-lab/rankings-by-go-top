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
 * morning fills in the order he, en, es, pt-BR, fr, a quarter of an hour apart
 * — the order lib/blog/auto/rotation.ts declares, and it is last-pays-first: a
 * language that keeps failing the quality gate spends the window's reserve, and
 * the one that goes without is the last in that list, never an older one.
 *
 * Production only, and only in WINDOW_HOURS_UTC (04:00-07:59 UTC = 07:00-10:59
 * in Israel). The window held three hours while there were three languages, and
 * a morning really does use them: on 17 Oct the Spanish article failed the
 * quality gate twice and published on the third pass, at 06:47. A fourth
 * language behind a morning like that would have run out of window, so the
 * window grew with it — the last hour is a reserve for retries, not a later
 * publishing time. Outside it this returns at once without a read or a log
 * line.
 */

import type { createAdminClient } from '@/lib/supabase/admin'
import { BLOG_AUTO_LOCALES, type BlogAutoLocale } from '@/lib/blog/auto/rotation'
import { localesPublishedSince, isLocaleGenerating } from '@/lib/blog/auto/store'
import { runBlogAutoPublish, type BlogAutoSummary } from '@/lib/blog/auto/runner'
import { isBlogAutoPublishEnabled } from '@/lib/blog/auto/cron-run'

type Admin = ReturnType<typeof createAdminClient>

/** The UTC hours the morning run may write in. */
export const WINDOW_HOURS_UTC: readonly number[] = [4, 5, 6, 7]

/** Left for the emails that follow in the cron's `after()`. */
export const BLOG_WINDOW_MARGIN_MS = 15_000

export interface BlogWindowResult {
  state: 'disabled' | 'not_production' | 'outside_window' | 'all_done' | 'busy' | 'no_time' | 'ran'
  locale: BlogAutoLocale | null
  summary: BlogAutoSummary | null
}

const RESULT = (state: BlogWindowResult['state'], locale: BlogAutoLocale | null = null): BlogWindowResult => ({
  state, locale, summary: null,
})

/** Midnight UTC of the day `nowMs` falls in. */
export function startOfUtcDay(nowMs: number): string {
  const d = new Date(nowMs)
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())).toISOString()
}

export function isInWindow(nowMs: number): boolean {
  return WINDOW_HOURS_UTC.includes(new Date(nowMs).getUTCHours())
}

/**
 * The first language of the day's order that has neither published today nor a
 * run in flight. `null` means the morning is done, or someone else is writing.
 */
export async function nextLocaleToWrite(
  admin: Admin,
  nowMs: number,
): Promise<{ locale: BlogAutoLocale | null; busy: boolean }> {
  const published = new Set(await localesPublishedSince(admin, startOfUtcDay(nowMs)))
  for (const locale of BLOG_AUTO_LOCALES) {
    if (published.has(locale)) continue
    if (await isLocaleGenerating(admin, locale)) return { locale: null, busy: true }
    return { locale, busy: false }
  }
  return { locale: null, busy: false }
}

export async function runBlogDailyWindow(
  admin: Admin,
  options: { env: NodeJS.ProcessEnv; now?: number; deadlineAt: number },
): Promise<BlogWindowResult> {
  const now = options.now ?? Date.now()
  if (!isBlogAutoPublishEnabled()) return RESULT('disabled')
  if (options.env.VERCEL_ENV !== 'production') return RESULT('not_production')
  if (!isInWindow(now)) return RESULT('outside_window')

  const { locale, busy } = await nextLocaleToWrite(admin, now)
  if (busy) return RESULT('busy')
  if (!locale) return RESULT('all_done')
  // One article takes 78-170s in Production, so a run that cannot finish one
  // leaves it to the next quarter of an hour rather than dying mid-publish.
  if (Date.now() >= options.deadlineAt) return RESULT('no_time', locale)

  const summary = await runBlogAutoPublish(admin, { locale })
  console.log('[blog-window] run complete', {
    locale,
    published: summary.published?.slug ?? null,
    planned: summary.planned,
    topUpAdded: summary.topUpAdded,
    skipped: summary.skipped,
    failure: summary.failure,
    durationMs: summary.durationMs,
  })
  return { state: 'ran', locale, summary }
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
