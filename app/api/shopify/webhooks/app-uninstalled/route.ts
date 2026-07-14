/**
 * Shopify app/uninstalled webhook — POST /api/shopify/webhooks/app-uninstalled
 *
 * A NORMAL (non-compliance) webhook: when a merchant uninstalls the app, Shopify
 * revokes the access token, so we mark the shop's connection disconnected and empty
 * the stored token. Distinct from shop/redact (GDPR): uninstall may happen at a
 * different time and simply cleans up the now-dead token. Same raw-body HMAC
 * verification (public app secret) as the compliance endpoint; idempotent; logs no
 * secrets or payloads.
 */

import { createAdminClient } from '@/lib/supabase/admin'
import { verifyShopifyWebhookHmac, shopifyWebhookSecret, shopDomainHash } from '@/lib/shopify/webhook'
import { disconnectShopConnections } from '@/lib/shopify/connection-cleanup'

export const runtime = 'nodejs'

export async function POST(request: Request) {
  const rawBody = Buffer.from(await request.arrayBuffer())
  const hmacHeader = request.headers.get('x-shopify-hmac-sha256')
  const topic = request.headers.get('x-shopify-topic')
  const shopHeader = request.headers.get('x-shopify-shop-domain')

  const secret = shopifyWebhookSecret()
  if (!secret || !verifyShopifyWebhookHmac(rawBody, hmacHeader, secret)) {
    return new Response('Unauthorized', { status: 401 })
  }
  if (topic !== 'app/uninstalled') {
    return new Response('Unsupported topic', { status: 404 })
  }

  let payload: Record<string, unknown> = {}
  try { payload = rawBody.length ? (JSON.parse(rawBody.toString('utf8')) as Record<string, unknown>) : {} } catch { payload = {} }
  const shopDomain = String((payload as { myshopify_domain?: unknown; domain?: unknown }).myshopify_domain || shopHeader || '')

  const res = await disconnectShopConnections(createAdminClient(), shopDomain, 'app_uninstalled')
  console.log('[shopify-webhook] app/uninstalled', { shop: shopDomainHash(shopDomain), matched: res.matched, result: res.ok ? 'ok' : 'error' })
  return new Response('OK', { status: 200 })
}
