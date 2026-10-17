/**
 * Dates on the content strategy tab, in the merchant's language. The board's months
 * are keyed 'YYYY-MM' in the browser's time zone (lib/content/strategy/board.ts
 * monthKey), and these turn keys and times into words.
 */
import { intlLocaleOf, type PublicLocale } from '@/lib/i18n/locales'

const intlLocale = intlLocaleOf

/** "12 Oct" / "12 באוק׳". */
export function shortDate(iso: string | null, lang: PublicLocale): string | null {
  if (!iso) return null
  const ms = Date.parse(iso)
  if (!Number.isFinite(ms)) return null
  return new Intl.DateTimeFormat(intlLocale(lang), { day: 'numeric', month: 'short' }).format(new Date(ms))
}

/** The parts of the next article's date tile: weekday, day of the month, month. */
export function dateTile(iso: string | null, lang: PublicLocale): { weekday: string; day: string; month: string } | null {
  if (!iso) return null
  const ms = Date.parse(iso)
  if (!Number.isFinite(ms)) return null
  const d = new Date(ms)
  const f = (o: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat(intlLocale(lang), o).format(d)
  return { weekday: f({ weekday: 'long' }), day: f({ day: 'numeric' }), month: f({ month: 'long' }) }
}

/** A month chip's label: the month, and its year only when it is not this year. */
export function monthLabel(key: string, lang: PublicLocale, now: Date = new Date()): string {
  const [y, m] = key.split('-').map(Number)
  if (!y || !m) return key
  const d = new Date(Date.UTC(y, m - 1, 15))
  const withYear = y !== now.getFullYear()
  return new Intl.DateTimeFormat(intlLocale(lang), { month: 'long', ...(withYear ? { year: 'numeric' } : {}), timeZone: 'UTC' }).format(d)
}

export function fill(template: string, values: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (_, k: string) => (k in values ? String(values[k]) : `{${k}}`))
}

/** "Sunday, 4 October" / "יום ראשון, 4 באוקטובר": a publish date in a sentence. */
export function longDate(iso: string | null, lang: PublicLocale): string | null {
  if (!iso) return null
  const ms = Date.parse(iso)
  if (!Number.isFinite(ms)) return null
  return new Intl.DateTimeFormat(intlLocale(lang), { weekday: 'long', day: 'numeric', month: 'long' }).format(new Date(ms))
}
