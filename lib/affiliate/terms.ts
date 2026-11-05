/**
 * THE PROGRAM'S NUMBERS, in one place.
 *
 * Every surface reads them from here: the public page in four languages
 * (lib/i18n/public/affiliates.ts), the partner's own dashboard, the commission
 * engine (lib/affiliate/commissions.ts) and the defaults of the `affiliates`
 * table (20261009190000_affiliate_program.sql). They are the published offer, so
 * two places holding two values would mean a page promising a rate the engine
 * does not pay.
 *
 * A partner row carries its OWN base_rate/top_rate/top_rate_from, seeded from
 * these defaults, so a negotiated rate never means editing this file — and the
 * engine reads the partner's figures, not these. lib/affiliate/__qa__/terms.qa.ts
 * holds these numbers to the table's defaults and to the public copy.
 */
export const AFFILIATE_TERMS = {
  /**
   * Commission on every payment, for as long as the customer keeps paying.
   *
   * 35 since 2026-11-05, raised from 30 so the three channels promise one
   * number: this page, JVZoo (where the four products pay 35% recurring) and
   * Digistore24 (35%). An affiliate comparing two of them was being shown two
   * different offers, which is the one thing a published rate may not do.
   */
  baseRate: 35,
  /** The higher rate, from this many ACTIVE PAYING referrals onwards. */
  topRate: 40,
  topRateFrom: 10,
  /**
   * The hold. A commission is earned the moment a payment settles and is
   * released this many days later, so a refund inside the refund window reverses
   * a commission that was never paid out.
   */
  holdDays: 30,
  /** Paid once the released balance passes this, in the partner's own currency. */
  minPayoutUsd: 100,
  minPayoutIls: 350,
} as const

export type AffiliateTerms = typeof AFFILIATE_TERMS
