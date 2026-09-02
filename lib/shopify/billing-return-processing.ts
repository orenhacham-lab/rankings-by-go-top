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
import { getActiveShopifySubscription, describeInactiveSubscription } from './partner-client'
import { recordShopifyBillingCache } from './billing-cache'
import { confirmShopifyActiveAndAdvance } from './paypal-migration'
import { loadBillingIntentByNonce, consumeBillingIntent, hashBillingIntentNonce, isEmbeddedBillingIntent } from './billing-intent'
import { getShopifyOAuthConfigForEdition, verifyShopifyHmac, type ShopifyAppEdition } from './oauth'

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
  /**
   * Shopify confirmed the plan, but finishing the PayPal→Shopify migration did
   * NOT complete: the migration state could not be read, the PayPal
   * cancellation failed, or the atomic completion could not be confirmed.
   * Reporting 'success' here would tell a customer their migration is done
   * while their PayPal subscription is still live or their billing authority
   * never moved.
   */
  | 'migration_incomplete'
  | 'success'
  /**
   * COOKIE-LESS RECOVERY. No usable intent cookie reached us, but Shopify
   * itself vouched for the shop (a valid HMAC over this exact callback), the
   * shop resolves to a live connection, and a LIVE subscription check then
   * confirmed an active, recognized plan. The billing cache is reconciled from
   * that verified answer. Deliberately a distinct outcome from 'success': no
   * intent was spent, so no PayPal→Shopify migration is advanced here.
   */
  | 'reconciled_without_intent'

export interface BillingReturnResult {
  outcome: BillingReturnOutcome
  /** null only for the outcomes reached before any intent row is known (missing/invalid cookie). */
  projectId: string | null
  /**
   * True when this billing round-trip STARTED inside the embedded Shopify app,
   * so the caller must return the merchant to the embedded app rather than to
   * the website dashboard. Known from the intent's server-stamped origin, or —
   * on the cookie-less path — from the fact that Shopify itself signed the
   * callback, which only happens for an app-embedded/Admin-originated return.
   */
  embedded: boolean
  /** The connection's OWN canonical shop domain, for building that embedded
   *  destination server-side. Never a value from the request. */
  shopDomain: string | null
}

/**
 * COOKIE-LESS RECOVERY, authorized by Shopify's OWN signature.
 *
 * Reached only when no intent nonce arrived — the production case, because
 * Shopify renders the billing return inside the Admin iframe where our
 * SameSite=Lax intent cookie is third-party and is not sent. Weakening that
 * cookie to SameSite=None is not an option: it is the sole authorization for
 * migration advance and PayPal cancellation.
 *
 * What IS trusted here: a valid HMAC over this exact callback, computed with
 * an app secret only Shopify and we hold. That proves Shopify generated this
 * request for this shop. Everything else is still resolved server-side:
 *
 *   - the shop comes from the SIGNED params, then must resolve to a LIVE,
 *     connected, non-archived connection with a verified shop_gid;
 *   - the connection's own app edition must match the app whose secret
 *     verified the signature, so a signature from one app can never speak for
 *     a connection that belongs to the other;
 *   - entitlement is NEVER taken from charge_id or plan_handle — those are
 *     not read at all. The plan is confirmed by the same LIVE subscription
 *     check the app performs everywhere else.
 *
 * What this path deliberately does NOT do: consume an intent (there is none),
 * advance a PayPal→Shopify migration, or cancel a PayPal subscription. Those
 * stay behind the intent-authorized path, so a replayed callback can never
 * repeat an irreversible billing transition. Re-running this is safe: the only
 * write is the billing-cache upsert, which is idempotent.
 */
async function reconcileFromVerifiedShopifyCallback(
  admin: Admin,
  callbackParams: Record<string, string> | undefined,
  fetchImpl: typeof fetch,
): Promise<BillingReturnResult> {
  if (!callbackParams || !callbackParams.hmac) return result('billing_intent_missing', null)

  // 1) WHICH app signed this. Each edition is tried against its own secret;
  //    whichever verifies is the app Shopify was speaking for. No fallback
  //    "any secret will do" — the winning edition is carried forward and
  //    re-checked against the connection below.
  let signedBy: ShopifyAppEdition | null = null
  for (const edition of ['public', 'legacy'] as const) {
    const config = getShopifyOAuthConfigForEdition(edition)
    if (config && verifyShopifyHmac(callbackParams, config.clientSecret)) { signedBy = edition; break }
  }
  if (!signedBy) return result('billing_intent_missing', null)

  const shop = normalizeShopDomain(callbackParams.shop ?? '')
  if (!shop) return result('billing_intent_missing', null)

  // 2) The connection is resolved from the SIGNED shop, server-side.
  const { data: connData } = await admin
    .from('shopify_connections')
    .select('id, project_id, user_id, shop_domain, shop_gid, oauth_app_edition')
    .eq('shop_domain', shop)
    .is('archived_at', null)
    .eq('connection_status', 'connected')
    .maybeSingle()
  const connection = connData as {
    id: string; project_id: string; user_id: string; shop_domain: string
    shop_gid: string | null; oauth_app_edition: ShopifyAppEdition | null
  } | null
  if (!connection) return result('connection_not_found', null, { embedded: true, shopDomain: shop })
  // A NULL edition predates the two-app split and is treated as 'legacy',
  // the same assumption every other reader makes.
  if ((connection.oauth_app_edition ?? 'legacy') !== signedBy) {
    return result('shop_mismatch', connection.project_id, { embedded: true, shopDomain: connection.shop_domain })
  }
  if (!connection.shop_gid) {
    return result('shop_identity_unverified', connection.project_id, { embedded: true, shopDomain: connection.shop_domain })
  }

  const route = { embedded: true, shopDomain: connection.shop_domain }

  // 3) The LIVE check — the only thing that may grant anything.
  const verified = await getActiveShopifySubscription(connection.shop_gid, fetchImpl, connection.shop_domain)
  if (!verified.ok) {
    await recordShopifyBillingCache(admin, connection.id, {
      shopify_plan_handle: null, shopify_subscription_status: 'unknown',
      shopify_trial_ends_at: null, shopify_current_period_end: null, shopify_cancel_at_end_of_cycle: false,
      shopify_billing_last_error: `verification_failed: ${verified.reason}`,
    })
    return result('billing_verification_unavailable', connection.project_id, route)
  }
  if (!verified.active) {
    await recordShopifyBillingCache(admin, connection.id, {
      shopify_plan_handle: null, shopify_subscription_status: 'none',
      shopify_trial_ends_at: null, shopify_current_period_end: null, shopify_cancel_at_end_of_cycle: false,
      shopify_billing_last_error: describeInactiveSubscription(verified.reason, verified.rawHandles),
    })
    return result(verified.reason === 'unrecognized_plan_handle' ? 'unrecognized_plan' : 'no_active_plan', connection.project_id, route)
  }

  await recordShopifyBillingCache(admin, connection.id, {
    shopify_plan_handle: verified.planHandle, shopify_subscription_status: 'active',
    shopify_trial_ends_at: verified.trialEndsAt, shopify_current_period_end: verified.currentPeriodEnd,
    shopify_cancel_at_end_of_cycle: verified.cancelAtEndOfCycle, shopify_billing_last_error: null,
  })
  return result('reconciled_without_intent', connection.project_id, route)
}

/** Shape a result, defaulting the two routing fields so no branch can forget them. */
function result(
  outcome: BillingReturnOutcome,
  projectId: string | null,
  opts: { embedded?: boolean; shopDomain?: string | null } = {},
): BillingReturnResult {
  return { outcome, projectId, embedded: opts.embedded === true, shopDomain: opts.shopDomain ?? null }
}

export async function processShopifyBillingReturn(
  admin: Admin,
  args: {
    nonce: string | undefined
    suppliedShopRaw: string | null
    /**
     * The callback's FULL query as key→value, used ONLY to verify Shopify's
     * own HMAC on the cookie-less recovery path below. Absent (the default)
     * disables that path entirely, which is what every existing caller and
     * test gets unless it opts in.
     */
    callbackParams?: Record<string, string>
  },
  fetchImpl: typeof fetch = fetch,
): Promise<BillingReturnResult> {
  const { nonce, suppliedShopRaw, callbackParams } = args

  // NO USABLE INTENT COOKIE. Shopify renders this return inside the Admin
  // iframe, where our SameSite=Lax intent cookie is a third-party cookie and
  // is simply not sent — that is exactly what happened in production on Sep 2.
  // Rather than dead-ending the merchant, fall back to an identity SHOPIFY
  // vouched for. `charge_id` and `plan_handle` are NOT authorization and are
  // never read; the fallback authorizes nothing by itself either — it only
  // permits the same LIVE subscription check the app already performs, and
  // caches its verified answer.
  if (!nonce) return reconcileFromVerifiedShopifyCallback(admin, callbackParams, fetchImpl)

  const loaded = await loadBillingIntentByNonce(admin, nonce)
  // Not found (wrong/forged/unknown nonce) — no row to attribute a project
  // to; zero side effects below this point for this call.
  if (!loaded.found) return result('billing_intent_invalid', null)
  const embedded = loaded.found ? isEmbeddedBillingIntent(loaded.row.intended_action) : false
  if (loaded.expired) return result('billing_intent_expired', loaded.row.project_id, { embedded, shopDomain: loaded.row.shop_domain })
  if (loaded.alreadyConsumed) {
    // Idempotent no-op: no Partner API call, no cache write, no migration
    // advance — see the module header.
    return result('billing_intent_already_processed', loaded.row.project_id, { embedded, shopDomain: loaded.row.shop_domain })
  }

  const intent = loaded.row
  const route = { embedded, shopDomain: intent.shop_domain }

  const { data: connData } = await admin
    .from('shopify_connections')
    .select('id, project_id, user_id, shop_domain, shop_gid')
        .eq('id', intent.connection_id)
    .is('archived_at', null)
    .maybeSingle()
  const connection = connData as {
    id: string; project_id: string; user_id: string; shop_domain: string; shop_gid: string | null
  } | null
  if (!connection) return result('connection_not_found', intent.project_id, route)

  // `shop` is an ADDITIONAL equality check only — never the lookup key, and
  // a mismatch does NOT consume the intent (preserves it for a legitimate
  // retry with the correct value).
  if (suppliedShopRaw !== null) {
    const suppliedShop = normalizeShopDomain(suppliedShopRaw)
    if (!suppliedShop || suppliedShop !== connection.shop_domain) {
      return result('shop_mismatch', intent.project_id, route)
    }
  }
  if (!connection.shop_gid) {
    return result('shop_identity_unverified', intent.project_id, route)
  }

  // Spend the intent NOW, before any account-level side effect. A lost race
  // (consumed by a concurrent request) is the same no-side-effect outcome as
  // an already-consumed intent.
  const consumedNow = await consumeBillingIntent(admin, hashBillingIntentNonce(nonce))
  if (!consumedNow) return result('billing_intent_already_processed', intent.project_id, route)

  const verified = await getActiveShopifySubscription(connection.shop_gid, fetchImpl, connection.shop_domain)

  if (!verified.ok) {
    await recordShopifyBillingCache(admin, connection.id, {
      shopify_plan_handle: null, shopify_subscription_status: 'unknown',
      shopify_trial_ends_at: null, shopify_current_period_end: null, shopify_cancel_at_end_of_cycle: false,
      shopify_billing_last_error: `verification_failed: ${verified.reason}`,
    })
    return result('billing_verification_unavailable', intent.project_id, route)
  }

  if (!verified.active) {
    await recordShopifyBillingCache(admin, connection.id, {
      shopify_plan_handle: null, shopify_subscription_status: 'none',
      shopify_trial_ends_at: null, shopify_current_period_end: null, shopify_cancel_at_end_of_cycle: false,
      shopify_billing_last_error: describeInactiveSubscription(verified.reason, verified.rawHandles),
    })
    return result(verified.reason === 'unrecognized_plan_handle' ? 'unrecognized_plan' : 'no_active_plan', intent.project_id, route)
  }

  await recordShopifyBillingCache(admin, connection.id, {
    shopify_plan_handle: verified.planHandle, shopify_subscription_status: 'active',
    shopify_trial_ends_at: verified.trialEndsAt, shopify_current_period_end: verified.currentPeriodEnd,
    shopify_cancel_at_end_of_cycle: verified.cancelAtEndOfCycle, shopify_billing_last_error: null,
  })
  // The migration's own result decides the outcome. It used to be discarded,
  // so a failed PayPal cancellation or an unconfirmed completion still
  // reported success.
  const advanced = await confirmShopifyActiveAndAdvance(admin, connection.user_id, fetchImpl)
  if (advanced && (advanced.cancelFailed || advanced.dbWriteUnconfirmed || advanced.status !== 'completed')) {
    console.warn('[shopify-billing-return] plan confirmed but the migration did not complete', {
      status: advanced.status,
      cancelFailed: advanced.cancelFailed === true,
      dbWriteUnconfirmed: advanced.dbWriteUnconfirmed === true,
    })
    return result('migration_incomplete', intent.project_id, route)
  }

  return result('success', intent.project_id, route)
}
