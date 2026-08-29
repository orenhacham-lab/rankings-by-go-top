/**
 * Phase 2 — Shopify App Bridge session-token (ID token) verification,
 * server-side. This is what lets the embedded connector home
 * (app/shopify/app) trust "this request really comes from an authenticated
 * Shopify Admin session for shop X" — a Supabase browser session inside the
 * iframe is NEVER accepted as proof of Shopify identity on its own (per the
 * explicit Phase 2 requirement); this is the actual verification.
 *
 * Session tokens are JWTs signed HS256 with the app's client secret
 * (SHOPIFY_CLIENT_SECRET — the same secret used for OAuth HMAC verification,
 * never sent to the browser). Verified here with Node's built-in `crypto`
 * only — no JWT library dependency, consistent with how this codebase
 * hand-rolls the other Shopify/PayPal HMAC verifications.
 *
 * Rejects: any algorithm other than exactly "HS256" (no alg-confusion), a bad
 * signature, a missing/mismatched `aud` (must equal SHOPIFY_CLIENT_ID), an
 * `iss`/`dest` whose hostnames don't match each other or don't end with
 * `.myshopify.com`, and a token outside its `nbf`/`exp` window. On success,
 * returns the verified shop's `.myshopify.com` domain — the ONLY shop
 * identity this module will ever hand back to a caller.
 */

import crypto from 'crypto'
import { getShopifyOAuthConfig } from './oauth'

function base64UrlDecode(input: string): Buffer {
  return Buffer.from(input, 'base64url')
}

export type SessionTokenResult =
  | { ok: true; shopDomain: string }
  | { ok: false; reason: 'not_configured' | 'malformed' | 'bad_algorithm' | 'bad_signature' | 'bad_audience' | 'bad_shop_domain' | 'expired' | 'not_yet_valid' }

/**
 * Verify a raw session-token string (the value of the `Authorization: Bearer
 * <token>` header the App Bridge client sends). Never throws.
 */
export function verifyShopifySessionToken(token: string, now: number = Date.now()): SessionTokenResult {
  const config = getShopifyOAuthConfig()
  if (!config) return { ok: false, reason: 'not_configured' }
  if (typeof token !== 'string' || !token) return { ok: false, reason: 'malformed' }

  const parts = token.split('.')
  if (parts.length !== 3) return { ok: false, reason: 'malformed' }
  const [headerB64, payloadB64, signatureB64] = parts

  let header: { alg?: string }
  let payload: { aud?: string; iss?: string; dest?: string; exp?: number; nbf?: number }
  try {
    header = JSON.parse(base64UrlDecode(headerB64).toString('utf8'))
    payload = JSON.parse(base64UrlDecode(payloadB64).toString('utf8'))
  } catch {
    return { ok: false, reason: 'malformed' }
  }

  // Reject anything but the exact expected algorithm — never trust a
  // client-declared "none" or an unexpected algorithm.
  if (header.alg !== 'HS256') return { ok: false, reason: 'bad_algorithm' }

  const expectedSig = crypto
    .createHmac('sha256', config.clientSecret)
    .update(`${headerB64}.${payloadB64}`)
    .digest('base64url')
  const a = Buffer.from(signatureB64, 'utf8')
  const b = Buffer.from(expectedSig, 'utf8')
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return { ok: false, reason: 'bad_signature' }

  if (typeof payload.aud !== 'string' || payload.aud !== config.clientId) return { ok: false, reason: 'bad_audience' }

  if (typeof payload.exp !== 'number' || now / 1000 >= payload.exp) return { ok: false, reason: 'expired' }
  if (typeof payload.nbf === 'number' && now / 1000 < payload.nbf) return { ok: false, reason: 'not_yet_valid' }

  const issHost = safeHostname(payload.iss)
  const destHost = safeHostname(payload.dest)
  if (!issHost || !destHost || issHost !== destHost || !destHost.endsWith('.myshopify.com')) {
    return { ok: false, reason: 'bad_shop_domain' }
  }

  return { ok: true, shopDomain: destHost }
}

function safeHostname(value: string | undefined): string | null {
  if (typeof value !== 'string' || !value) return null
  try {
    return new URL(value).hostname.toLowerCase()
  } catch {
    return null
  }
}
