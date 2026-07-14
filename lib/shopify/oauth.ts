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

export interface ShopifyOAuthConfig {
  clientId: string
  clientSecret: string
  /** Canonical app base URL, e.g. https://www.gotopseo.com (no trailing slash). */
  appUrl: string
}

/**
 * Resolve the OAuth app credentials from server env. Never exposed to client.
 *
 * The PUBLIC app "Go Top SEO" is preferred when its credentials are present, so new
 * installs authenticate with SHOPIFY_PUBLIC_CLIENT_ID/SECRET and the callback HMAC +
 * token exchange use the public app secret. It falls back to the legacy custom-app
 * SHOPIFY_CLIENT_ID/SECRET only when the public pair is unset (e.g. local/dev).
 * Client ID + secret must come from the SAME app (never mixed). Stored access tokens
 * are app-credential-independent bearer tokens, so existing connections keep working.
 */
export function getShopifyOAuthConfig(): ShopifyOAuthConfig | null {
  const publicId = (process.env.SHOPIFY_PUBLIC_CLIENT_ID || '').trim()
  const publicSecret = (process.env.SHOPIFY_PUBLIC_CLIENT_SECRET || '').trim()
  const usePublic = !!publicId && !!publicSecret
  const clientId = usePublic ? publicId : (process.env.SHOPIFY_CLIENT_ID || '').trim()
  const clientSecret = usePublic ? publicSecret : (process.env.SHOPIFY_CLIENT_SECRET || '').trim()
  const appUrl = (process.env.SHOPIFY_APP_URL || process.env.NEXT_PUBLIC_APP_URL || '').trim().replace(/\/+$/, '')
  if (!clientId || !clientSecret || !appUrl || !/^https:\/\//.test(appUrl)) return null
  return { clientId, clientSecret, appUrl }
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
