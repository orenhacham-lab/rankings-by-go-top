/**
 * One message of the US outbound channel, start to finish.
 *
 * WHY ONE PER CALL. The plan requires 5 to 15 minutes between messages, and the
 * cron that drives this runs every fifteen. Sending exactly one per pass gets
 * the spacing from the schedule instead of from a process that waits, which
 * matters because a serverless function that sleeps through a wave is a
 * function killed halfway through it, having sent some unknown prefix.
 *
 * THE ORDER OF THE CHECKS IS THE WHOLE DESIGN, and it is not the order that
 * reads most naturally. It is cheapest-and-most-binding first:
 *
 *   1. Is the channel switched on, and does it have a transport at all.
 *   2. Has it already stopped itself today (two permanent rejections).
 *   3. Is now inside the recipient's window, and is the day's quota left.
 *   4. For the chosen prospect: is the address on the suppression list. This
 *      FAILS CLOSED — a list we cannot read is not permission to write to
 *      someone who asked us to stop.
 *   5. Is the site still Shopify or WordPress, read from the site itself.
 *   6. Is there a finding that is true today.
 *
 * Only then is anything sent. Every one of those is a refusal that costs
 * nothing; the two that are expensive to get wrong are 4 and 6, and they are
 * the two that are re-done from scratch on every single message rather than
 * read from the row.
 *
 * WHY THE ROW IS CLAIMED BEFORE THE SEND AND NOT AFTER. Two cron passes can
 * overlap. The claim is a conditional update — `first_sent_at` from NULL, in
 * one statement — so the second pass finds nothing to claim and sends nothing.
 * The cost is that a send which fails after the claim leaves a row marked as
 * written to that was not: we lose one prospect. The alternative cost is
 * writing to the same business twice, which is the thing the law and the
 * recipient both care about. So the order fails towards losing a prospect, on
 * purpose, and the failure is logged and marked rather than swallowed.
 *
 * WHAT THIS PROCESS CANNOT SEE, stated plainly because it is the channel's one
 * remaining blind spot: real bounces and spam complaints arrive in the mailbox,
 * and nothing here reads the mailbox. The plan's "stop above 3% bounces" and
 * "stop on one complaint" are therefore still watched by a person. What this
 * does see is a permanent rejection at submission, and two of those in a day
 * stop it on their own.
 */
import type { ServiceRoleClient } from '@/lib/supabase/admin'
import { isSuppressed } from '@/lib/email-suppression'
import { PROSPECTS_TABLE, type ProspectStatus } from './prospects'
import { gatherEvidence, pickFinding, type PageFetcher } from './finding'
import { assertSendable, composeFirstMessage, composeSecondMessage, SENDER_NAME } from './message'
import {
  DAILY_FAILURE_STOP,
  dailyQuota,
  nextMessageFor,
  sendWindow,
  SENDING_TIME_ZONE,
  startOfLocalDayUtc,
  type ProspectScheduleRow,
} from './schedule'
import { type MessageSender } from './smtp'

/** How many prospects one pass will examine before giving up for this pass. */
export const MAX_CANDIDATES_PER_PASS = 6

/** The marker parked on a row whose site offered nothing true to say today. */
export const NO_FINDING_NOTE = 'no_finding'

export interface SenderDeps {
  now: Date
  fetchPage: PageFetcher
  send: MessageSender
  timeZone?: string
}

export type SenderResult =
  | { status: 'sent'; kind: 'first' | 'second'; company: string; findingKind?: string }
  | {
    status: 'idle'
    reason: 'outside_window' | 'quota_reached' | 'stopped_on_failures' | 'no_candidate' | 'read_failed'
  }
  | { status: 'send_failed'; reason: 'rejected' | 'failed'; code: string }

type ProspectRow = ProspectScheduleRow & {
  id: string
  company: string
  site_host: string
  platform: string | null
  contact_name: string | null
  unsub_token: string
  note: string | null
}

const SELECTED = 'id, company, email, site_host, platform, contact_name, unsub_token, note, status, first_sent_at, second_sent_at, replied_at'

/** The first message the channel ever sent, which is what the ramp counts from. */
export async function readChannelStart(admin: ServiceRoleClient): Promise<Date | null> {
  try {
    const { data, error } = await admin.from(PROSPECTS_TABLE)
      .select('first_sent_at')
      .not('first_sent_at', 'is', null)
      .order('first_sent_at', { ascending: true })
      .limit(1)
      .maybeSingle()
    if (error || !data) return null
    const ms = Date.parse((data as { first_sent_at: string }).first_sent_at)
    return Number.isNaN(ms) ? null : new Date(ms)
  } catch {
    return null
  }
}

export interface DayTally {
  sent: number
  rejected: number
  /** False when a count could not be read, in which case nothing is sent. */
  readable: boolean
}

/**
 * What has already happened today, local to the recipient's clock.
 *
 * Both messages count towards the quota: a second message is a message, and the
 * reason for the quota is the volume the domain sends, which does not care which
 * of the two it was.
 */
export async function readDayTally(
  admin: ServiceRoleClient,
  now: Date,
  timeZone = SENDING_TIME_ZONE,
): Promise<DayTally> {
  const since = startOfLocalDayUtc(now, timeZone).toISOString()
  try {
    const { data, error } = await admin.from(PROSPECTS_TABLE)
      .select('first_sent_at, second_sent_at, status, note, updated_at')
      .gte('updated_at', since)
    if (error) return { sent: 0, rejected: 0, readable: false }
    let sent = 0
    let rejected = 0
    for (const row of (data ?? []) as Record<string, string | null>[]) {
      if ((row.first_sent_at ?? '') >= since) sent += 1
      if ((row.second_sent_at ?? '') >= since) sent += 1
      if (row.status === 'disqualified' && (row.note ?? '').startsWith('rejected')) rejected += 1
    }
    return { sent, rejected, readable: true }
  } catch {
    return { sent: 0, rejected: 0, readable: false }
  }
}

/**
 * The prospects worth examining this pass, second messages first.
 *
 * Second messages lead because they are the only part of the sequence with a
 * deadline attached to someone else's expectation: the first message said
 * "following up once", and a follow-up that arrives three weeks late is worse
 * than none. First messages have no such clock.
 */
export async function readCandidates(admin: ServiceRoleClient, now: Date): Promise<ProspectRow[] | null> {
  try {
    const { data, error } = await admin.from(PROSPECTS_TABLE)
      .select(SELECTED)
      .in('status', ['new', 'sent_first'])
      .is('replied_at', null)
      .not('email', 'is', null)
      .order('created_at', { ascending: true })
      .limit(200)
    if (error) return null
    const rows = (data ?? []) as ProspectRow[]
    const due = rows
      .map((row) => ({ row, kind: nextMessageFor(row, now) }))
      .filter((c): c is { row: ProspectRow; kind: 'first' | 'second' } => c.kind !== null)
    return [
      ...due.filter((c) => c.kind === 'second').map((c) => c.row),
      ...due.filter((c) => c.kind === 'first').map((c) => c.row),
    ]
  } catch {
    return null
  }
}

/** Park a row we will not write to again, with the reason in its note. */
async function disqualify(admin: ServiceRoleClient, id: string, note: string): Promise<void> {
  try {
    await admin.from(PROSPECTS_TABLE)
      .update({ status: 'disqualified' as ProspectStatus, note })
      .eq('id', id)
  } catch {
    // A row we failed to mark is re-examined next pass and refused again. The
    // refusal is what matters; the marking only saves the work.
  }
}

/**
 * Claim a first message: `first_sent_at` moves from NULL in one statement, so
 * of two overlapping passes exactly one wins. Returns false when it lost.
 *
 * The finding and its timestamp go in the same statement because the table's
 * CHECK refuses one without the other, which is deliberate: a row that says it
 * was sent a finding without saying when that finding was checked is a row we
 * cannot defend.
 */
async function claimFirst(
  admin: ServiceRoleClient,
  id: string,
  finding: string,
  now: Date,
): Promise<boolean> {
  try {
    const { data, error } = await admin.from(PROSPECTS_TABLE)
      .update({
        status: 'sent_first' as ProspectStatus,
        first_sent_at: now.toISOString(),
        finding,
        finding_checked: now.toISOString(),
        note: 'auto wave',
      })
      .eq('id', id)
      .is('first_sent_at', null)
      .select('id')
    if (error) return false
    return ((data ?? []) as unknown[]).length === 1
  } catch {
    return false
  }
}

/** The same claim for the second message, conditional on `second_sent_at`. */
async function claimSecond(admin: ServiceRoleClient, id: string, now: Date): Promise<boolean> {
  try {
    const { data, error } = await admin.from(PROSPECTS_TABLE)
      .update({
        status: 'sent_second' as ProspectStatus,
        second_sent_at: now.toISOString(),
        note: 'auto follow-up',
      })
      .eq('id', id)
      .is('second_sent_at', null)
      .select('id')
    if (error) return false
    return ((data ?? []) as unknown[]).length === 1
  } catch {
    return false
  }
}

/**
 * Send at most one message. Never throws: this runs unattended as a passenger
 * on a cron that has other work to do.
 */
export async function sendNextProspect(
  admin: ServiceRoleClient,
  deps: SenderDeps,
): Promise<SenderResult> {
  const { now, fetchPage, send } = deps
  const timeZone = deps.timeZone ?? SENDING_TIME_ZONE

  const quota = dailyQuota(now, await readChannelStart(admin))
  const window = sendWindow(now, quota, timeZone)
  if (!window.open) return { status: 'idle', reason: 'outside_window' }

  const tally = await readDayTally(admin, now, timeZone)
  // A count we could not read is not a count of zero. Sending on an unreadable
  // tally is how a day sends its quota several times over.
  if (!tally.readable) return { status: 'idle', reason: 'read_failed' }
  if (tally.rejected >= DAILY_FAILURE_STOP) return { status: 'idle', reason: 'stopped_on_failures' }
  if (tally.sent >= quota) return { status: 'idle', reason: 'quota_reached' }

  const candidates = await readCandidates(admin, now)
  if (candidates === null) return { status: 'idle', reason: 'read_failed' }

  const today = window.day
  let examined = 0
  for (const row of candidates) {
    if (examined >= MAX_CANDIDATES_PER_PASS) break
    const kind = nextMessageFor(row, now)
    if (kind === null) continue
    // Already looked at today and found nothing true to say: not worth another
    // fetch of the same unchanged page in the same day.
    if (kind === 'first' && (row.note ?? '') === `${NO_FINDING_NOTE} ${today}`) continue
    examined += 1

    const email = row.email
    if (email === null) continue

    // 4. Fails closed.
    const suppression = await isSuppressed(admin, email)
    if (suppression.suppressed) {
      if (suppression.reason === 'listed' || suppression.reason === 'invalid_address') {
        await disqualify(admin, row.id, `suppressed: ${suppression.reason}`)
        continue
      }
      // Unreadable list: not this row's fault, and not a reason to send.
      return { status: 'idle', reason: 'read_failed' }
    }

    let message: { subject: string; text: string }
    let findingKind: string | undefined

    if (kind === 'first') {
      // 5 and 6, from the site itself, now.
      const evidence = await gatherEvidence(row.site_host, fetchPage)
      if (evidence.platform.platform === null) {
        await disqualify(admin, row.id, `platform: ${evidence.platform.reason}`)
        continue
      }
      const finding = pickFinding(evidence, now)
      if (finding === null) {
        try {
          await admin.from(PROSPECTS_TABLE)
            .update({ note: `${NO_FINDING_NOTE} ${today}` }).eq('id', row.id)
        } catch { /* re-checked next pass at worst */ }
        continue
      }
      findingKind = finding.kind
      message = composeFirstMessage({
        company: row.company,
        siteHost: row.site_host,
        contactName: row.contact_name,
        unsubToken: row.unsub_token,
        findingClause: finding.clause,
      }, now)
      const gate = assertSendable(message, row.unsub_token)
      if (!gate.sendable) {
        await disqualify(admin, row.id, `unsendable: ${gate.reason}`)
        continue
      }
      if (!await claimFirst(admin, row.id, finding.clause, now)) continue
    } else {
      message = composeSecondMessage({
        company: row.company,
        siteHost: row.site_host,
        contactName: row.contact_name,
        unsubToken: row.unsub_token,
      }, now)
      const gate = assertSendable(message, row.unsub_token)
      if (!gate.sendable) {
        await disqualify(admin, row.id, `unsendable: ${gate.reason}`)
        continue
      }
      if (!await claimSecond(admin, row.id, now)) continue
    }

    const outcome = await send({
      to: email,
      subject: message.subject,
      text: message.text,
      fromName: SENDER_NAME,
    })

    if (outcome.status === 'sent') {
      return { status: 'sent', kind, company: row.company, findingKind }
    }
    // The row is already claimed, so this prospect is spent either way. The note
    // is what makes the day's own stop rule countable.
    await disqualify(admin, row.id, `${outcome.status}: ${outcome.code}`)
    return { status: 'send_failed', reason: outcome.status, code: outcome.code }
  }

  return { status: 'idle', reason: 'no_candidate' }
}
