/**
 * Phase 4F.2 — POST /api/content/articles/:id/shopify
 *
 * Publish/update the article as a Shopify Blog Article (draft or published).
 * Idempotent: creates once, then updates the SAME article by stored GID; never
 * duplicates on retry. Requires write_content + a selected target Blog. Never
 * returns the token. Gated by ENABLE_CONTENT + ownership.
 */

import { authContentProject, isContentModuleEnabled } from '@/lib/content/api-auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { loadShopifyConnection } from '@/lib/shopify/api-auth'
import { publishArticleToShopify, type ShopifyPublishArticleRow } from '@/lib/shopify/publish-article'

const ARTICLE_SELECT =
  'id, project_id, title, slug, excerpt, meta_description, content_html, featured_image_url, shopify_blog_id, shopify_article_id, shopify_tags'

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!isContentModuleEnabled()) return Response.json({ error: 'Not found' }, { status: 404 })
  const { id } = await params

  let body: { status?: string; publishDate?: string | null }
  try { body = await request.json() } catch { body = {} }
  const raw = body.status === undefined ? 'draft' : body.status
  if (raw !== 'draft' && raw !== 'publish') return Response.json({ error: 'invalid_status', reason: 'invalid_status' }, { status: 400 })
  const published = raw === 'publish'

  const admin = createAdminClient()
  const { data: article } = await admin.from('generated_articles').select(ARTICLE_SELECT).eq('id', id).maybeSingle()
  if (!article) return Response.json({ error: 'Article not found' }, { status: 404 })
  const a = article as Record<string, unknown>

  const auth = await authContentProject(a.project_id as string)
  if ('error' in auth) return Response.json({ error: auth.error }, { status: auth.status })

  const loaded = await loadShopifyConnection(auth.admin, auth.project.id)
  if ('error' in loaded) {
    const reason = loaded.status === 404 ? 'no_shopify_connection' : loaded.status === 409 ? 'shopify_connection_inactive' : 'shopify_connection_error'
    return Response.json({ error: reason, reason }, { status: loaded.status === 404 ? 400 : loaded.status })
  }

  // Author name (optional) — the project's business name where available.
  let authorName: string | null = null
  try {
    const { data: proj } = await auth.admin.from('projects').select('business_name').eq('id', auth.project.id).maybeSingle()
    const bn = (proj as { business_name?: string } | null)?.business_name
    authorName = bn ? String(bn) : null
  } catch { /* optional */ }

  const result = await publishArticleToShopify(
    auth.admin, loaded.connection, loaded.creds, a as unknown as ShopifyPublishArticleRow,
    { published, publishDate: body.publishDate ?? null, authorName },
  )

  if (!result.ok) {
    // A publishing failure is NEVER reported as success. Post-item metadata is
    // preserved by the orchestrator (never erased on transient failure).
    // A DESTINATION VERDICT vs a DESTINATION OUTAGE are different answers and
    // must not share a status. `no_shopify_blog` (the store has none) and
    // `missing_default_blog` (it has several and none is chosen) are settled
    // facts the merchant must act on → 400. `blog_lookup_failed` is our
    // inability to read Shopify right now, says nothing about the store, and is
    // retryable → 503. Everything else keeps its existing mapping.
    const httpStatus = result.reason === 'missing_write_content_scope' || result.reason === 'no_shopify_blog' || result.reason === 'missing_default_blog' ? 400
      : result.reason === 'blog_lookup_failed' ? 503
      : result.reason === 'permission_error' || result.reason === 'token_invalid' ? 403
      : result.reason === 'remote_article_missing' ? 409
      : 502
    return Response.json({
      error: result.reason, reason: result.reason,
      ...(result.detail ? { detail: result.detail } : {}),
      ...(result.userErrors ? { userErrors: result.userErrors } : {}),
      imageWarnings: result.imageWarnings,
    }, { status: httpStatus })
  }

  return Response.json({
    ok: true,
    shopify_article_id: result.articleId,
    shopify_article_url: result.url,
    shopify_handle: result.handle,
    shopify_status: result.status,
    shopify_published_at: result.publishedAt ?? null,
    updated: result.updated ?? false,
    imageWarnings: result.imageWarnings,
  })
}
