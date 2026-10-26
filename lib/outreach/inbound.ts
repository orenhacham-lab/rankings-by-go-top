/**
 * What happens when someone answers an outbound prospecting email.
 *
 * The message we send promises: reply "no" and I will not write again. A promise we do
 * not keep is a deceptive act under FTC Act s.5 on its own, quite apart from CAN-SPAM,
 * so the promise has to be kept by machine and not by someone reading an inbox.
 *
 * The mailbox provider POSTs every inbound message here. We decide one thing: did this
 * person ask us to stop? If yes, the address goes on the shared suppression list and no
 * sender of ours writes to it again. If no, nothing is recorded and the reply is left for
 * a human — a genuinely interested answer is not ours to handle automatically.
 *
 * Two deliberate choices:
 *
 * 1. QUOTED TEXT IS REMOVED FIRST. Our own message contains the word "unsubscribe", and
 *    almost every reply quotes it back. Matching the raw body would suppress every person
 *    who answered "yes please" with our footer underneath.
 * 2. AMBIGUITY SUPPRESSES. The costs are not symmetric: suppressing someone who meant
 *    yes loses a lead, failing to suppress someone who meant no breaks a promise we made
 *    in writing. So a short reply that reads like a refusal is treated as one.
 */
import type { ServiceRoleClient } from '@/lib/supabase/admin'
import { normalizeEmail, suppress } from '@/lib/email-suppression'
import {
  classifyDelivery,
  parkBouncedProspect,
  recordDeliveryReport,
  type DeliveryKind,
} from './bounce'

/** Where a reply stops being the person's own words and starts being ours, quoted back. */
const QUOTE_MARKERS = [
  /^>.*$/gm,
  /^\s*on .{0,120}\bwrote:\s*$[\s\S]*/im,
  /^\s*-{2,}\s*original message\s*-{2,}[\s\S]*/im,
  /^\s*_{5,}\s*$[\s\S]*/m,
  /^\s*from:\s.+$[\s\S]*/im,
  /^\s*sent from my .*$/gim,
  /^\s*this is an advertisement sent by[\s\S]*/im,
]

/** The person's own words: everything before the quoted original, with quoted lines gone. */
export function ownWords(body: string): string {
  let text = body.replace(/\r\n/g, '\n')
  for (const marker of QUOTE_MARKERS) text = text.replace(marker, '')
  return text.replace(/\s+/g, ' ').trim()
}

/** Phrases that are a refusal wherever they appear in the person's own words. */
const REFUSALS = [
  'unsubscribe', 'remove me', 'take me off', 'opt out', 'opt-out',
  'do not contact', "don't contact", 'do not email', "don't email",
  'not interested', 'no thanks', 'no thank you', 'stop emailing', 'stop contacting',
  'leave me alone', 'remove this email', 'remove from your list', 'delete my',
]
/** A reply this short and this blunt is a refusal, and nothing else. */
const SHORT_NO = /^(no|nope|stop|pass|unsubscribe|remove)[.!]?$/i

/** True when the person asked us to stop. Quoted text is removed before matching. */
export function isOptOut(body: string, subject = ''): boolean {
  const words = ownWords(body)
  if (SHORT_NO.test(words)) return true
  const haystack = `${ownWords(subject)} ${words}`.toLowerCase()
  return REFUSALS.some((phrase) => haystack.includes(phrase))
}

/**
 * The sender of an inbound message, out of a payload whose exact shape is the provider's
 * to change. Every form we can read is tried; anything else is no address at all, and a
 * delivery we cannot attribute is never guessed at.
 */
export function senderAddress(payload: unknown): string | null {
  const seen = new Set<unknown>()
  const walk = (node: unknown, depth: number): string | null => {
    if (depth > 6 || node === null || typeof node !== 'object' || seen.has(node)) return null
    seen.add(node)
    const record = node as Record<string, unknown>
    for (const key of ['from', 'sender', 'replyTo', 'reply_to', 'envelopeFrom', 'envelope_from']) {
      const found = addressIn(record[key])
      if (found) return found
    }
    for (const value of Object.values(record)) {
      const found = walk(value, depth + 1)
      if (found) return found
    }
    return null
  }
  return walk(payload, 0)
}

const ADDRESS = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/

function addressIn(value: unknown): string | null {
  if (typeof value === 'string') {
    const match = value.match(ADDRESS)
    return match ? normalizeEmail(match[0]) : null
  }
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = addressIn(item)
      if (found) return found
    }
    return null
  }
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>
    for (const key of ['address', 'email', 'value', 'text']) {
      const found = addressIn(record[key])
      if (found) return found
    }
  }
  return null
}

/** Keys a provider puts the message text under, best first. */
const BODY_KEYS = [
  'text', 'textBody', 'text_body', 'plain', 'plainBody', 'bodyPlain', 'body_plain',
  'stripped-text', 'strippedText', 'body', 'content', 'message', 'snippet', 'preview',
  'html', 'htmlBody', 'bodyHtml', 'body_html',
]

/**
 * A mark that is really an HTML tag, not a bounce's `<address@host>`: a tag name
 * is letters and digits, then whitespace, a slash or the closing bracket.
 */
const HTML_TAG = /<\/?[a-z][a-z0-9]*(?:\s[^>]*)?\/?>/i

/** Tags out, entities in: an HTML-only part still has to be readable. */
function asText(value: string): string {
  if (!HTML_TAG.test(value) && !/&(nbsp|lt|gt|amp|quot|#39);/i.test(value)) return value
  return value
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<br\s*\/?>|<\/p>|<\/div>|<\/tr>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&lt;/gi, '<').replace(/&gt;/gi, '>').replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"').replace(/&#39;/gi, "'")
    // Stripping tags leaves the gaps they stood in; a reader of this text
    // matches on words, so the gaps must not become part of them.
    .replace(/[^\S\n]{2,}/g, ' ')
    .trim()
}

/** A string that could be a message rather than an id, a flag or an attachment. */
function looksLikeProse(value: string): boolean {
  if (value.length < 40) return false
  // A long run with no whitespace is an encoded attachment or a token, never prose.
  return /\s/.test(value.slice(0, 200))
}

/**
 * Everything in the payload that could carry the person's words.
 *
 * WHY THIS IS NOT ONE FIELD LOOKUP. On 26 Oct 2026 every delivery report since
 * 22 Oct was stored as "unreadable report" with no recipient, while the same
 * bodies read straight from the mailbox parse correctly — so the field this
 * read was looking in is not the field the provider fills. A brake that depends
 * on one provider's spelling of "text" is a brake that disappears when the
 * provider renames it, so this takes the known names first, then the longest
 * piece of prose anywhere in the payload, and reads HTML as text either way.
 */
export function messageText(payload: unknown): { subject: string; body: string } {
  const strings: { key: string; value: string }[] = []
  const seen = new Set<unknown>()
  const walk = (node: unknown, depth: number): void => {
    if (depth > 6 || node === null || typeof node !== 'object' || seen.has(node)) return
    seen.add(node)
    for (const [key, value] of Object.entries(node as Record<string, unknown>)) {
      if (typeof value === 'string' && value) strings.push({ key, value })
      else walk(value, depth + 1)
    }
  }
  walk(payload, 0)

  const subject = strings.find((s) => s.key === 'subject')?.value ?? ''
  const named = BODY_KEYS.map((key) => strings.filter((s) => s.key === key))
    .flat()
    .map((s) => asText(s.value))
    .find((text) => text.trim().length > 0)
  if (named !== undefined) return { subject, body: named }

  // Nothing under a name we know: take the longest prose in the payload, which
  // is the report or the reply itself, and never the subject we already have.
  const fallback = strings
    .filter((s) => s.key !== 'subject' && looksLikeProse(s.value))
    .map((s) => asText(s.value))
    .sort((a, b) => b.length - a.length)[0]
  return { subject, body: fallback ?? '' }
}

export type InboundOutcome =
  /** The person asked to stop, and the list now says so. */
  | { action: 'suppressed'; }
  /** A reply for a human to read: nothing recorded. */
  | { action: 'left_for_a_human' }
  /** The mail system reporting a failure or a complaint, now counted. */
  | { action: 'delivery_report'; kind: DeliveryKind; attributed: boolean }
  /** We could not tell who wrote, so there is nothing to suppress. */
  | { action: 'no_sender' }
  /** The person asked to stop and we could not record it: the provider should retry. */
  | { action: 'failed' }

/**
 * The payload's field names, nested, with no values: what a log may carry when
 * a provider's shape turns out not to be the shape this module reads.
 */
export function payloadShape(payload: unknown, depth = 0): string {
  if (depth > 4 || payload === null || typeof payload !== 'object') return typeof payload
  if (Array.isArray(payload)) return payload.length === 0 ? '[]' : `[${payloadShape(payload[0], depth + 1)}]`
  const parts = Object.entries(payload as Record<string, unknown>)
    .slice(0, 24)
    .map(([key, value]) => `${key}:${payloadShape(value, depth + 1)}`)
  return `{${parts.join(',')}}`
}

/**
 * The decisions this endpoint makes, in the order that matters.
 *
 * THE DELIVERY REPORT IS READ FIRST, and the order is the point. A bounce body
 * quotes the message that bounced, which is our message, which contains the
 * word "unsubscribe" in its footer. Where the quote arrives in a shape the
 * stripper above does not recognise — and a bounce wraps the original in
 * message/rfc822 rather than in "On ... wrote:" — the opt-out matcher would read
 * the mail system's own report as the business asking us to stop, and suppress
 * an address that never asked for anything. Classifying first makes that
 * impossible: a report from the mail system is never a person's words.
 */
export async function handleInboundReply(
  payload: unknown,
  admin: ServiceRoleClient,
  now: Date = new Date(),
): Promise<InboundOutcome> {
  const email = senderAddress(payload)
  const { subject, body } = messageText(payload)

  const report = classifyDelivery({ sender: email, subject, body })
  if (report !== null) {
    // A REPORT WE CANNOT NAME A RECIPIENT FOR IS A BRAKE THAT DID NOT ENGAGE.
    // On 26 Oct 2026 every one of sixteen reports since 22 Oct was stored with
    // no recipient and detail "unreadable report", while the same report bodies
    // parse correctly when read straight from the mailbox. So the body the
    // provider POSTs is not the body of the report, and the only way to tell
    // which field carries it is to see the payload's shape. Keys and lengths
    // only: a bounce body carries a business's address and our own message, and
    // neither belongs in a log.
    if (report.recipient === null) {
      console.warn('[outreach-inbound] report with no recipient', {
        kind: report.kind,
        detail: report.detail,
        subjectLength: subject.length,
        bodyLength: body.length,
        shape: payloadShape(payload),
      })
    }
    const recorded = await recordDeliveryReport(admin, report, now)
    // A report we could not write down is one the provider should deliver
    // again: these are the channel's brakes, and a lost bounce is a brake that
    // silently did not engage.
    if (recorded === null) return { action: 'failed' }
    if (recorded.kind === 'hard_bounce' && recorded.attributed && recorded.emailHash !== null) {
      await parkBouncedProspect(admin, recorded.emailHash)
      // AND THE ADDRESS ITSELF, not just this one prospect row. A permanent
      // failure means the address is dead or closed to us; parking the row
      // stops this channel's second message, while the suppression list stops
      // every sender in the product, which is what a dead address warrants.
      if (report.recipient !== null) {
        await suppress(admin, {
          email: report.recipient,
          source: 'hard_bounce',
          channel: 'outbound_prospect',
          note: recorded.detail,
        })
      }
    }
    return { action: 'delivery_report', kind: recorded.kind, attributed: recorded.attributed }
  }

  if (!email) return { action: 'no_sender' }
  if (!isOptOut(body, subject)) return { action: 'left_for_a_human' }
  try {
    const result = await suppress(admin, {
      email,
      source: 'reply_optout',
      channel: 'outbound_prospect',
      note: 'asked to stop in a reply',
    })
    return result.status === 'ok' ? { action: 'suppressed' } : { action: 'failed' }
  } catch {
    return { action: 'failed' }
  }
}
