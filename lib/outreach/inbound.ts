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

/** Everything in the payload that could carry the person's words. */
export function messageText(payload: unknown): { subject: string; body: string } {
  const read = (keys: string[]): string => {
    const seen = new Set<unknown>()
    const walk = (node: unknown, depth: number): string | null => {
      if (depth > 6 || node === null || typeof node !== 'object' || seen.has(node)) return null
      seen.add(node)
      const record = node as Record<string, unknown>
      for (const key of keys) if (typeof record[key] === 'string' && record[key]) return record[key] as string
      for (const value of Object.values(record)) {
        const found = walk(value, depth + 1)
        if (found) return found
      }
      return null
    }
    return walk(payload, 0) ?? ''
  }
  return { subject: read(['subject']), body: read(['text', 'textBody', 'body', 'plain', 'snippet']) }
}

export type InboundOutcome =
  /** The person asked to stop, and the list now says so. */
  | { action: 'suppressed'; }
  /** A reply for a human to read: nothing recorded. */
  | { action: 'left_for_a_human' }
  /** We could not tell who wrote, so there is nothing to suppress. */
  | { action: 'no_sender' }
  /** The person asked to stop and we could not record it: the provider should retry. */
  | { action: 'failed' }

/** The one decision this endpoint makes. */
export async function handleInboundReply(payload: unknown, admin: ServiceRoleClient): Promise<InboundOutcome> {
  const email = senderAddress(payload)
  if (!email) return { action: 'no_sender' }
  const { subject, body } = messageText(payload)
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
