/**
 * Phase 2 (blocker fix) — the CENTRAL Shopify entitlement resolver.
 *
 * A Shopify merchant is buying the SAME Rankings by Go Top plans as a PayPal
 * customer — Shopify is only the billing provider, not a separate product.
 * This module is the single place that decides, for a Shopify-governed user,
 * which internal Rankings plan_code (and therefore which PLAN_LIMITS) they
 * get. lib/subscription.ts's getUserEntitlement()/hasAccess() call this
 * FIRST; when it returns non-null, its answer is AUTHORITATIVE and the
 * normal `subscriptions` table (PayPal/manual/trial) is never consulted for
 * that user — a local trial or a manually-granted subscriptions row can
 * never grant entitlement to a Shopify-governed user (this is exactly the
 * shopify@gotop.co.il reviewer-account scenario: an active, manually granted
 * `large_agency` row with no paypal_subscription_id must NOT bypass Shopify
 * verification once that account is Shopify-connected).
 *
 * Handle → plan_code mapping (verified against the actual repo evidence —
 * lib/subscription.ts's PLAN_LIMITS keys and lib/paypal/client.ts's
 * KNOWN_PLAN_CODES):
 *   regular       -> 'regular'
 *   advanced      -> 'advanced'
 *   premium       -> 'premium'
 *   large-agency  -> 'large_agency'   (hyphen in the Shopify handle,
 *                                       underscore in the internal plan_code
 *                                       — this is the ONLY spelling
 *                                       difference; every other tier is
 *                                       identical on both sides)
 */

import type { SubscriptionPlan } from '@/lib/supabase/types'
import { getActiveShopifySubscription } from './partner-client'
import { recordShopifyBillingCache } from './billing-cache'
import type { ShopifyPlanHandle } from './constants'
import { getActiveMigration } from './paypal-migration'
import { isShopifyBillingAuthority } from '@/lib/billing/governance'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Admin = any

/** Exhaustive, explicit — a missing key here is a compile error (Record over the literal union). */
const SHOPIFY_HANDLE_TO_PLAN_CODE: Record<ShopifyPlanHandle, SubscriptionPlan> = {
  regular: 'regular',
  advanced: 'advanced',
  premium: 'premium',
  'large-agency': 'large_agency',
}

export interface ShopifyGovernedEntitlement {
  governed: true
  /** null = Shopify-governed but no verified active plan yet (floor/trial-tier access; see lib/subscription.ts). */
  planCode: SubscriptionPlan | null
  hasActiveSubscription: boolean
  currentPeriodEnd: string | null
  /** Non-null only when the last check could not be trusted (API outage, unrecognized handle, etc). */
  verificationError: string | null
}

/** General entitlement checks are NOT the same acute "billing-sensitive
 *  action" as an actual publish mutation (see billing-guard.ts, which never
 *  uses the cache) — a short freshness window keeps quota/feature checks
 *  fast while still never trusting an indefinitely stale value.
 *
 *  Cache-tightening fix — 5 minutes (was 1 hour): a cached 'active' entry
 *  must not be trusted for up to an hour after the merchant's real Shopify
 *  billing state changed. This bounds the worst case for any billing-state
 *  change NOT already covered by an explicit invalidation path (uninstall —
 *  see shop-cleanup.ts's applyAppUninstalled; billing return — see
 *  billing-return-processing.ts, which always live-checks + rewrites the
 *  cache on every return, never reads it; migration state — see
 *  getActiveMigration below, read fresh on every call, never cached at all)
 *  to at most 5 minutes. Applies to positive AND negative cache entries
 *  alike — a uniform TTL is the smallest safe policy (a differentiated one
 *  would only reduce Partner API call volume, not risk, at the cost of more
 *  code). Never applied to website-only trial/PayPal caching, which this
 *  module has no involvement with at all. */
const CACHE_FRESHNESS_MS = 5 * 60 * 1000 // 5 minutes

interface ConnectionRow {
  id: string
  shop_domain: string
  shop_gid: string | null
  shopify_plan_handle: string | null
  shopify_subscription_status: 'active' | 'none' | 'unknown' | null
  shopify_current_period_end: string | null
  shopify_current_period_start: string | null
  shopify_billing_verified_at: string | null
}

function fromCache(c: ConnectionRow): ShopifyGovernedEntitlement {
  const handle = c.shopify_plan_handle as ShopifyPlanHandle | null
  const planCode = c.shopify_subscription_status === 'active' && handle && handle in SHOPIFY_HANDLE_TO_PLAN_CODE
    ? SHOPIFY_HANDLE_TO_PLAN_CODE[handle]
    : null
  return {
    governed: true,
    planCode,
    hasActiveSubscription: planCode !== null,
    currentPeriodEnd: planCode !== null ? c.shopify_current_period_end : null,
    verificationError: c.shopify_subscription_status === 'unknown' ? 'stale_or_unverifiable' : null,
  }
}

/**
 * Returns null when this user is NOT Shopify-governed — caller must fall back
 * to the normal PayPal/trial resolution unchanged.
 *
 * GOVERNANCE FIX (production). This used to mean "has no connected Shopify
 * store", which made the mere existence of an integration record decide who
 * bills the account. A website customer connecting Shopify purely to publish
 * was switched onto Shopify billing and, having no Shopify App Pricing
 * subscription, dropped to the zero-entitlement `shopify_billing_required`
 * state. Authority now comes from the durable, server-controlled
 * `billing_governance` record (lib/billing/governance.ts), which changes only
 * through a trusted transition — a verified direct App Store install, or a
 * COMPLETED PayPal→Shopify migration. Creating, disconnecting, revoking,
 * refreshing or failing a connection never changes it.
 *
 * For a Shopify-governed user the behaviour below is unchanged: mid-migration
 * or unverifiable billing returns `planCode: null` (floor tier), never a
 * silent fallback to PayPal data.
 */
export async function resolveShopifyGovernedEntitlement(admin: Admin, userId: string): Promise<ShopifyGovernedEntitlement | null> {
  // AUTHORITY FIRST — before any connection lookup. A website-governed account
  // is not a Shopify billing question at all, however many stores it connects.
  if (!(await isShopifyBillingAuthority(admin, userId))) return null

  const { data } = await admin
    .from('shopify_connections')
    .select('id, shop_domain, shop_gid, shopify_plan_handle, shopify_subscription_status, shopify_current_period_end, shopify_current_period_start, shopify_billing_verified_at')
    .eq('user_id', userId)
    .eq('connection_status', 'connected')
    .is('archived_at', null)
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  // A Shopify-governed account whose store is currently unusable — failed
  // token, uninstalled, disconnected, archived — is STILL Shopify-governed.
  // Returning null here would fall through to the website trial/PayPal
  // resolution and hand the merchant a fresh website trial as a side effect of
  // a token failure, which is exactly what must never happen. It resolves to
  // the zero-entitlement floor instead: the account keeps its Shopify
  // authority and is told to reconnect / choose a plan.
  if (!data) {
    return { governed: true, planCode: null, hasActiveSubscription: false, currentPeriodEnd: null, verificationError: 'no_active_shopify_connection' }
  }
  const connection = data as ConnectionRow

  // An in-progress PayPal→Shopify migration means Shopify is not yet the
  // safely-confirmed sole provider — never grant Shopify-plan entitlement
  // (or fall back to PayPal data) while that's unresolved; floor tier only.
  const activeMigration = await getActiveMigration(admin, userId)
  if (activeMigration) {
    return { governed: true, planCode: null, hasActiveSubscription: false, currentPeriodEnd: null, verificationError: 'paypal_migration_incomplete' }
  }

  const fresh = connection.shopify_billing_verified_at
    && Date.now() - new Date(connection.shopify_billing_verified_at).getTime() < CACHE_FRESHNESS_MS
  if (fresh) return fromCache(connection)

  if (!connection.shop_gid) {
    return { governed: true, planCode: null, hasActiveSubscription: false, currentPeriodEnd: null, verificationError: 'shop_identity_unverified' }
  }

  const result = await getActiveShopifySubscription(connection.shop_gid, fetch, connection.shop_domain)

  if (!result.ok) {
    await recordShopifyBillingCache(admin, connection.id, {
      shopify_plan_handle: connection.shopify_plan_handle,
      shopify_subscription_status: 'unknown',
      shopify_trial_ends_at: null,
      shopify_current_period_end: connection.shopify_current_period_end,
      shopify_current_period_start: connection.shopify_current_period_start,
      shopify_cancel_at_end_of_cycle: false,
      shopify_billing_last_error: `verification_failed: ${result.reason}`,
    })
    // API outage etc. Fail closed for THIS Shopify-governed user only — this
    // never touches or removes access for users who never installed
    // Shopify (they never reach this function at all: it returned null
    // above for them).
    return { governed: true, planCode: null, hasActiveSubscription: false, currentPeriodEnd: null, verificationError: result.reason }
  }

  if (!result.active) {
    await recordShopifyBillingCache(admin, connection.id, {
      shopify_plan_handle: null,
      shopify_subscription_status: 'none',
      shopify_trial_ends_at: null,
      shopify_current_period_end: null,
      shopify_current_period_start: null,
      shopify_cancel_at_end_of_cycle: false,
      shopify_billing_last_error: null,
    })
    return { governed: true, planCode: null, hasActiveSubscription: false, currentPeriodEnd: null, verificationError: null }
  }

  await recordShopifyBillingCache(admin, connection.id, {
    shopify_plan_handle: result.planHandle,
    shopify_subscription_status: 'active',
    shopify_trial_ends_at: result.trialEndsAt,
    shopify_current_period_end: result.currentPeriodEnd,
    // Phase 3 — always whatever the Partner API reports RIGHT NOW; no
    // special-casing for a plan change having reset the cycle boundaries —
    // this write simply reflects Shopify's own current authoritative state.
    shopify_current_period_start: result.currentPeriodStart,
    shopify_cancel_at_end_of_cycle: result.cancelAtEndOfCycle,
    shopify_billing_last_error: null,
  })
  return {
    governed: true,
    planCode: SHOPIFY_HANDLE_TO_PLAN_CODE[result.planHandle],
    hasActiveSubscription: true,
    currentPeriodEnd: result.currentPeriodEnd,
    verificationError: null,
  }
}

/**
 * Lightweight, CACHE-ONLY variant for hasAccess() (middleware hot path) —
 * never makes a live Partner API call (that would put an external network
 * dependency in front of every page load). A never-verified or long-stale
 * cache fails closed (no access) rather than granting anything; the cache is
 * kept fresh by every publish attempt, billing-page load, connector-home
 * load, and pricing-return — a user actively using the product will have a
 * fresh cache almost all the time.
 */
export async function isShopifyGovernedAndActive(admin: Admin, userId: string): Promise<{ governed: boolean; active: boolean }> {
  // Same authority rule as resolveShopifyGovernedEntitlement — a connection
  // row never decides governance on its own.
  if (!(await isShopifyBillingAuthority(admin, userId))) return { governed: false, active: false }

  const { data } = await admin
    .from('shopify_connections')
    .select('shopify_subscription_status, shopify_billing_verified_at')
    .eq('user_id', userId)
    .eq('connection_status', 'connected')
    .is('archived_at', null)
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (!data) return { governed: false, active: false }
  const row = data as { shopify_subscription_status: string | null; shopify_billing_verified_at: string | null }
  const fresh = row.shopify_billing_verified_at
    && Date.now() - new Date(row.shopify_billing_verified_at).getTime() < CACHE_FRESHNESS_MS
  return { governed: true, active: fresh === true && row.shopify_subscription_status === 'active' }
}
