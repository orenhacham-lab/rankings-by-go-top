/**
 * Phase 3 (review correction) — the DB/decision-side logic for
 * POST /api/billing-market/select, extracted so it's directly testable
 * without needing to emulate the Supabase Admin Auth API (updateUserById)
 * inside the FakeAdmin harness. The route wires the real checks (Shopify
 * governance, existing-subscription lookup, locale persistence) as plain
 * injectable async functions; this function only decides the OUTCOME from
 * already-known inputs plus those three checks — it never talks to Next.js
 * request/cookie machinery directly.
 *
 * Every requirement this function enforces (see the route for the full
 * rationale on each):
 *  - only 'ILS' | 'USD' are ever accepted;
 *  - an already-set locale is never overwritten (one-time fill-in, not a
 *    switcher — and since `existingLocale` is always the caller's freshly
 *    re-read live value, repeated/concurrent calls after a value is
 *    observed are correctly refused every time, not just the first);
 *  - a Shopify-governed account is refused outright (billing authority
 *    belongs to Shopify App Pricing, not this endpoint);
 *  - a user who already has a paid PayPal subscription (locale somehow
 *    unset) is refused — this app cannot re-derive which currency that
 *    existing subscription actually bills in, so it must not be guessed;
 *  - 2nd review correction — ATOMIC first-write: two genuinely concurrent
 *    requests (both observing existingLocale as unset before either writes)
 *    can no longer both proceed to persistLocale. `claimSelectionSlot`
 *    (supabase/migrations/20260828180000_add_billing_market_claim_gate.sql) is a
 *    CONDITIONAL UPDATE against a dedicated concurrency-gate column — only
 *    one concurrent caller ever wins it; the loser gets `already_set`
 *    immediately, without ever touching user_metadata.locale. If the WINNER
 *    then fails to persist (a real DB/network error), `releaseSelectionSlot`
 *    releases the claim so a retried request is not permanently locked out.
 */

export type BillingMarketSelectionOutcome =
  | { kind: 'invalid_market' }
  | { kind: 'already_set' }
  | { kind: 'shopify_governed' }
  | { kind: 'existing_paid_subscription' }
  | { kind: 'lookup_failed'; message: string }
  | { kind: 'claim_failed'; message: string }
  | { kind: 'persist_failed'; message: string }
  | { kind: 'persisted'; locale: 'he' | 'en' }

export interface BillingMarketSelectionDeps {
  /** Combines hasPendingShopifyLinkCookie(request) and
   *  isShopifyBillingRequiredForUser(admin, userId) — both already exist and
   *  are independently tested elsewhere; this route only needs their OR. */
  isShopifyGoverned: () => Promise<boolean>
  hasExistingPaidPaypalSubscription: () => Promise<{ ok: true; exists: boolean } | { ok: false; message: string }>
  /** Atomic first-write gate — a conditional UPDATE that only ONE concurrent
   *  caller can win. `wonClaim: false` (not an error) means a concurrent
   *  request already claimed this slot. */
  claimSelectionSlot: () => Promise<{ ok: true; wonClaim: boolean } | { ok: false; message: string }>
  /** Releases a won-but-unused claim after a downstream persist failure, so
   *  the user is never permanently locked out by a transient DB error. */
  releaseSelectionSlot: () => Promise<void>
  persistLocale: (locale: 'he' | 'en') => Promise<{ ok: true } | { ok: false; message: string }>
}

export async function resolveBillingMarketSelection(
  existingLocale: string | null | undefined,
  requestedMarket: string | undefined,
  deps: BillingMarketSelectionDeps,
): Promise<BillingMarketSelectionOutcome> {
  const locale = requestedMarket === 'ILS' ? 'he' : requestedMarket === 'USD' ? 'en' : null
  if (!locale) return { kind: 'invalid_market' }

  // Always checked FIRST, against the live value the caller just re-read —
  // never a value cached from an earlier request in this process. This is
  // what makes repeated/concurrent calls after a market is already set safe:
  // every one of them independently re-reads the current record and refuses.
  if (existingLocale === 'he' || existingLocale === 'en') return { kind: 'already_set' }

  if (await deps.isShopifyGoverned()) return { kind: 'shopify_governed' }

  const existingSub = await deps.hasExistingPaidPaypalSubscription()
  if (!existingSub.ok) return { kind: 'lookup_failed', message: existingSub.message }
  if (existingSub.exists) return { kind: 'existing_paid_subscription' }

  // 2nd review correction — the atomic gate. Placed as the LAST check before
  // any write, so the claim is only ever taken by a request that has already
  // passed every other refusal condition.
  const claim = await deps.claimSelectionSlot()
  if (!claim.ok) return { kind: 'claim_failed', message: claim.message }
  if (!claim.wonClaim) return { kind: 'already_set' }

  const persisted = await deps.persistLocale(locale)
  if (!persisted.ok) {
    await deps.releaseSelectionSlot()
    return { kind: 'persist_failed', message: persisted.message }
  }
  return { kind: 'persisted', locale }
}
