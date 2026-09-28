import { clsx, type ClassValue } from 'clsx'
import { extendTailwindMerge } from 'tailwind-merge'
import { formatDate as formatDateIn } from '@/lib/format/date'
import type { Locale } from '@/lib/i18n/locales'

/**
 * tailwind-merge only knows Tailwind's own scale, so it read the design tokens'
 * type steps (`text-copy`, `text-caption`, …) as COLOURS: `cn('text-caption
 * text-muted')` kept the colour and silently dropped the size. It is told the
 * token names here — the same names as the @theme block in app/globals.css —
 * so a size and a colour are two things again, and a later radius or shadow
 * still replaces an earlier one.
 */
const twMerge = extendTailwindMerge({
  extend: {
    theme: {
      text: ['display', 'title', 'metric', 'section', 'copy', 'caption', 'overline'],
      radius: ['card', 'inset', 'control', 'pill'],
      shadow: ['card', 'control', 'pop'],
    },
  },
})

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * A day, in the screen's language. Both helpers are the one date formatter
 * (lib/format/date.ts); a caller that does not pass the language gets Hebrew,
 * as every caller did before the language was a parameter.
 */
export function formatDate(date: string | Date | null, lang: Locale = 'he'): string {
  return formatDateIn(date, lang, 'full')
}

/** A day and its time, in the screen's language (lib/format/date.ts). */
export function formatDateTime(date: string | Date | null, lang: Locale = 'he'): string {
  return formatDateIn(date, lang, 'dateTime')
}

export function positionChange(current: number | null, previous: number | null): number | null {
  if (current === null || previous === null) return null
  // Lower position number = better ranking, so improvement = positive change
  return previous - current
}

export function getChangeLabel(change: number | null): string {
  if (change === null) return '—'
  if (change > 0) return `▲ ${change}`
  if (change < 0) return `▼ ${Math.abs(change)}`
  return '='
}

export function getEngineLabel(engine: string): string {
  if (engine === 'google_search') return 'גוגל אורגני'
  if (engine === 'google_maps') return 'גוגל מפות'
  return engine
}

export function getDeviceLabel(device: string | null | undefined): string {
  if (device === 'desktop') return 'מחשב'
  if (device === 'mobile') return 'מובייל'
  return 'ברירת מחדל'
}

export function getSearchTypeLabel(engine: string, device: string | null | undefined): string {
  if (engine === 'google_search') {
    if (device === 'mobile') return 'גוגל אורגני · מובייל'
    return 'גוגל אורגני · מחשב'
  }
  if (engine === 'google_maps') return 'גוגל מפות'
  return engine
}

// Phase 3 — weekly rank scanning removed. Only 'manual' and 'monthly' remain.
export function getFrequencyLabel(freq: string): string {
  if (freq === 'monthly') return 'פעם בחודש'
  return 'ידני'
}

export function truncate(str: string, maxLen: number): string {
  if (str.length <= maxLen) return str
  return str.slice(0, maxLen) + '...'
}

/** Phase 3 — the only two allowed rank-scan cadence values. Server-side
 *  allowlist used at every project create/update path — independent of the
 *  DB CHECK constraint, which was previously the ONLY enforcement (no
 *  application-level validation existed at all). */
export const VALID_SCAN_FREQUENCIES = ['manual', 'monthly'] as const
export type ScanFrequency = (typeof VALID_SCAN_FREQUENCIES)[number]
export function isValidScanFrequency(value: unknown): value is ScanFrequency {
  return typeof value === 'string' && (VALID_SCAN_FREQUENCIES as readonly string[]).includes(value)
}

/** Phase 3 — weekly and monthly_first_day removed (the latter was bugged
 *  into daily re-scanning — see supabase/migrations/20260829000000_add_usage_reservations_and_billing_periods.sql). Only
 *  'manual' (returns null — no auto-scheduling) and 'monthly' remain. */
export function calculateNextScanDate(frequency: string, fromDate: Date = new Date()): Date | null {
  const d = new Date(fromDate)
  if (frequency === 'monthly') {
    d.setMonth(d.getMonth() + 1)
    return d
  }
  return null
}


export function getEngineDisplayLabel(engine: string, device?: string | null): string {
  return getSearchTypeLabel(engine, device)
}
