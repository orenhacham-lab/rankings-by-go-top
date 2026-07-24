/**
 * POST /api/shopify/webhooks/app-uninstalled — the PUBLIC "Go Top SEO" app's uninstall
 * webhook (the exact URL declared in shopify.app.toml / Partner Dashboard). NOT a GDPR
 * compliance topic, but signed by the same public app, so its raw-body HMAC is verified
 * with SHOPIFY_PUBLIC_CLIENT_SECRET. On app/uninstalled it disables the connection via
 * applyAppUninstalled (revocation-sentinel token, unchanged). Same response contract as
 * the base route: 401 before parse/DB; 400 invalid_json / invalid_payload; 400 for an
 * invalid/missing shop; 500 on cleanup failure; 200 on success or an unrelated valid
 * topic. POST only, Node.js runtime, no secret/body logging. No product feature flag.
 */

import { createAdminClient } from '@/lib/supabase/admin'
import { readVerifiedPublicWebhook, json } from '@/lib/shopify/webhook-public'
import { applyAppUninstalled } from '@/lib/shopify/shop-cleanup'
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

  if (topic === 'app/uninstalled') {
    const resolved = resolveCleanupShop('app/uninstalled', v.payload, headerShop)
    if ('error' in resolved) return json(400, { error: resolved.error })
    const admin = createAdminClient()
    const result = await applyAppUninstalled(admin, resolved.shop)
    if (!result.ok) {
      console.error('[shopify-app-uninstalled] cleanup failed', { topic, reason: result.error })
      return json(500, { error: 'cleanup_failed' })
    }
    return json(200, { ok: true, topic })
  }

  // A validly-signed but unrelated topic reaching this endpoint → acknowledge, no side effects.
  return json(200, { ok: true, topic: topic || null })
}
