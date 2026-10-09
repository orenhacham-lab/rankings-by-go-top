/**
 * The calendar of the weekly summary email. Pure: every function takes the time it works
 * from.
 *
 * THE WINDOW is the seven days ending at the send: that is what the email talks about
 * ("the past week"), and it does not depend on a timezone's week boundary, so summer time
 * cannot shorten or double it.
 *
 * THE KEY is only an idempotency token: the ISO 8601 week (YYYY-Www) of the send moment.
 * One email per project per key, so a cron that fires every 15 minutes, or twice, cannot
 * summarise the same week again. It is never shown to a reader.
 */
export const WEEK_MS = 7 * 86_400_000
export const SEND_ZONE = 'Asia/Jerusalem'
export const SEND_HOUR = 9
export const SEND_DAY = 'Sun'

const ZONE_DAY = new Intl.DateTimeFormat('en-US', { timeZone: SEND_ZONE, weekday: 'short' })
const ZONE_HOUR = new Intl.DateTimeFormat('en-GB', { timeZone: SEND_ZONE, hour: '2-digit', hourCycle: 'h23' })

/** Sunday, 09:00 to 09:59 in Israel (summer and winter time alike). */
export function inWeeklyWindow(now: Date): boolean {
  return ZONE_DAY.format(now) === SEND_DAY && Number(ZONE_HOUR.format(now)) === SEND_HOUR
}

/** The seven days the email is about: [start, end). */
export function weekWindow(now: Date): { start: Date; end: Date } {
  return { start: new Date(now.getTime() - WEEK_MS), end: now }
}

/** The ISO 8601 week of a moment, as YYYY-Www. */
export function weekKeyOf(now: Date): string {
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))
  // Thursday of this ISO week decides the year the week belongs to.
  const day = d.getUTCDay() === 0 ? 7 : d.getUTCDay()
  d.setUTCDate(d.getUTCDate() + 4 - day)
  const yearStart = Date.UTC(d.getUTCFullYear(), 0, 1)
  const week = Math.ceil(((d.getTime() - yearStart) / 86_400_000 + 1) / 7)
  return `${d.getUTCFullYear()}-W${String(week).padStart(2, '0')}`
}

export const WEEK_KEY = /^\d{4}-W\d{2}$/
export const isWeekKey = (v: unknown): v is string => typeof v === 'string' && WEEK_KEY.test(v)
