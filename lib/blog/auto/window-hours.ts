/**
 * THE HOURS THE BLOG MAY WRITE IN, on their own.
 *
 * Split out of lib/blog/auto/daily-window.ts so the silence check
 * (lib/blog/auto/silent-morning.ts) can know when the window closes without
 * importing the window that calls it: a cycle whose values are read at module
 * load would leave the check's hour undefined. daily-window re-exports both
 * names, so every existing caller is unchanged.
 */

/**
 * The UTC hours the morning run may write in. Four hours held five languages;
 * nine languages need six, because the cron fires every fifteen minutes and an
 * hour is therefore four runs, of which one per language goes on a first pass
 * and the rest is reserve for a language that fails a gate and retries. On
 * 4 Nov 2026 the four-hour window ran out at 07:59 with Italian still unwritten
 * and German, live that day, never reached at all.
 *
 * POLISH, the tenth language, did NOT buy a seventh hour, and that was a
 * decision rather than an omission: six hours are twenty-four runs, so the
 * reserve went from fifteen passes to fourteen, and the order became
 * hungriest-first the same day, which is what actually protected the languages
 * at the end of the list. The note it left in lib/blog/auto/rotation.ts was that
 * fourteen was the narrowest the reserve had been since the window was widened,
 * and that an ELEVENTH language should come with the seventh hour rather than
 * after it.
 *
 * KOREAN is that eleventh language, so the seventh hour came with it:
 * 04:00-10:59 UTC, twenty-eight runs, eleven first passes and seventeen of
 * reserve. The number to watch is the reserve, not the count of languages: it
 * must hold at least one retry per language, which is what J18 in
 * lib/blog/auto/__qa__/blog-auto.qa.ts asserts.
 *
 * THAT ARITHMETIC NO LONGER HOLDS; see the note on the constant below.
 */
/**
 * TWELVE HOURS, from 21 November 2026, because the hour stopped being four runs.
 *
 * Everything above counts an hour as FOUR chances, which it was while
 * cron-job.org's quarter-hour call reached the blog. PR 472 put a pass gate in
 * front of that call to hold down Vercel CPU after the Hobby overrun, and the
 * gate returns 202 BEFORE `after()`, where the blog window is started. So a
 * gated call never reaches the blog at all, and an hour became ONE chance.
 *
 * The window did not change, so seven hours stopped being twenty-eight runs and
 * became seven, for eleven languages. The measurement is unambiguous — articles
 * a day: 15 Nov 11, 16 Nov 10, 17 Nov 9, then 18 Nov 5, 19 Nov 3, 20 Nov 5,
 * 21 Nov 5. PR 472 merged on the evening of 17 November.
 *
 * TWELVE AND NOT ELEVEN. Eleven hours for eleven languages is exact, and exact
 * means a language that loses its hour to the quality gate loses its day: that
 * is what 19 November's three articles look like. The twelfth hour is the
 * reserve, in the way the fourth run of each hour used to be.
 *
 * It costs no CPU. Those hourly passes already run — the blog was simply not
 * allowed to use them — which is why this is the fix rather than exempting the
 * blog from the gate, with Vercel Pro due to be dropped at the end of the month.
 *
 * 04:00-15:59 UTC = 07:00-18:59 Israel. The number to watch is still the
 * reserve, now one hour rather than seventeen runs; if a language loses a day
 * again, the next move is to stop a refused language consuming its whole hour.
 */
export const WINDOW_HOURS_UTC: readonly number[] = [4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15]

/** Midnight UTC of the day `nowMs` falls in. */
export function startOfUtcDay(nowMs: number): string {
  const d = new Date(nowMs)
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())).toISOString()
}

export function isInWindow(nowMs: number): boolean {
  return WINDOW_HOURS_UTC.includes(new Date(nowMs).getUTCHours())
}
