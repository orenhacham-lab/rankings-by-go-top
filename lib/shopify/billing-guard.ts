/**
 * Phase 2 — the CENTRAL Shopify publishing entitlement guard.
 *
 * This is the single choke point for "may this Shopify connection publish
 * right now." It is called from exactly one place —
 * `publishArticleToShopify()` in lib/shopify/publish-article.ts, the ONLY
 * function in the codebase that performs a Shopify article create/update
 * mutation (confirmed by inspecting every caller: the manual publish route
 * and the automation/queue publish path both call that one function, and
 * nothing else in the tree calls shopifyArticleCreate/shopifyArticleUpdate
 * directly). Installing the guard there — before even the write_content
 * scope check — means there is no direct publication path (manual,
 * queue-triggered, cron, or retry) that can bypass it.
 *
 * ALWAYS revalidates live against the Shopify Partner API. The
 * shopify_connections billing columns (shopify_plan_handle,
 * shopify_subscription_status, etc.) are a cache/audit record this guard
 * writes back to AFTER deciding — never a source of truth it reads from to
 * make the decision. This module never applies to non-Shopify publish paths
 * (WordPress has its own, unrelated flow).
 */

import type { createAdminClient } from '@/lib/supabase/admin'
import type { ShopifyConnectionRow } from './api-auth'
import { getActiveShopifySubscription } from './partner-client'
import { getActiveMigrationResult } from './paypal-migration'
import { resolveBillingAuthority } from '@/lib/billing/governance'
import { getUserEntitlement } from '@/lib/subscription'
import { recordShopifyBillingCache } from './billing-cache'
import type { ShopifyPlanHandle } from './constants'

type Admin = ReturnType<typeof createAdminClient>

export type ShopifyPublishDenyReason =
  | 'shop_identity_unverified'
  /** Billing authority itself could not be read — an outage, not a verdict. */
  | 'billing_authority_unavailable'
  /** Website-governed account whose WEBSITE plan is not active. */
  | 'no_active_website_plan'
  | 'paypal_migration_incomplete'
  /** The migration state itself could not be read — an outage, not a verdict. */
  | 'migration_state_unavailable'
  | 'billing_verification_unavailable'
  | 'no_active_shopify_plan'

export type ShopifyPublishEntitlementResult =
  /** Shopify bills this account: a verified Shopify App Pricing plan. */
  | { ok: true; governedBy: 'shopify'; planHandle: ShopifyPlanHandle }
  /** The WEBSITE bills this account: its own entitlement was verified instead. */
  | { ok: true; governedBy: 'website' }
  | { ok: false; reason: ShopifyPublishDenyReason; detail?: string }

const recordBillingCache = recordShopifyBillingCache

/**
 * Fail closed on every branch. `connection` must be the freshly-loaded row
 * for the project attempting to publish (loadShopifyConnection's ownership
 * check already happened upstream in every caller).
 */
export async function checkShopifyPublishEntitlement(
  admin: Admin,
  connection: ShopifyConnectionRow,
  fetchImpl: typeof fetch = fetch,
): Promise<ShopifyPublishEntitlementResult> {
  // 0) WHO BILLS THIS ACCOUNT decides which entitlement applies.
  //
  //    This guard used to run Shopify App Pricing verification for EVERY
  //    Shopify publish, including accounts the WEBSITE bills. A website
  //    customer who connects a store purely as a publishing destination has no
  //    Shopify plan and — for an older direct connection — no shop_gid, so step
  //    1 below refused them unconditionally with 'shop_identity_unverified'.
  //    Their entitlement lives on the website side; demanding a Shopify plan of
  //    them asks the wrong question.
  //
  //    Authority is READ here, never changed. A governance read failure fails
  //    closed, and a website-governed account is still checked — against its
  //    real website entitlement, not waved through.
  const authority = await resolveBillingAuthority(admin, connection.user_id)
  if (!authority.ok) {
    return { ok: false, reason: 'billing_authority_unavailable', detail: authority.reason }
  }
  if (authority.authority !== 'shopify') {
    const entitlement = await getUserEntitlement(connection.user_id, admin)
    if (entitlement.plan === 'entitlement_unavailable') {
      return { ok: false, reason: 'billing_verification_unavailable', detail: 'website entitlement unavailable' }
    }
    const websiteActive = entitlement.isAdmin || entitlement.hasActiveSubscription || entitlement.trialActive
    if (!websiteActive) {
      return { ok: false, reason: 'no_active_website_plan', detail: entitlement.plan }
    }
    return { ok: true, governedBy: 'website' }
  }

  // 1) A connection with no verified Shop GID cannot be checked against the
  //    Partner API at all (activeSubscription requires a real shopId). This
  //    also covers pre-Phase-2 connections that haven't re-verified yet.
  //    Reached ONLY for Shopify-billed accounts, where a Partner-API check is
  //    genuinely required.
  if (!connection.shop_gid) {
    return { ok: false, reason: 'shop_identity_unverified', detail: 'no shop_gid on this connection; reconnect required' }
  }

  // 2) An in-progress or failed PayPal→Shopify migration means the account
  //    must not be treated as safely entitled yet, even if Shopify itself
  //    reports an active plan — the migration might have confirmed Shopify
  //    but not yet safely stopped PayPal (shopify_confirmed), or the PayPal
  //    cancellation itself failed (paypal_cancel_failed) and needs manual
  //    attention before this account is safe to treat as fully migrated.
  //    A FAILED lookup is not "no migration": treating it as none would let a
  //    database error unlock publishing for an account mid-migration, so it
  //    fails closed with its own reason.
  const migration = await getActiveMigrationResult(admin, connection.user_id)
  if (!migration.ok) {
    return { ok: false, reason: 'migration_state_unavailable', detail: migration.reason }
  }
  if (migration.migration) {
    return { ok: false, reason: 'paypal_migration_incomplete', detail: migration.migration.status }
  }

  // 3) The live, authoritative check. Every failure mode of this call is
  //    ALREADY fail-closed (see partner-client.ts) — never treat an
  //    unverifiable result as entitled.
  const result = await getActiveShopifySubscription(connection.shop_gid, fetchImpl, connection.shop_domain)

  if (!result.ok) {
    await recordBillingCache(admin, connection.id, {
      shopify_plan_handle: connection.shopify_plan_handle,
      shopify_subscription_status: 'unknown',
      shopify_trial_ends_at: connection.shopify_trial_ends_at,
      shopify_current_period_end: connection.shopify_current_period_end,
      shopify_current_period_start: connection.shopify_current_period_start,
      shopify_cancel_at_end_of_cycle: connection.shopify_cancel_at_end_of_cycle ?? false,
      shopify_billing_last_error: `verification_failed: ${result.reason}`,
    })
    return { ok: false, reason: 'billing_verification_unavailable', detail: result.reason }
  }

  if (!result.active) {
    await recordBillingCache(admin, connection.id, {
      shopify_plan_handle: null,
      shopify_subscription_status: 'none',
      shopify_trial_ends_at: null,
      shopify_current_period_end: null,
      shopify_current_period_start: null,
      shopify_cancel_at_end_of_cycle: false,
      shopify_billing_last_error: result.reason === 'unrecognized_plan_handle' ? `unrecognized_plan_handle: ${(result.rawHandles ?? []).join(',')}` : null,
    })
    return { ok: false, reason: 'no_active_shopify_plan', detail: result.reason }
  }

  await recordBillingCache(admin, connection.id, {
    shopify_plan_handle: result.planHandle,
    shopify_subscription_status: 'active',
    shopify_trial_ends_at: result.trialEndsAt,
    shopify_current_period_end: result.currentPeriodEnd,
    shopify_current_period_start: result.currentPeriodStart,
    shopify_cancel_at_end_of_cycle: result.cancelAtEndOfCycle,
    shopify_billing_last_error: null,
  })
  return { ok: true, governedBy: 'shopify', planHandle: result.planHandle }
}
