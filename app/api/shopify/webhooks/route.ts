/**
 * POST /api/shopify/webhooks — Shopify mandatory compliance webhook receiver.
 *
 * This is the BASE endpoint Shopify's automated review calls. It verifies the
 * raw-body HMAC BEFORE parsing anything, then dispatches by `X-Shopify-Topic`:
 *   - customers/data_request, customers/redact → verified 200 no-op (this app stores
 *     NO Shopify customer PII — see the evidence note below);
 *   - shop/redact → erase local shop-scoped data (lib/shopify/shop-cleanup);
 *   - app/uninstalled → disable the connection (revocation sentinel token);
 *   - any other valid topic → 200 with no side effects.
 *
 * Responses: missing/invalid HMAC → 401 (before any parse or DB access); valid HMAC
 * with malformed JSON → 400; invalid/missing shop for a cleanup topic → 400; a
 * cleanup/DB failure → 500 (so Shopify retries); success → 200. No redirects.
 * Node.js runtime (crypto + exact raw bytes). No PII/secret/body is logged.
 */

import crypto from 'crypto'
import { createAdminClient } from '@/lib/supabase/admin'
import { isContentModuleEnabled } from '@/lib/content/api-auth'
import { normalizeShopDomain } from '@/lib/shopify/domain'
import { getShopifyWebhookSecret, verifyShopifyWebhookHmac, SHOPIFY_WEBHOOK_HMAC_HEADER } from '@/lib/shopify/webhook-hmac'
import { applyShopRedact, applyAppUninstalled } from '@/lib/shopify/shop-cleanup'

export const runtime = 'nodejs'

const TOPIC_HEADER = 'x-shopify-topic'
const SHOP_HEADER = 'x-shopify-shop-domain'

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
}

/** Non-reversible short hash of the shop domain for safe logging (never the plain shop). */
function shopHash(shop: string): string {
  return crypto.createHash('sha256').update(shop).digest('hex').slice(0, 12)
}

export async function POST(request: Request): Promise<Response> {
  if (!isContentModuleEnabled()) return json(404, { error: 'Not found' })

  // 1) Read the EXACT raw bytes ONCE, before any decode/parse.
  const raw = Buffer.from(await request.arrayBuffer())

  // 2) Verify the raw-body HMAC BEFORE parsing JSON or touching the database.
  const secret = getShopifyWebhookSecret()
  const hmacHeader = request.headers.get(SHOPIFY_WEBHOOK_HMAC_HEADER)
  if (!verifyShopifyWebhookHmac(raw, hmacHeader, secret)) return json(401, { error: 'unauthorized' })

  // 3) Only after successful verification: decode + parse.
  let payload: Record<string, unknown>
  try {
    payload = JSON.parse(raw.toString('utf8')) as Record<string, unknown>
  } catch {
    return json(400, { error: 'invalid_json' })
  }

  const topic = request.headers.get(TOPIC_HEADER) ?? ''

  // customers/data_request + customers/redact — VERIFIED NO-OP.
  // Evidence (repo/schema/scopes): this app stores NO Shopify customer PII. The only
  // shop-scoped tables are shopify_connections / shopify_entities (merchant catalog) /
  // shopify_oauth_states, plus Shopify publish pointers on generated_articles — none
  // holds customer/order data. Requested OAuth scopes are read_products / read_content /
  // write_content only (no customer/order scopes). So there is nothing to return or erase.
  if (topic === 'customers/data_request' || topic === 'customers/redact') {
    return json(200, { ok: true, topic })
  }

  if (topic === 'shop/redact' || topic === 'app/uninstalled') {
    // Resolve the shop ONLY from the verified payload (fallback: the signed shop header).
    // Never a user-controlled arbitrary host — normalizeShopDomain enforces *.myshopify.com.
    const rawShop =
      (typeof payload.shop_domain === 'string' && payload.shop_domain) ||
      request.headers.get(SHOP_HEADER) ||
      ''
    const shop = normalizeShopDomain(String(rawShop))
    if (!shop) return json(400, { error: 'invalid_shop' })

    const admin = createAdminClient()
    const result = topic === 'shop/redact'
      ? await applyShopRedact(admin, shop)
      : await applyAppUninstalled(admin, shop)
    if (!result.ok) {
      // Non-2xx so Shopify retries. Only a non-reversible shop hash + reason are logged.
      console.error('[shopify-webhook] cleanup failed', { topic, shop: shopHash(shop), reason: result.error })
      return json(500, { error: 'cleanup_failed' })
    }
    return json(200, { ok: true, topic })
  }

  // Valid HMAC but an unknown/unsupported topic → acknowledge (avoid Shopify retries),
  // with NO side effects.
  return json(200, { ok: true, topic: topic || null })
}
