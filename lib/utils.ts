import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatDate(date: string | Date | null, options?: Intl.DateTimeFormatOptions): string {
  if (!date) return '—'
  const d = typeof date === 'string' ? new Date(date) : date
  return d.toLocaleDateString('he-IL', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    ...options,
  })
}

export function formatDateTime(date: string | Date | null): string {
  if (!date) return '—'
  const d = typeof date === 'string' ? new Date(date) : date
  return d.toLocaleString('he-IL', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
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
    if (device === 'mobile') return 'גוגל אורגני — מובייל'
    return 'גוגל אורגני — מחשב'
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
