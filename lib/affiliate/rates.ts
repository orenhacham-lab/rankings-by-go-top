/**
 * What a partner is owed on one payment, and when it is theirs.
 *
 * PURE arithmetic, deliberately separate from the database work in
 * ./commissions.ts, because these three answers are the published offer and must
 * be readable and testable on their own: which rate applies, how much that is,
 * and when the hold ends. __qa__/rates.qa.ts covers them.
 */

/** A partner's own rate card, as the `affiliates` row carries it. */
export interface RateCard {
  baseRate: number
  topRate: number
  topRateFrom: number
}

/**
 * The rate for a partner with this many ACTIVE PAYING referrals.
 *
 * "30%, rising to 40% from 10 active paying referrals" is on the public page in
 * four languages and in the agreement, so the comparison is `>=` and counts
 * referrals that are paying NOW — a partner who once had twelve and now has
 * three is back on the base rate, which is what "active" means. The count is
 * taken at the moment the payment arrives, so a partner crossing the threshold
 * earns the higher rate from their next payment onward and nothing is
 * retroactively recalculated (recalculating would also mean rewriting
 * commissions, which the database forbids on purpose).
 */
export function effectiveRate(card: RateCard, activePayingReferrals: number): number {
  if (!Number.isFinite(activePayingReferrals) || activePayingReferrals < 0) return card.baseRate
  return activePayingReferrals >= card.topRateFrom ? card.topRate : card.baseRate
}

/**
 * The commission on a payment, rounded to the currency's two decimals.
 *
 * Rounded HALF UP on the partner's side of a half-agora: the amounts are small,
 * the gesture is cheap, and an argument about a rounding direction costs more
 * than every half-agora we will ever round. A payment of 0 (a full discount, a
 * zero-value renewal) earns 0 rather than failing: the row still records that
 * the payment happened.
 */
export function commissionAmount(paymentAmount: number, rate: number): number {
  if (!Number.isFinite(paymentAmount) || !Number.isFinite(rate) || paymentAmount <= 0 || rate <= 0) return 0
  return Math.round(paymentAmount * rate) / 100
}

/** When a commission earned at `earnedAt` is released from the hold. */
export function releaseAt(earnedAt: Date, holdDays: number): Date {
  return new Date(earnedAt.getTime() + Math.max(0, holdDays) * 24 * 60 * 60 * 1000)
}

/** True once the hold on a commission earned at `earnedAt` has passed. */
export function released(earnedAt: Date, holdDays: number, now: Date): boolean {
  return now.getTime() >= releaseAt(earnedAt, holdDays).getTime()
}

/** Is a released balance big enough to pay out, in the partner's currency? */
export function payable(balance: number, currency: 'ILS' | 'USD', minimums: { minPayoutIls: number; minPayoutUsd: number }): boolean {
  const minimum = currency === 'ILS' ? minimums.minPayoutIls : minimums.minPayoutUsd
  return balance >= minimum
}
