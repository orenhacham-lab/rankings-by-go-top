/**
 * The trial bar: "N days left in your free trial — Upgrade now", under the
 * dashboard's top bar. DISPLAY ONLY. It reads the trial state the app already
 * resolves and changes no plan, price, quota, subscription or billing setting;
 * its one action is a link to the billing screen, which owns all of that.
 *
 * WHO SEES IT. Only a website account in its own free trial, or one whose trial
 * has ended and that has not paid yet. Nobody else:
 *   - an administrator (getUserEntitlement answers admin first, as billing does);
 *   - an account that came from Shopify or that Shopify bills
 *     (billing_governance: signup_origin 'shopify_app_store', or authority
 *     'shopify'): Shopify owns its trial and its upgrade, and the embedded app
 *     never shows the website's plans;
 *   - a paying account, including a cancelled one still inside its period;
 *   - an account whose billing state cannot be read right now. The bar is a
 *     nudge, so an unknown state shows nothing rather than a guess.
 *
 * The decision is a pure function of the facts, so the rules above are tested
 * without a database (lib/billing/__qa__/trial-bar.qa.ts).
 */
import type { ServiceRoleClient } from '@/lib/supabase/admin'
import { getUserEntitlement, type UserEntitlement } from '@/lib/subscription'
import { resolveBillingAuthority, type BillingAuthority, type SignupOrigin } from './governance'

export type TrialBarState =
  | { kind: 'hidden' }
  /** Two days or more left, counted in whole days rounded up. */
  | { kind: 'active'; daysLeft: number }
  /** Less than a day (24 hours) left. */
  | { kind: 'last_day' }
  /** The trial ended and nothing replaced it. */
  | { kind: 'expired' }

export interface TrialBarFacts {
  /** null when billing_governance could not be read: the bar then stays hidden. */
  governance: { authority: BillingAuthority; signupOrigin: SignupOrigin | null } | null
  entitlement: Pick<UserEntitlement, 'isAdmin' | 'plan' | 'trialActive' | 'trialEndsAt' | 'hasActiveSubscription'> | null
}

const DAY_MS = 24 * 60 * 60 * 1000
const HIDDEN: TrialBarState = { kind: 'hidden' }

/** An account Shopify bills, or one that was created by installing from the Shopify App Store. */
function fromShopify(governance: NonNullable<TrialBarFacts['governance']>): boolean {
  return governance.authority !== 'website' || governance.signupOrigin === 'shopify_app_store'
}

export function trialBarState(facts: TrialBarFacts, now: Date): TrialBarState {
  const { governance, entitlement } = facts
  if (!governance || !entitlement) return HIDDEN
  if (fromShopify(governance)) return HIDDEN
  if (entitlement.isAdmin) return HIDDEN
  if (entitlement.plan !== 'trial' || entitlement.hasActiveSubscription) return HIDDEN
  // No trial on record (no subscriptions row): there is no date to count from.
  const ends = entitlement.trialEndsAt ? Date.parse(entitlement.trialEndsAt) : NaN
  if (!Number.isFinite(ends)) return HIDDEN
  const left = ends - now.getTime()
  if (!entitlement.trialActive || left <= 0) return { kind: 'expired' }
  const daysLeft = Math.ceil(left / DAY_MS)
  return daysLeft <= 1 ? { kind: 'last_day' } : { kind: 'active', daysLeft }
}

/**
 * Read the facts for one signed-in user. `userId` is always the id the server
 * verified from the session. Both reads are the service role's, and both are
 * filtered by that user (resolveBillingAuthority and getUserEntitlement name
 * `user_id` / `id` themselves). Never throws.
 */
export async function loadTrialBar(admin: ServiceRoleClient, userId: string, now: Date = new Date()): Promise<TrialBarState> {
  try {
    // Governance FIRST: a Shopify-governed account stops here, so the bar never
    // costs a Shopify billing lookup.
    const decision = await resolveBillingAuthority(admin, userId)
    if (!decision.ok) return HIDDEN
    const governance = { authority: decision.authority, signupOrigin: decision.governance?.signupOrigin ?? null }
    if (fromShopify(governance)) return HIDDEN
    const entitlement = await getUserEntitlement(userId, admin, () => now)
    return trialBarState({ governance, entitlement }, now)
  } catch {
    return HIDDEN
  }
}
