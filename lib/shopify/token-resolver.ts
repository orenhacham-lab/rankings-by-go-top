/**
 * THE server-side Shopify Admin API credential resolver.
 *
 * Every Admin API call in this application takes its access token from here,
 * through lib/shopify/api-auth.ts's loadShopifyConnection — the single place a
 * stored Shopify credential is decrypted for use. Individual callers never
 * implement refresh logic of their own.
 *
 * WHY THIS EXISTS. Shopify no longer accepts non-expiring Admin API access
 * tokens, so a store stays usable only if its expiring grant is rotated before
 * expiry — from any call site, including background publishing that runs with
 * no merchant session.
 *
 * SERIALIZATION — one refresh per connection, before the external call.
 * Optimistic concurrency on the write alone is not enough. Shopify's guidance
 * is explicit: refresh a store one at a time, because two workers refreshing
 * the same store concurrently can leave one holding a token the other has
 * already replaced. So a DB-backed LEASE is acquired first
 * (begin_shopify_token_refresh); only the lease owner calls Shopify. Others are
 * told 'locked', wait briefly, and re-read — and when the winner has stored a
 * safely valid token, they simply use it and never call Shopify at all. The
 * lease is time-bounded, so a crashed worker's lease expires and is reclaimed.
 * The rotation write is ADDITIONALLY conditioned on the exact ciphertext the
 * lease owner was given, so even a lease holder cannot overwrite a pair that
 * changed underneath it.
 *
 * ISSUING APP. A token can only be refreshed with the credentials of the app
 * that issued it. The connection records that edition, and the refresh resolves
 * that app's pair explicitly — never "whichever pair is configured". An unknown
 * edition is never guessed: the merchant is asked to reauthorize.
 *
 * FAILURE POLICY.
 *   * TERMINAL (Shopify rejected the refresh token) → no Admin API call is
 *     attempted, and the connection is marked `refresh_token_invalid`, but only
 *     while this caller still owns the lease AND the credential has not been
 *     replaced. The `app_uninstalled` tombstone is never overwritten.
 *   * TRANSIENT → nothing stored changes at all.
 *   * BILLING AUTHORITY is never touched by either.
 */

import type { createAdminClient } from '@/lib/supabase/admin'
import { decryptCredential, encryptCredential, CredentialsCryptoError } from '@/lib/security/credentials-crypto'
import { getShopifyOAuthConfigForEdition, refreshOfflineAccessToken, TokenRefreshError, expiryFromNow } from './oauth'
import type { ShopifyAppEdition } from './oauth'

type Admin = ReturnType<typeof createAdminClient>

/** Refresh this long before expiry — longer than a serverless request's life. */
export const REFRESH_SKEW_SECONDS = 300
/** How long one invocation may hold the lease before it is reclaimable. */
export const REFRESH_LEASE_SECONDS = 60
/** Bounded wait for another invocation's in-flight rotation. */
export const LOCK_RETRY_DELAYS_MS = [200, 400, 800]
/**
 * Attempts to PERSIST a pair Shopify has already returned. Retried WITHOUT
 * calling Shopify again: the rotation happened, the old refresh token is spent,
 * and asking for another pair would strand the one we are holding.
 */
export const PERSIST_RETRY_DELAYS_MS = [100, 300]

export type ResolvedTokenFailure =
  /** Stored ciphertext could not be decrypted, or a new pair could not be encrypted. */
  | 'credential_unreadable'
  /** The merchant must reconnect: refresh refused, refresh material missing, or issuing app unknown. */
  | 'reauthorization_required'
  /** Transient: Shopify unreachable/5xx, or another worker still rotating. */
  | 'token_refresh_failed'
  /** This app's credentials for the stored edition are not configured. */
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
  oauth_app_edition?: string | null
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
 * Classify a stored credential's SHAPE. PURE.
 *
 *   'expiring'      an expiry and refresh material — the normal modern grant.
 *   'incomplete'    an expiry but NO refresh material. Inconsistent: it cannot
 *                   be rotated and its access token may already be dead, so it
 *                   must never be sent to the Admin API on the strength of
 *                   having once had an expiry.
 *   'legacy'        no expiry and no refresh material, and NOT issued by the
 *                   public app — either explicitly 'legacy', or a pre-column
 *                   NULL edition, which can only be a credential issued before
 *                   the public app existed (see the note in the body). Legacy
 *                   custom-app tokens are non-expiring by design.
 *   'unusable'      no expiry and no refresh material, issued by the PUBLIC app.
 *                   A non-expiring public token is exactly the deprecated kind
 *                   the Admin API now refuses, so it is never sent.
 */
export function classifyStoredCredential(c: ResolvableConnection): 'expiring' | 'incomplete' | 'legacy' | 'unusable' {
  const hasRefresh = !!c.refresh_token_encrypted
  const hasExpiry = !!c.access_token_expires_at
  if (hasRefresh) return 'expiring'
  if (hasExpiry) return 'incomplete'
  if (c.oauth_app_edition === 'legacy') return 'legacy'

  // PRODUCTION REGRESSION (historical direct connections).
  //
  // A non-expiring credential with NO recorded edition is a row written BEFORE
  // oauth_app_edition existed — the column was added by migration
  // 20260901010000 with no backfill, and every writer since records it: the
  // OAuth callback always passes `config.edition` (never null, see
  // lib/shopify/oauth.ts's ShopifyAppEdition) and the App Store link copies the
  // edition off the pending install. So NULL cannot be produced by any current
  // path — it can only mean "issued before the public app existed", which is
  // precisely the legacy custom app.
  //
  // Treating that as 'unusable' stranded every intentional pre-approval direct
  // connection: the resolver refused a perfectly good token, loadShopifyConnection
  // returned 409, and the automation queue reported "this project has no
  // connected Shopify store" before it ever contacted Shopify.
  //
  // THE PUBLIC-APP GUARD IS UNCHANGED. An edition of 'public' with no expiry and
  // no refresh material still falls through to 'unusable' below: a non-expiring
  // PUBLIC token is the deprecated kind the Admin API refuses, and it is still
  // refused here. Only the pre-column NULL is admitted, and only when there is
  // no expiry and no refresh material to rotate with.
  if (c.oauth_app_edition === null || c.oauth_app_edition === undefined) return 'legacy'

  return 'unusable'
}

function decrypt(value: string): string | null {
  try {
    return decryptCredential(value)
  } catch (err) {
    // A fixed classification from credentials-crypto — never ciphertext or key material.
    console.error('[shopify-tokens] credential decryption failed', {
      reason: err instanceof CredentialsCryptoError ? err.message : 'decryption_failed',
    })
    return null
  }
}

function storedTokenResult(ciphertext: string, rotated = false): ResolvedToken {
  const plain = decrypt(ciphertext)
  return plain ? { ok: true, accessToken: plain, rotated } : { ok: false, reason: 'credential_unreadable' }
}

/**
 * The access token to use for an Admin API request against this connection,
 * refreshing first when it is at or near expiry.
 *
 * Returns only the one plaintext access token the caller needs — never
 * ciphertext, an expiry, or the refresh token.
 */
export async function resolveShopifyAccessToken(admin: Admin, connection: ResolvableConnection): Promise<ResolvedToken> {
  // Fast path — a token with life left in it. No lease, no Shopify call.
  if (isAccessTokenSafelyValid(connection.access_token_expires_at)) {
    return storedTokenResult(connection.access_token_encrypted)
  }

  const shape = classifyStoredCredential(connection)

  // A proven legacy non-expiring credential is used as-is: the legacy custom
  // app's tokens do not expire and there is nothing to rotate.
  if (shape === 'legacy') return storedTokenResult(connection.access_token_encrypted)

  // An INCOMPLETE expiring row (an expiry, no refresh material) cannot be
  // rotated, and its access token is at or past expiry — returning it would
  // send a dead credential to the Admin API. Likewise a non-expiring token from
  // the public app, or one whose issuing app was never recorded: neither can be
  // refreshed and neither may be guessed at.
  if (shape === 'incomplete' || shape === 'unusable') return { ok: false, reason: 'reauthorization_required' }

  for (let attempt = 0; ; attempt++) {
    // ── 1) Serialize BEFORE contacting Shopify ────────────────────────────
    const { data, error } = await admin.rpc('begin_shopify_token_refresh', {
      p_connection_id: connection.id,
      p_lease_seconds: REFRESH_LEASE_SECONDS,
      p_min_valid_seconds: REFRESH_SKEW_SECONDS,
    })
    if (error) return { ok: false, reason: 'token_refresh_failed' }
    const row = (Array.isArray(data) ? data[0] : data) as {
      outcome?: string
      lease_token?: string | null
      access_token_encrypted?: string | null
      refresh_token_encrypted?: string | null
      oauth_app_edition?: string | null
    } | null | undefined
    const outcome = row?.outcome

    if (outcome === 'not_found') return { ok: false, reason: 'reauthorization_required' }
    // The app was uninstalled: a late refresh must not resurrect it.
    if (outcome === 'uninstalled') return { ok: false, reason: 'reauthorization_required' }
    if (outcome === 'no_refresh_material') return { ok: false, reason: 'reauthorization_required' }
    if (outcome === 'unknown_edition') return { ok: false, reason: 'reauthorization_required' }

    // Someone else rotated while we waited — use what is stored NOW, never the
    // copy this request read before the lease.
    if (outcome === 'fresh') {
      return row?.access_token_encrypted
        ? storedTokenResult(row.access_token_encrypted)
        : { ok: false, reason: 'credential_unreadable' }
    }

    if (outcome === 'locked') {
      // Another invocation is mid-rotation. WAIT — never refresh in parallel.
      if (attempt < LOCK_RETRY_DELAYS_MS.length) {
        await sleep(LOCK_RETRY_DELAYS_MS[attempt])
        continue
      }
      return { ok: false, reason: 'token_refresh_failed' }
    }

    if (outcome !== 'granted' || !row?.lease_token || !row?.refresh_token_encrypted) {
      return { ok: false, reason: 'token_refresh_failed' }
    }

    // ── 2) We alone hold the lease. Rotate exactly once. ──────────────────
    const leaseToken = row.lease_token
    const expectedAccess = row.access_token_encrypted ?? connection.access_token_encrypted
    const edition = row.oauth_app_edition === 'public' || row.oauth_app_edition === 'legacy'
      ? (row.oauth_app_edition as ShopifyAppEdition)
      : null
    if (!edition) {
      await releaseLease(admin, connection.id, leaseToken, expectedAccess, false)
      return { ok: false, reason: 'reauthorization_required' }
    }

    // The credentials of the app that ISSUED this token — never whichever pair
    // happens to be configured.
    const config = getShopifyOAuthConfigForEdition(edition)
    if (!config) {
      await releaseLease(admin, connection.id, leaseToken, expectedAccess, false)
      return { ok: false, reason: 'not_configured' }
    }

    const refreshToken = decrypt(row.refresh_token_encrypted)
    if (!refreshToken) {
      await releaseLease(admin, connection.id, leaseToken, expectedAccess, false)
      return { ok: false, reason: 'credential_unreadable' }
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
      // x-request-id. No token, no body, no header, no ciphertext, no secret.
      console.warn('[shopify-tokens] refresh failed', {
        route: 'token_refresh',
        shopDomain: connection.shop_domain,
        edition,
        terminal,
        kind: err instanceof Error ? err.message : 'unknown',
        httpStatus: err instanceof TokenRefreshError ? err.diagnostics.httpStatus : null,
        shopifyRequestId: err instanceof TokenRefreshError ? err.diagnostics.shopifyRequestId : null,
        missingFields: err instanceof TokenRefreshError ? err.diagnostics.missingFields : undefined,
      })
      await releaseLease(admin, connection.id, leaseToken, expectedAccess, terminal)
      return { ok: false, reason: terminal ? 'reauthorization_required' : 'token_refresh_failed' }
    }

    let accessEncrypted: string
    let refreshEncrypted: string
    try {
      accessEncrypted = encryptCredential(rotated.accessToken)
      refreshEncrypted = encryptCredential(rotated.refreshToken)
    } catch {
      await releaseLease(admin, connection.id, leaseToken, expectedAccess, false)
      return { ok: false, reason: 'credential_unreadable' }
    }

    // ── 3) Store the WHOLE pair atomically, still holding the lease. ──────
    const now = Date.now()
    // PERSIST the pair Shopify already returned. Retried on a DATABASE error
    // WITHOUT contacting Shopify again — the rotation is done and the old
    // refresh token is spent, so a second call would strand this pair.
    const persisted = await persistRotatedPair(admin, {
      connectionId: connection.id,
      leaseToken,
      expectedAccessTokenEncrypted: expectedAccess,
      accessTokenEncrypted: accessEncrypted,
      refreshTokenEncrypted: refreshEncrypted,
      accessTokenExpiresAt: expiryFromNow(rotated.expiresIn, now),
      refreshTokenExpiresAt: rotated.refreshTokenExpiresIn === null
        ? null
        : expiryFromNow(rotated.refreshTokenExpiresIn, now),
    })
    if (persisted.outcome === 'rotated') return { ok: true, accessToken: rotated.accessToken, rotated: true }

    if (persisted.outcome === 'persist_failed') {
      // The pair IS valid — Shopify issued it — but we could not store it. That
      // is TRANSIENT: the connection is not marked failed and billing authority
      // is untouched. The lease is released so the next request can retry
      // cleanly rather than waiting it out.
      await releaseLease(admin, connection.id, leaseToken, expectedAccess, false)
      return { ok: false, reason: 'token_refresh_failed' }
    }

    // 'lease_lost' — our lease expired, or the credential was replaced or the
    // store uninstalled while we were talking to Shopify. Our pair is retired
    // and was NOT written. Re-read and use whatever actually landed.
    if (attempt < LOCK_RETRY_DELAYS_MS.length) continue
    return { ok: false, reason: 'token_refresh_failed' }
  }
}

/**
 * Store an already-issued rotated pair, retrying a DATABASE failure in place.
 *
 * Shopify is never called again from here: by this point the rotation has
 * happened and the previous refresh token is spent, so a second exchange would
 * abandon a valid pair. Only transport/DB errors are retried; a definite
 * 'lease_lost' or 'invalid_rotation' answer is returned immediately.
 */
async function persistRotatedPair(admin: Admin, args: {
  connectionId: string
  leaseToken: string
  expectedAccessTokenEncrypted: string
  accessTokenEncrypted: string
  refreshTokenEncrypted: string
  accessTokenExpiresAt: string
  refreshTokenExpiresAt: string | null
}): Promise<{ outcome: 'rotated' | 'lease_lost' | 'persist_failed' }> {
  for (let attempt = 0; attempt <= PERSIST_RETRY_DELAYS_MS.length; attempt++) {
    const { data, error } = await admin.rpc('complete_shopify_token_refresh', {
      p_connection_id: args.connectionId,
      p_lease_token: args.leaseToken,
      p_expected_access_token_encrypted: args.expectedAccessTokenEncrypted,
      p_access_token_encrypted: args.accessTokenEncrypted,
      p_refresh_token_encrypted: args.refreshTokenEncrypted,
      p_access_token_expires_at: args.accessTokenExpiresAt,
      p_refresh_token_expires_at: args.refreshTokenExpiresAt,
    })
    if (!error) {
      const outcome = ((Array.isArray(data) ? data[0] : data) as { outcome?: string } | null)?.outcome
      if (outcome === 'rotated') return { outcome: 'rotated' }
      // A definite answer — retrying cannot change it.
      return { outcome: 'lease_lost' }
    }
    if (attempt < PERSIST_RETRY_DELAYS_MS.length) await sleep(PERSIST_RETRY_DELAYS_MS[attempt])
  }
  console.warn('[shopify-tokens] rotated pair could not be persisted', { route: 'token_refresh', connectionId: args.connectionId })
  return { outcome: 'persist_failed' }
}

/**
 * Release this caller's lease, recording terminality.
 *
 * `terminal: true` writes the stable `refresh_token_invalid` state — but the
 * database applies it ONLY while this caller still owns the lease AND the
 * stored credential is still the one it was given, so a stale worker cannot
 * mark a connection failed after someone else fixed it, and the
 * `app_uninstalled` tombstone is never overwritten. Billing authority is never
 * touched.
 */
async function releaseLease(
  admin: Admin,
  connectionId: string,
  leaseToken: string,
  expectedAccessTokenEncrypted: string,
  terminal: boolean,
): Promise<void> {
  await admin.rpc('fail_shopify_token_refresh', {
    p_connection_id: connectionId,
    p_lease_token: leaseToken,
    p_expected_access_token_encrypted: expectedAccessTokenEncrypted,
    p_terminal: terminal,
    p_last_error: 'refresh_token_invalid',
  })
}
