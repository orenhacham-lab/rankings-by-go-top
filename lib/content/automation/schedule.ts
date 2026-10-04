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
 * The next publish instant (ISO) at `publishTime` on one of the given weekdays
 * (0=Sun … 6=Sat) in `timeZone`, strictly after `from`. Falls back to the plain
 * publish-time logic when no weekdays are given. Used for both the first slot and
 * post-publish advancement when a pool has a weekday schedule.
 */
export function nextPublishAtWeekdays(
  publishTime: string,
  timeZone: string,
  weekdays: number[] | null | undefined,
  from: number = Date.now(),
): string {
  const days = (weekdays ?? []).filter((d) => Number.isInteger(d) && d >= 0 && d <= 6)
  if (days.length === 0) return computeNextPublishAt(publishTime, timeZone, from)
  const set = new Set(days)
  const [h, mi] = parseTime(publishTime)
  const { y, mo, d } = localDateParts(from, timeZone)
  // The weekday of a calendar date is timezone-independent.
  for (let k = 0; k < 21; k++) {
    const wd = new Date(Date.UTC(y, mo - 1, d + k)).getUTCDay()
    if (set.has(wd)) {
      const inst = zonedWallToUtc(y, mo, d + k, h, mi, timeZone)
      if (inst > from) return new Date(inst).toISOString()
    }
  }
  return computeNextPublishAt(publishTime, timeZone, from)
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

/**
 * SPREAD THE PLAN'S ARTICLES OVER THE BILLING CYCLE.
 *
 * The cadence the owner picked decides the slots; the plan's article allowance
 * was never consulted. A cadence with more slots before the cycle ends than
 * articles left (Basic: 4 a month on a weekly cadence has 5 Sundays in some
 * cycles; twice a week has ~8) published the allowance early and then stood
 * still, its next item failing as quota_exceeded until the cycle renewed.
 *
 * Given the cadence's next slot (`cadenceNextIso`) and `slotAfter` (the
 * cadence's next slot strictly after an instant), this keeps the cadence's own
 * slot whenever the articles left (`remaining` unconsumed + `ready` already
 * generated) cover every slot before `periodEndIso`. Otherwise it aims the next
 * publish at an even share of the time left, `(end - now) / (articles + 1)`
 * (the "+1" is the next cycle's first article), and takes the cadence's first
 * slot at or after that. Nothing left at all: the first slot of the next cycle.
 * Never earlier than the cadence's own slot. Pure; the allowance is only read.
 */
export function spreadNextPublishAt(input: {
  cadenceNextIso: string
  nowMs: number
  periodEndIso: string | null
  remaining: number
  ready: number
  slotAfter: (fromMs: number) => string
}): string {
  const next = Date.parse(input.cadenceNextIso)
  const end = input.periodEndIso ? Date.parse(input.periodEndIso) : NaN
  if (!Number.isFinite(next) || !Number.isFinite(end) || end <= input.nowMs || next >= end) return input.cadenceNextIso
  const articles = Math.max(0, Math.floor(input.remaining)) + Math.max(0, Math.floor(input.ready))

  let slots = 0
  for (let at = next, guard = 0; at < end && guard < 400; guard++) {
    slots++
    at = Date.parse(input.slotAfter(at))
    if (!Number.isFinite(at)) break
  }
  if (slots <= articles) return input.cadenceNextIso

  const target = articles <= 0 ? end : input.nowMs + (end - input.nowMs) / (articles + 1)
  if (target <= next) return input.cadenceNextIso
  const spread = input.slotAfter(Math.ceil(target) - 1)
  return Date.parse(spread) > next ? spread : input.cadenceNextIso
}

/* ─────────────────────────────────────────────────────────────────────────────
 * THE PLAN DECIDES THE RHYTHM (owner, 2026-10-02).
 *
 * Articles a week = the plan's monthly article allowance ÷ 4 (Basic 4 → 1,
 * Advanced 12 → 3), on fixed working days in the project's own time zone:
 *   1 → Sun · 2 → Sun, Wed · 3 → Sun, Tue, Thu · 4 → Sun, Mon, Tue, Thu
 *   5 → Sun–Thu · more → spread evenly over Sun–Thu, several on a day.
 * Nothing is ever published on Friday or Saturday, on any schedule.
 * ───────────────────────────────────────────────────────────────────────────── */

/** Friday and Saturday (0=Sun … 6=Sat). Never a publishing day. */
export const NO_PUBLISH_WEEKDAYS: readonly number[] = [5, 6]
export const isNoPublishWeekday = (wd: number) => NO_PUBLISH_WEEKDAYS.includes(wd)

/** The working days a given count of extra articles lands on, Sun–Thu. */
const RHYTHM_DAYS: Record<number, number[]> = { 1: [0], 2: [0, 3], 3: [0, 2, 4], 4: [0, 1, 2, 4], 5: [0, 1, 2, 3, 4] }

/**
 * NO SITE TAKES MORE THAN ONE ARTICLE A WORKING DAY (owner, 4 October 2026:
 * "if a customer added their first project and you pushed 200 articles into
 * one site straight away, that is not reasonable").
 *
 * The monthly allowance stays account-wide and shared between the account's
 * sites; this is the ceiling on what ONE of them absorbs. It only ever binds
 * on a multi-site plan with fewer sites than its allowance assumes: Premium
 * (50 a month) with a single site was scheduled 13 a week, three on some days,
 * and Agency (200) 50 a week — around ten a day into the same site. Basic (1 a
 * week) and Advanced (3) are under the ceiling and unchanged.
 *
 * Five is also the widest rhythm the weekday spread has a shape for
 * (RHYTHM_DAYS tops out at Sun-Thu); above it `weeklyRhythm` starts stacking
 * several articles on the same day.
 */
export const MAX_ARTICLES_PER_WEEK_PER_SITE = 5

/** A month is 4.35 weeks, not 4. The rate is per month, the rhythm per week. */
const WEEKS_PER_MONTH = 30.44 / 7

/**
 * A SITE WHOSE SHARE DOES NOT FIT A WHOLE NUMBER OF ARTICLES A WEEK GETS A GAP
 * IN DAYS INSTEAD OF A WEEKDAY.
 *
 * A weekly rhythm can only publish a whole number of times a week, and it
 * cannot go below once. Rounding each site to the nearest week made the
 * account's sites add up to more than the account's allowance: an Agency
 * account (200 a month) over 30 sites is 1.5 articles a week each, which
 * rounded to 2 and scheduled 261 a month, and over 100 sites it was floored at
 * one a week and scheduled 435. Nothing over-published — the account's ledger
 * stops that — but the quota then went to whichever site the runner reached
 * first, and the sites added last could get nothing in a cycle.
 *
 * So the weekly rhythm is used only where it is a close fit (within
 * WEEKLY_FIT_TOLERANCE of the real rate), which is every single-site plan and
 * every multi-site account whose sites divide the allowance evenly. Everywhere
 * else the site publishes every N days, which can express any rate.
 *
 * A tenth keeps Basic on the Sunday it has today: four a month is 0.92 of a
 * week, 8% off a weekly slot, and that much the cycle spread already absorbs.
 */
export const WEEKLY_FIT_TOLERANCE = 0.1

/** What ONE site publishes: a weekly rhythm, or a gap in days when no weekly rhythm fits. */
export interface PerSiteRate {
  /** Articles a week, 1..MAX_ARTICLES_PER_WEEK_PER_SITE. 0 when `intervalDays` carries the rate. */
  perWeek: number
  /** Days between articles, when no weekly rhythm fits the share. */
  intervalDays: number | null
}

/**
 * The rate for one site of an account: the account-wide monthly allowance
 * shared by its active queues, never above one article a working day
 * (MAX_ARTICLES_PER_WEEK_PER_SITE) and never rounded up into more than the
 * account is allowed (WEEKLY_FIT_TOLERANCE).
 */
export function perSiteRate(monthlyAllowance: number, activeQueues = 1): PerSiteRate {
  if (!(monthlyAllowance > 0)) return { perWeek: 0, intervalDays: null }
  const queues = Math.max(1, Math.floor(activeQueues))
  const perWeek = monthlyAllowance / queues / WEEKS_PER_MONTH
  // Above the ceiling the rate is deliberately not the share, so no fit is
  // asked for: the site publishes once a working day and the rest of the
  // allowance waits for the account's other sites.
  if (perWeek >= MAX_ARTICLES_PER_WEEK_PER_SITE) return { perWeek: MAX_ARTICLES_PER_WEEK_PER_SITE, intervalDays: null }
  const whole = Math.round(perWeek)
  if (whole >= 1 && Math.abs(whole - perWeek) <= WEEKLY_FIT_TOLERANCE * perWeek) return { perWeek: whole, intervalDays: null }
  const days = Math.round((queues * WEEKS_PER_MONTH * 7) / monthlyAllowance)
  return { perWeek: 0, intervalDays: Math.min(90, Math.max(2, days)) }
}

/**
 * Articles a week for one site. 0 both when there is no allowance to divide
 * and when no weekly rhythm fits the share — `perSiteRate` says which, and
 * `articlesPerMonthPerSite` answers the question either way.
 */
export function articlesPerWeekFor(monthlyAllowance: number, activeQueues = 1): number {
  return perSiteRate(monthlyAllowance, activeQueues).perWeek
}

/** What one site publishes in about a month, whichever shape its rate has. */
export function articlesPerMonthPerSite(monthlyAllowance: number, activeQueues = 1): number {
  const rate = perSiteRate(monthlyAllowance, activeQueues)
  if (rate.intervalDays) return Math.ceil(30 / rate.intervalDays)
  return Math.ceil(rate.perWeek * WEEKS_PER_MONTH)
}

/** Articles per weekday (index 0=Sun … 6=Sat) for a weekly count. Fri/Sat are always 0. */
export function weeklyRhythm(perWeek: number): number[] {
  const n = Math.max(0, Math.floor(perWeek))
  const out = [0, 0, 0, 0, 0, 0, 0]
  const base = Math.floor(n / 5)
  for (let wd = 0; wd <= 4; wd++) out[wd] = base
  for (const wd of RHYTHM_DAYS[n % 5] ?? []) out[wd]!++
  return out
}

/** The weekdays a rhythm publishes on, in order. */
export const rhythmWeekdays = (perDay: number[]) => perDay.map((n, wd) => (n > 0 && !isNoPublishWeekday(wd) ? wd : -1)).filter((wd) => wd >= 0)

/** Minutes after local midnight for `n` articles on one day: hourly from the
 *  publish time, pulled earlier when the last one would run past 23:30. */
export function daySlotMinutes(startMinute: number, n: number): number[] {
  const count = Math.max(1, Math.min(88, Math.floor(n)))
  if (count === 1) return [startMinute]
  const gap = Math.max(15, Math.min(60, Math.floor((22 * 60) / (count - 1))))
  const start = Math.max(0, Math.min(startMinute, 23 * 60 + 30 - (count - 1) * gap))
  return Array.from({ length: count }, (_, j) => start + j * gap)
}

/** The local weekday (0=Sun … 6=Sat) of an instant in `timeZone`. */
export function localWeekday(instant: number, timeZone: string): number {
  const { y, mo, d } = localDateParts(instant, timeZone)
  return new Date(Date.UTC(y, mo - 1, d)).getUTCDay()
}

/** The next slot of a plan rhythm strictly after `from`, in `timeZone`. */
export function nextRhythmSlotAt(publishTime: string, timeZone: string, perDay: number[], from: number = Date.now()): string {
  const [h, mi] = parseTime(publishTime)
  const { y, mo, d } = localDateParts(from, timeZone)
  for (let k = 0; k < 15; k++) {
    const wd = new Date(Date.UTC(y, mo - 1, d + k)).getUTCDay()
    const n = isNoPublishWeekday(wd) ? 0 : (perDay[wd] ?? 0)
    if (n <= 0) continue
    for (const m of daySlotMinutes(h * 60 + mi, n)) {
      const inst = zonedWallToUtc(y, mo, d + k, Math.floor(m / 60), m % 60, timeZone)
      if (inst > from) return new Date(inst).toISOString()
    }
  }
  return skipNoPublishDays(computeNextPublishAt(publishTime, timeZone, from), timeZone, publishTime)
}

/** The owner's chosen weekdays without Friday and Saturday (Sunday if nothing is left). */
export function workingPublishDays(days: number[] | null | undefined): number[] {
  const list = (days ?? []).filter((d) => Number.isInteger(d) && d >= 0 && d <= 6)
  if (list.length === 0) return []
  const kept = list.filter((d) => !isNoPublishWeekday(d))
  return kept.length ? kept : [0]
}

/** A slot on Friday or Saturday moves to the following Sunday, same wall time. */
export function skipNoPublishDays(iso: string, timeZone: string, publishTime: string): string {
  const at = Date.parse(iso)
  if (!Number.isFinite(at) || !isNoPublishWeekday(localWeekday(at, timeZone))) return iso
  const [h, mi] = parseTime(publishTime)
  const { y, mo, d } = localDateParts(at, timeZone)
  const wd = new Date(Date.UTC(y, mo - 1, d)).getUTCDay()
  return new Date(zonedWallToUtc(y, mo, d + (7 - wd), h, mi, timeZone)).toISOString()
}

/**
 * The one slot function every caller uses (runner, pool routes, the screen's
 * projection): the plan's rhythm when there is one, otherwise the owner's own
 * schedule (weekdays, or every N days anchored on `anchorIso`), and never a
 * Friday or Saturday either way.
 */
export function makeSlotAfter(input: {
  publishTime: string
  timeZone: string
  perDay: number[] | null
  publishDays: number[] | null | undefined
  intervalDays: number
  anchorIso: string | null
  /**
   * The gap the PLAN gives this site when its share is below a weekly rhythm
   * (perSiteRate). Like `perDay` it outranks `publishDays`, because the plan
   * decides the rhythm and the owner's own weekdays would publish far more
   * than the account is allowed.
   */
  planIntervalDays?: number | null
}): (fromMs: number) => string {
  const { publishTime, timeZone, perDay } = input
  if (perDay && perDay.some((n, wd) => n > 0 && !isNoPublishWeekday(wd))) {
    return (fromMs) => nextRhythmSlotAt(publishTime, timeZone, perDay, fromMs)
  }
  const planInterval = input.planIntervalDays && input.planIntervalDays > 0 ? Math.floor(input.planIntervalDays) : null
  if (planInterval) {
    return (fromMs) => {
      const anchor = input.anchorIso && Number.isFinite(Date.parse(input.anchorIso)) ? input.anchorIso : null
      const next = anchor ? advanceNextPublishAt(anchor, timeZone, publishTime, planInterval, fromMs) : computeNextPublishAt(publishTime, timeZone, fromMs)
      return skipNoPublishDays(next, timeZone, publishTime)
    }
  }
  const days = workingPublishDays(input.publishDays)
  if (days.length) return (fromMs) => nextPublishAtWeekdays(publishTime, timeZone, days, fromMs)
  return (fromMs) => {
    const anchor = input.anchorIso && Number.isFinite(Date.parse(input.anchorIso)) ? input.anchorIso : null
    const next = anchor ? advanceNextPublishAt(anchor, timeZone, publishTime, input.intervalDays, fromMs) : computeNextPublishAt(publishTime, timeZone, fromMs)
    return skipNoPublishDays(next, timeZone, publishTime)
  }
}

/**
 * Whether a stored slot still belongs to the schedule: never Friday/Saturday,
 * and with a plan rhythm, on one of the rhythm's days. A slot stored before the
 * plan decided the rhythm (an owner's Wednesday on Basic) is realigned, not
 * published.
 */
export function slotFitsRhythm(iso: string | null, timeZone: string, perDay: number[] | null): boolean {
  const at = iso ? Date.parse(iso) : NaN
  if (!Number.isFinite(at)) return true
  const wd = localWeekday(at, timeZone)
  if (isNoPublishWeekday(wd)) return false
  return perDay ? (perDay[wd] ?? 0) > 0 : true
}

/**
 * The publish dates of the next `count` queued items, the way the runner will
 * produce them: each one at the schedule's next slot, spread over what is left
 * of the billing cycle when the allowance is known (spreadNextPublishAt), and a
 * new cycle restoring the plan's monthly allowance.
 */
export function projectPublishDates(input: {
  firstIso: string
  count: number
  slotAfter: (fromMs: number) => string
  cycle: { periodStartIso: string | null; periodEndIso: string; articlesLeft: number; perCycle: number } | null
}): string[] {
  const out: string[] = []
  let cursor = input.firstIso
  const c = input.cycle
  let end = c ? Date.parse(c.periodEndIso) : NaN
  const start = c?.periodStartIso ? Date.parse(c.periodStartIso) : NaN
  const len = Number.isFinite(start) && end > start ? end - start : 30 * 86_400_000
  let left = c ? Math.max(0, Math.floor(c.articlesLeft)) : 0
  for (let i = 0; i < input.count; i++) {
    out.push(cursor)
    if (i === input.count - 1) break
    const at = Date.parse(cursor)
    if (!Number.isFinite(at)) break
    const nowMs = at + 60_000
    const cadenceNextIso = input.slotAfter(nowMs)
    if (!c || !Number.isFinite(end)) { cursor = cadenceNextIso; continue }
    for (let g = 0; at >= end && g < 60; g++) { end += len; left = c.perCycle }
    left = Math.max(0, left - 1)
    cursor = spreadNextPublishAt({ cadenceNextIso, nowMs, periodEndIso: new Date(end).toISOString(), remaining: left, ready: 0, slotAfter: input.slotAfter })
  }
  return out
}
