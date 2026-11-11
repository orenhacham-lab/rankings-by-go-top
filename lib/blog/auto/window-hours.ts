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
 * nine languages need six (04:00-09:59 UTC = 07:00-12:59 Israel), because the
 * cron fires every fifteen minutes and the window is therefore twenty-four runs,
 * of which one per language goes on a first pass and the rest is reserve for a
 * language that fails a gate and retries. On 4 Nov 2026 the four-hour window ran
 * out at 07:59 with Italian still unwritten and German, live that day, never
 * reached at all.
 *
 * POLISH, the tenth language, did NOT buy a seventh hour, and that is a decision
 * rather than an omission: six hours are twenty-four runs, so the reserve went
 * from fifteen passes to fourteen, and the order became hungriest-first the same
 * day, which is what actually protected the languages at the end of the list.
 * The number to watch is the reserve, not the count of languages: at thirteen
 * languages the reserve falls below one retry each and the window has to grow.
 */
export const WINDOW_HOURS_UTC: readonly number[] = [4, 5, 6, 7, 8, 9]

/** Midnight UTC of the day `nowMs` falls in. */
export function startOfUtcDay(nowMs: number): string {
  const d = new Date(nowMs)
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())).toISOString()
}

export function isInWindow(nowMs: number): boolean {
  return WINDOW_HOURS_UTC.includes(new Date(nowMs).getUTCHours())
}
