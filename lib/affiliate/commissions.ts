/**
 * The money: a commission per customer payment, and its reversal.
 *
 * "30% of every payment, for as long as the customer keeps paying" is only true
 * if something runs on every payment. That something is here, called from the
 * PayPal webhook (app/api/paypal/webhook/route.ts) — the one place this app is
 * told that a customer has actually paid.
 *
 * DELIBERATELY NOT INSIDE lib/paypal/webhook-processing.ts. That module's
 * outcome contract and its QA suite are about `subscriptions`, and a commission
 * must never be able to turn a successfully applied subscription event into a
 * failure: the partner's money is our bookkeeping, the customer's subscription
 * is the product. So the webhook route applies the subscription event first and
 * then calls this, and a failure here is logged, never returned as the webhook's
 * verdict. PayPal would otherwise retry a delivery that already did its real
 * work.
 *
 * IDEMPOTENT BY CONSTRUCTION. PayPal retries until it gets a 2xx, so the same
 * payment arrives more than once. (source, external_payment_id) is unique in the
 * database, and the insert's 23505 is read here as "already recorded" — the
 * uniqueness, not a prior read, is what makes double payment impossible.
 *
 * WHAT IT DOES NOT DO: pay anybody. A commission is created `pending`, released
 * from the hold after the days in the terms, approved by a person, and only then
 * attached to a payout an operator marks paid. Nothing in this file moves money.
 *
 * SHOPIFY. A merchant billed by Shopify earns the partner nothing automatically,
 * and that is a limit of Shopify rather than a decision: the app is told a plan
 * is active, never that a charge was taken, so there is no payment event to hang
 * a per-payment commission on. Those referrals are marked `billing_source =
 * 'shopify'` and listed for an operator to commission by hand
 * (recordManualCommission).
 */
import { AFFILIATE_TERMS } from './terms'
import { commissionAmount, effectiveRate, releaseAt } from './rates'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Admin = any

export type CommissionCurrency = 'ILS' | 'USD'
export type CommissionSource = 'paypal' | 'shopify' | 'manual'

export interface PaymentCredit {
  /** The account that paid. */
  userId: string
  /** The payment's own id at the provider — the idempotency key. */
  externalPaymentId: string
  amount: number
  currency: string
  source: CommissionSource
  earnedAt?: Date
}

export type CommissionOutcome =
  /** The payer was not referred by anybody: the ordinary case. */
  | { kind: 'not_referred' }
  /** The referral was voided (a self-referral an operator refused). */
  | { kind: 'referral_void' }
  | { kind: 'partner_not_active' }
  | { kind: 'unsupported_currency'; currency: string }
  | { kind: 'already_recorded'; externalPaymentId: string }
  | { kind: 'recorded'; commissionId: string; affiliateId: string; amount: number; currency: CommissionCurrency; rate: number }
  | { kind: 'failed'; reason: string }

function supportedCurrency(raw: string): CommissionCurrency | null {
  const value = (raw ?? '').trim().toUpperCase()
  return value === 'ILS' || value === 'USD' ? value : null
}

/**
 * How many of a partner's referrals are paying RIGHT NOW, which is what decides
 * the tier. Counted from the referrals themselves, so a customer who churned
 * stops counting towards the higher rate the moment their subscription ends.
 */
export async function countActivePayingReferrals(admin: Admin, affiliateId: string): Promise<number> {
  const { data, error } = await admin
    .from('affiliate_referrals')
    .select('id')
    .eq('affiliate_id', affiliateId)
    .eq('status', 'paying')
  if (error) return 0
  return (data ?? []).length
}

/** The referral of an account, with its partner, or null. */
async function referralWithPartner(admin: Admin, userId: string) {
  const referral = await admin
    .from('affiliate_referrals')
    .select('id, affiliate_id, status, first_paid_at, billing_source')
    .eq('referred_user_id', userId)
    .maybeSingle()
  if (referral.error) return { error: 'referral_read_failed' as const }
  if (!referral.data) return { referral: null }
  const partner = await admin
    .from('affiliates')
    .select('id, status, base_rate, top_rate, top_rate_from')
    .eq('id', referral.data.affiliate_id)
    .maybeSingle()
  if (partner.error) return { error: 'affiliate_read_failed' as const }
  return { referral: referral.data, partner: partner.data ?? null }
}

/**
 * Record the commission for one customer payment.
 *
 * Called for every payment we are told about, referred or not: the "not
 * referred" answer is the common one and costs a single indexed lookup.
 */
export async function recordCommissionForPayment(admin: Admin, credit: PaymentCredit): Promise<CommissionOutcome> {
  const currency = supportedCurrency(credit.currency)
  if (!currency) return { kind: 'unsupported_currency', currency: credit.currency }

  const found = await referralWithPartner(admin, credit.userId)
  if ('error' in found && found.error) return { kind: 'failed', reason: found.error }
  const referral = found.referral
  if (!referral) return { kind: 'not_referred' }
  if (referral.status === 'void') return { kind: 'referral_void' }
  const partner = found.partner
  // A suspended partner keeps a resolving link but earns nothing more: that is
  // what suspension is for, and the agreement says a commission may be withheld.
  if (!partner || partner.status !== 'approved') return { kind: 'partner_not_active' }

  const earnedAt = credit.earnedAt ?? new Date()
  const activePaying = await countActivePayingReferrals(admin, partner.id)
  const rate = effectiveRate(
    { baseRate: Number(partner.base_rate), topRate: Number(partner.top_rate), topRateFrom: Number(partner.top_rate_from) },
    activePaying,
  )
  const amount = commissionAmount(credit.amount, rate)

  const inserted = await admin
    .from('affiliate_commissions')
    .insert({
      affiliate_id: partner.id,
      referral_id: referral.id,
      source: credit.source,
      external_payment_id: credit.externalPaymentId,
      payment_amount: credit.amount,
      currency,
      rate,
      amount,
      status: 'pending',
      earned_at: earnedAt.toISOString(),
      releases_at: releaseAt(earnedAt, AFFILIATE_TERMS.holdDays).toISOString(),
    })
    .select('id')
    .single()
  if (inserted.error) {
    return (inserted.error as { code?: string }).code === '23505'
      ? { kind: 'already_recorded', externalPaymentId: credit.externalPaymentId }
      : { kind: 'failed', reason: 'commission_insert_failed' }
  }

  // The referral is paying from its first payment onwards. first_paid_at is set
  // once (it is what "active paying since" means on the partner's dashboard).
  const paying: Record<string, unknown> = { status: 'paying', billing_source: credit.source === 'manual' ? 'shopify' : credit.source, updated_at: earnedAt.toISOString() }
  if (!referral.first_paid_at) paying.first_paid_at = earnedAt.toISOString()
  await admin.from('affiliate_referrals').update(paying).eq('id', referral.id)

  return { kind: 'recorded', commissionId: inserted.data.id, affiliateId: partner.id, amount, currency, rate }
}

export type ReversalOutcome =
  | { kind: 'nothing_to_reverse' }
  | { kind: 'reversed'; count: number }
  | { kind: 'failed'; reason: string }

/**
 * Reverse the commission on a payment that was refunded or charged back.
 *
 * "A commission on a customer who was refunded or charged back is cancelled and
 * deducted from the next payment" is in the terms in four languages, so it has
 * to happen without anyone remembering to do it. A commission already PAID is
 * reversed too: it then sits as a negative against the partner's next payout,
 * which is what "deducted from the next payment" means. The database makes a
 * reversal final.
 */
export async function reverseCommissionForPayment(
  admin: Admin,
  { source, externalPaymentId, reason, now = new Date() }: { source: CommissionSource; externalPaymentId: string; reason: string; now?: Date },
): Promise<ReversalOutcome> {
  const found = await admin
    .from('affiliate_commissions')
    .select('id, status')
    .eq('source', source)
    .eq('external_payment_id', externalPaymentId)
    .maybeSingle()
  if (found.error) return { kind: 'failed', reason: 'commission_read_failed' }
  if (!found.data) return { kind: 'nothing_to_reverse' }
  if (found.data.status === 'reversed') return { kind: 'nothing_to_reverse' }

  const updated = await admin
    .from('affiliate_commissions')
    .update({ status: 'reversed', reversed_at: now.toISOString(), reversed_reason: reason.slice(0, 200), updated_at: now.toISOString() })
    .eq('id', found.data.id)
    .select('id')
  if (updated.error) return { kind: 'failed', reason: 'commission_update_failed' }
  return { kind: 'reversed', count: (updated.data ?? []).length }
}

/**
 * A customer stopped paying: the referral stops counting towards the tier.
 *
 * Commissions already earned are untouched — they were earned on payments that
 * really happened — but the partner's rate is about referrals that are paying
 * now, so this has to be recorded when a subscription ends.
 */
export async function markReferralChurned(admin: Admin, userId: string, now = new Date()): Promise<boolean> {
  const { error } = await admin
    .from('affiliate_referrals')
    .update({ status: 'churned', updated_at: now.toISOString() })
    .eq('referred_user_id', userId)
    .eq('status', 'paying')
  return !error
}

/**
 * A commission entered by an operator: the Shopify-billed referrals above, and
 * a correction after a conversation with a partner. `externalPaymentId` is
 * whatever the operator can point at later (a Shopify charge id, an invoice
 * number), and it is still unique per source, so entering the same one twice is
 * refused rather than paid twice.
 */
export async function recordManualCommission(
  admin: Admin,
  {
    affiliateId,
    referralId,
    reference,
    paymentAmount,
    currency,
    rate,
    now = new Date(),
  }: {
    affiliateId: string
    referralId: string
    reference: string
    paymentAmount: number
    currency: CommissionCurrency
    rate: number
    now?: Date
  },
): Promise<CommissionOutcome> {
  const amount = commissionAmount(paymentAmount, rate)
  const inserted = await admin
    .from('affiliate_commissions')
    .insert({
      affiliate_id: affiliateId,
      referral_id: referralId,
      source: 'manual',
      external_payment_id: reference,
      payment_amount: paymentAmount,
      currency,
      rate,
      amount,
      status: 'pending',
      earned_at: now.toISOString(),
      releases_at: releaseAt(now, AFFILIATE_TERMS.holdDays).toISOString(),
    })
    .select('id')
    .single()
  if (inserted.error) {
    return (inserted.error as { code?: string }).code === '23505'
      ? { kind: 'already_recorded', externalPaymentId: reference }
      : { kind: 'failed', reason: 'commission_insert_failed' }
  }
  return { kind: 'recorded', commissionId: inserted.data.id, affiliateId, amount, currency, rate }
}
