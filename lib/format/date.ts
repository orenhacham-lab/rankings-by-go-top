/**
 * THE ONE DATE FORMATTER of the dashboard, in the screen's language.
 *
 * The UX review (P2-1) found four formats on one screen: 27.09.2026, "26 בספט'",
 * 9/27/2026 and "17:09 ,27.09.2026". Every screen now asks this module:
 *
 *   'full'      tables and facts        he 27.09.2026        en Sep 27, 2026
 *   'dateTime'  a check or a sync time  he 27.09.2026 · 17:09   en Sep 27, 2026 · 17:09
 *   'relative'  cards and feeds         he לפני 3 ימים       en 3 days ago
 *
 * In Hebrew the time comes after the date (to its left), and each figure is wrapped
 * in a left-to-right isolate, so "27.09.2026" and "17:09" never swap places or pull
 * the separator to the wrong side the way the old comma did.
 *
 * Pure, no React. An unreadable or missing value is '—'.
 */
import type { Locale } from '@/lib/i18n/locales'

export type DateStyle = 'full' | 'dateTime' | 'relative'

/** Left-to-right isolate: the figure keeps its own order inside a right-to-left line. */
const LRI = '⁦'
const PDI = '⁩'
export const EMPTY_DATE = '—'

function intlLocale(lang: Locale): string {
  return lang === 'he' ? 'he-IL' : 'en-US'
}

function toDate(value: string | number | Date | null | undefined): Date | null {
  if (value === null || value === undefined || value === '') return null
  const d = value instanceof Date ? value : new Date(value)
  return Number.isFinite(d.getTime()) ? d : null
}

function isolate(text: string, lang: Locale): string {
  return lang === 'he' ? `${LRI}${text}${PDI}` : text
}

function dayPart(d: Date, lang: Locale): string {
  return lang === 'he'
    ? new Intl.DateTimeFormat('he-IL', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(d)
    : new Intl.DateTimeFormat('en-US', { day: 'numeric', month: 'short', year: 'numeric' }).format(d)
}

function timePart(d: Date, lang: Locale): string {
  return new Intl.DateTimeFormat(intlLocale(lang), { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(d)
}

/** "3 days ago" / "in 2 days": the largest unit that reads naturally. */
function relativePart(d: Date, now: Date, lang: Locale): string {
  const diffSec = Math.round((d.getTime() - now.getTime()) / 1000)
  const rtf = new Intl.RelativeTimeFormat(lang, { numeric: 'auto' })
  const abs = Math.abs(diffSec)
  if (abs < 45) return rtf.format(0, 'second')
  if (abs < 45 * 60) return rtf.format(Math.round(diffSec / 60), 'minute')
  if (abs < 22 * 3600) return rtf.format(Math.round(diffSec / 3600), 'hour')
  if (abs < 26 * 86400) return rtf.format(Math.round(diffSec / 86400), 'day')
  if (abs < 320 * 86400) return rtf.format(Math.round(diffSec / (30 * 86400)), 'month')
  return rtf.format(Math.round(diffSec / (365 * 86400)), 'year')
}

export function formatDate(
  value: string | number | Date | null | undefined,
  lang: Locale,
  style: DateStyle = 'full',
  now: Date = new Date(),
): string {
  const d = toDate(value)
  if (!d) return EMPTY_DATE
  if (style === 'relative') return relativePart(d, now, lang)
  const day = isolate(dayPart(d, lang), lang)
  if (style === 'full') return day
  return `${day} · ${isolate(timePart(d, lang), lang)}`
}
