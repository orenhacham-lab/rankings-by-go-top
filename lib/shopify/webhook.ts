/**
 * Shopify webhook HMAC verification + compliance helpers (server-only, PURE where
 * possible). Used by the mandatory GDPR/compliance webhooks and app/uninstalled.
 *
 * The signature is HMAC-SHA256 (base64) over the UNTOUCHED raw request body, keyed
 * with the PUBLIC app's client secret. Verification is constant-time and never
 * throws on malformed input. NOTHING here logs raw bodies, tokens or personal data.
 */

import crypto from 'crypto'
import { normalizeShopDomain } from './domain'

/** The three mandatory Shopify compliance (GDPR) topics. */
export const COMPLIANCE_TOPICS = ['customers/data_request', 'customers/redact', 'shop/redact'] as const
export type ComplianceTopic = (typeof COMPLIANCE_TOPICS)[number]
export function isComplianceTopic(topic: string | null | undefined): topic is ComplianceTopic {
  return !!topic && (COMPLIANCE_TOPICS as readonly string[]).includes(topic)
}

/**
 * The secret used to verify PUBLIC-app webhooks. Compliance webhooks are delivered
 * by the public app "Go Top SEO", so they are signed with SHOPIFY_PUBLIC_CLIENT_SECRET.
 * Server-only; returns null when unconfigured (→ the caller rejects, never accepts).
 */
export function shopifyWebhookSecret(): string | null {
  const s = (process.env.SHOPIFY_PUBLIC_CLIENT_SECRET || '').trim()
  return s || null
}

/**
 * Verify the X-Shopify-Hmac-SHA256 header against an HMAC-SHA256 (base64) of the
 * exact raw body. Constant-time; returns false (never throws) for a missing header,
 * invalid base64, a length mismatch, or a wrong signature.
 */
export function verifyShopifyWebhookHmac(rawBody: Buffer, hmacHeader: string | null | undefined, secret: string): boolean {
  if (!hmacHeader || typeof hmacHeader !== 'string' || !secret) return false
  const expected = crypto.createHmac('sha256', secret).update(rawBody).digest() // Buffer (32 bytes)
  // Buffer.from(<invalid base64>) never throws — it decodes best-effort; a wrong
  // length or wrong bytes then fails the constant-time compare below.
  let provided: Buffer
  try {
    provided = Buffer.from(hmacHeader, 'base64')
  } catch {
    return false
  }
  if (provided.length !== expected.length) return false
  return crypto.timingSafeEqual(provided, expected)
}

/** A non-reversible short hash of the shop domain for SAFE logging (no PII). */
export function shopDomainHash(shopDomain: string | null | undefined): string {
  const norm = normalizeShopDomain(String(shopDomain || '')) || String(shopDomain || '').trim().toLowerCase()
  if (!norm) return 'unknown'
  return crypto.createHash('sha256').update(norm).digest('hex').slice(0, 12)
}
