/**
 * The one place that turns a verified Creem event into affiliate bookkeeping.
 *
 * Creem is the merchant of record for every card payment outside Israel
 * (lib/creem/*), so without this a partner who sends us a paying customer from
 * abroad earns nothing until somebody enters it by hand. The PayPal path has
 * had its bridge since the programme shipped (./paypal-bridge.ts); this is the
 * same pass for Creem, and it is deliberately built the same way:
 *
 *  - a SEPARATE pass, called by the webhook route AFTER
 *    lib/creem/webhook-processing.ts has applied the event to `subscriptions`.
 *    A commission must never be able to fail a subscription event: the
 *    customer's plan is the product, the partner's commission is our
 *    bookkeeping. The route logs a failure here and still answers Creem with
 *    the verdict for the subscription itself, or Creem retries a delivery
 *    whose real work succeeded.
 *  - lib/creem/webhook-processing.ts knows nothing about commissions. Its
 *    outcome union and QA suite are a contract about one table.
 *
 * WHICH EVENT MEANS WHAT
 *   checkout.completed    the first payment. The subscription row has just been
 *   subscription.paid     written by the activation pass; a renewal arrives as
 *                         subscription.paid. BOTH earn, and that is safe
 *                         BECAUSE the commission is keyed by the PAYMENT's own
 *                         id: Creem's `last_transaction.id` (`tran_…`). If the
 *                         first payment arrives as both events, the second one
 *                         hits the (source, external_payment_id) uniqueness and
 *                         is a no-op. Keying on the SUBSCRIPTION id instead
 *                         would make every monthly renewal look like the same
 *                         payment, and a partner would be paid once and never
 *                         again — a failure nobody notices for months.
 *   refund.created        the money went back: reverse that payment's
 *   dispute.created       commission. Both carry the transaction they are
 *                         about; without it nothing is reversed and the event
 *                         is reported, because lib/creem/events.ts already
 *                         raises these two for a human.
 *   subscription.canceled / expired / unpaid
 *                         the customer stopped paying: the referral stops
 *                         counting towards the partner's 40% tier. Commissions
 *                         already earned stand — they were earned on payments
 *                         that really happened.
 *
 * THE AMOUNT IS NEVER OUR PRICE LIST. It is what Creem says was collected, in
 * minor units, net of the tax Creem collects as merchant of record — tax is not
 * our revenue, so it is not a partner's commission base. A discounted or
 * proration-adjusted payment therefore earns on what the customer actually
 * paid, which is what the published terms say ("30% of every payment").
 *
 * THE EVENT IS THE EVIDENCE OF PAYMENT, not the transaction's own `status`
 * field: `checkout.completed` and `subscription.paid` are Creem's statements
 * that money arrived, exactly as PAYMENT.SALE.COMPLETED is PayPal's. A later
 * refund reverses, and nothing is payable before the hold in the terms expires
 * (./terms.ts) — so a commission is never paid out on money that came back.
 */
import { creemTransactionOf, type CreemFailure, type CreemResult, type CreemSubscriptionSnapshot, type CreemTransactionSnapshot } from '@/lib/creem/client'
import { recordCommissionForPayment, reverseCommissionForPayment, markReferralChurned, type CommissionOutcome, type ReversalOutcome } from './commissions'

// `any` deliberately, the convention this repo uses for anything called with
// BOTH the real Supabase admin client and FakeAdmin.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Admin = any

/** Only the fields this pass reads; the route hands it the same parsed event. */
export interface CreemAffiliateEvent {
  eventType?: string
  event_type?: string
  object?: Record<string, unknown>
}

export interface CreemAffiliateDeps {
  /** Injected so QA never reaches live Creem. The route passes
   *  lib/creem/client.ts::fetchCreemSubscription, the same read the
   *  entitlement pass uses. */
  fetchSubscription: (subscriptionId: string) => Promise<CreemResult<CreemSubscriptionSnapshot>>
}

export type CreemBridgeOutcome =
  | { kind: 'not_an_affiliate_event'; eventType: string | undefined }
  /** An event we act on, but it carries no usable reference. Reported, never
   *  shrugged off: a payment nobody can book is a partner not being paid. */
  | { kind: 'unusable_event'; eventType: string; reason: string }
  | { kind: 'commission'; outcome: CommissionOutcome }
  | { kind: 'reversal'; outcome: ReversalOutcome }
  | { kind: 'churn'; applied: boolean }
  /** A genuine event about a subscription that is not in our table (another
   *  environment's). Never creates anything. */
  | { kind: 'unknown_subscription'; creemSubscriptionId: string }
  /** Creem could not be read back, so the payment's amount is unknown. */
  | { kind: 'amount_unverifiable'; eventType: string; reason: CreemFailure }
  | { kind: 'failed'; reason: string }

const EARN_EVENTS = new Set(['checkout.completed', 'subscription.paid'])
const REVERSAL_EVENTS = new Set(['refund.created', 'dispute.created'])
/**
 * `subscription.unpaid` is in here and `subscription.past_due` is not, on
 * purpose and for the same reason lib/creem/events.ts keeps access on past_due:
 * past_due is a charge Creem is still retrying, unpaid is the end of it.
 * `subscription.paused` is left out too — a paused subscription is expected
 * back, and churn is reversed by the next payment anyway.
 */
const CHURN_EVENTS = new Set(['subscription.canceled', 'subscription.expired', 'subscription.unpaid'])

/** Currencies a commission can be booked in (./commissions.ts), and the only
 *  ones whose minor unit is a hundredth. */
const MINOR_UNIT_HUNDREDTHS = new Set(['ILS', 'USD'])

/** An id whether Creem sends the field as a string or as a nested object. */
function idOf(value: unknown): string | null {
  if (typeof value === 'string') return value.trim() || null
  if (value && typeof value === 'object' && 'id' in value) {
    const id = (value as { id?: unknown }).id
    return typeof id === 'string' ? id.trim() || null : null
  }
  return null
}

/**
 * What a payment earns a commission on: what was collected, less the tax Creem
 * collects as merchant of record, in the currency's major unit.
 *
 * Returns null rather than a guess whenever the figure is not plainly stated —
 * no amount, an unknown currency, or a currency whose minor unit is not a
 * hundredth (JPY would otherwise be read as a hundredth of itself).
 */
export function commissionBase(transaction: CreemTransactionSnapshot): { amount: number; currency: string } | null {
  const currency = (transaction.currency ?? '').trim().toUpperCase()
  if (!MINOR_UNIT_HUNDREDTHS.has(currency)) return null
  const collected = transaction.amountPaid ?? transaction.amount
  if (collected === null || !Number.isFinite(collected) || collected <= 0) return null
  const tax = transaction.taxAmount !== null && Number.isFinite(transaction.taxAmount) && transaction.taxAmount > 0
    ? transaction.taxAmount
    : 0
  // A tax larger than the amount collected is not something to subtract into a
  // negative base; it means the two fields are not the pair we think they are.
  const netMinor = tax >= collected ? collected : collected - tax
  return { amount: Math.round(netMinor) / 100, currency }
}

/** The account behind a Creem subscription id, or null. */
async function payerOf(admin: Admin, creemSubscriptionId: string): Promise<{ userId: string } | null | 'error'> {
  const { data, error } = await admin
    .from('subscriptions')
    .select('user_id')
    .eq('creem_subscription_id', creemSubscriptionId)
    .maybeSingle()
  if (error) return 'error'
  return data?.user_id ? { userId: data.user_id as string } : null
}

/**
 * The payment behind an earning event: the transaction on the event body when
 * Creem sent one, otherwise the subscription read back from Creem — the same
 * server-side read the entitlement is granted from.
 */
async function transactionFor(
  admin: Admin,
  eventType: string,
  object: Record<string, unknown>,
  subscriptionId: string,
  deps: CreemAffiliateDeps,
): Promise<{ transaction: CreemTransactionSnapshot } | { outcome: CreemBridgeOutcome }> {
  const fromEvent = creemTransactionOf(object.last_transaction) ?? creemTransactionOf(object.lastTransaction)
  if (fromEvent) return { transaction: fromEvent }
  const fetched = await deps.fetchSubscription(subscriptionId)
  if (!fetched.ok) return { outcome: { kind: 'amount_unverifiable', eventType, reason: fetched.reason } }
  const last = fetched.value.lastTransaction
  if (!last) return { outcome: { kind: 'unusable_event', eventType, reason: 'no_transaction_on_subscription' } }
  return { transaction: last }
}

/**
 * Apply one VERIFIED Creem event to the affiliate books. Authenticity is
 * settled by the route (lib/creem/signature.ts) before this is reached.
 *
 * Never throws for an event it does not handle: most events are not affiliate
 * events, and that answer costs no query at all.
 */
export async function applyCreemEventToAffiliateBooks(
  admin: Admin,
  event: CreemAffiliateEvent,
  deps: CreemAffiliateDeps,
  now = new Date(),
): Promise<CreemBridgeOutcome> {
  const eventType = (event.eventType ?? event.event_type ?? '').trim() || undefined
  const object = event.object && typeof event.object === 'object' && !Array.isArray(event.object)
    ? (event.object as Record<string, unknown>)
    : null
  if (!eventType || !object) return { kind: 'not_an_affiliate_event', eventType }

  if (EARN_EVENTS.has(eventType)) {
    // On checkout.completed the object is the CHECKOUT, so its own id is the
    // checkout's; the subscription is a field on it. On subscription.paid the
    // object is the subscription.
    const subscriptionId = eventType === 'checkout.completed'
      ? idOf(object.subscription)
      : idOf(object.id) ?? idOf(object.subscription)
    if (!subscriptionId) return { kind: 'unusable_event', eventType, reason: 'no_subscription_reference' }

    const payer = await payerOf(admin, subscriptionId)
    if (payer === 'error') return { kind: 'failed', reason: 'subscription_read_failed' }
    if (!payer) return { kind: 'unknown_subscription', creemSubscriptionId: subscriptionId }

    const found = await transactionFor(admin, eventType, object, subscriptionId, deps)
    if ('outcome' in found) return found.outcome
    const money = commissionBase(found.transaction)
    if (!money) return { kind: 'unusable_event', eventType, reason: 'no_usable_amount' }

    const outcome = await recordCommissionForPayment(admin, {
      userId: payer.userId,
      externalPaymentId: found.transaction.id,
      amount: money.amount,
      currency: money.currency,
      source: 'creem',
      earnedAt: now,
    })
    return { kind: 'commission', outcome }
  }

  if (REVERSAL_EVENTS.has(eventType)) {
    // The refund's or dispute's OWN id is not the payment's: reversing by it
    // would look for a commission that never existed and reverse nothing.
    const transactionId = idOf(object.transaction)
      ?? idOf(object.last_transaction)
      ?? idOf(object.payment)
    if (!transactionId) return { kind: 'unusable_event', eventType, reason: 'no_transaction_reference' }
    const outcome = await reverseCommissionForPayment(admin, {
      source: 'creem',
      externalPaymentId: transactionId,
      reason: eventType === 'refund.created' ? 'refund' : 'chargeback',
      now,
    })
    return { kind: 'reversal', outcome }
  }

  if (CHURN_EVENTS.has(eventType)) {
    const subscriptionId = idOf(object.id) ?? idOf(object.subscription)
    if (!subscriptionId) return { kind: 'unusable_event', eventType, reason: 'no_subscription_reference' }
    const payer = await payerOf(admin, subscriptionId)
    if (payer === 'error') return { kind: 'failed', reason: 'subscription_read_failed' }
    if (!payer) return { kind: 'unknown_subscription', creemSubscriptionId: subscriptionId }
    return { kind: 'churn', applied: await markReferralChurned(admin, payer.userId, now) }
  }

  return { kind: 'not_an_affiliate_event', eventType }
}

/** True when this outcome is worth a line in the log; the rest are ordinary. */
export function creemBridgeOutcomeIsNotable(outcome: CreemBridgeOutcome): boolean {
  if (outcome.kind === 'commission') return outcome.outcome.kind === 'recorded' || outcome.outcome.kind === 'failed'
  if (outcome.kind === 'reversal') return outcome.outcome.kind !== 'nothing_to_reverse'
  if (outcome.kind === 'churn') return true
  return outcome.kind === 'failed' || outcome.kind === 'unusable_event' || outcome.kind === 'amount_unverifiable'
}
