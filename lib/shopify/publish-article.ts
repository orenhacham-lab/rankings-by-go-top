/**
 * Phase 4F.2 — Shopify Blog Article publishing orchestrator (server-side).
 *
 * Create-or-update a Blog Article idempotently from a generated_articles row:
 *   - requires write_content (checked before any mutation),
 *   - composes the body from the article HTML + inline-image figures (stable
 *     public URLs only), featured image passed as a stable public URL,
 *   - persists shopify_article_id IMMEDIATELY on create (before url/status),
 *   - updates the SAME article on re-export (never a duplicate),
 *   - detects a deleted remote article and refuses to silently recreate,
 *   - treats GraphQL userErrors as failures and never erases stored metadata on
 *     a transient failure.
 * Reuses the frozen inline-image composer + HTML sanitizer unchanged.
 */

import type { createAdminClient } from '@/lib/supabase/admin'
import type { ShopifyCredentials } from './types'
import type { ShopifyConnectionRow } from './api-auth'
import { hasWriteContent } from './constants'
import { buildCanonicalUrl } from './domain'
import { ShopifyClientError, shopifyArticleCreate, shopifyArticleUpdate, shopifyGetArticle } from './client'
import { buildArticleInput, isStableImageUrl, summarizeUserErrors, decideArticleAction, type ShopifyUserError } from './article-payload'
import { checkShopifyPublishEntitlement } from './billing-guard'
import { resolvePublishBlogTarget } from './resolve-publish-blog'
import { sanitizeArticleHtml } from '@/lib/content/article-html'
import { injectInlineImages, type ComposableInlineImage } from '@/lib/content/inline-images-compose'

type Admin = ReturnType<typeof createAdminClient>

export type ShopifyPublishReason =
  | 'missing_write_content_scope' | 'no_shopify_blog' | 'invalid_blog' | 'permission_error'
  // Several blogs exist and none is selected — a choice only the merchant can
  // make. DISTINCT from no_shopify_blog: the store does have blogs.
  | 'missing_default_blog'
  // The Blogs lookup itself failed — transient, and never a claim about the store.
  | 'blog_lookup_failed'
  | 'article_create_failed' | 'article_update_failed' | 'graphql_user_error' | 'remote_article_missing'
  | 'token_invalid' | 'rate_limited' | 'exact_failure'
  // Phase 2 — the central billing entitlement guard denied this publish.
  | 'billing_not_entitled'

export interface ShopifyPublishArticleRow {
  id: string
  title: unknown
  slug: unknown
  excerpt: unknown
  meta_description: unknown
  content_html: unknown
  featured_image_url: unknown
  shopify_blog_id: string | null
  shopify_article_id: string | null
  shopify_tags: string[] | null
}

export interface ShopifyPublishResult {
  ok: boolean
  reason?: ShopifyPublishReason
  detail?: string
  userErrors?: ShopifyUserError[]
  /** Non-fatal per-image warnings (unstable/dropped image URLs). */
  imageWarnings: string[]
  /** Present on success. */
  articleId?: string
  url?: string | null
  handle?: string
  status?: 'draft' | 'published'
  publishedAt?: string | null
  /** True when this was an update of an existing article (not a create). */
  updated?: boolean
}

const nowIso = () => new Date().toISOString()

/** Load ready inline images with STABLE public URLs; warn on any dropped ones. */
async function loadStableInlineImages(admin: Admin, articleId: string): Promise<{ images: ComposableInlineImage[]; warnings: string[] }> {
  const warnings: string[] = []
  try {
    const { data } = await admin
      .from('article_inline_images')
      .select('id, section_id, alt_text, caption, storage_url, position, status')
      .eq('article_id', articleId)
      .eq('status', 'ready')
      .order('position', { ascending: true })
    const rows = (data ?? []) as { id: string; section_id: string; alt_text: string | null; caption: string | null; storage_url: string | null; position: number }[]
    const images: ComposableInlineImage[] = []
    for (const r of rows) {
      if (!isStableImageUrl(r.storage_url)) {
        if (r.storage_url) warnings.push(`inline image ${r.id}: unstable_image_url`)
        continue
      }
      // wp_media_url = null so injectInlineImages('preview') uses the public storage_url.
      images.push({ id: r.id, section_id: r.section_id, alt_text: r.alt_text, caption: r.caption, storage_url: r.storage_url, wp_media_url: null, position: r.position })
    }
    return { images, warnings }
  } catch {
    return { images: [], warnings: [] }
  }
}

/** Map a thrown ShopifyClientError to a publish reason. */
function reasonForClientError(err: unknown, action: 'create' | 'update'): ShopifyPublishReason {
  if (err instanceof ShopifyClientError) {
    if (err.kind === 'invalid_token') return 'token_invalid'
    if (err.kind === 'missing_scope') return 'permission_error'
    if (err.kind === 'rate_limited') return 'rate_limited'
  }
  return action === 'update' ? 'article_update_failed' : 'exact_failure'
}

export async function publishArticleToShopify(
  admin: Admin,
  connection: ShopifyConnectionRow,
  creds: ShopifyCredentials,
  article: ShopifyPublishArticleRow,
  opts: {
    published: boolean
    publishDate?: string | null
    authorName?: string | null
    /**
     * A destination ALREADY resolved by the caller for this same publish
     * attempt (the automation queue resolves it as a pre-claim prerequisite).
     *
     * ONE RESOLUTION PER ATTEMPT. Without this the queue resolved the blog and
     * then this function resolved it a second time — two Shopify Blogs calls
     * for one publish, and a window in which the second answer could differ
     * from the one the queue made its pause/retry decision on. When supplied,
     * this id is used verbatim and no lookup happens here. Direct callers (the
     * manual publish route) omit it and this function resolves internally.
     */
    blogTarget?: { blogId: string }
  },
): Promise<ShopifyPublishResult> {
  const base = { imageWarnings: [] as string[] }

  // 0) Phase 2 — the CENTRAL Shopify billing entitlement guard. Runs FIRST,
  //    before even the write_content scope check, because this function is
  //    the single choke point every Shopify publish path (manual, queue,
  //    cron, retry) goes through — see lib/shopify/billing-guard.ts for why
  //    that's true and what this call actually verifies. Fails closed: any
  //    unverifiable state blocks the publish rather than allowing it.
  const entitlement = await checkShopifyPublishEntitlement(admin, connection)
  if (!entitlement.ok) {
    await persistError(admin, article.id, `shopify_billing_${entitlement.reason}`, entitlement.detail)
    return { ok: false, reason: 'billing_not_entitled', detail: entitlement.detail, imageWarnings: [] }
  }

  // 1) write_content is mandatory before any mutation.
  if (!hasWriteContent(connection.granted_scopes)) {
    return { ok: false, reason: 'missing_write_content_scope', imageWarnings: [] }
  }
  // 2) Resolve the target blog: article-level selection overrides the project
  //    default. Persist the resolved id on the article so retries are
  //    deterministic and a later default change never moves a published article.
  // A store with exactly ONE blog needs no decision from anyone: ask Shopify,
  // use it, and persist it as the connection default. With several, refuse
  // rather than guess. See lib/shopify/resolve-publish-blog.ts.
  let blogId: string
  if (opts.blogTarget) {
    blogId = opts.blogTarget.blogId
  } else {
    const target = await resolvePublishBlogTarget(admin, connection, creds, article)
    if (!target.ok) return { ok: false, reason: target.reason, imageWarnings: [] }
    blogId = target.blogId
  }
  if (!article.shopify_blog_id) {
    await admin.from('generated_articles').update({ shopify_blog_id: blogId, updated_at: nowIso() }).eq('id', article.id)
    article.shopify_blog_id = blogId
  }

  // 3) Compose the body: sanitize + inject inline-image figures (stable URLs).
  const sanitized = sanitizeArticleHtml(String(article.content_html || ''))
  const { images, warnings } = await loadStableInlineImages(admin, article.id)
  const body = injectInlineImages(sanitized, images, 'preview')
  base.imageWarnings.push(...warnings)

  // Featured image — stable public URL only, else a visible warning (not fatal).
  const featuredRaw = article.featured_image_url ? String(article.featured_image_url) : null
  let imageUrl: string | null = null
  if (featuredRaw) {
    if (isStableImageUrl(featuredRaw)) imageUrl = featuredRaw
    else base.imageWarnings.push('featured image: unstable_image_url')
  }

  const title = String(article.title || 'Article')
  const input = buildArticleInput({
    blogId,
    title,
    handle: String(article.slug || '') || null,
    bodyHtml: body,
    summary: String(article.excerpt || article.meta_description || '') || null,
    tags: Array.isArray(article.shopify_tags) ? article.shopify_tags : [],
    authorName: opts.authorName || null,
    published: opts.published,
    publishDate: opts.publishDate || null,
    imageUrl,
    imageAlt: title,
  })

  const host = connection.storefront_domain || connection.shop_domain
  const action = decideArticleAction(article.shopify_article_id)
  const storedId = (article.shopify_article_id || '').trim()

  // 4) UPDATE path — reconcile first so a deleted remote article is detected and
  //    NOT silently recreated. Metadata is preserved on this branch.
  if (action === 'update') {
    try {
      const existing = await shopifyGetArticle(creds, storedId)
      if (!existing) {
        await admin.from('generated_articles').update({ shopify_status: 'remote_missing', shopify_last_error: 'remote_article_missing', shopify_last_synced_at: nowIso(), updated_at: nowIso() }).eq('id', article.id)
        return { ok: false, reason: 'remote_article_missing', imageWarnings: base.imageWarnings }
      }
    } catch (err) {
      const reason = reasonForClientError(err, 'update')
      await persistError(admin, article.id, reason)
      return { ok: false, reason, detail: err instanceof Error ? err.message : undefined, imageWarnings: base.imageWarnings }
    }

    try {
      const res = await shopifyArticleUpdate(creds, storedId, input)
      if (!res.ok) {
        const detail = summarizeUserErrors(res.userErrors)
        await persistError(admin, article.id, 'article_update_failed', detail)
        return { ok: false, reason: 'graphql_user_error', detail, userErrors: res.userErrors, imageWarnings: base.imageWarnings }
      }
      return await persistSuccess(admin, article.id, connection, host, res.article, base.imageWarnings, true)
    } catch (err) {
      const reason = reasonForClientError(err, 'update')
      await persistError(admin, article.id, reason)
      return { ok: false, reason, detail: err instanceof Error ? err.message : undefined, imageWarnings: base.imageWarnings }
    }
  }

  // 5) CREATE path — persist the new article id IMMEDIATELY (before url/status)
  //    so a later DB failure can never cause a duplicate on retry.
  try {
    const res = await shopifyArticleCreate(creds, input)
    if (!res.ok) {
      const detail = summarizeUserErrors(res.userErrors)
      await persistError(admin, article.id, 'article_create_failed', detail)
      return { ok: false, reason: 'graphql_user_error', detail, userErrors: res.userErrors, imageWarnings: base.imageWarnings }
    }
    // Critical: record the article id first (idempotency anchor).
    for (let i = 0; i < 3; i++) {
      const { error } = await admin.from('generated_articles').update({ shopify_article_id: res.article.id, updated_at: nowIso() }).eq('id', article.id)
      if (!error) break
    }
    return await persistSuccess(admin, article.id, connection, host, res.article, base.imageWarnings, false)
  } catch (err) {
    const reason = reasonForClientError(err, 'create')
    await persistError(admin, article.id, reason)
    return { ok: false, reason, detail: err instanceof Error ? err.message : undefined, imageWarnings: base.imageWarnings }
  }
}

async function persistSuccess(
  admin: Admin, articleId: string, connection: ShopifyConnectionRow, host: string,
  node: { id: string; handle: string; isPublished: boolean; publishedAt: string | null; blogHandle: string | null },
  imageWarnings: string[], updated: boolean,
): Promise<ShopifyPublishResult> {
  const url = node.handle ? buildCanonicalUrl(host, 'article', node.handle, node.blogHandle) : null
  const status: 'draft' | 'published' = node.isPublished ? 'published' : 'draft'
  await admin.from('generated_articles').update({
    shopify_article_id: node.id,
    shopify_article_url: url,
    shopify_handle: node.handle || null,
    shopify_status: status,
    shopify_published_at: node.publishedAt,
    shopify_last_error: null,
    shopify_last_synced_at: nowIso(),
    updated_at: nowIso(),
  }).eq('id', articleId)
  return { ok: true, articleId: node.id, url, handle: node.handle, status, publishedAt: node.publishedAt, imageWarnings, updated }
}

/** Record a failure WITHOUT erasing shopify_article_id or prior metadata. */
async function persistError(admin: Admin, articleId: string, reason: string, detail?: string): Promise<void> {
  await admin.from('generated_articles').update({
    shopify_last_error: detail ? `${reason}: ${detail}`.slice(0, 500) : reason,
    shopify_last_synced_at: nowIso(),
    updated_at: nowIso(),
  }).eq('id', articleId)
}
