/**
 * The calendar of the monthly report. A report covers one UTC calendar month,
 * named by its key 'YYYY-MM' and stored as the month's first day (period_month).
 * Pure: every function takes the time it works from.
 */

export type MonthKey = string

const KEY = /^(\d{4})-(0[1-9]|1[0-2])$/

export function isMonthKey(v: unknown): v is MonthKey {
  return typeof v === 'string' && KEY.test(v)
}

export function monthKeyOf(d: Date): MonthKey {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`
}

function parts(key: MonthKey): { y: number; m: number } {
  const match = KEY.exec(key)
  if (!match) throw new Error('invalid_month_key')
  return { y: Number(match[1]), m: Number(match[2]) - 1 }
}

/** [start, end) of the month, as instants. */
export function monthRange(key: MonthKey): { start: Date; end: Date } {
  const { y, m } = parts(key)
  return { start: new Date(Date.UTC(y, m, 1)), end: new Date(Date.UTC(y, m + 1, 1)) }
}

/** The same range as calendar days, for date columns: [startDay, endDay). */
export function monthDays(key: MonthKey): { startDay: string; endDay: string } {
  const { start, end } = monthRange(key)
  return { startDay: start.toISOString().slice(0, 10), endDay: end.toISOString().slice(0, 10) }
}

export function shiftMonth(key: MonthKey, by: number): MonthKey {
  const { y, m } = parts(key)
  return monthKeyOf(new Date(Date.UTC(y, m + by, 1)))
}

/** The month that ended most recently: the one the 1st's report is about. */
export function lastCompleteMonth(now: Date): MonthKey {
  return shiftMonth(monthKeyOf(now), -1)
}

/** period_month as stored: the first day of the month. */
export function periodMonthOf(key: MonthKey): string {
  return `${key}-01`
}

export function monthKeyFromPeriod(periodMonth: string): MonthKey | null {
  const key = periodMonth.slice(0, 7)
  return isMonthKey(key) ? key : null
}

/**
 * The first run of the monthly cron (vercel.json: "30 8 * * *") is 08:30 UTC
 * on the 1st. The next report is due then, for the month running now.
 */
export const REPORT_HOUR_UTC = 8
export const REPORT_MINUTE_UTC = 30

export function nextReportAt(now: Date): Date {
  const thisMonthRun = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, REPORT_HOUR_UTC, REPORT_MINUTE_UTC))
  if (now < thisMonthRun) return thisMonthRun
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1, REPORT_HOUR_UTC, REPORT_MINUTE_UTC))
}
