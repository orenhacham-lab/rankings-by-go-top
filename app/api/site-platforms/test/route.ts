/**
 * POST /api/site-platforms/test
 *   { projectId, platform: 'wix', siteId, apiKey }  → test an unsaved Wix pair (one harmless read)
 *   { projectId, platform: 'webhook', endpointUrl } → check an unsaved address (SSRF admission only)
 *   { projectId }                                   → test the saved connection
 *                                                     (Wix: one read; webhook: a signed test event)
 * Answers { ok, code? } with a stable code, never a provider's text.
 * Gated by ENABLE_CONTENT; auth + project ownership. Logic: lib/site-platforms/http.ts.
 */
import { handleTest } from '@/lib/site-platforms/http'
import { siteRouteDeps } from '@/lib/site-platforms/route-deps'

export async function POST(request: Request) {
  return handleTest(request, siteRouteDeps)
}
