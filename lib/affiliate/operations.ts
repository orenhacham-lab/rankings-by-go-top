/**
 * Everything an operator can do to the partner program, as functions.
 *
 * The route (app/api/admin/affiliates/route.ts) proves the caller is an
 * administrator and then calls one of these; the rules live here so they can be
 * exercised against FakeAdmin instead of a browser. Each one returns an outcome
 * rather than throwing, and each one refuses rather than repairing: an operator
 * who is told "this commission is still inside the hold" learns the rule, while
 * one whose click silently did something else does not.
 *
 * THE TWO GATES THAT ARE NOT CONVENIENCE:
 *   - approving a partner is the ONLY way a code comes into existence, and a
 *     code is the only way a link exists. That is the program's defence against
 *     someone joining to refer themselves, so there is no path here that creates
 *     an approved partner without a person choosing their code.
 *   - a commission cannot be approved before its hold has passed. The hold is
 *     the refund window: approving early would mean paying out money that a
 *     refund is about to reverse, and the terms promise partners the hold in
 *     four languages.
 *
 * Money moves by hand, outside this app, which is also what the terms say. A
 * payout here is a STATEMENT — this partner, this period, this amount — that an
 * operator marks paid with a reference once they have actually sent it.
 */
import { normalizeReferralCode } from './referral'
import { recordManualCommission, type CommissionCurrency } from './commissions'
import { AFFILIATE_TERMS } from './terms'
import { payable as meetsMinimum } from './rates'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Admin = any

export type OperationOutcome =
  | { kind: 'ok'; detail?: Record<string, unknown> }
  | { kind: 'not_found' }
  | { kind: 'invalid'; reason: string }
  | { kind: 'conflict'; reason: string }
  | { kind: 'failed'; reason: string }

/**
 * Approve an application: give the partner the code an operator chose, and with
 * it a working link.
 *
 * The code is normalized to the shape a link can carry and checked for being
 * taken — two partners with one code would credit one of them for the other's
 * audience, which the unique index also refuses, read here as a conflict so the
 * operator can simply pick another.
 */
export async function approveApplication(
  admin: Admin,
  { affiliateId, code, decidedBy, baseRate, topRate, topRateFrom, now = new Date() }: {
    affiliateId: string
    code: string
    decidedBy: string
    baseRate?: number
    topRate?: number
    topRateFrom?: number
    now?: Date
  },
): Promise<OperationOutcome> {
  const normalized = normalizeReferralCode(code)
  if (!normalized) return { kind: 'invalid', reason: 'code_shape' }
  if (baseRate !== undefined && !(baseRate > 0 && baseRate <= 100)) return { kind: 'invalid', reason: 'base_rate' }
  if (topRate !== undefined && !(topRate > 0 && topRate <= 100)) return { kind: 'invalid', reason: 'top_rate' }
  if (baseRate !== undefined && topRate !== undefined && topRate < baseRate) return { kind: 'invalid', reason: 'top_below_base' }
  if (topRateFrom !== undefined && !(Number.isInteger(topRateFrom) && topRateFrom >= 1)) return { kind: 'invalid', reason: 'top_rate_from' }

  const existing = await admin.from('affiliates').select('id, status').eq('id', affiliateId).maybeSingle()
  if (existing.error) return { kind: 'failed', reason: 'read_failed' }
  if (!existing.data) return { kind: 'not_found' }
  if (existing.data.status !== 'pending') return { kind: 'conflict', reason: 'already_decided' }

  const taken = await admin.from('affiliates').select('id').eq('code', normalized).maybeSingle()
  if (taken.error) return { kind: 'failed', reason: 'read_failed' }
  if (taken.data) return { kind: 'conflict', reason: 'code_taken' }

  const payload: Record<string, unknown> = {
    status: 'approved',
    code: normalized,
    decided_at: now.toISOString(),
    decided_by: decidedBy,
    updated_at: now.toISOString(),
  }
  if (baseRate !== undefined) payload.base_rate = baseRate
  if (topRate !== undefined) payload.top_rate = topRate
  if (topRateFrom !== undefined) payload.top_rate_from = topRateFrom

  const updated = await admin.from('affiliates').update(payload).eq('id', affiliateId).eq('status', 'pending').select('id')
  if (updated.error) {
    return (updated.error as { code?: string }).code === '23505'
      ? { kind: 'conflict', reason: 'code_taken' }
      : { kind: 'failed', reason: 'update_failed' }
  }
  // Zero rows: another operator decided this application between the read and
  // the write. Never reported as success.
  if (!(updated.data ?? []).length) return { kind: 'conflict', reason: 'already_decided' }
  return { kind: 'ok', detail: { code: normalized } }
}

/** Refuse an application. It keeps no code, so no link ever existed for it. */
export async function rejectApplication(
  admin: Admin,
  { affiliateId, decidedBy, notes, now = new Date() }: { affiliateId: string; decidedBy: string; notes?: string; now?: Date },
): Promise<OperationOutcome> {
  const payload: Record<string, unknown> = { status: 'rejected', decided_at: now.toISOString(), decided_by: decidedBy, updated_at: now.toISOString() }
  if (notes) payload.admin_notes = notes.slice(0, 4000)
  const updated = await admin.from('affiliates').update(payload).eq('id', affiliateId).eq('status', 'pending').select('id')
  if (updated.error) return { kind: 'failed', reason: 'update_failed' }
  return (updated.data ?? []).length ? { kind: 'ok' } : { kind: 'conflict', reason: 'already_decided' }
}

/**
 * Suspend a partner, or let them back in.
 *
 * A suspended partner's LINK KEEPS WORKING and keeps being counted: it is
 * published on somebody's blog and a visitor must not meet a dead end. What
 * stops is earning — lib/affiliate/commissions.ts refuses a commission for a
 * partner who is not approved — which is what the terms mean by withholding.
 */
export async function setPartnerStatus(
  admin: Admin,
  { affiliateId, status, notes, now = new Date() }: { affiliateId: string; status: 'approved' | 'suspended'; notes?: string; now?: Date },
): Promise<OperationOutcome> {
  const payload: Record<string, unknown> = { status, updated_at: now.toISOString() }
  if (notes) payload.admin_notes = notes.slice(0, 4000)
  const updated = await admin
    .from('affiliates')
    .update(payload)
    .eq('id', affiliateId)
    .in('status', ['approved', 'suspended'])
    .select('id')
  if (updated.error) return { kind: 'failed', reason: 'update_failed' }
  return (updated.data ?? []).length ? { kind: 'ok' } : { kind: 'not_found' }
}

/** How a partner is paid, and where. Recorded for the operator who pays them. */
export async function setPayoutDetails(
  admin: Admin,
  { affiliateId, method, details, now = new Date() }: { affiliateId: string; method: string; details: string; now?: Date },
): Promise<OperationOutcome> {
  if (!['paypal', 'wise', 'bank', 'credit'].includes(method)) return { kind: 'invalid', reason: 'method' }
  if (details.length > 500) return { kind: 'invalid', reason: 'details_too_long' }
  const updated = await admin
    .from('affiliates')
    .update({ payout_method: method, payout_details: details, updated_at: now.toISOString() })
    .eq('id', affiliateId)
    .select('id')
  if (updated.error) return { kind: 'failed', reason: 'update_failed' }
  return (updated.data ?? []).length ? { kind: 'ok' } : { kind: 'not_found' }
}

/** Connect a partner row to the account they sign in with, so their dashboard finds it. */
export async function linkPartnerAccount(
  admin: Admin,
  { affiliateId, userId, now = new Date() }: { affiliateId: string; userId: string; now?: Date },
): Promise<OperationOutcome> {
  const referred = await admin.from('affiliate_referrals').select('id').eq('referred_user_id', userId).eq('affiliate_id', affiliateId).maybeSingle()
  if (referred.error) return { kind: 'failed', reason: 'read_failed' }
  // The account this partner is about to be given is one of their OWN referrals:
  // linking it would make every commission on it a commission on themselves.
  if (referred.data) return { kind: 'conflict', reason: 'own_referral' }
  const updated = await admin.from('affiliates').update({ user_id: userId, updated_at: now.toISOString() }).eq('id', affiliateId).select('id')
  if (updated.error) {
    return (updated.error as { code?: string }).code === '23505'
      ? { kind: 'conflict', reason: 'account_already_partner' }
      : { kind: 'failed', reason: 'update_failed' }
  }
  return (updated.data ?? []).length ? { kind: 'ok' } : { kind: 'not_found' }
}

/**
 * Approve one commission for payout — only once its hold has passed.
 *
 * The hold is the refund window, so this is the rule that stops us paying out
 * money a refund is about to take back. The comparison is against the row's own
 * `releases_at`, written when it was earned, never recomputed here.
 */
export async function approveCommission(
  admin: Admin,
  { commissionId, approvedBy, now = new Date() }: { commissionId: string; approvedBy: string; now?: Date },
): Promise<OperationOutcome> {
  const found = await admin.from('affiliate_commissions').select('id, status, releases_at').eq('id', commissionId).maybeSingle()
  if (found.error) return { kind: 'failed', reason: 'read_failed' }
  if (!found.data) return { kind: 'not_found' }
  if (found.data.status !== 'pending') return { kind: 'conflict', reason: `status_${found.data.status}` }
  if (new Date(found.data.releases_at as string).getTime() > now.getTime()) return { kind: 'conflict', reason: 'still_held' }

  const updated = await admin
    .from('affiliate_commissions')
    .update({ status: 'approved', approved_at: now.toISOString(), approved_by: approvedBy, updated_at: now.toISOString() })
    .eq('id', commissionId)
    .eq('status', 'pending')
    .select('id')
  if (updated.error) return { kind: 'failed', reason: 'update_failed' }
  return (updated.data ?? []).length ? { kind: 'ok' } : { kind: 'conflict', reason: 'already_decided' }
}

/**
 * Void a commission by hand: a self-referral an operator decided against, a
 * duplicate, a customer who turned out to be the partner's own business. The
 * database makes it final.
 */
export async function reverseCommission(
  admin: Admin,
  { commissionId, reason, now = new Date() }: { commissionId: string; reason: string; now?: Date },
): Promise<OperationOutcome> {
  if (!reason.trim()) return { kind: 'invalid', reason: 'reason_required' }
  const found = await admin.from('affiliate_commissions').select('id, status').eq('id', commissionId).maybeSingle()
  if (found.error) return { kind: 'failed', reason: 'read_failed' }
  if (!found.data) return { kind: 'not_found' }
  if (found.data.status === 'reversed') return { kind: 'conflict', reason: 'already_reversed' }
  const updated = await admin
    .from('affiliate_commissions')
    .update({ status: 'reversed', reversed_at: now.toISOString(), reversed_reason: reason.trim().slice(0, 200), updated_at: now.toISOString() })
    .eq('id', commissionId)
    .select('id')
  if (updated.error) return { kind: 'failed', reason: 'update_failed' }
  return (updated.data ?? []).length ? { kind: 'ok' } : { kind: 'not_found' }
}

/** Mark a referral void: it earns nothing more and stops counting towards the tier. */
export async function voidReferral(
  admin: Admin,
  { referralId, now = new Date() }: { referralId: string; now?: Date },
): Promise<OperationOutcome> {
  const updated = await admin
    .from('affiliate_referrals')
    .update({ status: 'void', updated_at: now.toISOString() })
    .eq('id', referralId)
    .select('id')
  if (updated.error) return { kind: 'failed', reason: 'update_failed' }
  return (updated.data ?? []).length ? { kind: 'ok' } : { kind: 'not_found' }
}

/** A commission an operator enters: a Shopify-billed referral, or a correction. */
export async function addManualCommission(
  admin: Admin,
  { affiliateId, referralId, reference, paymentAmount, currency, rate, now = new Date() }: {
    affiliateId: string
    referralId: string
    reference: string
    paymentAmount: number
    currency: string
    rate: number
    now?: Date
  },
): Promise<OperationOutcome> {
  if (!reference.trim()) return { kind: 'invalid', reason: 'reference_required' }
  if (!(paymentAmount > 0)) return { kind: 'invalid', reason: 'payment_amount' }
  if (!(rate > 0 && rate <= 100)) return { kind: 'invalid', reason: 'rate' }
  if (currency !== 'ILS' && currency !== 'USD') return { kind: 'invalid', reason: 'currency' }

  const referral = await admin.from('affiliate_referrals').select('id, affiliate_id, status').eq('id', referralId).maybeSingle()
  if (referral.error) return { kind: 'failed', reason: 'read_failed' }
  if (!referral.data) return { kind: 'not_found' }
  if (referral.data.affiliate_id !== affiliateId) return { kind: 'invalid', reason: 'referral_not_theirs' }

  const outcome = await recordManualCommission(admin, {
    affiliateId,
    referralId,
    reference: reference.trim().slice(0, 200),
    paymentAmount,
    currency: currency as CommissionCurrency,
    rate,
    now,
  })
  if (outcome.kind === 'recorded') return { kind: 'ok', detail: { commissionId: outcome.commissionId, amount: outcome.amount } }
  if (outcome.kind === 'already_recorded') return { kind: 'conflict', reason: 'reference_already_used' }
  return { kind: 'failed', reason: outcome.kind === 'failed' ? outcome.reason : outcome.kind }
}

/**
 * Draw up a payout statement from everything approved and unpaid in one
 * currency.
 *
 * It does NOT mark anything paid: the money has not moved yet. The commissions
 * are attached to the statement so that the amount can be traced to the payments
 * behind it, and `markPayoutPaid` closes it once the transfer has actually been
 * made.
 */
export async function createPayout(
  admin: Admin,
  { affiliateId, currency, createdBy, note, allowBelowMinimum = false, now = new Date() }: {
    affiliateId: string
    currency: string
    createdBy: string
    note?: string
    /**
     * Pay a balance under the published minimum anyway. The agreement says a
     * balance below the minimum CARRIES OVER, so this is refused by default and
     * an operator has to choose it — which they legitimately do when a partner
     * leaves the program and there is nothing left to carry over into.
     */
    allowBelowMinimum?: boolean
    now?: Date
  },
): Promise<OperationOutcome> {
  if (currency !== 'ILS' && currency !== 'USD') return { kind: 'invalid', reason: 'currency' }
  const approved = await admin
    .from('affiliate_commissions')
    .select('id, amount, earned_at')
    .eq('affiliate_id', affiliateId)
    .eq('currency', currency)
    .eq('status', 'approved')
    .is('payout_id', null)
  if (approved.error) return { kind: 'failed', reason: 'read_failed' }
  const rows = (approved.data ?? []) as { id: string; amount: unknown; earned_at: string }[]
  if (!rows.length) return { kind: 'conflict', reason: 'nothing_approved' }

  const amount = Math.round(rows.reduce((sum, row) => sum + Number(row.amount ?? 0), 0) * 100) / 100
  // The published minimum, in four languages: below it the balance carries over
  // to the next payment rather than being paid. Refused here rather than left to
  // an operator to remember, because a statement under the minimum is a payment
  // the agreement says we do not make.
  if (!allowBelowMinimum && !meetsMinimum(amount, currency, AFFILIATE_TERMS)) {
    return { kind: 'conflict', reason: 'below_minimum' }
  }
  const days = rows.map((row) => row.earned_at).sort()
  const payout = await admin
    .from('affiliate_payouts')
    .insert({
      affiliate_id: affiliateId,
      amount,
      currency,
      status: 'draft',
      period_start: days[0]?.slice(0, 10) ?? null,
      period_end: days[days.length - 1]?.slice(0, 10) ?? null,
      note: note?.slice(0, 1000) ?? null,
      created_by: createdBy,
      created_at: now.toISOString(),
    })
    .select('id')
    .single()
  if (payout.error) return { kind: 'failed', reason: 'insert_failed' }

  const attached = await admin
    .from('affiliate_commissions')
    .update({ payout_id: payout.data.id, updated_at: now.toISOString() })
    .in('id', rows.map((row) => row.id))
    .select('id')
  if (attached.error) return { kind: 'failed', reason: 'attach_failed' }
  return { kind: 'ok', detail: { payoutId: payout.data.id, amount, currency, commissions: rows.length } }
}

/** The transfer has been made: close the statement and mark its commissions paid. */
export async function markPayoutPaid(
  admin: Admin,
  { payoutId, reference, now = new Date() }: { payoutId: string; reference: string; now?: Date },
): Promise<OperationOutcome> {
  if (!reference.trim()) return { kind: 'invalid', reason: 'reference_required' }
  const found = await admin.from('affiliate_payouts').select('id, status').eq('id', payoutId).maybeSingle()
  if (found.error) return { kind: 'failed', reason: 'read_failed' }
  if (!found.data) return { kind: 'not_found' }
  if (found.data.status !== 'draft') return { kind: 'conflict', reason: `status_${found.data.status}` }

  const paidAt = now.toISOString()
  const updated = await admin
    .from('affiliate_payouts')
    .update({ status: 'paid', paid_at: paidAt, reference: reference.trim().slice(0, 200), updated_at: paidAt })
    .eq('id', payoutId)
    .eq('status', 'draft')
    .select('id')
  if (updated.error) return { kind: 'failed', reason: 'update_failed' }
  if (!(updated.data ?? []).length) return { kind: 'conflict', reason: 'already_paid' }

  // Only the APPROVED ones become paid. A commission reversed between the
  // statement and the transfer stays reversed — the database would refuse to
  // revive it anyway, and that refusal is the point.
  const marked = await admin
    .from('affiliate_commissions')
    .update({ status: 'paid', paid_at: paidAt, updated_at: paidAt })
    .eq('payout_id', payoutId)
    .eq('status', 'approved')
    .select('id')
  if (marked.error) return { kind: 'failed', reason: 'commissions_update_failed' }
  return { kind: 'ok', detail: { commissions: (marked.data ?? []).length } }
}

/** Throw away a statement that was not sent: its commissions go back in the queue. */
export async function cancelPayout(
  admin: Admin,
  { payoutId, now = new Date() }: { payoutId: string; now?: Date },
): Promise<OperationOutcome> {
  const found = await admin.from('affiliate_payouts').select('id, status').eq('id', payoutId).maybeSingle()
  if (found.error) return { kind: 'failed', reason: 'read_failed' }
  if (!found.data) return { kind: 'not_found' }
  if (found.data.status !== 'draft') return { kind: 'conflict', reason: `status_${found.data.status}` }
  const detached = await admin
    .from('affiliate_commissions')
    .update({ payout_id: null, updated_at: now.toISOString() })
    .eq('payout_id', payoutId)
    .eq('status', 'approved')
    .select('id')
  if (detached.error) return { kind: 'failed', reason: 'detach_failed' }
  const updated = await admin
    .from('affiliate_payouts')
    .update({ status: 'cancelled', updated_at: now.toISOString() })
    .eq('id', payoutId)
    .eq('status', 'draft')
    .select('id')
  if (updated.error) return { kind: 'failed', reason: 'update_failed' }
  return (updated.data ?? []).length ? { kind: 'ok' } : { kind: 'conflict', reason: 'already_decided' }
}
