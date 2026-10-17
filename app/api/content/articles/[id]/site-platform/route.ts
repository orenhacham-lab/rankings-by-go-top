/**
 * POST /api/content/articles/:id/site-platform
 *
 * Publish the article to the project's Wix or custom-site (webhook) connection.
 * Idempotent: an article already on that platform is reconciled, never posted
 * twice. Failures answer with a stable code the screen localizes.
 * Gated by ENABLE_CONTENT; auth + project ownership. Logic: lib/site-platforms/http.ts.
 */
import { handlePublishArticle } from '@/lib/site-platforms/http'
import { siteRouteDeps } from '@/lib/site-platforms/route-deps'

export const maxDuration = 60

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  return handlePublishArticle(id, siteRouteDeps)
}
