/**
 * Phase 4F.1 — Shopify OAuth (authorization-code, offline token). Server-side
 * only. The merchant enters only their *.myshopify.com domain and approves the
 * Shopify screen; the client secret never reaches the browser.
 *
 * PURE helpers (authorize-URL build, HMAC verification, return-path build) are
 * split out so they are unit-testable without network or env.
 */

import crypto from 'crypto'
import { SHOPIFY_REQUIRED_SCOPES } from './constants'
import { normalizeShopDomain } from './domain'

/** Which Shopify app a resolved credential pair belongs to. */
export type ShopifyAppEdition = 'public' | 'legacy'

export interface ShopifyOAuthConfig {
  clientId: string
  clientSecret: string
  /** Canonical app base URL, e.g. https://www.gotopseo.com (no trailing slash). */
  appUrl: string
  /** Which app the clientId/clientSecret above belong to. Never a mixed pair. */
  edition: ShopifyAppEdition
}

/**
 * Resolve the OAuth app credentials from server env. Never exposed to client.
 *
 * Production bug this fixes: this app exists TWICE in Shopify — the PUBLIC
 * "Go Top SEO" app (which merchants install, and which signs every app-launch
 * request, OAuth callback and session token) and an older LEGACY custom app.
 * They have entirely different client IDs and secrets. Every embedded/public
 * flow resolves its credentials here, and this function read only the LEGACY
 * pair — so a genuine, correctly-signed public-app launch was verified against
 * the wrong secret and rejected as `invalid_hmac`. Only the compliance
 * webhooks (lib/shopify/webhook-public.ts) were ever wired to the public app.
 *
 * The pair is resolved ATOMICALLY and is never mixed: a public client id is
 * only ever used with the public secret, and a legacy id only with the legacy
 * secret. Mixing them would produce a config that cannot verify anything and
 * would silently fail every flow. The public app wins when BOTH of its values
 * are configured; otherwise this falls back to the legacy pair, so a
 * deployment that has not yet been given public credentials keeps behaving
 * exactly as it does today rather than breaking.
 */
export function getShopifyOAuthConfig(): ShopifyOAuthConfig | null {
  const appUrl = (process.env.SHOPIFY_APP_URL || process.env.NEXT_PUBLIC_APP_URL || '').trim().replace(/\/+$/, '')
  if (!appUrl || !/^https:\/\//.test(appUrl)) return null

  const publicClientId = (process.env.SHOPIFY_PUBLIC_CLIENT_ID || '').trim()
  const publicClientSecret = (process.env.SHOPIFY_PUBLIC_CLIENT_SECRET || '').trim()
  if (publicClientId && publicClientSecret) {
    return { clientId: publicClientId, clientSecret: publicClientSecret, appUrl, edition: 'public' }
  }

  const clientId = (process.env.SHOPIFY_CLIENT_ID || '').trim()
  const clientSecret = (process.env.SHOPIFY_CLIENT_SECRET || '').trim()
  if (clientId && clientSecret) {
    return { clientId, clientSecret, appUrl, edition: 'legacy' }
  }
  return null
}

/**
 * The client id of whichever app getShopifyOAuthConfig() would resolve —
 * without requiring the app URL to be configured. Used ONLY for the App
 * Bridge `shopify-api-key` meta tag, which is a public API key (never a
 * secret) and must name the SAME app whose secret verifies the resulting
 * session tokens. Applies the identical atomic-pair rule so the meta tag can
 * never name the public app while session-token verification uses the legacy
 * secret. Returns '' when nothing is configured.
 */
export function getShopifyAppClientId(): string {
  const publicClientId = (process.env.SHOPIFY_PUBLIC_CLIENT_ID || '').trim()
  const publicClientSecret = (process.env.SHOPIFY_PUBLIC_CLIENT_SECRET || '').trim()
  if (publicClientId && publicClientSecret) return publicClientId
  return (process.env.SHOPIFY_CLIENT_ID || '').trim()
}

/** True when OAuth is configured (used to gate the flow / show a clear error). */
export function isShopifyOAuthConfigured(): boolean {
  return getShopifyOAuthConfig() !== null
}

/** The single, exact redirect URI (must match the Dev Dashboard allowlist). */
export function oauthRedirectUri(appUrl: string): string {
  return `${appUrl.replace(/\/+$/, '')}/api/shopify/oauth/callback`
}

/** The exact, server-constructed return destination (no open redirect). */
export function projectReturnUrl(appUrl: string, projectId: string, params: Record<string, string>): string {
  const base = `${appUrl.replace(/\/+$/, '')}/projects/${encodeURIComponent(projectId)}`
  const qs = new URLSearchParams(params).toString()
  return qs ? `${base}?${qs}` : base
}

/**
 * K1 — server-built internal Content Hub path for a project. `projectId` comes
 * from the server-validated, ownership-checked one-time OAuth state, so this is
 * never an open redirect. Used on a CLEAN connection success to drop the user
 * straight into the Content Hub for that project.
 */
export function contentHubReturnUrl(appUrl: string, projectId: string): string {
  return `${appUrl.replace(/\/+$/, '')}/content?projectId=${encodeURIComponent(projectId)}`
}

/**
 * Build the Shopify authorize URL for an OFFLINE token (no grant_options[] =
 * per-user). Read-only scopes only. PURE.
 */
export function buildAuthorizeUrl(opts: {
  shop: string
  clientId: string
  redirectUri: string
  state: string
  scopes?: readonly string[]
}): string {
  const scopes = (opts.scopes ?? SHOPIFY_REQUIRED_SCOPES).join(',')
  const params = new URLSearchParams({
    client_id: opts.clientId,
    scope: scopes,
    redirect_uri: opts.redirectUri,
    state: opts.state,
  })
  return `https://${opts.shop}/admin/oauth/authorize?${params.toString()}`
}

/**
 * Verify the HMAC Shopify appends to OAuth callbacks. Builds the message from
 * every query param except `hmac` (and the legacy `signature`), sorted, joined
 * as k=v&… , and compares an HMAC-SHA256 with the client secret in constant
 * time. PURE. `params` is the raw query as key→value.
 */
export function verifyShopifyHmac(params: Record<string, string>, clientSecret: string): boolean {
  const provided = params.hmac
  if (!provided || typeof provided !== 'string') return false
  const message = Object.keys(params)
    .filter((k) => k !== 'hmac' && k !== 'signature')
    .sort()
    .map((k) => `${k}=${params[k]}`)
    .join('&')
  const digest = crypto.createHmac('sha256', clientSecret).update(message).digest('hex')
  // Constant-time compare (equal length required by timingSafeEqual).
  const a = Buffer.from(digest, 'utf8')
  const b = Buffer.from(provided, 'utf8')
  if (a.length !== b.length) return false
  return crypto.timingSafeEqual(a, b)
}

export interface ShopifyLaunchDetectionResult {
  ok: boolean
  /** The normalized *.myshopify.com host, only when ok === true. */
  shop: string | null
  /** A stable, non-sensitive reason code — never included the raw hmac/shop
   *  values, safe to log. */
  reason: 'missing_params' | 'invalid_hmac' | 'invalid_shop' | 'invalid_timestamp' | 'expired_launch' | null
}

/** Default tolerance for a signed launch's `timestamp` param — Shopify's own
 *  request/redirect chain is near-instant; 5 minutes comfortably covers
 *  normal clock skew and network latency while still rejecting a captured
 *  URL replayed long after the fact. */
export const SHOPIFY_LAUNCH_TIMESTAMP_TOLERANCE_MS = 5 * 60_000

/**
 * Hotfix — detects and validates a genuine, fresh, Shopify-SIGNED app-launch
 * request: the `?shop=...&hmac=...&host=...&timestamp=...` shape Shopify
 * sends to the app's configured Application URL on every install AND every
 * reopen (see app/shopify/app/page.tsx's header comment — this is the SAME
 * request shape, just detected at whatever URL Shopify is ACTUALLY
 * configured to send it to, which this codebase cannot itself change — see
 * app/page.tsx for where this is used).
 *
 * PURE — no I/O, no persistence, no privileged decision made here at all;
 * this ONLY decides whether the caller should redirect into the real
 * embedded entry point (/shopify/app), mirroring that page's own documented
 * stance that an unverified `shop` decides nothing privileged on its own.
 * Missing shop/hmac, an invalid signature, an unparseable/expired
 * timestamp, or a shop that fails to normalize all fail closed (`ok: false`)
 * with a distinct, non-sensitive reason — NEVER guessed, never silently
 * treated as valid.
 */
export function detectSignedShopifyLaunch(
  params: Record<string, string>,
  clientSecret: string,
  nowMs: number = Date.now(),
  toleranceMs: number = SHOPIFY_LAUNCH_TIMESTAMP_TOLERANCE_MS,
): ShopifyLaunchDetectionResult {
  if (!params.shop || !params.hmac) return { ok: false, shop: null, reason: 'missing_params' }
  if (!verifyShopifyHmac(params, clientSecret)) return { ok: false, shop: null, reason: 'invalid_hmac' }
  const shop = normalizeShopDomain(params.shop)
  if (!shop) return { ok: false, shop: null, reason: 'invalid_shop' }
  if (params.timestamp) {
    const ts = Number(params.timestamp)
    if (!Number.isFinite(ts)) return { ok: false, shop: null, reason: 'invalid_timestamp' }
    const ageMs = nowMs - ts * 1000
    if (ageMs > toleranceMs || ageMs < -toleranceMs) return { ok: false, shop: null, reason: 'expired_launch' }
  }
  return { ok: true, shop, reason: null }
}

/** A cryptographically-random opaque state token (also used as the nonce). */
export function generateOAuthState(): string {
  return crypto.randomBytes(32).toString('hex')
}

/** Name + path of the signed browser nonce cookie (scoped to the OAuth routes). */
export const OAUTH_NONCE_COOKIE = 'shopify_oauth_nonce'
export const OAUTH_COOKIE_PATH = '/api/shopify/oauth'

/**
 * Sign the nonce for the browser cookie: `${nonce}.${hmac}`. The HMAC (over the
 * nonce, with the app client secret) lets the callback detect tampering without
 * any server storage of the cookie value. PURE.
 */
export function signNonceCookie(nonce: string, secret: string): string {
  const mac = crypto.createHmac('sha256', secret).update(nonce).digest('hex')
  return `${nonce}.${mac}`
}

/**
 * Verify a signed nonce cookie and return the nonce, or null when the value is
 * missing, malformed, or the signature doesn't match (tampering). Constant-time
 * comparison. PURE.
 */
export function verifyNonceCookie(value: string | undefined | null, secret: string): string | null {
  if (!value || typeof value !== 'string') return null
  const dot = value.lastIndexOf('.')
  if (dot <= 0) return null
  const nonce = value.slice(0, dot)
  const provided = value.slice(dot + 1)
  const expected = crypto.createHmac('sha256', secret).update(nonce).digest('hex')
  const a = Buffer.from(provided, 'utf8')
  const b = Buffer.from(expected, 'utf8')
  if (a.length !== b.length) return null
  return crypto.timingSafeEqual(a, b) ? nonce : null
}

/**
 * Exchange the authorization code for an OFFLINE access token. Returns the token
 * + the space/comma-separated granted scope string. Throws on failure (caller
 * maps to a token_exchange_failed redirect). Never logs the token/secret.
 */
export async function exchangeCodeForToken(opts: {
  shop: string
  code: string
  clientId: string
  clientSecret: string
}): Promise<{ accessToken: string; scope: string }> {
  const res = await fetch(`https://${opts.shop}/admin/oauth/access_token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ client_id: opts.clientId, client_secret: opts.clientSecret, code: opts.code }),
    redirect: 'error',
  })
  if (!res.ok) throw new Error(`token_exchange_http_${res.status}`)
  const json = (await res.json().catch(() => null)) as { access_token?: string; scope?: string } | null
  if (!json || typeof json.access_token !== 'string' || !json.access_token) throw new Error('token_exchange_no_token')
  return { accessToken: json.access_token, scope: typeof json.scope === 'string' ? json.scope : '' }
}
