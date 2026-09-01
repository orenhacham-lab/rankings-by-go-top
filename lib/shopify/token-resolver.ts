/**
 * THE server-side Shopify Admin API credential resolver.
 *
 * Every Admin API call in this application takes its access token from here,
 * through lib/shopify/api-auth.ts's loadShopifyConnection — the single place a
 * stored Shopify credential is decrypted for use. Individual callers
 * (connection testing, blog loading, sync, manual and automatic publishing,
 * embedded-install verification) never implement refresh logic of their own.
 *
 * WHY THIS EXISTS
 * ---------------
 * Shopify no longer accepts non-expiring Admin API access tokens:
 *
 *   "Non-expiring access tokens are no longer accepted for the Admin API"
 *
 * An expiring offline grant is a PAIR — a short-lived access token plus a
 * refresh token — so keeping a store usable means rotating before expiry, from
 * any call site, including background publishing that runs with no merchant
 * session at all.
 *
 * THE RULES
 * ---------
 *   * Use the stored access token while it is safely valid (more than
 *     REFRESH_SKEW_SECONDS of life left).
 *   * Otherwise rotate through Shopify with the stored refresh token and store
 *     the WHOLE new pair — Shopify rotates the refresh token too, so both
 *     halves move together or neither does.
 *   * A TERMINAL refresh failure (Shopify rejecting the refresh token) fails
 *     closed: no Admin API call is attempted with the dead access token, and
 *     the connection is marked with the stable `refresh_token_invalid` state
 *     that lib/shopify/connection-health.ts classifies as reconnect.
 *   * A TRANSIENT failure changes no stored state at all, so a network blip
 *     never costs a merchant their connection.
 *   * BILLING AUTHORITY IS NEVER TOUCHED HERE. A token problem is not a change
 *     of who bills the account (lib/billing/governance.ts).
 *   * A LEGACY connection (no refresh material and no recorded expiry) is
 *     returned as-is; its token either still works or is refused with 401/403,
 *     which the existing classifier already routes to a reconnect.
 *
 * CONCURRENCY — optimistic, no lock, no new RPC
 * --------------------------------------------
 * The rotation write is conditioned on the EXACT `access_token_encrypted` this
 * request loaded. Two concurrent requests both see an expiring token and both
 * call Shopify; the first to write matches the row and wins, and the second
 * matches ZERO rows — its pair is retired and is discarded rather than
 * overwriting the winner's. The loser then re-reads and uses the credential
 * that actually landed. Ciphertext equality is exact here because it compares a
 * stored value with the same stored value the caller read, never two separate
 * encryptions of the same plaintext (encryptCredential uses a random IV, so
 * those would never match).
 *
 * SECRECY. Plaintext exists here only as local values: the access token handed
 * back to the immediate caller, and the refresh token used for one rotation
 * request. Nothing plaintext is logged, returned to a client, or written.
 */

import type { createAdminClient } from '@/lib/supabase/admin'
import { decryptCredential, encryptCredential, CredentialsCryptoError } from '@/lib/security/credentials-crypto'
import { getShopifyOAuthConfig, refreshOfflineAccessToken, TokenRefreshError, expiryFromNow } from './oauth'

type Admin = ReturnType<typeof createAdminClient>

/**
 * Refresh this long before the access token expires. Comfortably longer than a
 * serverless request's own lifetime, so a token that passes this check cannot
 * expire midway through the work it was fetched for.
 */
export const REFRESH_SKEW_SECONDS = 300
/** How many times a caller that LOSES the optimistic race re-reads and retries. */
export const MAX_ROTATION_ATTEMPTS = 3

export type ResolvedTokenFailure =
  /** Stored ciphertext could not be decrypted, or the new pair could not be encrypted. */
  | 'credential_unreadable'
  /** Shopify rejected the refresh token itself. Terminal — reconnect required. */
  | 'reauthorization_required'
  /** Shopify was unreachable or returned 5xx/429. Transient — retry later. */
  | 'token_refresh_failed'
  /** The app's Shopify credentials are not configured. */
  | 'not_configured'

export type ResolvedToken =
  | { ok: true; accessToken: string; rotated: boolean }
  | { ok: false; reason: ResolvedTokenFailure }

/** The columns the resolver needs. A superset row (the full connection) is fine. */
export interface ResolvableConnection {
  id: string
  shop_domain: string
  access_token_encrypted: string
  refresh_token_encrypted?: string | null
  access_token_expires_at?: string | null
  refresh_token_expires_at?: string | null
}

/** True when this expiry is far enough away to use the token it belongs to. PURE. */
export function isAccessTokenSafelyValid(expiresAt: string | null | undefined, now: number = Date.now()): boolean {
  if (!expiresAt) return false
  const t = new Date(expiresAt).getTime()
  if (!Number.isFinite(t)) return false
  return t - now > REFRESH_SKEW_SECONDS * 1000
}

/**
 * A row with neither refresh material nor a recorded access-token expiry
 * predates expiring grants. It cannot be rotated, so it is used as-is. PURE.
 */
export function isLegacyNonExpiringConnection(c: ResolvableConnection): boolean {
  return !c.refresh_token_encrypted && !c.access_token_expires_at
}

function decrypt(value: string): string | null {
  try {
    return decryptCredential(value)
  } catch (err) {
    // A fixed classification from credentials-crypto — never ciphertext or key
    // material.
    console.error('[shopify-tokens] credential decryption failed', {
      reason: err instanceof CredentialsCryptoError ? err.message : 'decryption_failed',
    })
    return null
  }
}

/**
 * The access token to use for an Admin API request against this connection,
 * refreshing first when it is at or near expiry.
 *
 * Returns only the one plaintext access token the caller needs — never
 * ciphertext, an expiry, or the refresh token.
 */
export async function resolveShopifyAccessToken(admin: Admin, connection: ResolvableConnection): Promise<ResolvedToken> {
  // Fast path — a token with life left in it. No Shopify call, no write.
  if (isAccessTokenSafelyValid(connection.access_token_expires_at)) {
    const plain = decrypt(connection.access_token_encrypted)
    return plain ? { ok: true, accessToken: plain, rotated: false } : { ok: false, reason: 'credential_unreadable' }
  }

  // Legacy path — nothing to rotate with. Hand back what is stored and let the
  // Admin API's own 401/403 classification decide, exactly as before.
  if (isLegacyNonExpiringConnection(connection)) {
    const plain = decrypt(connection.access_token_encrypted)
    return plain ? { ok: true, accessToken: plain, rotated: false } : { ok: false, reason: 'credential_unreadable' }
  }

  const config = getShopifyOAuthConfig()
  if (!config) return { ok: false, reason: 'not_configured' }

  let current = connection
  for (let attempt = 0; attempt < MAX_ROTATION_ATTEMPTS; attempt++) {
    if (!current.refresh_token_encrypted) {
      // Nothing to rotate with (cleared on uninstall, or never issued).
      const plain = decrypt(current.access_token_encrypted)
      return plain ? { ok: true, accessToken: plain, rotated: false } : { ok: false, reason: 'credential_unreadable' }
    }

    const refreshToken = decrypt(current.refresh_token_encrypted)
    if (!refreshToken) return { ok: false, reason: 'credential_unreadable' }

    let rotated
    try {
      rotated = await refreshOfflineAccessToken({
        shop: current.shop_domain,
        refreshToken,
        clientId: config.clientId,
        clientSecret: config.clientSecret,
      })
    } catch (err) {
      const terminal = err instanceof TokenRefreshError ? err.terminal : false
      // Diagnostics only: a stable code, Shopify's HTTP status and its opaque
      // x-request-id. No token, no body, no header, no ciphertext.
      console.warn('[shopify-tokens] refresh failed', {
        route: 'token_refresh',
        shopDomain: current.shop_domain,
        terminal,
        kind: err instanceof Error ? err.message : 'unknown',
        httpStatus: err instanceof TokenRefreshError ? err.diagnostics.httpStatus : null,
        shopifyRequestId: err instanceof TokenRefreshError ? err.diagnostics.shopifyRequestId : null,
        missingFields: err instanceof TokenRefreshError ? err.diagnostics.missingFields : undefined,
      })
      if (terminal) {
        await markReauthorizationRequired(admin, current.id)
        return { ok: false, reason: 'reauthorization_required' }
      }
      // TRANSIENT — nothing stored changes, and the Admin API is NOT called.
      return { ok: false, reason: 'token_refresh_failed' }
    }

    let accessEncrypted: string
    let refreshEncrypted: string
    try {
      accessEncrypted = encryptCredential(rotated.accessToken)
      refreshEncrypted = encryptCredential(rotated.refreshToken)
    } catch {
      return { ok: false, reason: 'credential_unreadable' }
    }

    const now = Date.now()
    // OPTIMISTIC CONCURRENCY. Conditioned on the exact ciphertext this request
    // loaded, so a pair rotated by someone else in the meantime is not
    // overwritten — this update simply matches nothing.
    const { data: updated } = await admin
      .from('shopify_connections')
      .update({
        access_token_encrypted: accessEncrypted,
        refresh_token_encrypted: refreshEncrypted,
        access_token_expires_at: expiryFromNow(rotated.expiresIn, now),
        refresh_token_expires_at: rotated.refreshTokenExpiresIn === null
          ? null
          : expiryFromNow(rotated.refreshTokenExpiresIn, now),
        updated_at: new Date(now).toISOString(),
      })
      .eq('id', current.id)
      .eq('access_token_encrypted', current.access_token_encrypted)
      .select('id')
      .maybeSingle()

    if (updated) return { ok: true, accessToken: rotated.accessToken, rotated: true }

    // We LOST the race: another request already rotated this connection. Our
    // pair is retired and was deliberately not written. Reload and use the one
    // that actually landed.
    const { data: reloaded } = await admin
      .from('shopify_connections')
      .select('id, shop_domain, access_token_encrypted, refresh_token_encrypted, access_token_expires_at, refresh_token_expires_at')
      .eq('id', current.id)
      .maybeSingle()
    if (!reloaded) return { ok: false, reason: 'token_refresh_failed' }
    current = reloaded as ResolvableConnection

    if (isAccessTokenSafelyValid(current.access_token_expires_at)) {
      const plain = decrypt(current.access_token_encrypted)
      return plain ? { ok: true, accessToken: plain, rotated: false } : { ok: false, reason: 'credential_unreadable' }
    }
    // Still not valid — the winner's token is itself near expiry. Try again.
  }

  return { ok: false, reason: 'token_refresh_failed' }
}

/**
 * Record that this connection needs the merchant to reconnect, because Shopify
 * refused the refresh token. Writes ONLY the stable, non-sensitive state — no
 * Shopify response body, no token — and deliberately never touches billing
 * authority or the `app_uninstalled` tombstone, which is what
 * claim_shopify_shop_ownership uses to supersede a shop.
 */
async function markReauthorizationRequired(admin: Admin, connectionId: string): Promise<void> {
  const { data } = await admin
    .from('shopify_connections')
    .select('last_error')
    .eq('id', connectionId)
    .maybeSingle()
  if ((data as { last_error?: string | null } | null)?.last_error === 'app_uninstalled') return
  await admin
    .from('shopify_connections')
    .update({ connection_status: 'failed', last_error: 'refresh_token_invalid', updated_at: new Date().toISOString() })
    .eq('id', connectionId)
}
