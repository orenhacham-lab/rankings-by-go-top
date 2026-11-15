/**
 * Attaching a paid receipt to the account its buyer actually signed up with.
 *
 * WHY THIS EXISTS. A marketplace purchase is delivered as a claim link in an
 * email, and until now that link was the only route: the token is a capability
 * (lib/marketplace/claim.ts), so whoever holds it claims the receipt onto the
 * account they are signed into. A buyer who never opens that email signs up at
 * the front door instead, lands on the trial, and concludes the product is
 * broken while a paid receipt sits unclaimed beside their account.
 *
 * That is not hypothetical: Digistore24's own reviewer did exactly this on
 * 14.11.2026 — order 78906016, bought at 12:00 UTC with one address, an account
 * created at 12:01 under the same address and left on a 7-day trial — and
 * reported it as a bug against the product. We answered that a purchase will
 * attach itself, and this is that answer.
 *
 * WHAT MAKES IT SAFE. The email here is NOT a value anybody typed at us. It is
 * the address Supabase has verified for the signed-in account: `email` only
 * counts when `email_confirmed_at` is set, which means the person holding this
 * session proved they receive mail at it. The buyer email on the receipt came
 * from the platform's own signed delivery (lib/marketplace/intake.ts). So the
 * match is between two addresses we each have independent evidence for, and
 * the grant is still performed by the same locked database function that the
 * link uses — this module decides nothing about plans, periods or authority.
 *
 * WHAT IT DELIBERATELY WILL NOT DO:
 *   - It never claims for an account that already has a paid entitlement
 *     (`active` or `cancelled`): a second receipt must not silently replace a
 *     plan somebody is already being billed for. Those buyers keep the link.
 *   - It never claims on an unverified address. An account can be created with
 *     any address; without the confirmation, matching on it would hand a
 *     stranger a paid plan by typing a buyer's email at sign-up.
 *   - It never throws. Every failure answers an outcome, because this runs
 *     beside a page render: a receipt that cannot be attached right now must
 *     cost the merchant a trial screen, never an error page.
 */
import { claimMarketplaceOrder } from './claim'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Admin = any

export type AutoClaimOutcome =
  /** No verified address, or the account already has a paid entitlement. */
  | 'not_eligible'
  /** Nothing unclaimed is on record for that address. The ordinary case. */
  | 'no_order'
  /** The receipt is now this account's plan. */
  | 'claimed'
  /** It was already this account's. Nothing changed, nothing is wrong. */
  | 'already_claimed'
  /** Spent, refunded or cancelled between the read and the claim. */
  | 'unavailable'
  /** The platform never said when the period ends: a person must finish it. */
  | 'needs_operator'
  /** The read or the call failed. Retried on the next load, never reported as "no". */
  | 'failed'

/** What this needs of the signed-in user. Supabase's own user object satisfies it. */
export type ClaimingUser = {
  id: string
  email?: string | null
  /** Supabase sets this when the address is confirmed; null until then. */
  email_confirmed_at?: string | null
}

/** The address, only when it is one Supabase has verified. */
export function verifiedEmailOf(user: ClaimingUser | null | undefined): string | null {
  if (!user?.email || !user.email_confirmed_at) return null
  const email = user.email.trim().toLowerCase()
  return email.includes('@') ? email : null
}

export async function autoClaimByBuyerEmail(admin: Admin, user: ClaimingUser | null | undefined): Promise<AutoClaimOutcome> {
  const email = verifiedEmailOf(user)
  if (!email || !user?.id) return 'not_eligible'

  try {
    // A paid plan already here is never replaced from an email match.
    const sub = await admin
      .from('subscriptions')
      .select('status')
      .eq('user_id', user.id)
      .in('status', ['active', 'cancelled'])
      .limit(1)
    if (sub.error) return 'failed'
    if ((sub.data?.length ?? 0) > 0) return 'not_eligible'

    // buyer_email is stored lower-cased by the table's own CHECK constraint,
    // and indexed (idx_marketplace_orders_buyer_email).
    const orders = await admin
      .from('marketplace_orders')
      .select('claim_token')
      .eq('buyer_email', email)
      .eq('status', 'paid')
      .is('claimed_at', null)
      .order('created_at', { ascending: false })
      .limit(1)
    if (orders.error) return 'failed'
    const token = (orders.data as { claim_token: string | null }[] | null)?.[0]?.claim_token
    if (!token) return 'no_order'

    const outcome = await claimMarketplaceOrder(admin, user.id, token)
    switch (outcome.kind) {
      case 'claimed': return 'claimed'
      case 'already_claimed': return 'already_claimed'
      case 'unavailable': return 'unavailable'
      case 'needs_operator':
        console.error('[marketplace-auto-claim] needs an operator', { why: outcome.why })
        return 'needs_operator'
      case 'failed':
        console.error('[marketplace-auto-claim] claim failed', { message: outcome.message })
        return 'failed'
    }
  } catch {
    return 'failed'
  }
}
