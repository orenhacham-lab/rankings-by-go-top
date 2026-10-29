/**
 * Getting the claim link to the buyer who paid on an external marketplace.
 *
 * THIS IS THE STEP THAT WAS MISSING, AND WITHOUT IT THE CHANNEL TAKES MONEY
 * AND DELIVERS NOTHING. `recordMarketplaceOrder` mints a claim token and
 * returns `claimUrl` (lib/marketplace/intake.ts); the webhook route recorded
 * the order and dropped that URL on the floor. Nothing else produced it, so a
 * buyer paid JVZoo in full, landed on whatever return URL the product is
 * configured with, and the one capability that turns their payment into a
 * plan sat in our database where only we could see it. The migration's
 * comment that the token "travels in the return URL the platform sends the
 * buyer to" cannot be true for JVZoo: our token is generated when the
 * callback arrives, and the platform's redirect is decided before and
 * independently of it. So the delivery has to be ours, and it is this file.
 *
 * ENGLISH ONLY, ON PURPOSE. The payload carries no language, the buyer has no
 * account yet to read a preference from, and the legal reading of this channel
 * is that JVZoo is sold to the United States only (see the thread's record on
 * non-Union OSS). Guessing a language from a product id would be inventing a
 * fact about a person; one English email that the claim screen then continues
 * in the visitor's own locale is the honest version.
 *
 * WHAT IT MAY NOT SAY. Not the plan's price, because what the buyer paid is
 * the platform's fact and this email is not a receipt; not "your account is
 * ready", because no account exists until they make one; and no support
 * address of its own, for the reason lib/i18n/public/marketplace-claim.ts
 * gives — the site already has support routes and a second one here is how an
 * unwatched mailbox gets published.
 *
 * FAILURE IS LOUD BUT NEVER FATAL. The webhook has already answered the
 * platform by the time this runs, and a refused send must not turn a recorded
 * order into a retried delivery: the row is correct, only the notice failed.
 * So a failure returns a reason, the caller logs it, and the operator gets an
 * alert naming the ORDER ID and never the token — the token is the buyer's
 * capability and does not belong in our own inbox. Resending is then a lookup
 * by that id.
 */
import { escapeEmailHtml } from '@/lib/notifications/email-escape'
import {
  deliverOperatorEmail,
  type AlertDeps,
} from '@/lib/notifications/operator-alerts'
import type { PlanCode } from '@/lib/plans/catalog'

export interface ClaimEmailContent {
  subject: string
  html: string
  text: string
}

/** How each plan is named to the buyer. Labels, not entitlements. */
const PLAN_LABEL: Record<PlanCode, string> = {
  regular: 'Regular',
  advanced: 'Advanced',
  premium: 'Premium',
  large_agency: 'Large Agency',
}

export interface ClaimEmailInput {
  /** The absolute https claim URL from `recordMarketplaceOrder`. */
  claimUrl: string
  plan: PlanCode
  /** The platform's own label, as registered in config (e.g. 'JVZoo'). */
  providerLabel: string
}

/**
 * The email itself. Pure: no environment, no network, no clock.
 *
 * The link is escaped although we generated it, because "we generated it" is
 * a property of today's caller and not of this function.
 */
export function buildClaimEmail(input: ClaimEmailInput): ClaimEmailContent {
  const url = input.claimUrl
  const plan = PLAN_LABEL[input.plan]
  const platform = input.providerLabel

  const subject = `Activate your Go Top SEO ${plan} plan`

  const lines = [
    `Thank you for your purchase on ${platform}.`,
    '',
    'One step is left: open the link below and create your Go Top SEO account, or sign in if you already have one. Your purchase is attached to that account and the plan becomes active.',
    '',
    url,
    '',
    'The link works once, and it is yours — please do not forward it.',
    '',
    `Plan: ${plan}`,
    '',
    'Go Top Digital Marketing and Advertising Ltd',
  ]

  const html = [
    '<div style="font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.6;color:#111">',
    `<p>Thank you for your purchase on ${escapeEmailHtml(platform)}.</p>`,
    '<p>One step is left: open the link below and create your Go Top SEO account, or sign in if you already have one. Your purchase is attached to that account and the plan becomes active.</p>',
    `<p><a href="${escapeEmailHtml(url)}" style="display:inline-block;padding:12px 20px;background:#111;color:#fff;text-decoration:none;border-radius:6px">Activate my ${escapeEmailHtml(plan)} plan</a></p>`,
    `<p style="font-size:13px;color:#555">If the button does not work, copy this address into your browser:<br>${escapeEmailHtml(url)}</p>`,
    '<p style="font-size:13px;color:#555">The link works once, and it is yours — please do not forward it.</p>',
    `<p style="font-size:13px;color:#555">Plan: ${escapeEmailHtml(plan)}</p>`,
    '<p style="font-size:13px;color:#555">Go Top Digital Marketing and Advertising Ltd</p>',
    '</div>',
  ].join('')

  return { subject, html, text: lines.join('\n') }
}

export type BuyerSender = (message: {
  to: string
  from: string
  subject: string
  html: string
  text: string
  replyTo?: string
}) => Promise<{ ok: boolean }>

/** Resend, the same way every other customer email in this project sends. */
export const resendBuyerSender: BuyerSender = async (message) => {
  const { Resend } = await import('resend')
  const resend = new Resend(process.env.RESEND_API_KEY)
  const result = await resend.emails.send({
    from: message.from,
    to: message.to,
    subject: message.subject,
    html: message.html,
    text: message.text,
    ...(message.replyTo ? { replyTo: message.replyTo } : {}),
  })
  if (result.error) {
    console.error('[marketplace-claim-email] provider refused', { name: result.error.name })
    return { ok: false }
  }
  return { ok: true }
}

export type ClaimEmailResult =
  | { sent: true }
  | { sent: false; reason: 'not_configured' | 'invalid_recipient' | 'send_failed' }

export interface ClaimEmailDeps {
  env?: Record<string, string | undefined>
  send?: BuyerSender
  /** Only used to report a failure; never to decide whether to send. */
  alert?: AlertDeps
}

/**
 * Deliver the claim link to one buyer.
 *
 * `to` comes from the order row we just wrote, which took it from the
 * platform's payload after `normalizeEmail`. It is the only recipient, and
 * there is no second recipient argument: this function cannot be made to mail
 * anybody else.
 */
export async function sendClaimEmail(
  to: string,
  input: ClaimEmailInput,
  deps: ClaimEmailDeps = {},
): Promise<ClaimEmailResult> {
  const env = deps.env ?? process.env
  const recipient = to.trim().toLowerCase()
  if (!recipient || !/^[^@\s]+@[^@\s.]+\.[^@\s]+$/.test(recipient)) {
    return { sent: false, reason: 'invalid_recipient' }
  }
  const from = (env.RESEND_FROM_EMAIL ?? '').trim()
  const key = (env.RESEND_API_KEY ?? '').trim()
  // No key or no sender is a configuration fact, not a transient failure, and
  // it must not be reported as a send.
  if (!from || !key) return { sent: false, reason: 'not_configured' }
  if (!/^https:\/\/[^\s"'<>]+$/.test(input.claimUrl)) {
    return { sent: false, reason: 'not_configured' }
  }

  const content = buildClaimEmail(input)
  const send = deps.send ?? resendBuyerSender
  const replyTo = (env.RESEND_REPLY_TO ?? '').trim()
  let ok = false
  try {
    const result = await send({
      to: recipient,
      from,
      subject: content.subject,
      html: content.html,
      text: content.text,
      ...(replyTo ? { replyTo } : {}),
    })
    ok = result.ok === true
  } catch {
    ok = false
  }
  return ok ? { sent: true } : { sent: false, reason: 'send_failed' }
}

/**
 * Tell the operator that a paid buyer has not been given their link.
 *
 * The order id and nothing else: with it the token can be looked up and the
 * email resent by hand, and without the token in this message our own inbox
 * never holds somebody else's capability.
 */
export async function alertClaimEmailFailed(
  params: { orderId: string; providerLabel: string; reason: string },
  deps: AlertDeps = {},
): Promise<void> {
  const subject = `A ${params.providerLabel} buyer has no claim link`
  const html = [
    '<p>An order was recorded and the email carrying its claim link was not sent.</p>',
    `<p>Platform: ${escapeEmailHtml(params.providerLabel)}<br>`,
    `Order id: ${escapeEmailHtml(params.orderId)}<br>`,
    `Reason: ${escapeEmailHtml(params.reason)}</p>`,
    '<p>The order row is correct and the plan is unclaimed. Look the order up by that id, take its claim token and send the link by hand.</p>',
  ].join('')
  await deliverOperatorEmail({ subject, html }, deps)
}
