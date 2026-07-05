/**
 * Content-automation scheduling helpers (Phase 4 — management only, no cron).
 *
 * Timezone-correct "next publish" math with no external date library. Cadence is
 * modeled as an interval in days (v1 has no per-weekday selection — see the
 * limitation note in the phase summary), plus a wall-clock publish time in the
 * pool's timezone.
 */

export const DEFAULT_TIMEZONE = 'Asia/Jerusalem'
export const DEFAULT_PUBLISH_TIME = '09:00'
export type Cadence = 'daily' | 'weekly' | 'monthly' | 'custom'

/** Normalize cadence + interval_days to a positive whole-day interval. */
export function resolveIntervalDays(cadence: Cadence, intervalDays: number | null | undefined): number {
  if (typeof intervalDays === 'number' && intervalDays > 0) return Math.min(365, Math.floor(intervalDays))
  switch (cadence) {
    case 'daily': return 1
    case 'weekly': return 7
    case 'monthly': return 30
    default: return 7
  }
}

/** Parse "HH:MM" → [hour, minute], defaulting safely. */
function parseTime(publishTime: string | null | undefined): [number, number] {
  const m = /^(\d{1,2}):(\d{2})$/.exec((publishTime || '').trim())
  if (!m) return [9, 0]
  const h = Math.min(23, Math.max(0, Number(m[1])))
  const mi = Math.min(59, Math.max(0, Number(m[2])))
  return [h, mi]
}

/** ms to add to a UTC instant so its wall-clock in `timeZone` equals the UTC fields. */
function tzOffsetMs(instant: number, timeZone: string): number {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone, hour12: false,
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit',
  })
  const map: Record<string, number> = {}
  for (const p of dtf.formatToParts(new Date(instant))) if (p.type !== 'literal') map[p.type] = Number(p.value)
  const asUTC = Date.UTC(map.year!, (map.month! - 1), map.day!, map.hour!, map.minute!, map.second!)
  return asUTC - instant
}

/** Convert a wall-clock time in `timeZone` to a UTC instant (DST-correct). */
function zonedWallToUtc(y: number, mo1: number, d: number, h: number, mi: number, timeZone: string): number {
  const guess = Date.UTC(y, mo1 - 1, d, h, mi, 0) // mo1 is 1-based; Date.UTC normalizes overflow
  const offset = tzOffsetMs(guess, timeZone)
  return guess - offset
}

/** Local Y/M/D (1-based month) of an instant in `timeZone`. */
function localDateParts(instant: number, timeZone: string): { y: number; mo: number; d: number } {
  const dtf = new Intl.DateTimeFormat('en-US', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' })
  const map: Record<string, number> = {}
  for (const p of dtf.formatToParts(new Date(instant))) if (p.type !== 'literal') map[p.type] = Number(p.value)
  return { y: map.year!, mo: map.month!, d: map.day! }
}

/**
 * The next publish instant (ISO) at `publishTime` in `timeZone` strictly after
 * `from`. Used for a pool's first/next slot.
 */
export function computeNextPublishAt(
  publishTime: string,
  timeZone: string,
  from: number = Date.now(),
): string {
  const [h, mi] = parseTime(publishTime)
  const { y, mo, d } = localDateParts(from, timeZone)
  let k = 0
  let inst = zonedWallToUtc(y, mo, d + k, h, mi, timeZone)
  // Guard against pathological DST loops.
  while (inst <= from && k < 8) { k++; inst = zonedWallToUtc(y, mo, d + k, h, mi, timeZone) }
  return new Date(inst).toISOString()
}

/**
 * Projected publish instant (ISO) for queue position `index` (0-based): the base
 * slot + index * intervalDays at the same wall time. Display-only in Phase 4.
 */
export function projectedPublishAt(
  baseIso: string,
  publishTime: string,
  timeZone: string,
  intervalDays: number,
  index: number,
): string {
  const base = Date.parse(baseIso)
  if (!Number.isFinite(base)) return baseIso
  if (index <= 0) return baseIso
  const [h, mi] = parseTime(publishTime)
  const { y, mo, d } = localDateParts(base, timeZone)
  return new Date(zonedWallToUtc(y, mo, d + index * Math.max(1, intervalDays), h, mi, timeZone)).toISOString()
}

/**
 * After a publish, the next slot: step forward from `fromIso` by `intervalDays`
 * (at the same wall time) until strictly after `now`. Catches up correctly even
 * when the cron ran late (e.g. a daily cron for an hourly-ish cadence).
 */
export function advanceNextPublishAt(
  fromIso: string,
  timeZone: string,
  publishTime: string,
  intervalDays: number,
  now: number = Date.now(),
): string {
  const [h, mi] = parseTime(publishTime)
  const start = Number.isFinite(Date.parse(fromIso)) ? Date.parse(fromIso) : now
  const { y, mo, d } = localDateParts(start, timeZone)
  const step = Math.max(1, intervalDays)
  let k = step
  let inst = zonedWallToUtc(y, mo, d + k, h, mi, timeZone)
  let guard = 0
  while (inst <= now && guard < 500) { k += step; inst = zonedWallToUtc(y, mo, d + k, h, mi, timeZone); guard++ }
  return new Date(inst).toISOString()
}
