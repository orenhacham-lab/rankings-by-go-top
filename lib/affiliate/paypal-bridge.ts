/**
 * The one place that turns a verified PayPal event into affiliate bookkeeping.
 *
 * It is a SEPARATE pass from lib/paypal/webhook-processing.ts, called by the
 * webhook route after that module has applied the event to `subscriptions`.
 * Three reasons, and the first is the one that matters:
 *   1. a commission must never fail a subscription event. The customer's
 *      subscription is the product; the partner's commission is our
 *      bookkeeping. If this pass fails, the route logs it and still answers
 *      PayPal with the verdict for the subscription itself — otherwise PayPal
 *      retries a delivery whose real work succeeded.
 *   2. webhook-processing.ts's outcome union and its QA suite are a contract
 *      about one table. Widening them to carry commission outcomes would make
 *      every existing branch mean two things.
 *   3. the events are not the same set. A commission is earned on
 *      PAYMENT.SALE.COMPLETED (the only event that carries a real amount), and
 *      reversed on PAYMENT.SALE.REFUNDED / PAYMENT.SALE.REVERSED, which
 *      webhook-processing.ts deliberately ignores because they say nothing about
 *      a subscription's period.
 *
 * WHICH EVENT MEANS WHAT:
 *   PAYMENT.SALE.COMPLETED   a payment really happened, with its amount and
 *                            currency: earn (30%, or 40% at the tier).
 *                            BILLING.SUBSCRIPTION.ACTIVATED is NOT used — it
 *                            carries no amount, and the first payment arrives as
 *                            its own SALE.COMPLETED, so using both would either
 *                            double-count or invent a figure.
 *   PAYMENT.SALE.REFUNDED    the money went back: reverse that payment's
 *   PAYMENT.SALE.REVERSED    commission (`resource.sale_id` points at it).
 *   BILLING.SUBSCRIPTION.CANCELLED / EXPIRED
 *                            the customer stopped paying: the referral stops
 *                            counting towards the partner's tier. Commissions
 *                            already earned stand — they were earned on payments
 *                            that really happened.
 */
import { recordCommissionForPayment, reverseCommissionForPayment, markReferralChurned, type CommissionOutcome, type ReversalOutcome } from './commissions'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Admin = any

/** Only the fields this pass reads. The route hands it the same parsed event. */
export interface PayPalAffiliateEvent {
  event_type?: string
  resource?: {
    id?: string
    billing_agreement_id?: string
    sale_id?: string
    amount?: { total?: string | number; currency?: string }
  }
}

export type BridgeOutcome =
  | { kind: 'not_an_affiliate_event'; eventType: string | undefined }
  /** The event is one we act on, but it carries no usable payment reference. */
  | { kind: 'unusable_event'; eventType: string; reason: string }
  | { kind: 'commission'; outcome: CommissionOutcome }
  | { kind: 'reversal'; outcome: ReversalOutcome }
  | { kind: 'churn'; applied: boolean }
  | { kind: 'unknown_subscription'; paypalSubscriptionId: string }
  | { kind: 'failed'; reason: string }

const CHURN_EVENTS = new Set(['BILLING.SUBSCRIPTION.CANCELLED', 'BILLING.SUBSCRIPTION.EXPIRED'])
const REVERSAL_EVENTS = new Set(['PAYMENT.SALE.REFUNDED', 'PAYMENT.SALE.REVERSED'])

/** The account behind a PayPal subscription id, or null. */
async function payerOf(admin: Admin, paypalSubscriptionId: string): Promise<{ userId: string } | null | 'error'> {
  const { data, error } = await admin
    .from('subscriptions')
    .select('user_id')
    .eq('paypal_subscription_id', paypalSubscriptionId)
    .maybeSingle()
  if (error) return 'error'
  return data?.user_id ? { userId: data.user_id as string } : null
}

/** The amount of a sale as a number, or null when PayPal did not send one. */
export function saleAmount(resource: PayPalAffiliateEvent['resource']): { amount: number; currency: string } | null {
  const raw = resource?.amount
  if (!raw || raw.total === undefined || raw.total === null || !raw.currency) return null
  const amount = typeof raw.total === 'number' ? raw.total : Number.parseFloat(String(raw.total))
  if (!Number.isFinite(amount) || amount < 0) return null
  return { amount, currency: String(raw.currency) }
}

/**
 * Apply one verified event to the affiliate books. Never throws for an event it
 * does not handle — most events are not affiliate events, and that is the
 * cheapest possible answer (no query at all).
 */
export async function applyPayPalEventToAffiliateBooks(admin: Admin, event: PayPalAffiliateEvent, now = new Date()): Promise<BridgeOutcome> {
  const eventType = event.event_type
  const resource = event.resource
  if (!eventType || !resource) return { kind: 'not_an_affiliate_event', eventType }

  if (eventType === 'PAYMENT.SALE.COMPLETED') {
    // A one-off sale unrelated to any subscription: nothing to credit, and not
    // an error (the subscription pass says the same about it).
    if (!resource.billing_agreement_id) return { kind: 'not_an_affiliate_event', eventType }
    if (!resource.id) return { kind: 'unusable_event', eventType, reason: 'no_sale_id' }
    const money = saleAmount(resource)
    if (!money) return { kind: 'unusable_event', eventType, reason: 'no_amount' }
    const payer = await payerOf(admin, resource.billing_agreement_id)
    if (payer === 'error') return { kind: 'failed', reason: 'subscription_read_failed' }
    if (!payer) return { kind: 'unknown_subscription', paypalSubscriptionId: resource.billing_agreement_id }
    const outcome = await recordCommissionForPayment(admin, {
      userId: payer.userId,
      externalPaymentId: resource.id,
      amount: money.amount,
      currency: money.currency,
      source: 'paypal',
      earnedAt: now,
    })
    return { kind: 'commission', outcome }
  }

  if (REVERSAL_EVENTS.has(eventType)) {
    // `sale_id` is the payment being refunded; `id` is the refund's own id, so
    // using it would look for a commission that never existed.
    const saleId = resource.sale_id
    if (!saleId) return { kind: 'unusable_event', eventType, reason: 'no_sale_id' }
    const outcome = await reverseCommissionForPayment(admin, {
      source: 'paypal',
      externalPaymentId: saleId,
      reason: eventType === 'PAYMENT.SALE.REFUNDED' ? 'refund' : 'chargeback',
      now,
    })
    return { kind: 'reversal', outcome }
  }

  if (CHURN_EVENTS.has(eventType)) {
    if (!resource.id) return { kind: 'unusable_event', eventType, reason: 'no_subscription_id' }
    const payer = await payerOf(admin, resource.id)
    if (payer === 'error') return { kind: 'failed', reason: 'subscription_read_failed' }
    if (!payer) return { kind: 'unknown_subscription', paypalSubscriptionId: resource.id }
    return { kind: 'churn', applied: await markReferralChurned(admin, payer.userId, now) }
  }

  return { kind: 'not_an_affiliate_event', eventType }
}

/** True when this outcome is worth a line in the log (the rest are the ordinary cases). */
export function bridgeOutcomeIsNotable(outcome: BridgeOutcome): boolean {
  if (outcome.kind === 'commission') return outcome.outcome.kind === 'recorded' || outcome.outcome.kind === 'failed'
  if (outcome.kind === 'reversal') return outcome.outcome.kind !== 'nothing_to_reverse'
  if (outcome.kind === 'churn') return true
  return outcome.kind === 'failed' || outcome.kind === 'unusable_event'
}
