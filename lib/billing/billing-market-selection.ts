/**
 * w17 — the billing market LOCKS at the first PayPal checkout.
 *
 * Before w17 this module decided POST /api/billing-market/select, where the
 * client sent the currency it wanted and the choice was written into
 * user_metadata.locale (the language). Both are gone: the client never sends
 * a currency, and billing never writes the language. The market is now
 * decided on the server (lib/billing/server-market.ts) and stored in its own
 * place — auth app_metadata.billing_market, which only the server can write —
 * exactly once, by app/api/paypal/activate after PayPal has verified the
 * subscription.
 *
 * The market stored is the one PayPal really charges: the market of the
 * VERIFIED PayPal plan id (lib/paypal/checkout-plans.ts marketForPayPalPlanId),
 * never a value from the request body.
 *
 * Invariants kept from the old route:
 *  - only a known market is ever written;
 *  - an already-stored market is never overwritten (one-time, not a switcher)
 *    — `existingMarket` is the caller's freshly re-read live value;
 *  - ATOMIC first write: `claimSelectionSlot` is the conditional UPDATE on
 *    public.profiles.billing_market_claimed_at
 *    (supabase/migrations/20260828180000_add_billing_market_claim_gate.sql,
 *    already in production; users cannot write it since the OWASP hardening).
 *    Only one concurrent caller wins; the loser gets `already_set` without
 *    writing. If the winner's write fails, the claim is released so a later
 *    checkout can still lock it.
 *  - a Shopify-governed account is refused (Shopify bills it).
 */

import { isBillingMarket, type BillingMarket } from '@/lib/billing/market'

export type BillingMarketLockOutcome =
  | { kind: 'unknown_market' }
  | { kind: 'already_set' }
  | { kind: 'shopify_governed' }
  | { kind: 'claim_failed'; message: string }
  | { kind: 'persist_failed'; message: string }
  | { kind: 'persisted'; market: BillingMarket }

export interface BillingMarketLockDeps {
  isShopifyGoverned: () => Promise<boolean>
  /** Atomic first-write gate — a conditional UPDATE only ONE concurrent
   *  caller can win. `wonClaim: false` (not an error) means it is taken. */
  claimSelectionSlot: () => Promise<{ ok: true; wonClaim: boolean } | { ok: false; message: string }>
  /** Releases a won-but-unused claim after a failed write. */
  releaseSelectionSlot: () => Promise<void>
  /** Writes app_metadata.billing_market. Never user_metadata. */
  persistMarket: (market: BillingMarket) => Promise<{ ok: true } | { ok: false; message: string }>
}

export async function lockBillingMarket(
  existingMarket: unknown,
  paidMarket: BillingMarket | null | undefined,
  deps: BillingMarketLockDeps,
): Promise<BillingMarketLockOutcome> {
  if (!isBillingMarket(paidMarket)) return { kind: 'unknown_market' }

  // Checked FIRST, against the live value the caller just re-read.
  if (isBillingMarket(existingMarket)) return { kind: 'already_set' }

  if (await deps.isShopifyGoverned()) return { kind: 'shopify_governed' }

  // The atomic gate, as the LAST check before the write.
  const claim = await deps.claimSelectionSlot()
  if (!claim.ok) return { kind: 'claim_failed', message: claim.message }
  if (!claim.wonClaim) return { kind: 'already_set' }

  const persisted = await deps.persistMarket(paidMarket)
  if (!persisted.ok) {
    await deps.releaseSelectionSlot()
    return { kind: 'persist_failed', message: persisted.message }
  }
  return { kind: 'persisted', market: paidMarket }
}
