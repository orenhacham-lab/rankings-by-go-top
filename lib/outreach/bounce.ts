/**
 * The channel's brakes: bounces and spam complaints, read from the mailbox's
 * own inbound webhook, and the stop rules computed from them.
 *
 * WHY THIS EXISTS NOW. Until today the sender could only see a permanent
 * rejection at the moment of submission. A real bounce does not arrive then: it
 * arrives minutes or hours later, as an ordinary message into
 * oren@trygotopseo.com, and nothing in the app read it. The plan's "stop above
 * 3% bounces" and "stop on one complaint" were therefore watched by a person.
 * At five messages a day that is a person's job; at the twenty to thirty Oren
 * asked for on 16 Oct 2026 it is not, and a channel that cannot stop itself is
 * one that burns the sending domain before anybody looks.
 *
 * The mailbox already POSTs every inbound message to /api/outreach/inbound, so
 * the bounces were already arriving at code that discarded them. This module is
 * what reads them.
 *
 * THE ONE THING THIS MODULE IS REALLY FOR: not counting a failure that is not
 * ours. On 13 Oct 2026 a MAILER-DAEMON message arrived about
 * sales@db-toolco.com and looked exactly like our bounce. It was not one. The
 * message HAD been delivered; that mailbox forwards to Gmail and the third hop
 * was refused by a filter we have nothing to do with. A rate rule that counted
 * it would have stopped the channel over someone else's broken forwarder. So a
 * BOUNCE counts only when the address it names is an address we actually wrote
 * to, and everything else is recorded as not ours. A spam complaint is the one
 * exception and counts either way: it arrives at the mailbox that sent the
 * message complained about, so it is ours by construction.
 *
 * WHERE THE RULES COME FROM. /mnt/project-files/outreach/sending-plan-2026-10-11.md:
 * bounce rate above 3% over the last 50 sends is a full stop, one spam complaint
 * is a full stop, two hard bounces in a day stops that day. The plan also says
 * plainly why the 3% is below what providers enforce: better to stop early than
 * to burn.
 *
 * ONE DELIBERATE DEPARTURE, and it is the only one. The rate rule needs at least
 * two hard bounces before it can fire. Read literally, with seven messages ever
 * sent, a single mistyped address is 14% and stops the whole channel until a
 * human clears it — which is exactly the babysitting this is meant to remove.
 * Two is also the number the plan itself uses for its same-day rule, and at the
 * steady state the rule was written for (50 sends) two bounces are 4% and stop
 * the channel anyway, so the departure changes nothing where the rule bites and
 * removes a false stop where it does not.
 *
 * A FULL STOP IS DERIVED, NOT STORED. There is no "stopped" flag to forget to
 * clear or to flip by accident: while the counted events are there, the sender
 * refuses, and `cleared_at` on those events is a human having looked. That also
 * means the stop survives a redeploy, which a flag in the environment does not.
 */
import type { ServiceRoleClient } from '@/lib/supabase/admin'
import { hashEmail, normalizeEmail } from '@/lib/email-suppression'
import { PROSPECTS_TABLE } from './prospects'
import { SENDING_TIME_ZONE, startOfLocalDayUtc } from './schedule'

export const DELIVERY_EVENTS_TABLE = 'outreach_delivery_events'

export type DeliveryKind = 'hard_bounce' | 'soft_bounce' | 'complaint'

/** Sends the rate is measured over. The plan's own number. */
export const BOUNCE_RATE_WINDOW = 50
/** Above this, the channel stops. Below what providers enforce, on purpose. */
export const BOUNCE_RATE_MAX = 0.03
/** The rate rule needs this many bounces before it can fire. See the header. */
export const MIN_HARD_BOUNCES_FOR_RATE = 2
/** Hard bounces in one local day that stop that day. The plan's own number. */
export const SAME_DAY_HARD_BOUNCE_STOP = 2

/** A message from the mail system rather than from a person. */
export interface InboundMessage {
  sender: string | null
  subject: string
  body: string
}

export interface DeliveryReport {
  kind: DeliveryKind
  /** Our own short code. Never the provider's words. */
  detail: string
  /** The address the failure was about, if the report names one. */
  recipient: string | null
}

/** Addresses the mail system itself writes from. */
const DAEMON = /^(mailer-daemon|postmaster|bounce|bounces|bounce-notification)@/i

/** Subjects a delivery report arrives under, across providers. */
const REPORT_SUBJECT = [
  /undelivered mail/i,
  /undeliverable/i,
  /delivery status notification/i,
  /delivery (has )?failed/i,
  /returned mail/i,
  /mail delivery (failed|system)/i,
  /failure notice/i,
]

/** A complaint is a different animal: a human pressed "spam" and a loop told us. */
const COMPLAINT_MARKERS = [
  /content-type:\s*message\/feedback-report/i,
  /feedback-type:\s*abuse/i,
  /\bspam complaint\b/i,
  /\babuse report\b/i,
  /\bcomplaint-id\b/i,
]

/** `Status: 5.1.1` and friends: the machine-readable verdict, where there is one. */
const DSN_STATUS = /^\s*status:\s*([245])\.(\d{1,3})\.(\d{1,3})/im
/** The recipient the report is ABOUT, which is never the daemon that sent it. */
const FINAL_RECIPIENT = /^\s*(?:final-recipient|original-recipient|original-rcpt-to):\s*(?:rfc822;)?\s*<?([^\s<>;]+@[^\s<>;]+)>?/im
const FAILED_RECIPIENTS = /^\s*x-failed-recipients:\s*<?([^\s<>,;]+@[^\s<>,;]+)>?/im

/**
 * The address a report names in its PROSE, where no header carries it.
 *
 * Both reports this channel actually received on 19 and 21 Oct 2026 were real
 * bounces on addresses we chose, and both were recorded as not ours because
 * neither carried Final-Recipient in the part we read: Postfix put the address
 * in its transcript line (`<addr>: host ... said: 550 ...`) and Office 365 in
 * an English sentence. The headers were in the attached message/rfc822 part,
 * which the webhook does not hand us. Two real bounces the rate rule could not
 * see is the brake failing silently, which is worse than a brake that fires.
 *
 * These patterns are deliberately narrow. A bounce body quotes the whole
 * original message, our footer and the recipient's own address included, so
 * anything that merely takes the first address it finds would attribute a
 * forwarder's failure to us — the db-toolco case in the header, with the
 * protection removed.
 */
const PROSE_RECIPIENT = [
  // Postfix / mailchannels transcript: `<sales@example.com>: host ... said: 550 ...`
  /^\s*<([^\s<>,;]+@[^\s<>,;]+)>:\s*(?:host|.{0,80}?\bsaid:)/im,
  // Office 365: `Your message to info@example.com couldn't be delivered.`
  /\byour message to\s+<?([^\s<>,;]+@[^\s<>,;]+)>?\s+(?:couldn|could not|was|wasn|has)/i,
  // Gmail and others: `The response was: ... to <addr>` is too loose; this is the
  // one form that names the address as the delivery target.
  /\bdelivery to the following recipients? failed permanently:\s*<?([^\s<>,;]+@[^\s<>,;]+)>?/i,
]

/**
 * What this inbound message is, if it is not a person writing back.
 *
 * Returns null for an ordinary reply, which is the common case and is somebody
 * else's job (lib/outreach/inbound.ts decides whether it is an opt-out).
 */
export function classifyDelivery(message: InboundMessage): DeliveryReport | null {
  const subject = message.subject ?? ''
  const body = message.body ?? ''
  const haystack = `${subject}\n${body}`

  if (COMPLAINT_MARKERS.some((re) => re.test(haystack))) {
    return { kind: 'complaint', detail: 'feedback-report abuse', recipient: recipientIn(body) }
  }

  const fromDaemon = DAEMON.test((message.sender ?? '').trim())
  const reportSubject = REPORT_SUBJECT.some((re) => re.test(subject))
  const status = DSN_STATUS.exec(body)
  // A delivery report is one of these three things. A person's reply is none of
  // them, and a person's reply is what must not be mistaken for a bounce: being
  // wrong in that direction suppresses a business that answered us.
  if (!fromDaemon && !reportSubject && status === null) return null

  if (status !== null) {
    const code = `${status[1]}.${status[2]}.${status[3]}`
    // 2.x.x is a delivery report that reports success — a delay notice cleared,
    // or a relayed-to-someone-else notice. Not a failure, and not ours to count.
    if (status[1] === '2') return null
    return {
      kind: status[1] === '5' ? 'hard_bounce' : 'soft_bounce',
      detail: `dsn ${code}`,
      recipient: recipientIn(body),
    }
  }

  // No machine-readable status, so read the reply code out of the text.
  const permanent = /\b5\d\d\b/.test(body) || /\bpermanent(ly)? (failed|failure|rejected)\b/i.test(body)
  const temporary = /\b4\d\d\b/.test(body) || /\btemporar(y|ily)\b/i.test(body) || /\bdelayed?\b/i.test(body)
  // When a report is unreadable, treat it as permanent. The plan's own words:
  // better to stop early than to burn. A soft bounce counted as hard costs one
  // prospect and, at worst, a day; the other way costs the domain.
  const kind: DeliveryKind = permanent || !temporary ? 'hard_bounce' : 'soft_bounce'
  return { kind, detail: permanent ? 'permanent, no dsn' : temporary ? 'temporary, no dsn' : 'unreadable report', recipient: recipientIn(body) }
}

/** The address a report names, normalized, or null when it names none. */
export function recipientIn(body: string): string | null {
  let match = FINAL_RECIPIENT.exec(body) ?? FAILED_RECIPIENTS.exec(body)
  for (const re of PROSE_RECIPIENT) {
    if (match !== null) break
    match = re.exec(body)
  }
  if (!match) return null
  const address = normalizeEmail(match[1])
  // Our own address appears all over a bounce body (we are the sender it is
  // reporting to). It is never the recipient the failure is about.
  if (address.endsWith('@trygotopseo.com')) return null
  return address.includes('@') ? address : null
}

export interface RecordedEvent {
  kind: DeliveryKind
  detail: string
  emailHash: string | null
  attributed: boolean
}

/**
 * Record one report, having first decided whether it is ours.
 *
 * "Ours" means: the address it names is a business this channel actually wrote
 * to. Anything else is written down as not ours and counts towards nothing —
 * see the db-toolco case in the header. Returns what was recorded, or null when
 * nothing could be written, which is never a reason to pretend the report was
 * clean.
 */
export async function recordDeliveryReport(
  admin: ServiceRoleClient,
  report: DeliveryReport,
  occurredAt: Date,
): Promise<RecordedEvent | null> {
  const emailHash = report.recipient === null ? null : hashEmail(report.recipient)
  let attributed = false
  let detail = report.detail
  if (emailHash !== null) {
    const match = await wroteTo(admin, emailHash)
    // A hash we could not check is not a hash we can blame ourselves for.
    if (match === null) detail = `${detail}, unchecked`
    attributed = match === true
    if (match === false) detail = `${detail}, unmatched recipient`
  } else {
    detail = `${detail}, no recipient named`
  }

  const event: RecordedEvent = { kind: report.kind, detail: detail.slice(0, 200), emailHash, attributed }
  try {
    const { error } = await admin.from(DELIVERY_EVENTS_TABLE).insert({
      email_hash: emailHash,
      kind: report.kind,
      attributed,
      detail: event.detail,
      occurred_at: occurredAt.toISOString(),
    })
    if (error) return null
  } catch {
    return null
  }
  return event
}

/** True when this channel really did write to the address behind the hash. */
async function wroteTo(admin: ServiceRoleClient, emailHash: string): Promise<boolean | null> {
  try {
    const { data, error } = await admin.from(PROSPECTS_TABLE)
      .select('id, first_sent_at')
      .eq('email_hash', emailHash)
      .not('first_sent_at', 'is', null)
      .limit(1)
    if (error) return null
    return ((data ?? []) as unknown[]).length === 1
  } catch {
    return null
  }
}

/**
 * A hard-bounced address is a dead address: park the row so the second message
 * never goes to it. Best effort — the stop rules are what protect the domain,
 * and this only protects one wasted send.
 */
export async function parkBouncedProspect(admin: ServiceRoleClient, emailHash: string): Promise<void> {
  try {
    await admin.from(PROSPECTS_TABLE)
      .update({ status: 'disqualified', note: 'hard bounce' })
      .eq('email_hash', emailHash)
      .in('status', ['new', 'sent_first'])
  } catch {
    // The row stays; the worst case is one message to an address that bounces
    // again, which the rules above then count a second time.
  }
}

export interface StopCounts {
  complaints: number
  hardBouncesInWindow: number
  sendsInWindow: number
  hardBouncesToday: number
}

export type StopVerdict =
  | { stopped: true; reason: 'complaint' | 'bounce_rate' | 'hard_bounces_today'; detail: string }
  | { stopped: false }

/** The plan's three stop rules, in the order of how much they mean. */
export function channelStop(counts: StopCounts): StopVerdict {
  if (counts.complaints > 0) {
    return { stopped: true, reason: 'complaint', detail: `${counts.complaints} complaint(s)` }
  }
  const { hardBouncesInWindow, sendsInWindow } = counts
  if (hardBouncesInWindow >= MIN_HARD_BOUNCES_FOR_RATE && sendsInWindow > 0) {
    const rate = hardBouncesInWindow / sendsInWindow
    if (rate > BOUNCE_RATE_MAX) {
      return {
        stopped: true,
        reason: 'bounce_rate',
        detail: `${hardBouncesInWindow} of ${sendsInWindow} = ${(rate * 100).toFixed(1)}%`,
      }
    }
  }
  if (counts.hardBouncesToday >= SAME_DAY_HARD_BOUNCE_STOP) {
    return { stopped: true, reason: 'hard_bounces_today', detail: `${counts.hardBouncesToday} today` }
  }
  return { stopped: false }
}

export interface StopState {
  verdict: StopVerdict
  counts: StopCounts
  /** False when a count could not be read, in which case nothing is sent. */
  readable: boolean
}

const UNREADABLE: StopState = {
  verdict: { stopped: false },
  counts: { complaints: 0, hardBouncesInWindow: 0, sendsInWindow: 0, hardBouncesToday: 0 },
  readable: false,
}

/**
 * Whether the channel has stopped itself, from the data.
 *
 * The window is the last 50 sends as the plan says, which means the instant the
 * fiftieth-most-recent message went out; bounces older than that belong to a
 * window that has passed. With fewer than fifty sends ever, the window is every
 * send there has been.
 */
export async function readStopState(
  admin: ServiceRoleClient,
  now: Date,
  timeZone = SENDING_TIME_ZONE,
): Promise<StopState> {
  const sends = await readRecentSends(admin)
  if (sends === null) return UNREADABLE

  const windowStart = sends.length === 0 ? null : sends[Math.min(sends.length, BOUNCE_RATE_WINDOW) - 1]
  const dayStart = startOfLocalDayUtc(now, timeZone)

  let rows: { kind: string; attributed: boolean | null; occurred_at: string }[]
  try {
    const { data, error } = await admin.from(DELIVERY_EVENTS_TABLE)
      .select('kind, attributed, occurred_at')
      .is('cleared_at', null)
      .order('occurred_at', { ascending: false })
      .limit(200)
    if (error) return UNREADABLE
    rows = (data ?? []) as { kind: string; attributed: boolean | null; occurred_at: string }[]
  } catch {
    return UNREADABLE
  }

  const counts: StopCounts = {
    complaints: 0,
    hardBouncesInWindow: 0,
    sendsInWindow: Math.min(sends.length, BOUNCE_RATE_WINDOW),
    hardBouncesToday: 0,
  }
  for (const row of rows) {
    const at = Date.parse(row.occurred_at)
    if (Number.isNaN(at)) continue
    // A COMPLAINT COUNTS WHETHER OR NOT WE COULD ATTRIBUTE IT, and this is the
    // one place the attribution rule does not apply. A bounce can be about
    // somebody else's mail — the db-toolco case in the header — but a spam
    // complaint arrives at the mailbox that sent the complained-about message,
    // so it is ours by construction, and feedback reports frequently name the
    // recipient in a form no parser of ours will read. One is a full stop, and
    // it is never windowed away.
    if (row.kind === 'complaint') { counts.complaints += 1; continue }
    if (row.kind !== 'hard_bounce') continue
    // A bounce, on the other hand, counts only when it is about an address we
    // really wrote to.
    if (row.attributed !== true) continue
    if (windowStart !== null && at >= windowStart.getTime()) counts.hardBouncesInWindow += 1
    if (at >= dayStart.getTime()) counts.hardBouncesToday += 1
  }

  return { verdict: channelStop(counts), counts, readable: true }
}

/** The instants of the most recent messages, newest first. */
async function readRecentSends(admin: ServiceRoleClient): Promise<Date[] | null> {
  const read = async (column: 'first_sent_at' | 'second_sent_at'): Promise<string[] | null> => {
    try {
      const { data, error } = await admin.from(PROSPECTS_TABLE)
        .select(column)
        .not(column, 'is', null)
        .order(column, { ascending: false })
        .limit(BOUNCE_RATE_WINDOW)
      if (error) return null
      return ((data ?? []) as Record<string, string | null>[])
        .map((row) => row[column])
        .filter((value): value is string => typeof value === 'string')
    } catch {
      return null
    }
  }
  const [first, second] = await Promise.all([read('first_sent_at'), read('second_sent_at')])
  if (first === null || second === null) return null
  return [...first, ...second]
    .map((value) => new Date(Date.parse(value)))
    .filter((date) => !Number.isNaN(date.getTime()))
    .sort((a, b) => b.getTime() - a.getTime())
    .slice(0, BOUNCE_RATE_WINDOW)
}
