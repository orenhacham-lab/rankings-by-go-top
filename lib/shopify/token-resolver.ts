/**
 * THE server-side Shopify Admin API credential resolver.
 *
 * Every Admin API call in this app gets its access token from here, via
 * lib/shopify/api-auth.ts's loadShopifyConnection — there is no second place a
 * stored token is decrypted for use.
 *
 * WHY THIS EXISTS
 * ---------------
 * Shopify no longer accepts non-expiring Admin API access tokens:
 *
 *   "[API] Non-expiring access tokens are no longer accepted for the Admin
 *    API. Start using expiring offline tokens."
 *
 * An expiring offline grant is a PAIR — a short-lived access token and a
 * long-lived refresh token — plus two expiries. Keeping that pair usable means
 * rotating it before the access token dies, from any of five call sites,
 * including background publishing that runs with no merchant session at all.
 * Doing that per-call-site would guarantee races; doing it here means one
 * implementation, one lock, one set of rules.
 *
 * THE RULES
 * ---------
 *   * Use the stored access token while it is safely valid (more than
 *     REFRESH_SKEW_SECONDS of life left).
 *   * Otherwise rotate through Shopify with the stored refresh token, and store
 *     the WHOLE new pair atomically.
 *   * Only ONE invocation may rotate a given connection at a time. The lease
 *     lives in the database (begin_shopify_token_refresh), is bounded in time
 *     so a crashed invocation cannot wedge the shop, and is re-checked at
 *     write time (complete_shopify_token_refresh) so an invocation that lost
 *     its lease can never store its now-retired pair over a newer one.
 *   * A TERMINAL refresh failure — Shopify rejecting the refresh token itself —
 *     writes the stable machine state `refresh_token_invalid`, which
 *     lib/shopify/connection-health.ts classifies as needsInstall/reconnect. A
 *     TRANSIENT failure changes no stored state at all, so a network blip can
 *     never cost a merchant their connection.
 *   * A LEGACY connection (no refresh material, no recorded expiry) is returned
 *     as-is. Its token either still works or is refused with 401/403, which the
 *     existing classifier already routes to a reconnect — this resolver does
 *     not invent a failure for a row it cannot rotate.
 *
 * SECRECY. Plaintext tokens exist here only as local values: the decrypted
 * access token returned to the immediate caller, and the decrypted refresh
 * token used for the single rotation request. Nothing plaintext is logged,
 * returned to a client, stored, or passed to the database — the RPCs take and
 * return ciphertext only.
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
/** How long one invocation may hold the rotation lease before it is reclaimed. */
export const REFRESH_LEASE_SECONDS = 60
/** Bounded wait for another invocation's in-flight rotation. */
export const LOCK_RETRY_DELAYS_MS = [250, 500, 1000]

export type ResolvedToken =
  | { ok: true; accessToken: string; rotated: boolean }
  | { ok: false; reason: 'decryption_failed' | 'refresh_failed' | 'refresh_in_progress' | 'not_configured' | 'connection_not_found' }

/** The columns the resolver needs. A superset row (the full connection) is fine. */
export interface ResolvableConnection {
  id: string
  shop_domain: string
  access_token_encrypted: string
  refresh_token_encrypted?: string | null
  access_token_expires_at?: string | null
  refresh_token_expires_at?: string | null
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

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

/**
 * Return the access token to use for an Admin API request against this
 * connection, refreshing first if it is at or near expiry.
 *
 * Never returns ciphertext, an expiry, or a refresh token — the caller gets the
 * one plaintext access token it needs and nothing else.
 */
export async function resolveShopifyAccessToken(admin: Admin, connection: ResolvableConnection): Promise<ResolvedToken> {
  const decrypt = (value: string): string | null => {
    try { return decryptCredential(value) } catch (err) {
      // The message is a fixed classification from credentials-crypto, never
      // ciphertext or key material.
      console.error('[Shopify tokens] credential decryption failed:', err instanceof CredentialsCryptoError ? err.message : 'decryption failed')
      return null
    }
  }

  // Fast path — a token with life left in it. No lock, no round trip.
  if (isAccessTokenSafelyValid(connection.access_token_expires_at)) {
    const plain = decrypt(connection.access_token_encrypted)
    return plain ? { ok: true, accessToken: plain, rotated: false } : { ok: false, reason: 'decryption_failed' }
  }

  // Legacy path — nothing to rotate with. Hand back what is stored and let the
  // Admin API's own 401/403 classification decide, exactly as before.
  if (isLegacyNonExpiringConnection(connection)) {
    const plain = decrypt(connection.access_token_encrypted)
    return plain ? { ok: true, accessToken: plain, rotated: false } : { ok: false, reason: 'decryption_failed' }
  }

  const config = getShopifyOAuthConfig()
  if (!config) return { ok: false, reason: 'not_configured' }

  for (let attempt = 0; ; attempt++) {
    const { data, error } = await admin.rpc('begin_shopify_token_refresh', {
      p_connection_id: connection.id,
      p_lease_seconds: REFRESH_LEASE_SECONDS,
      p_min_valid_seconds: REFRESH_SKEW_SECONDS,
    })
    if (error) return { ok: false, reason: 'refresh_failed' }
    const row = (Array.isArray(data) ? data[0] : data) as {
      outcome?: string
      lease_token?: string | null
      access_token_encrypted?: string | null
      refresh_token_encrypted?: string | null
    } | null | undefined
    const outcome = row?.outcome

    if (outcome === 'not_found') return { ok: false, reason: 'connection_not_found' }

    // Someone else rotated while we waited — use what is stored NOW, never the
    // copy this request read before the lock.
    if (outcome === 'fresh') {
      const plain = row?.access_token_encrypted ? decrypt(row.access_token_encrypted) : null
      return plain ? { ok: true, accessToken: plain, rotated: false } : { ok: false, reason: 'decryption_failed' }
    }

    if (outcome === 'no_refresh_material') {
      const plain = row?.access_token_encrypted ? decrypt(row.access_token_encrypted) : null
      return plain ? { ok: true, accessToken: plain, rotated: false } : { ok: false, reason: 'decryption_failed' }
    }

    if (outcome === 'locked') {
      // Another invocation is mid-rotation. Wait briefly and re-read rather
      // than rotating in parallel; if it is still going, report a TRANSIENT
      // failure — never a credential failure.
      if (attempt < LOCK_RETRY_DELAYS_MS.length) {
        await sleep(LOCK_RETRY_DELAYS_MS[attempt])
        continue
      }
      return { ok: false, reason: 'refresh_in_progress' }
    }

    if (outcome !== 'granted' || !row?.lease_token || !row?.refresh_token_encrypted) {
      return { ok: false, reason: 'refresh_failed' }
    }

    // ── We hold the lease. Rotate exactly once. ──────────────────────────
    const leaseToken = row.lease_token
    const refreshToken = decrypt(row.refresh_token_encrypted)
    if (!refreshToken) {
      await releaseLease(admin, connection.id, leaseToken, false)
      return { ok: false, reason: 'decryption_failed' }
    }

    let rotated
    try {
      rotated = await refreshOfflineAccessToken({
        shop: connection.shop_domain,
        refreshToken,
        clientId: config.clientId,
        clientSecret: config.clientSecret,
      })
    } catch (err) {
      const terminal = err instanceof TokenRefreshError ? err.terminal : false
      // Diagnostics only: a stable code, Shopify's HTTP status and its opaque
      // x-request-id. No token, no body, no header, no ciphertext.
      console.warn('[Shopify tokens] refresh failed', {
        route: 'token_refresh',
        shopDomain: connection.shop_domain,
        terminal,
        kind: err instanceof Error ? err.message : 'unknown',
        httpStatus: err instanceof TokenRefreshError ? err.diagnostics.httpStatus : null,
        shopifyRequestId: err instanceof TokenRefreshError ? err.diagnostics.shopifyRequestId : null,
        missingFields: err instanceof TokenRefreshError ? err.diagnostics.missingFields : undefined,
      })
      await releaseLease(admin, connection.id, leaseToken, terminal)
      return { ok: false, reason: terminal ? 'refresh_failed' : 'refresh_in_progress' }
    }

    let accessEncrypted: string
    let refreshEncrypted: string
    try {
      accessEncrypted = encryptCredential(rotated.accessToken)
      refreshEncrypted = encryptCredential(rotated.refreshToken)
    } catch {
      await releaseLease(admin, connection.id, leaseToken, false)
      return { ok: false, reason: 'decryption_failed' }
    }

    const now = Date.now()
    const { data: doneData, error: doneErr } = await admin.rpc('complete_shopify_token_refresh', {
      p_connection_id: connection.id,
      p_lease_token: leaseToken,
      p_access_token_encrypted: accessEncrypted,
      p_refresh_token_encrypted: refreshEncrypted,
      p_access_token_expires_at: expiryFromNow(rotated.expiresIn, now),
      p_refresh_token_expires_at: expiryFromNow(rotated.refreshTokenExpiresIn, now),
    })
    if (doneErr) return { ok: false, reason: 'refresh_failed' }
    const doneOutcome = ((Array.isArray(doneData) ? doneData[0] : doneData) as { outcome?: string } | null)?.outcome

    if (doneOutcome === 'rotated') return { ok: true, accessToken: rotated.accessToken, rotated: true }

    // 'lease_lost' — our lease expired and another invocation rotated in the
    // meantime. Our pair is retired and was NOT written. Re-read and use the
    // pair that actually won.
    if (doneOutcome === 'lease_lost' && attempt < LOCK_RETRY_DELAYS_MS.length) continue
    return { ok: false, reason: 'refresh_failed' }
  }
}

/**
 * Release the lease, recording terminality. `terminal: true` writes the stable
 * `refresh_token_invalid` state (reconnect); `false` leaves every credential
 * field untouched.
 */
async function releaseLease(admin: Admin, connectionId: string, leaseToken: string, terminal: boolean): Promise<void> {
  await admin.rpc('fail_shopify_token_refresh', {
    p_connection_id: connectionId,
    p_lease_token: leaseToken,
    p_terminal: terminal,
    p_last_error: 'refresh_token_invalid',
  })
}
