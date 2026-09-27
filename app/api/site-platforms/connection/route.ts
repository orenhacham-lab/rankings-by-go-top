/**
 * /api/site-platforms/connection — the project's Wix or custom-site (webhook) connection.
 *
 * GET    ?projectId=   → the sanitized connection (never the key or secret) + whether
 *                        the platform may be switched (not for Shopify App Store merchants)
 * POST   { projectId, platform: 'wix', siteId, apiKey, siteUrl? }
 *        { projectId, platform: 'webhook', endpointUrl, siteUrl?, rotateSecret? }
 *                      → validate (Wix: one harmless read; webhook: SSRF admission),
 *                        encrypt, save. A new webhook secret is returned ONCE.
 * DELETE ?projectId=   → disconnect
 *
 * Gated by ENABLE_CONTENT; auth + project ownership on every method (proxy.ts
 * does not cover /api/*). Logic and its QA: lib/site-platforms/http.ts.
 */
import { handleDeleteConnection, handleGetConnection, handleSaveConnection } from '@/lib/site-platforms/http'
import { siteRouteDeps } from '@/lib/site-platforms/route-deps'

export async function GET(request: Request) {
  return handleGetConnection(request, siteRouteDeps)
}

export async function POST(request: Request) {
  return handleSaveConnection(request, siteRouteDeps)
}

export async function DELETE(request: Request) {
  return handleDeleteConnection(request, siteRouteDeps)
}
