/**
 * The two messages of the US outbound channel, composed from the approved text.
 *
 * The wording is not this module's to invent. It is the text Oren approved on
 * 10 Oct 2026 (`/mnt/project-files/outreach/message-final-2026-10-10.md`), with
 * the two corrections made since: "sites" and "company" rather than "stores"
 * and "store name" (12 Oct, because most recipients are manufacturers with a
 * WordPress site and a promise about a store is false for them), and a footer
 * that names the brand and the postal address and no company name.
 *
 * WHAT THE FOOTER HAS TO CARRY, and why it is assembled here rather than typed
 * per message: 15 U.S.C. 7704(a)(5) requires three things in a commercial
 * message — that it identifies itself as an advertisement, a working opt-out,
 * and the sender's valid physical postal address. A registered company name is
 * not one of them, which is why "Go Top SEO" alone is both lawful and honest:
 * it is the name on the site, in the sender address and throughout the message,
 * so there is no gap to mislead about. The privacy link is California's
 * requirement, not CAN-SPAM's, and it is why the link is not optional either.
 *
 * WHY THE FOOTER MUST KEEP ITS FIRST SIX WORDS. The reply classifier
 * (lib/outreach/inbound.ts) strips our own quoted words from a reply before
 * looking for a refusal, and the line it recognises the footer by is
 * "This is an advertisement sent by". Our footer contains the word
 * "unsubscribe", which is a refusal keyword, so a footer the stripper does not
 * recognise turns every interested reply into an opt-out and silently
 * suppresses the people who said yes. `assertSendable` refuses to send a body
 * whose footer has drifted away from that opening.
 *
 * WHY THE UNSUBSCRIBE LINK IS PER RECIPIENT. The signed link
 * (unsubscribe-token.ts) is keyed with CRON_SECRET; this sender runs on the
 * server and could mint one, but the row already carries its own 64-hex secret
 * (`unsub_token`) which the mailbox route and this one both resolve, and a
 * database trigger refuses to change it on an existing row so the link keeps
 * working for the 30 days CAN-SPAM requires. One link shape for both senders is
 * one thing to keep working rather than two.
 */

/** The sender, as it appears in the From header and in the signature. */
export const SENDER_NAME = 'Oren Hacham'
/** The brand. The only name the footer carries. */
export const BRAND = 'Go Top SEO'
/** Verified against the companies register. Required by 7704(a)(5)(A)(iii). */
export const POSTAL_ADDRESS = 'HaRechasim 24/2, Ramat Gan 5235524, Israel'
/** The section "Business Outreach by Email" lives here. Required by CPRA. */
export const PRIVACY_URL = 'https://www.gotopseo.com/en/privacy'
export const SITE_URL = 'https://www.gotopseo.com'
export const UNSUBSCRIBE_BASE = 'https://www.gotopseo.com/api/outreach/unsubscribe'

/** The six words lib/outreach/inbound.ts recognises the footer by. */
export const FOOTER_OPENING = 'This is an advertisement sent by'

export function unsubscribeUrl(token: string): string {
  return `${UNSUBSCRIBE_BASE}?u=${encodeURIComponent(token)}`
}

export function footer(token: string): string {
  return [
    `${FOOTER_OPENING} ${BRAND} at ${POSTAL_ADDRESS}. If you would rather not`,
    'hear from us again, unsubscribe here:',
    unsubscribeUrl(token),
    '- we act on it immediately. How we handle your details:',
    PRIVACY_URL,
  ].join('\n')
}

/** "Hi Dana," when we hold a name, "Hello," when we do not. Never a guess. */
export function greeting(contactName: string | null | undefined): string {
  const name = (contactName ?? '').trim()
  // A role address ("sales", "info") is not a person and must not be greeted
  // as one; nor is anything long enough to be a company line.
  if (name.length === 0 || name.length > 40 || /[@<>]/.test(name)) return 'Hello,'
  return `Hi ${name.split(/\s+/)[0]},`
}

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

/** "October 16, 2026" — the date the finding was measured, in the message. */
export function checkDate(now: Date): string {
  return `${MONTHS[now.getUTCMonth()]} ${now.getUTCDate()}, ${now.getUTCFullYear()}`
}

export interface MessageInput {
  company: string
  siteHost: string
  contactName?: string | null
  unsubToken: string
}

export interface ComposedMessage {
  subject: string
  text: string
}

/** The domain as the message names it: no scheme, no trailing slash. */
export function domainLabel(siteHost: string): string {
  return siteHost.replace(/^https?:\/\//i, '').replace(/\/+$/, '')
}

/**
 * Message one. `findingClause` completes "I noticed that ..." and comes from
 * lib/outreach/finding.ts, measured minutes earlier against the live page.
 */
export function composeFirstMessage(
  input: MessageInput & { findingClause: string },
  now: Date,
): ComposedMessage {
  const domain = domainLabel(input.siteHost)
  const text = `${greeting(input.contactName)}

I run ${BRAND}, a tool that writes and publishes SEO content and fixes technical
SEO issues directly on Shopify and WordPress sites.

In an automated check of your public pages on ${checkDate(now)} I noticed that
${input.findingClause}. It is the kind of thing that quietly costs organic traffic.

Would it be useful if I sent you the full free report for ${domain}? No signup,
no call. If it is not relevant, reply "no" and I will not write again.

${SENDER_NAME}
${BRAND} - ${SITE_URL}

${footer(input.unsubToken)}
`
  return { subject: `a question about ${input.company}'s organic traffic`, text }
}

/**
 * Message two, seven days later and only to someone who did not reply. It makes
 * no new claim: a second finding would be a second thing to keep true, and the
 * approved text deliberately only repeats the offer. After it the business
 * leaves the list whether or not it asked to.
 */
export function composeSecondMessage(input: MessageInput, now: Date): ComposedMessage {
  const domain = domainLabel(input.siteHost)
  void now
  const text = `${greeting(input.contactName)} following up once on the free report for
${domain}. If it is not relevant, ignore this and you will not hear from me again.

${SENDER_NAME}
${BRAND} - ${SITE_URL}

${footer(input.unsubToken)}
`
  return { subject: `re: ${input.company}'s organic traffic`, text }
}

export type SendableVerdict = { sendable: true } | { sendable: false; reason: string }

/**
 * The last gate before a body is handed to the transport: every element the law
 * requires is present, and the footer still opens with the words the reply
 * classifier recognises.
 *
 * This duplicates what the composers above already do, on purpose. The cost of
 * the duplication is one function; the cost of its absence is a lawful-looking
 * message that is missing its opt-out, sent two hundred times before anyone
 * reads one.
 */
export function assertSendable(message: ComposedMessage, token: string): SendableVerdict {
  const { subject, text } = message
  if (subject.trim().length === 0) return { sendable: false, reason: 'empty_subject' }
  if (!text.includes(FOOTER_OPENING)) return { sendable: false, reason: 'footer_opening_missing' }
  // Start of a line, which is what inbound.ts's `^` anchor needs to strip it.
  if (!new RegExp(`^${FOOTER_OPENING}`, 'm').test(text)) return { sendable: false, reason: 'footer_not_at_line_start' }
  if (!text.includes(POSTAL_ADDRESS)) return { sendable: false, reason: 'postal_address_missing' }
  if (!text.includes(unsubscribeUrl(token))) return { sendable: false, reason: 'unsubscribe_link_missing' }
  if (!text.includes(PRIVACY_URL)) return { sendable: false, reason: 'privacy_link_missing' }
  // A placeholder that survived composition is a bug that would be visible to
  // the recipient and nowhere else.
  if (/\[[a-z ]+\]/i.test(text)) return { sendable: false, reason: 'placeholder_left_in_body' }
  return { sendable: true }
}
