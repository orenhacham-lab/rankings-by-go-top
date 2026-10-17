/**
 * One way to write a date, in the screen's language (UX review P2-1).
 *
 *   he  27.09.2026            27.09.2026 · 17:09
 *   en  Sep 27, 2026          Sep 27, 2026 · 5:09 PM
 *
 * The Hebrew screens used to show four formats side by side, among them the
 * American "9/27/2026" (`toLocaleDateString('en-US')`), which a Hebrew reader
 * takes for the 9th of the 27th month. English spells the month, so no reader
 * has to guess which number is the day.
 *
 * With a time, the date comes first and the time after it. On a right-to-left
 * screen two runs of digits separated by a space are laid out right to left, so
 * "27.09.2026 17:09" would read as time-then-date; each run is therefore wrapped
 * in a left-to-right isolate (U+2066 … U+2069), which keeps the date on the
 * reading side and each number intact. The string is plain text, so it works in
 * a table cell, a title attribute or an export alike.
 *
 * The clock is the viewer's own: these helpers never pin a time zone.
 */
import type { Locale } from './locales'

type DateInput = string | number | Date | null | undefined

const LRI = '⁦'
const PDI = '⁩'
const EMPTY = '—'

function toDate(value: DateInput): Date | null {
  if (value === null || value === undefined || value === '') return null
  const d = value instanceof Date ? value : new Date(value)
  return Number.isNaN(d.getTime()) ? null : d
}

export interface DateFormatter {
  /** 27.09.2026 / Sep 27, 2026. A missing or invalid date is "—". */
  date(value: DateInput): string
  /** 27.09.2026 · 17:09 / Sep 27, 2026 · 5:09 PM. A missing or invalid date is "—". */
  dateTime(value: DateInput): string
}

export function formatDate(lang: Locale): DateFormatter {
  const he = lang === 'he'
  const dateFmt = he
    ? new Intl.DateTimeFormat('he-IL', { day: '2-digit', month: '2-digit', year: 'numeric' })
    : new Intl.DateTimeFormat('en-US', { day: 'numeric', month: 'short', year: 'numeric' })
  const timeFmt = he
    ? new Intl.DateTimeFormat('he-IL', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
    : new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit' })
  const iso = (s: string) => (he ? `${LRI}${s}${PDI}` : s)
  return {
    date(value) {
      const d = toDate(value)
      return d ? dateFmt.format(d) : EMPTY
    },
    dateTime(value) {
      const d = toDate(value)
      return d ? `${iso(dateFmt.format(d))} · ${iso(timeFmt.format(d))}` : EMPTY
    },
  }
}
