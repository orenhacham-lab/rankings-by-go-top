/**
 * When the outbound channel is allowed to send, and how much.
 *
 * WHY A RAMP AT ALL. trygotopseo.com is a young sending domain with almost no
 * history. Mailbox providers decide what to do with a domain mostly from how it
 * behaves over its first weeks, and a domain that goes from five messages a day
 * to fifty is the exact shape of a compromised account. The cost of being wrong
 * is not this channel: it is the customer mail — the signup, reminder and report
 * emails — quietly landing in spam for everyone. So the ramp is the approved
 * plan (`/mnt/project-files/outreach/sending-plan-2026-10-11.md`): five a day in
 * the first week, then ten, then twenty, and a ceiling of thirty.
 *
 * WHY THE WINDOW IS DERIVED FROM THE QUOTA RATHER THAN FIXED. The plan says
 * 09:00–11:00 Eastern, which it could, because five messages at the 5–15 minute
 * spacing it also requires fit in two hours. Ten do not. Rather than quietly
 * breaking one rule to keep the other, the window is computed from the quota at
 * the spacing the cron actually gives — and at a quota of five it comes out at
 * 09:00–11:00 exactly, so week one is the approved plan unchanged and the later
 * widening is a consequence of the ramp rather than a second decision.
 *
 * WHY THE SPACING IS NOT IMPLEMENTED HERE. One message per cron pass, and the
 * cron runs every fifteen minutes, so the spacing is a property of the schedule
 * rather than something this process waits for. A serverless function that
 * sleeps between sends is a function that is killed halfway through a wave.
 *
 * WHY EASTERN AND NOT UTC. The window exists so that a message arrives during
 * the recipient's working morning, which is a fact about their clock, not ours.
 * `Intl` is asked for the offset on the day in question so that the two
 * daylight-saving shifts — which fall on different dates in the US and in
 * Israel — move the window by themselves.
 */

/** The ceiling the plan sets, whatever the ramp would otherwise reach. */
export const DAILY_CAP = 30
/** Messages a day, by week of the channel's life. The last value repeats. */
export const RAMP: readonly number[] = [5, 10, 20, DAILY_CAP]
/** The window opens at this hour, recipient's time. */
export const WINDOW_OPEN_HOUR = 9
/** And never runs past this hour, however large the quota. */
export const WINDOW_LAST_HOUR = 17
/** What the 15-minute cron gives between two sends. */
export const PASS_MINUTES = 15
/** Passes of slack so a skipped or failed pass does not cost the day's quota. */
export const SLACK_PASSES = 3
/** Days after message one before message two may go. */
export const SECOND_MESSAGE_DAYS = 7
/**
 * Permanent rejections at submission in one day before the channel stops
 * itself. The plan's wording is "two hard bounces in a day"; a 5xx from the
 * submission server is the part of that this process can see on its own.
 */
export const DAILY_FAILURE_STOP = 2

const DAY_MS = 24 * 60 * 60 * 1000

export const SENDING_TIME_ZONE = 'America/New_York'

export interface LocalTime {
  /** 1 = Monday ... 7 = Sunday, as ISO numbers them. */
  weekday: number
  hour: number
  minute: number
  /** The local calendar day, "2026-10-16", which is what a daily quota counts over. */
  day: string
}

const WEEKDAYS: Record<string, number> = {
  Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7,
}

/**
 * The recipient's wall clock for an instant. Asked of `Intl` rather than
 * computed, because the alternative is hard-coding when the United States
 * changes its clocks.
 */
export function localTime(now: Date, timeZone = SENDING_TIME_ZONE): LocalTime {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    weekday: 'short',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit',
    hour12: false,
  }).formatToParts(now)
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? ''
  // Intl gives midnight as hour 24 in some runtimes; the modulo makes both agree.
  const hour = Number(get('hour')) % 24
  return {
    weekday: WEEKDAYS[get('weekday')] ?? 0,
    hour,
    minute: Number(get('minute')),
    day: `${get('year')}-${get('month')}-${get('day')}`,
  }
}

/**
 * The day's quota, from how long the channel has been sending.
 *
 * `channelStartedAt` is the first message the channel ever sent, read from the
 * table rather than written down, so the ramp cannot drift out of step with
 * what actually happened. Before the first message there is no ramp to be on:
 * the quota is the first week's.
 */
export function dailyQuota(now: Date, channelStartedAt: Date | null): number {
  if (channelStartedAt === null) return RAMP[0]
  const elapsed = now.getTime() - channelStartedAt.getTime()
  if (!Number.isFinite(elapsed) || elapsed < 0) return RAMP[0]
  const week = Math.floor(elapsed / (7 * DAY_MS))
  return RAMP[Math.min(week, RAMP.length - 1)]
}

/** The last minute of the window, as minutes after midnight, for a given quota. */
export function windowEndMinute(quota: number): number {
  const needed = (Math.max(0, quota) + SLACK_PASSES) * PASS_MINUTES
  return Math.min(WINDOW_OPEN_HOUR * 60 + needed, WINDOW_LAST_HOUR * 60)
}

export type WindowVerdict =
  | { open: true; day: string }
  | { open: false; reason: 'weekend' | 'before_window' | 'after_window' }

/**
 * Whether this instant is inside the sending window.
 *
 * Saturday and Sunday are refused outright: the plan is Monday to Friday, and a
 * cold message that lands on a Sunday reads as automated whatever it says.
 */
export function sendWindow(now: Date, quota: number, timeZone = SENDING_TIME_ZONE): WindowVerdict {
  const local = localTime(now, timeZone)
  if (local.weekday >= 6 || local.weekday === 0) return { open: false, reason: 'weekend' }
  const minute = local.hour * 60 + local.minute
  if (minute < WINDOW_OPEN_HOUR * 60) return { open: false, reason: 'before_window' }
  if (minute >= windowEndMinute(quota)) return { open: false, reason: 'after_window' }
  return { open: true, day: local.day }
}

/** The columns the choice of next message reads. */
export interface ProspectScheduleRow {
  status: string
  email: string | null
  first_sent_at: string | null
  second_sent_at: string | null
  replied_at: string | null
}

export type NextMessage = 'first' | 'second' | null

/**
 * Which message, if any, this prospect is due.
 *
 * Every branch is a refusal unless it is plainly a send, because the two things
 * that must never happen are a third message and a message to someone who
 * replied or opted out. A redacted row (`email === null`) is one whose address
 * we deleted on request; there is nothing left to send to and nothing to
 * restore.
 */
export function nextMessageFor(row: ProspectScheduleRow, now: Date): NextMessage {
  if (row.email === null) return null
  if (row.replied_at !== null) return null
  if (row.status === 'opted_out' || row.status === 'disqualified' || row.status === 'replied') return null
  if (row.second_sent_at !== null) return null

  if (row.first_sent_at === null) return row.status === 'new' ? 'first' : null
  if (row.status !== 'sent_first') return null
  const sentAt = Date.parse(row.first_sent_at)
  if (Number.isNaN(sentAt)) return null
  return sentAt <= now.getTime() - SECOND_MESSAGE_DAYS * DAY_MS ? 'second' : null
}

/** The UTC instant a local day began, which is the bound a daily count needs. */
export function startOfLocalDayUtc(now: Date, timeZone = SENDING_TIME_ZONE): Date {
  const local = localTime(now, timeZone)
  const minutes = local.hour * 60 + local.minute
  const midnight = new Date(now.getTime() - minutes * 60_000)
  // Back to the start of the minute, so a count's bound does not depend on seconds.
  midnight.setUTCSeconds(0, 0)
  return midnight
}
