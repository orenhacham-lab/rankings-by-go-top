/**
 * Shopify mandatory COMPLIANCE (GDPR) webhooks —
 * POST /api/shopify/webhooks/compliance
 *
 * Handles exactly the three mandatory topics: customers/data_request,
 * customers/redact, shop/redact. The raw body is read ONCE and HMAC-verified with
 * the PUBLIC app secret BEFORE any JSON parsing; an unverified request is 401.
 *
 * Data model note: this app stores NO Shopify CUSTOMER or ORDER personal data
 * (only project content + a shop-scoped connection with an encrypted Admin token).
 * So customers/* are safe, idempotent no-ops; shop/redact revokes the shop's stored
 * token (never deletes project content/articles). All handlers are naturally
 * idempotent, so no event-dedupe store is required. Nothing here logs raw payloads,
 * tokens, customer data, emails, addresses or phone numbers.
 */

import { createAdminClient } from '@/lib/supabase/admin'
import { verifyShopifyWebhookHmac, shopifyWebhookSecret, isComplianceTopic, shopDomainHash } from '@/lib/shopify/webhook'
import { disconnectShopConnections } from '@/lib/shopify/connection-cleanup'

// Node runtime: crypto (HMAC) + service-role DB access.
export const runtime = 'nodejs'

export async function POST(request: Request) {
  // 1) Read the raw body ONCE as bytes — NEVER request.json() before verifying.
  const rawBody = Buffer.from(await request.arrayBuffer())
  const hmacHeader = request.headers.get('x-shopify-hmac-sha256')
  const topic = request.headers.get('x-shopify-topic')
  const shopHeader = request.headers.get('x-shopify-shop-domain')
  const webhookId = request.headers.get('x-shopify-webhook-id') // trace only (handlers are idempotent)

  // 2) HMAC over the untouched raw body, keyed with the public app secret.
  const secret = shopifyWebhookSecret()
  if (!secret || !verifyShopifyWebhookHmac(rawBody, hmacHeader, secret)) {
    return new Response('Unauthorized', { status: 401 })
  }

  // 3) Only the three mandatory compliance topics are accepted here.
  if (!isComplianceTopic(topic)) {
    return new Response('Unsupported topic', { status: 404 })
  }

  // 4) Parse the payload ONLY after verification (safe — the body is authentic).
  let payload: Record<string, unknown> = {}
  try {
    payload = rawBody.length ? (JSON.parse(rawBody.toString('utf8')) as Record<string, unknown>) : {}
  } catch {
    payload = {}
  }
  const shopDomain = String(payload.shop_domain || shopHeader || '')
  const logBase = { topic, shop: shopDomainHash(shopDomain), webhookId: webhookId || null }

  try {
    if (topic === 'shop/redact') {
      // Revoke the shop's stored token; preserve all project content/articles.
      const res = await disconnectShopConnections(createAdminClient(), shopDomain, 'shop_redacted')
      console.log('[shopify-compliance] shop/redact', { ...logBase, matched: res.matched, result: res.ok ? 'ok' : 'error' })
      // Idempotent + non-enumerating: always 200 regardless of whether a shop existed.
      return new Response('OK', { status: 200 })
    }

    // customers/data_request + customers/redact: this app stores no Shopify customer
    // or order personal data, so both are safe, idempotent no-ops.
    console.log('[shopify-compliance] no-op (no customer PII stored)', { ...logBase, result: 'no_data' })
    return new Response('OK', { status: 200 })
  } catch (e) {
    // A handler error must not reveal internals; the request was authentic, so ack.
    console.error('[shopify-compliance] handler error', { topic, shop: shopDomainHash(shopDomain), message: e instanceof Error ? e.message : 'error' })
    return new Response('OK', { status: 200 })
  }
}
