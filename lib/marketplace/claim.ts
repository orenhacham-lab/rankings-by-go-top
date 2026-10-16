/**
 * Turning a recorded marketplace order into this account's entitlement.
 *
 * A thin wrapper over ONE database function. The transition itself —
 * converting a trial in place or inserting a row, spending the receipt, and
 * moving billing authority to the marketplace — is
 * `public.claim_marketplace_order` (supabase/migrations/
 * 20261016160000_marketplace_orders.sql), for the reason
 * lib/billing/governance.ts gives: every trusted billing-authority transition
 * in this schema is atomic in the database, not a sequence of writes from a
 * route. A route that half-finished would leave a paying buyer with an
 * account the marketplace governs and no entitlement, or an entitlement
 * nobody is billing for.
 *
 * So this module does exactly three things: it refuses to call with nothing,
 * it maps the function's outcome to a typed result, and it never throws. It
 * decides NOTHING about who may claim what — that lives in the function,
 * where the row is locked.
 *
 * THE TOKEN IS A CAPABILITY, NOT A CREDENTIAL. It says "this receipt is
 * claimable"; it does not say who the claimer is. The caller must already
 * have an authenticated account, and the function attaches the order to THAT
 * account. Two consequences, both deliberate: the buyer's email on the
 * platform does not have to match the email they sign up with (people buy
 * with one address and work with another, and refusing that would strand a
 * paying customer), and a leaked link is bounded — it can be spent once, by
 * whoever holds it, which is the same exposure as any emailed claim link.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Admin = any

export type MarketplaceClaimOutcome =
  /** The entitlement is now active on the order's plan. */
  | { kind: 'claimed' }
  /** The buyer reloaded the link. Nothing changed, and nothing is wrong. */
  | { kind: 'already_claimed' }
  /** No such token, or the receipt is spent, refunded or cancelled. The
   *  caller must NOT distinguish these for the visitor: all it may say is
   *  that this link cannot be used. */
  | { kind: 'unavailable' }
  /** The platform never told us when the period ends, so nothing was
   *  written. A person has to finish this one by hand. */
  | { kind: 'needs_operator'; why: 'period_end_unknown' | 'multiple_current_entitlement_rows' }
  /** The call itself failed. Retryable, and never reported as "no". */
  | { kind: 'failed'; message: string }

export async function claimMarketplaceOrder(
  admin: Admin,
  userId: string | null | undefined,
  claimToken: string | null | undefined,
): Promise<MarketplaceClaimOutcome> {
  const user = userId?.trim()
  const token = claimToken?.trim()
  if (!user || !token) return { kind: 'unavailable' }

  let data: unknown
  let error: { message?: string; code?: string } | null = null
  try {
    const res = await admin.rpc('claim_marketplace_order', { p_user_id: user, p_claim_token: token })
    data = res.data
    error = res.error ?? null
  } catch (err) {
    return { kind: 'failed', message: err instanceof Error ? err.message.slice(0, 120) : 'claim_rpc_threw' }
  }
  if (error) return { kind: 'failed', message: (error.code || error.message || 'claim_rpc_failed').slice(0, 120) }

  switch (typeof data === 'string' ? data : '') {
    case 'claimed':
      return { kind: 'claimed' }
    case 'already_claimed_by_this_account':
      return { kind: 'already_claimed' }
    case 'order_unavailable':
      return { kind: 'unavailable' }
    case 'period_end_unknown':
      return { kind: 'needs_operator', why: 'period_end_unknown' }
    case 'multiple_current_entitlement_rows':
      return { kind: 'needs_operator', why: 'multiple_current_entitlement_rows' }
    default:
      // An answer this code does not recognise means the function and this
      // module disagree about the contract. Never read as success.
      return { kind: 'failed', message: 'unrecognised_claim_outcome' }
  }
}
