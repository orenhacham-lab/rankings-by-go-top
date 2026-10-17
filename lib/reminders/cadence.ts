/**
 * When a reminder about articles waiting for approval may go out. Pure: the clock and the
 * stored state come in, one decision comes out, so every rule runs under test.
 *
 * THE RULES (UX decisions, E):
 *   - the first email when the oldest waiting article has been ready for 48 hours;
 *   - the second 5 days after the first, if the same articles still wait;
 *   - then weekly, and at most 3 emails in all for the same articles;
 *   - never more than one email per project in 72 hours (whatever the batch);
 *   - only at 09:00 Asia/Jerusalem (the hour of 09:00 to 09:59), Sunday to Thursday;
 *   - nothing once nothing waits, and nothing for an owner who turned reminders off.
 * "The same articles" is the oldest waiting article: while it waits, the count goes on;
 * once it is approved, what still waits is a new batch with its own count.
 */
export const FIRST_AFTER_MS = 48 * 3_600_000
export const SECOND_AFTER_MS = 5 * 86_400_000
export const WEEKLY_AFTER_MS = 7 * 86_400_000
export const MIN_GAP_MS = 72 * 3_600_000
export const MAX_PER_BATCH = 3
export const SEND_HOUR = 9
export const SEND_ZONE = 'Asia/Jerusalem'

export interface ReminderState {
  batchKey: string | null
  sentCount: number
  lastSentAt: string | null
  enabled: boolean
}

export type ReminderDecision =
  | { send: true; sentCount: number }
  | { send: false; reason: 'disabled' | 'nothing_waiting' | 'too_soon' | 'batch_done' | 'min_gap' }

const ISRAEL_DAY = new Intl.DateTimeFormat('en-US', { timeZone: SEND_ZONE, weekday: 'short' })
const ISRAEL_HOUR = new Intl.DateTimeFormat('en-GB', { timeZone: SEND_ZONE, hour: '2-digit', hourCycle: 'h23' })

/** Sunday to Thursday, 09:00 to 09:59 in Israel (summer and winter time alike). */
export function inSendWindow(now: Date): boolean {
  const day = ISRAEL_DAY.format(now)
  const hour = Number(ISRAEL_HOUR.format(now))
  return ['Sun', 'Mon', 'Tue', 'Wed', 'Thu'].includes(day) && hour === SEND_HOUR
}

const ms = (iso: string | null): number => {
  const t = iso ? Date.parse(iso) : NaN
  return Number.isFinite(t) ? t : NaN
}

export function decideReminder(input: {
  now: Date
  /** The oldest waiting article: its id and when it became ready; null when nothing waits. */
  oldest: { id: string; readyAt: string } | null
  state: ReminderState | null
}): ReminderDecision {
  const { now, oldest } = input
  const state = input.state ?? { batchKey: null, sentCount: 0, lastSentAt: null, enabled: true }
  if (!state.enabled) return { send: false, reason: 'disabled' }
  if (!oldest) return { send: false, reason: 'nothing_waiting' }

  const t = now.getTime()
  const last = ms(state.lastSentAt)
  // One email per project per 72 hours, across batches.
  if (Number.isFinite(last) && t - last < MIN_GAP_MS) return { send: false, reason: 'min_gap' }

  const sameBatch = state.batchKey === oldest.id
  const sent = sameBatch ? state.sentCount : 0
  if (sent >= MAX_PER_BATCH) return { send: false, reason: 'batch_done' }

  if (sent === 0) {
    const ready = ms(oldest.readyAt)
    return Number.isFinite(ready) && t - ready >= FIRST_AFTER_MS ? { send: true, sentCount: 1 } : { send: false, reason: 'too_soon' }
  }
  // A batch already mailed: the gap since ITS last email (this project's last email, here).
  const gap = sent === 1 ? SECOND_AFTER_MS : WEEKLY_AFTER_MS
  return Number.isFinite(last) && t - last >= gap ? { send: true, sentCount: sent + 1 } : { send: false, reason: 'too_soon' }
}
