/**
 * Shopify WEBHOOK HMAC verification (raw-body).
 *
 * Shopify signs every webhook with a base64 HMAC-SHA256 over the EXACT raw request
 * bytes, delivered in the `X-Shopify-Hmac-Sha256` header, using the app's client
 * secret. This is DIFFERENT from the OAuth callback HMAC (query-string, hex,
 * sorted params) in lib/shopify/oauth.ts — do not use that verifier for webhooks.
 *
 * Security: reads ONLY `SHOPIFY_CLIENT_SECRET` (the same app secret the OAuth flow
 * uses). Never logs the secret, the header, the raw body, or any digest.
 */

import crypto from 'crypto'

/** The header Shopify sends the base64 HMAC in (lower-cased for header lookups). */
export const SHOPIFY_WEBHOOK_HMAC_HEADER = 'x-shopify-hmac-sha256'

/** HMAC-SHA256 digest length in bytes (a valid signature is exactly this long). */
const HMAC_SHA256_BYTES = 32

/**
 * Shopify's canonical base64 encoding of a 32-byte SHA-256 digest: exactly 44 chars —
 * 43 standard-alphabet chars + a single `=` pad. Standard alphabet only (no URL-safe
 * `-`/`_`), no whitespace, no trailing junk. Node's base64 decoder is LENIENT (it
 * silently drops invalid characters), so a valid signature with `!!!!` appended would
 * otherwise still decode to 32 bytes — this exact-shape check rejects that before decode.
 */
const CANONICAL_HMAC_RE = /^[A-Za-z0-9+/]{43}=$/

/**
 * The Shopify app client secret used to sign webhook HMACs. Reads
 * `SHOPIFY_CLIENT_SECRET` ONLY — the same secret the app's OAuth uses. Returns
 * null when unset/blank so the caller fails closed (rejects the webhook).
 */
export function getShopifyWebhookSecret(): string | null {
  const secret = process.env.SHOPIFY_CLIENT_SECRET
  return typeof secret === 'string' && secret.trim().length > 0 ? secret : null
}

/**
 * Verify a Shopify webhook HMAC over the EXACT raw request bytes.
 *
 * Computes base64 HMAC-SHA256 of `rawBody` with `secret` and compares it in
 * constant time to the provided `X-Shopify-Hmac-Sha256` header. Returns `false`
 * for any missing / malformed / wrong-length / tampered / invalid input — it
 * never throws and never logs sensitive material. Length is normalized before the
 * timing-safe compare so `timingSafeEqual` cannot throw on a length mismatch.
 */
export function verifyShopifyWebhookHmac(
  rawBody: Buffer,
  hmacHeader: string | null | undefined,
  secret: string | null | undefined,
): boolean {
  if (!secret || typeof secret !== 'string') return false
  if (!hmacHeader || typeof hmacHeader !== 'string') return false
  if (!Buffer.isBuffer(rawBody)) return false

  // 1) Require Shopify's EXACT canonical base64 shape before decoding (defeats the lenient
  //    decoder: appended `!!!!`, whitespace, URL-safe alphabet, or bad length all fail here).
  if (!CANONICAL_HMAC_RE.test(hmacHeader)) return false

  const provided = Buffer.from(hmacHeader, 'base64')
  if (provided.length !== HMAC_SHA256_BYTES) return false

  // 2) Reject any header that does not round-trip to its OWN canonical encoding — a second
  //    guard against non-canonical input the regex might not have distinguished.
  if (provided.toString('base64') !== hmacHeader) return false

  const computed = crypto.createHmac('sha256', secret).update(rawBody).digest()
  // Both are exactly 32 bytes here, so timingSafeEqual is safe; guard anyway.
  if (computed.length !== provided.length) return false
  try {
    return crypto.timingSafeEqual(computed, provided)
  } catch {
    return false
  }
}
