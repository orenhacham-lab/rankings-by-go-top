/**
 * A MORNING WHERE THE BLOG PUBLISHED NOTHING, SAID OUT LOUD.
 *
 * On 6 Nov 2026 not one article was published, in any of the ten languages.
 * Nothing in blog_plan was touched that day, so the runner never got as far as
 * a read: it was not a gate, not an empty queue, not a model refusing a claim.
 * It was found three days later, by someone counting rows, and the cause can no
 * longer be established — this plan keeps runtime logs for one hour.
 *
 * That is the real defect. A whole silent morning looks exactly like a healthy
 * one from the outside: the cron answers 202 every fifteen minutes either way,
 * and `[blog-window] run complete` simply does not appear. Nobody is watching
 * for the absence of a line.
 *
 * So the window reports its own silence. One read, once a day, in the first
 * quarter of an hour after the window closes: if no language published today,
 * one email to the operator's own address, through the channel that already
 * exists for operator alerts (lib/notifications/operator-alerts.ts) and under
 * the same kill switch. Not a digest, and nothing on a normal morning: an alert
 * that arrives daily is an alert nobody reads.
 *
 * WHY NO STATE IS KEPT, and why it is still at most one email a day: the alert
 * fires only in the hour after the window, in the minutes before :15, which the
 * fifteen-minute cron reaches once. A missed slot means no alert that day, and
 * that is the right trade against a migration to the production database for a
 * single boolean — the same cron that would have carried the row is the one that
 * carries the check.
 *
 * The decision is pure (`silentMorningVerdict`), so every branch is exercisable
 * offline; only the read and the send are not.
 */

import type { createAdminClient } from '@/lib/supabase/admin'
import { localesPublishedSince } from '@/lib/blog/auto/store'
import { localesForDay } from '@/lib/blog/auto/rotation'
import { startOfUtcDay, WINDOW_HOURS_UTC } from '@/lib/blog/auto/window-hours'
import { deliverOperatorEmail, operatorAlertShell, type AlertDeps } from '@/lib/notifications/operator-alerts'

type Admin = ReturnType<typeof createAdminClient>

/** The hour after the window closes, UTC. */
export const SILENCE_CHECK_HOUR_UTC = Math.max(...WINDOW_HOURS_UTC) + 1
/** Only the first cron slot of that hour, so the check runs once a day. */
export const SILENCE_CHECK_BEFORE_MINUTE = 15

export type SilenceVerdict =
  | { check: false; reason: 'wrong_hour' | 'already_past_first_slot' }
  | { check: true }

/** Whether this invocation is the day's one silence check. Pure. */
export function silentMorningVerdict(nowMs: number): SilenceVerdict {
  const d = new Date(nowMs)
  if (d.getUTCHours() !== SILENCE_CHECK_HOUR_UTC) return { check: false, reason: 'wrong_hour' }
  if (d.getUTCMinutes() >= SILENCE_CHECK_BEFORE_MINUTE) {
    return { check: false, reason: 'already_past_first_slot' }
  }
  return { check: true }
}

/** The email, in the language its one reader reads. Pure. */
export function silentMorningEmail(nowMs: number, expectedLocales: number): { subject: string; html: string } {
  const day = new Date(nowMs).toISOString().slice(0, 10)
  return {
    subject: `הבלוג לא פרסם הבוקר אף מאמר (${day})`,
    html: operatorAlertShell('הבוקר הסתיים בלי אף מאמר', [
      ['התאריך', day],
      ['שפות שהיו אמורות לפרסם', String(expectedLocales)],
      ['שפות שפרסמו', '0'],
      ['מה זה אומר', 'חלון הפרסום נסגר ואף שפה לא פרסמה. זה לא שער איכות ולא תור ריק, כי אלה עוצרים שפה אחת ולא את כולן.'],
      ['מה לבדוק', 'שהקריאה החוזרת כל רבע שעה אל /api/content/automation/cron עדיין מגיעה, ושהמסד עונה.'],
    ], '#b91c1c'),
  }
}

export type SilenceResult =
  | { state: 'not_checked'; reason: 'wrong_hour' | 'already_past_first_slot' }
  | { state: 'published'; locales: number }
  | { state: 'alerted'; sent: boolean }

/**
 * The check itself. Called by the window on every invocation; it costs nothing
 * outside its one slot, because the verdict is decided before any read.
 */
export async function reportSilentMorning(
  admin: Admin,
  options: { now: number; deps?: AlertDeps },
): Promise<SilenceResult> {
  const verdict = silentMorningVerdict(options.now)
  if (!verdict.check) return { state: 'not_checked', reason: verdict.reason }

  const published = await localesPublishedSince(admin, startOfUtcDay(options.now))
  if (published.length > 0) return { state: 'published', locales: published.length }

  const expected = localesForDay().length
  // Logged as well as mailed: the log line is what a later reader greps for,
  // and the email is what reaches anyone the same morning.
  console.error('[blog-window] NOTHING PUBLISHED TODAY', {
    day: new Date(options.now).toISOString().slice(0, 10),
    expectedLocales: expected,
  })
  const out = await deliverOperatorEmail(silentMorningEmail(options.now, expected), options.deps ?? {})
  return { state: 'alerted', sent: out.sent }
}
