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

/** Resolve the OAuth app credentials from server env. Never exposed to client. */
export function getShopifyOAuthConfig(): ShopifyOAuthConfig | null {
  const clientId = (process.env.SHOPIFY_CLIENT_ID || '').trim()
  const clientSecret = (process.env.SHOPIFY_CLIENT_SECRET || '').trim()
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

/** A cryptographically-random opaque state token. */
export function generateOAuthState(): string {
  return crypto.randomBytes(32).toString('hex')
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
