/**
 * Phase 4F.1 — Shopify connection load/sanitize helpers. Ownership is enforced
 * by the shared authContentProject (same as WordPress). The access token is
 * decrypted server-side only at call time and never returned to the client.
 */

import type { createAdminClient } from '@/lib/supabase/admin'
import { SHOPIFY_API_VERSION, hasWriteContent } from './constants'
import { resolveShopifyAccessToken } from './token-resolver'
import type { ShopifyCredentials } from './types'

export type ShopifyConnectionRow = {
  id: string
  user_id: string
  project_id: string
  shop_domain: string
  storefront_domain: string | null
  access_token_encrypted: string
  // Expiring offline grant. The refresh token uses the same AES-256-GCM
  // mechanism as the access token and is decrypted ONLY inside
  // lib/shopify/token-resolver.ts, only to perform one rotation. Nullable for
  // connections created before expiring grants existed.
  refresh_token_encrypted: string | null
  access_token_expires_at: string | null
  refresh_token_expires_at: string | null
  // WHICH Shopify app issued this credential. Refresh must use that app's
  // client id + secret; NULL means it was never recorded and is never guessed.
  oauth_app_edition: 'public' | 'legacy' | null
  api_version: string
  connection_status: 'untested' | 'connected' | 'failed'
  last_tested_at: string | null
  last_synced_at: string | null
  last_error: string | null
  // Phase 4F.2 — project-level default publishing Blog GID (nullable).
  default_blog_id: string | null
  // Phase 4F.1 OAuth — scopes the merchant approved + how the token was obtained.
  granted_scopes: string[] | null
  auth_method: 'manual' | 'oauth'
  // Phase 2 — canonical Shopify Shop GID (gid://shopify/Shop/…), captured
  // server-side via Admin GraphQL at OAuth completion. NULL on pre-Phase-2
  // connections until they re-verify (the billing guard fails closed on null).
  shop_gid: string | null
  // Phase 2 — cache/audit of the last Partner API activeSubscription check.
  // NEVER the source of truth for a publish decision — see billing-guard.ts.
  shopify_plan_handle: string | null
  shopify_subscription_status: 'active' | 'none' | 'unknown' | null
  shopify_trial_ends_at: string | null
  shopify_current_period_end: string | null
  // Phase 3 — authoritative billing-cycle start (Partner API
  // currentBillingCycle.startTime). Same cache/audit-only rule as
  // shopify_current_period_end.
  shopify_current_period_start: string | null
  shopify_cancel_at_end_of_cycle: boolean | null
  shopify_billing_verified_at: string | null
  shopify_billing_last_error: string | null
  created_at: string
  updated_at: string
}

type Admin = ReturnType<typeof createAdminClient>

/**
 * Load the project's Shopify connection and decrypt its access token.
 * Returns a clear error (no secrets) when missing, inactive, or undecryptable.
 *
 * DEFAULT-DENY inactive policy: a connection whose `connection_status` is not
 * `'connected'` (i.e. `untested`/`failed`, including a revocation-sentinel row after
 * app/uninstalled) is REJECTED with status 409 so blogs/sync/manual+automatic publish
 * stop LOCALLY before any Shopify API call. Only `test-connection` may pass
 * `{ allowInactive: true }` — it is the path responsible for testing/recovering an
 * untested/failed connection. Ownership is unchanged (enforced by the caller).
 */
export async function loadShopifyConnection(
  admin: Admin,
  projectId: string,
  opts?: { allowInactive?: boolean },
): Promise<
  | { error: string; status: 404 | 409 | 500 | 503 }
  | { connection: ShopifyConnectionRow; creds: ShopifyCredentials }
> {
  const { data, error } = await admin
    .from('shopify_connections')
    .select('*')
        .eq('project_id', projectId)
    .is('archived_at', null)
    .maybeSingle()

  if (error) {
    console.error('[Shopify] Failed to load connection:', error.message)
    return { error: 'Failed to load Shopify connection', status: 500 }
  }
  if (!data) return { error: 'No Shopify connection for this project', status: 404 }

  const connection = data as ShopifyConnectionRow
  if (connection.connection_status !== 'connected' && !opts?.allowInactive) {
    return { error: 'Shopify connection is not active', status: 409 }
  }
  // THE credential resolution point. Every Admin API caller in the app reaches
  // Shopify through this one function, so refreshing an expiring offline grant
  // belongs here and nowhere else: the resolver reuses a token that is still
  // safely valid and otherwise rotates it, storing the whole new pair under
  // optimistic concurrency. It needs no merchant session, which is what
  // background publishing requires.
  const resolved = await resolveShopifyAccessToken(admin, connection)
  if (!resolved.ok) {
    // Stable, non-sensitive reason codes only — never a token or ciphertext.
    console.error('[Shopify] Could not resolve an Admin API credential:', resolved.reason)
    if (resolved.reason === 'reauthorization_required') {
      // TERMINAL: Shopify refused the refresh token. The connection is already
      // marked so the UI can offer a reconnect. Billing authority is untouched.
      return { error: 'Shopify authorization expired — reconnect the store', status: 409 }
    }
    if (resolved.reason === 'not_configured') {
      return { error: 'Shopify app credentials are not configured for this connection', status: 500 }
    }
    if (resolved.reason === 'token_refresh_failed') {
      // TRANSIENT: Shopify was unreachable or briefly failing. Retry later;
      // nothing about the connection or its billing has changed.
      return { error: 'Shopify credentials could not be refreshed, try again', status: 503 }
    }
    return { error: 'Stored Shopify credentials could not be decrypted', status: 500 }
  }

  return {
    connection,
    // Always the server-pinned version (centralized), never a stale stored value.
    creds: { shopDomain: connection.shop_domain, accessToken: resolved.accessToken, apiVersion: SHOPIFY_API_VERSION },
  }
}

/** Strip the token (even encrypted) before returning a connection to the client. */
export function sanitizeShopifyConnection(c: ShopifyConnectionRow) {
  return {
    id: c.id,
    project_id: c.project_id,
    shop_domain: c.shop_domain,
    storefront_domain: c.storefront_domain,
    api_version: c.api_version,
    connection_status: c.connection_status,
    last_tested_at: c.last_tested_at,
    last_synced_at: c.last_synced_at,
    last_error: c.last_error,
    granted_scopes: Array.isArray(c.granted_scopes) ? c.granted_scopes : [],
    auth_method: c.auth_method ?? 'oauth',
    // Phase 2 — safe to expose: plan handle/status/dates, never the shop_gid
    // itself (no reason the browser needs it) and never anything token-shaped.
    shopify_plan_handle: c.shopify_plan_handle ?? null,
    shopify_subscription_status: c.shopify_subscription_status ?? null,
    shopify_trial_ends_at: c.shopify_trial_ends_at ?? null,
    shopify_current_period_end: c.shopify_current_period_end ?? null,
    shopify_cancel_at_end_of_cycle: c.shopify_cancel_at_end_of_cycle ?? false,
    shopify_billing_verified_at: c.shopify_billing_verified_at ?? null,
    shopify_billing_last_error: c.shopify_billing_last_error ?? null,
    // Phase 4F.2 — true when write_content was granted (publishing is enabled).
    can_publish: hasWriteContent(c.granted_scopes),
    default_blog_id: c.default_blog_id ?? null,
    created_at: c.created_at,
    updated_at: c.updated_at,
  }
}
