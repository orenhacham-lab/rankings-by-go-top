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
  if (engine === 'google_search') return 'גוגל חיפוש'
  if (engine === 'google_maps') return 'גוגל מפות'
  return engine
}

export function getEngineDisplayLabel(
  engine: string,
  deviceType?: 'desktop' | 'mobile' | null
): string {
  const base = getEngineLabel(engine)
  if (engine !== 'google_search') return base
  if (deviceType === 'mobile') return `${base} (מובייל)`
  if (deviceType === 'desktop') return `${base} (מחשב)`
  return base
}

export function getFrequencyLabel(freq: string): string {
  if (freq === 'weekly') return 'פעם בשבוע'
  if (freq === 'monthly') return 'פעם בחודש'
  if (freq === 'monthly_first_day') return 'כל חודש ב-1 לחודש'
  return 'ידני'
}

export function truncate(str: string, maxLen: number): string {
  if (str.length <= maxLen) return str
  return str.slice(0, maxLen) + '...'
}

export function calculateNextScanDate(frequency: string, fromDate: Date = new Date()): Date | null {
  const d = new Date(fromDate)
  if (frequency === 'weekly') {
    d.setDate(d.getDate() + 7)
    return d
  }
  if (frequency === 'monthly') {
    d.setMonth(d.getMonth() + 1)
    return d
  }
  if (frequency === 'monthly_first_day') {
    d.setMonth(d.getMonth() + 1, 1)
    d.setHours(fromDate.getHours(), fromDate.getMinutes(), fromDate.getSeconds(), fromDate.getMilliseconds())
    return d
  }
  return null
}
