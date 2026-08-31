/**
 * Phase 2 (blocker fix) — the full, testable logic behind
 * app/api/shopify/billing/return/route.ts, extracted so it can be exercised
 * with FakeAdmin + an injectable fetch (same pattern as
 * lib/paypal/webhook-processing.ts's processVerifiedPayPalWebhookEvent).
 * The route handler itself is now a thin wrapper: read the intent cookie,
 * call this function, translate the returned `outcome` to a redirect.
 *
 * Every outcome other than 'success' is guaranteed, by construction, to
 * reach this function's return statement WITHOUT having called
 * recordShopifyBillingCache or confirmShopifyActiveAndAdvance — see the
 * inline comments at each early-return below. lib/shopify/__qa__/
 * phase2-billing-intent.qa.ts asserts this directly against a FakeAdmin's
 * table contents (not just the return value) for every invalid-callback case.
 */

import type { createAdminClient } from '@/lib/supabase/admin'
import { normalizeShopDomain } from './domain'
import { getActiveShopifySubscription } from './partner-client'
import { recordShopifyBillingCache } from './billing-cache'
import { confirmShopifyActiveAndAdvance } from './paypal-migration'
import { loadBillingIntentByNonce, consumeBillingIntent, hashBillingIntentNonce } from './billing-intent'

type Admin = ReturnType<typeof createAdminClient>

export type BillingReturnOutcome =
  | 'billing_intent_missing'
  | 'billing_intent_invalid'
  | 'billing_intent_expired'
  | 'billing_intent_already_processed'
  | 'connection_not_found'
  | 'shop_mismatch'
  | 'shop_identity_unverified'
  | 'billing_verification_unavailable'
  | 'no_active_plan'
  | 'unrecognized_plan'
  | 'success'

export interface BillingReturnResult {
  outcome: BillingReturnOutcome
  /** null only for the two outcomes reached before any intent row is known (missing/invalid cookie). */
  projectId: string | null
}

export async function processShopifyBillingReturn(
  admin: Admin,
  args: { nonce: string | undefined; suppliedShopRaw: string | null },
  fetchImpl: typeof fetch = fetch,
): Promise<BillingReturnResult> {
  const { nonce, suppliedShopRaw } = args

  if (!nonce) return { outcome: 'billing_intent_missing', projectId: null }

  const loaded = await loadBillingIntentByNonce(admin, nonce)
  // Not found (wrong/forged/unknown nonce) — no row to attribute a project
  // to; zero side effects below this point for this call.
  if (!loaded.found) return { outcome: 'billing_intent_invalid', projectId: null }
  if (loaded.expired) return { outcome: 'billing_intent_expired', projectId: loaded.row.project_id }
  if (loaded.alreadyConsumed) {
    // Idempotent no-op: no Partner API call, no cache write, no migration
    // advance — see the module header.
    return { outcome: 'billing_intent_already_processed', projectId: loaded.row.project_id }
  }

  const intent = loaded.row

  const { data: connData } = await admin
    .from('shopify_connections')
    .select('id, project_id, user_id, shop_domain, shop_gid')
        .eq('id', intent.connection_id)
    .is('archived_at', null)
    .maybeSingle()
  const connection = connData as { id: string; project_id: string; user_id: string; shop_domain: string; shop_gid: string | null } | null
  if (!connection) return { outcome: 'connection_not_found', projectId: intent.project_id }

  // `shop` is an ADDITIONAL equality check only — never the lookup key, and
  // a mismatch does NOT consume the intent (preserves it for a legitimate
  // retry with the correct value).
  if (suppliedShopRaw !== null) {
    const suppliedShop = normalizeShopDomain(suppliedShopRaw)
    if (!suppliedShop || suppliedShop !== connection.shop_domain) {
      return { outcome: 'shop_mismatch', projectId: intent.project_id }
    }
  }
  if (!connection.shop_gid) {
    return { outcome: 'shop_identity_unverified', projectId: intent.project_id }
  }

  // Spend the intent NOW, before any account-level side effect. A lost race
  // (consumed by a concurrent request) is the same no-side-effect outcome as
  // an already-consumed intent.
  const consumedNow = await consumeBillingIntent(admin, hashBillingIntentNonce(nonce))
  if (!consumedNow) return { outcome: 'billing_intent_already_processed', projectId: intent.project_id }

  const result = await getActiveShopifySubscription(connection.shop_gid, fetchImpl, connection.shop_domain)

  if (!result.ok) {
    await recordShopifyBillingCache(admin, connection.id, {
      shopify_plan_handle: null, shopify_subscription_status: 'unknown',
      shopify_trial_ends_at: null, shopify_current_period_end: null, shopify_cancel_at_end_of_cycle: false,
      shopify_billing_last_error: `verification_failed: ${result.reason}`,
    })
    return { outcome: 'billing_verification_unavailable', projectId: intent.project_id }
  }

  if (!result.active) {
    await recordShopifyBillingCache(admin, connection.id, {
      shopify_plan_handle: null, shopify_subscription_status: 'none',
      shopify_trial_ends_at: null, shopify_current_period_end: null, shopify_cancel_at_end_of_cycle: false,
      shopify_billing_last_error: result.reason === 'unrecognized_plan_handle' ? `unrecognized_plan_handle: ${(result.rawHandles ?? []).join(',')}` : null,
    })
    return { outcome: result.reason === 'unrecognized_plan_handle' ? 'unrecognized_plan' : 'no_active_plan', projectId: intent.project_id }
  }

  await recordShopifyBillingCache(admin, connection.id, {
    shopify_plan_handle: result.planHandle, shopify_subscription_status: 'active',
    shopify_trial_ends_at: result.trialEndsAt, shopify_current_period_end: result.currentPeriodEnd,
    shopify_cancel_at_end_of_cycle: result.cancelAtEndOfCycle, shopify_billing_last_error: null,
  })
  await confirmShopifyActiveAndAdvance(admin, connection.user_id, fetchImpl)

  return { outcome: 'success', projectId: intent.project_id }
}
