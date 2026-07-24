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

/**
 * Resolve the target shop for a cleanup topic from the HMAC-verified inputs, per topic:
 *   - shop/redact: `shop_domain` is part of the signed compliance PAYLOAD → required. If
 *     the (unsigned) X-Shopify-Shop-Domain header is also present, it must normalize to the
 *     SAME shop, else reject. An absent header is acceptable.
 *   - app/uninstalled: the shop comes from the X-Shopify-Shop-Domain HEADER (a header on a
 *     request whose raw body passed HMAC — the header itself is not signed) → required. If
 *     the payload carries a non-null `myshopify_domain`, it must match the header shop.
 * Never uses an arbitrary `payload.domain` fallback. Pure — no DB access. Returns the
 * normalized shop or a stable non-sensitive error code.
 */
export function resolveCleanupShop(
  topic: 'shop/redact' | 'app/uninstalled',
  payload: Record<string, unknown>,
  headerShop: string | null,
): { shop: string } | { error: string } {
  if (topic === 'shop/redact') {
    const shop = normalizeShopDomain(typeof payload.shop_domain === 'string' ? payload.shop_domain : '')
    if (!shop) return { error: 'invalid_shop' }
    if (headerShop) {
      const h = normalizeShopDomain(headerShop)
      if (!h || h !== shop) return { error: 'shop_mismatch' }
    }
    return { shop }
  }
  // app/uninstalled
  const shop = normalizeShopDomain(headerShop ?? '')
  if (!shop) return { error: 'invalid_shop' }
  if (payload.myshopify_domain != null) {
    const p = normalizeShopDomain(typeof payload.myshopify_domain === 'string' ? payload.myshopify_domain : '')
    if (!p || p !== shop) return { error: 'shop_mismatch' }
  }
  return { shop }
}

export async function POST(request: Request): Promise<Response> {
  // Shopify's mandatory compliance webhooks MUST stay reachable regardless of any
  // product feature flag (content module, automation, Shopify UI, etc.). This endpoint
  // is deliberately NOT gated by isContentModuleEnabled — disabling a UI/content feature
  // must never turn a compliance endpoint into a 404. HMAC verification below is the
  // first (and only) application-level gate; an unsigned/invalid request always 401s.

  // 1) Read the EXACT raw bytes ONCE, before any decode/parse.
  const raw = Buffer.from(await request.arrayBuffer())

  // 2) Verify the raw-body HMAC BEFORE parsing JSON or touching the database.
  const secret = getShopifyWebhookSecret()
  const hmacHeader = request.headers.get(SHOPIFY_WEBHOOK_HMAC_HEADER)
  if (!verifyShopifyWebhookHmac(raw, hmacHeader, secret)) return json(401, { error: 'unauthorized' })

  // 3) Only after successful verification: decode + parse into UNKNOWN, then require a
  //    non-null plain JSON object. A signed null/array/string/number/boolean is a malformed
  //    payload → 400 (never allowed to throw or reach the database).
  let parsed: unknown
  try {
    parsed = JSON.parse(raw.toString('utf8'))
  } catch {
    return json(400, { error: 'invalid_json' })
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    return json(400, { error: 'invalid_payload' })
  }
  const payload = parsed as Record<string, unknown>

  const topic = request.headers.get(TOPIC_HEADER) ?? ''
  const headerShop = request.headers.get(SHOP_HEADER)

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
    // Resolve + validate the shop identity per topic BEFORE any DB access. An invalid /
    // missing / mismatched shop returns 400 and never opens an admin client.
    const resolved = resolveCleanupShop(topic, payload, headerShop)
    if ('error' in resolved) return json(400, { error: resolved.error })

    const admin = createAdminClient()
    const result = topic === 'shop/redact'
      ? await applyShopRedact(admin, resolved.shop)
      : await applyAppUninstalled(admin, resolved.shop)
    if (!result.ok) {
      // Non-2xx so Shopify retries. Only a non-reversible shop hash + reason are logged.
      console.error('[shopify-webhook] cleanup failed', { topic, shop: shopHash(resolved.shop), reason: result.error })
      return json(500, { error: 'cleanup_failed' })
    }
    return json(200, { ok: true, topic })
  }

  // Valid HMAC but an unknown/unsupported topic → acknowledge (avoid Shopify retries),
  // with NO side effects.
  return json(200, { ok: true, topic: topic || null })
}
