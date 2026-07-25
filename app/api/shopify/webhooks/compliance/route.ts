/**
 * POST /api/shopify/webhooks/compliance — the PUBLIC "Go Top SEO" app's mandatory GDPR
 * compliance endpoint (the exact URL declared in shopify.app.toml and configured in the
 * Shopify Partner Dashboard). Verifies the raw-body HMAC with SHOPIFY_PUBLIC_CLIENT_SECRET,
 * then dispatches by X-Shopify-Topic:
 *   - customers/data_request, customers/redact → verified 200 no-op (this app stores NO
 *     Shopify customer PII — see the base route + shop-cleanup for the evidence);
 *   - shop/redact → applyShopRedact (local shop-scoped erasure, unchanged).
 * Same response contract as the base route: 401 before parse/DB; 400 invalid_json /
 * invalid_payload; 400 for an invalid/missing/mismatched shop; 500 on cleanup failure;
 * 200 on success or an unrelated valid topic. POST only, Node.js runtime, no logging of
 * secrets/body/customer data. NOT gated by any product feature flag.
 */

import { createAdminClient } from '@/lib/supabase/admin'
import { readVerifiedPublicWebhook, json } from '@/lib/shopify/webhook-public'
import { applyShopRedact } from '@/lib/shopify/shop-cleanup'
// Reuse the base route's validated per-topic shop resolver AS-IS (not duplicated).
import { resolveCleanupShop } from '../route'

export const runtime = 'nodejs'

const TOPIC_HEADER = 'x-shopify-topic'
const SHOP_HEADER = 'x-shopify-shop-domain'

export async function POST(request: Request): Promise<Response> {
  const v = await readVerifiedPublicWebhook(request)
  if (!v.ok) return json(v.status, { error: v.error })

  const topic = request.headers.get(TOPIC_HEADER) ?? ''
  const headerShop = request.headers.get(SHOP_HEADER)

  // customers/* — VERIFIED NO-OP (no Shopify customer PII stored; scopes are
  // read_products/read_content/write_content only). Nothing to return or erase.
  if (topic === 'customers/data_request' || topic === 'customers/redact') {
    return json(200, { ok: true, topic })
  }

  if (topic === 'shop/redact') {
    const resolved = resolveCleanupShop('shop/redact', v.payload, headerShop)
    if ('error' in resolved) return json(400, { error: resolved.error })
    const admin = createAdminClient()
    const result = await applyShopRedact(admin, resolved.shop)
    if (!result.ok) {
      console.error('[shopify-compliance] cleanup failed', { topic, reason: result.error })
      return json(500, { error: 'cleanup_failed' })
    }
    return json(200, { ok: true, topic })
  }

  // A validly-signed but non-compliance topic reaching this endpoint → acknowledge (avoid
  // Shopify retries), with NO side effects.
  return json(200, { ok: true, topic: topic || null })
}
