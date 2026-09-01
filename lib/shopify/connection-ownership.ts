/**
 * THE single place a Shopify shop's ownership is claimed, reactivated or
 * transferred. Both proof-carrying flows funnel through here:
 *
 *   A. authorization-code — app/api/shopify/oauth/callback/route.ts, after the
 *      callback HMAC is verified, the signed nonce matches the one-time state,
 *      the state is atomically consumed, the code is exchanged for a token, and
 *      the Shopify-returned identity matches the requested shop.
 *   B. embedded managed install — app/api/shopify/link/complete/route.ts,
 *      completing a pending install created by
 *      app/api/shopify/embedded-install/route.ts after the App Bridge session
 *      token's signature/issuer/audience/expiry/destination were verified and
 *      the offline token exchange succeeded for that same shop.
 *
 * A user-entered myshopify domain, an authenticated Rankings session, a cookie
 * or a pending-install row NEVER reach this module on their own — each caller
 * must already hold fresh cryptographic proof for the shop it passes in.
 *
 * ---------------------------------------------------------------------------
 * Why this module exists in this shape.
 *
 * Production bug: after an uninstall, lib/shopify/shop-cleanup.ts's
 * applyAppUninstalled keeps the row as a TOMBSTONE (connection_status
 * 'failed', last_error 'app_uninstalled', granted_scopes '{}', token replaced
 * by the revocation sentinel). The previous one-owner-per-shop guards — an
 * inline copy in oauth/callback and a second copy here — matched on
 * shop_domain with NO status filter, so that tombstone blocked the shop
 * forever: reinstall + reconnect returned shop_already_connected permanently,
 * from any project including the original owner's.
 *
 * Two subtly different copies of a security guard is exactly how that kind of
 * defect survives, so both are now replaced by one call into the
 * claim_shopify_shop_ownership RPC. The decision and the write happen inside a
 * single transaction, under a per-shop advisory lock, with the row re-read
 * after the lock is taken — so a concurrent reconnect cannot duplicate a
 * claim, overwrite a live owner, or win by last-write.
 * ---------------------------------------------------------------------------
 */

import type { createAdminClient } from '@/lib/supabase/admin'
import { initiateMigrationIfPayPalSubscriber } from './paypal-migration'

type Admin = ReturnType<typeof createAdminClient>

/**
 * How the caller proved it controls this shop. Recorded to make it impossible
 * to call this module without having stated which verified flow you came from
 * — there is deliberately no "trust me" variant.
 */
export type ShopOwnershipProof =
  /** Verified OAuth callback: HMAC + nonce/state consumed + code exchanged +
   *  Shopify identity matched the requested shop. */
  | 'oauth_callback_verified'
  /** Verified App Bridge session token + successful offline token exchange for
   *  the same shop. */
  | 'session_token_exchange_verified'

export type ClaimShopResult =
  | { ok: true; connectionId: string; outcome: 'reactivated' | 'claimed' }
  | { ok: false; reason: 'shop_already_connected' | 'shop_not_reclaimable' | 'save_failed' }

/** Outcome codes the RPC may return, mapped to the caller-facing reasons. */
const RPC_BLOCKED: Record<string, ClaimShopResult extends never ? never : 'shop_already_connected' | 'shop_not_reclaimable'> = {
  shop_already_connected: 'shop_already_connected',
  blocked_not_eligible: 'shop_not_reclaimable',
}

export async function claimShopForProject(admin: Admin, args: {
  userId: string
  projectId: string
  shopDomain: string
  shopGid: string | null
  accessTokenEncrypted: string
  /**
   * The rest of the expiring offline grant. Passed to the RPC in the SAME call
   * as the access token, so a live row can never hold an access token from one
   * exchange beside a refresh token from another.
   */
  refreshTokenEncrypted: string | null
  accessTokenExpiresAt: string | null
  refreshTokenExpiresAt: string | null
  apiVersion: string
  grantedScopes: string[]
  storefrontDomain: string | null
  connectionStatus: 'connected' | 'failed'
  lastError: string | null
  /** Which verified flow established control of this shop. Required. */
  proof: ShopOwnershipProof
}): Promise<ClaimShopResult> {
  // `proof` is not forwarded to the database — it exists so no call site can be
  // written without naming the verified flow it came from, and so a reviewer
  // can see at a glance that every caller has one.
  if (args.proof !== 'oauth_callback_verified' && args.proof !== 'session_token_exchange_verified') {
    return { ok: false, reason: 'save_failed' }
  }

  const { data, error } = await admin.rpc('claim_shopify_shop_ownership', {
    p_user_id: args.userId,
    p_project_id: args.projectId,
    p_shop_domain: args.shopDomain,
    p_shop_gid: args.shopGid,
    p_access_token_encrypted: args.accessTokenEncrypted,
    p_api_version: args.apiVersion,
    p_granted_scopes: args.grantedScopes,
    p_storefront_domain: args.storefrontDomain,
    p_connection_status: args.connectionStatus,
    p_last_error: args.lastError,
    p_refresh_token_encrypted: args.refreshTokenEncrypted,
    p_access_token_expires_at: args.accessTokenExpiresAt,
    p_refresh_token_expires_at: args.refreshTokenExpiresAt,
  })

  if (error) return { ok: false, reason: 'save_failed' }

  const row = (Array.isArray(data) ? data[0] : data) as
    | { outcome?: string; connection_id?: string | null }
    | null
    | undefined
  const outcome = row?.outcome
  if (!outcome) return { ok: false, reason: 'save_failed' }

  const blocked = RPC_BLOCKED[outcome]
  if (blocked) return { ok: false, reason: blocked }

  if (outcome !== 'reactivated' && outcome !== 'claimed') return { ok: false, reason: 'save_failed' }
  if (!row?.connection_id) return { ok: false, reason: 'save_failed' }

  // PayPal→Shopify migration is keyed on the NEW owner only. A reactivated
  // same-project connection and a freshly claimed one are treated identically
  // here; nothing about the archived row's billing is consulted or copied.
  await initiateMigrationIfPayPalSubscriber(admin, {
    userId: args.userId,
    projectId: args.projectId,
    shopifyConnectionId: row.connection_id,
  })

  return { ok: true, connectionId: row.connection_id, outcome }
}
