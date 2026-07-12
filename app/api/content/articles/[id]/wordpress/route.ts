/**
 * Content module — POST /api/content/articles/:id/wordpress
 *
 * Exports the article to the project's connected WordPress site as a DRAFT or a
 * PUBLISHED post (status chosen by the caller — never defaults to publish):
 *   1. Duplicate protection: if the article was already exported (wp_post_id),
 *      require force=true to create a NEW post.
 *   2. If a featured image exists, upload it to the WP Media Library and set it
 *      as featured_media. If the upload FAILS: draft proceeds without the image
 *      (with a warning); publish is BLOCKED (no silent image-less publish).
 *   3. Create the post with the requested status; best-effort SEO meta.
 * Saves wp_post_id, wp_post_url, wp_featured_media_id, wp_connection_id (and
 * local status='published' on a successful publish).
 *
 * No scheduling/cron/pools. Gated by ENABLE_CONTENT + ownership. Credentials are
 * decrypted server-side and never logged or returned.
 */

import { authContentProject, isContentModuleEnabled, loadWordPressCredentials } from '@/lib/content/api-auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { writeVerifiedSeoMeta, WordPressClientError, type WordPressPostStatus } from '@/lib/wordpress/client'
import { wpCreatePost } from '@/lib/content/wordpress-publish'
import { ensureProjectKeywordFromPublishedArticle } from '@/lib/content/keyword-from-article'

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!isContentModuleEnabled()) return Response.json({ error: 'Not found' }, { status: 404 })
  const { id } = await params

  let body: { status?: string; force?: boolean; update?: boolean }
  try {
    body = await request.json()
  } catch {
    body = {}
  }
  // Explicit status only; reject anything else server-side. Default is the safe 'draft'.
  const raw = body.status === undefined ? 'draft' : body.status
  if (raw !== 'draft' && raw !== 'publish') {
    return Response.json({ error: 'invalid_status', reason: 'invalid_status' }, { status: 400 })
  }
  const status: WordPressPostStatus = raw
  const force = body.force === true
  const wantUpdate = body.update === true

  const admin = createAdminClient()
  const { data: article, error } = await admin
    .from('generated_articles')
    .select('id, project_id, topic_id, title, slug, excerpt, meta_title, meta_description, content_html, status, featured_image_url, featured_image_storage_path, wp_post_id, wp_post_url, wp_featured_media_id, wp_primary_category_id, wp_category_ids, wp_tag_ids')
    .eq('id', id)
    .maybeSingle()
  if (error) {
    if ((error as { code?: string }).code === '42P01') return Response.json({ error: 'Content module not initialized' }, { status: 404 })
    return Response.json({ error: 'Failed to load article' }, { status: 500 })
  }
  if (!article) return Response.json({ error: 'Article not found' }, { status: 404 })

  const a = article as Record<string, unknown>
  const auth = await authContentProject(a.project_id as string)
  if ('error' in auth) return Response.json({ error: auth.error }, { status: auth.status })

  // Duplicate protection. Once exported (wp_post_id present) a plain re-export is
  // ambiguous, so require an explicit intent:
  //   - update:true → UPDATE the same post in place (idempotent; no new post),
  //   - force:true  → create a NEW separate post (legacy escape hatch),
  //   - neither     → 409 already_exported (unchanged).
  if (a.wp_post_id && !force && !wantUpdate) {
    return Response.json(
      { error: 'already_exported', reason: 'already_exported', wp_post_id: a.wp_post_id, wp_post_url: a.wp_post_url ?? null },
      { status: 409 },
    )
  }
  // Update-in-place applies only when a post already exists and force wasn't asked.
  const existing = a.wp_post_id && !force
    ? { postId: Number(a.wp_post_id), featuredMediaId: typeof a.wp_featured_media_id === 'number' ? (a.wp_featured_media_id as number) : null }
    : undefined

  // WordPress connection (decrypted server-side).
  const loaded = await loadWordPressCredentials(auth.admin, auth.project.id)
  if ('error' in loaded) {
    const reason = loaded.status === 404 ? 'no_wordpress_connection' : 'wordpress_connection_error'
    return Response.json({ error: reason, reason }, { status: loaded.status === 404 ? 400 : loaded.status })
  }
  const connId = loaded.connection.id
  const title = String(a.title || 'article')
  const logBase = { articleId: id, projectId: auth.project.id, connId, status }

  // Featured image + inline images + taxonomy + createPost/updatePost via the
  // shared WordPress core (same behavior: publish blocks on image-upload failure;
  // draft proceeds with a warning; taxonomy is a safe SET that never fails the
  // post). `existing` → update the same post in place (idempotent re-export).
  const created = await wpCreatePost(auth.admin, loaded.creds, a as never, { status, existing })
  if (!created.ok) {
    if (created.kind === 'media_upload_failed') {
      console.warn('[content-wp-export] media upload failed', { ...logBase, step: 'media_upload' })
      return Response.json({ error: 'wordpress_media_upload_failed', reason: 'wordpress_media_upload_failed', ...(created.detail ? { detail: created.detail } : {}) }, { status: 502 })
    }
    console.log('[content-wp-export] post create failed', { ...logBase, step: 'post_create' })
    return Response.json({ error: 'wordpress_post_failed', reason: 'wordpress_post_failed', ...(created.detail ? { detail: created.detail } : {}) }, { status: 502 })
  }
  const featuredMedia = created.featuredMediaId ?? undefined

  // Phase 4E — SEO meta: detect the site's SEO plugin and write ONLY its keys,
  // then verify. Never fatal to the post; the exact status is surfaced so the UI
  // can warn (never a silent success). The article's focus keyword is the linked
  // topic's primary keyword (best-effort lookup).
  let focusKeyword: string | null = null
  if (a.topic_id && typeof a.topic_id === 'string') {
    try {
      const { data: t } = await auth.admin.from('article_topics').select('primary_keyword').eq('id', a.topic_id).maybeSingle()
      const kw = (t as { primary_keyword?: string } | null)?.primary_keyword
      focusKeyword = kw ? String(kw) : null
    } catch { /* focus keyword is optional */ }
  }
  let seoPlugin: string = 'unknown'
  let seoStatus: string = 'plugin_unavailable'
  let seoDetail: string | undefined
  try {
    const seo = await writeVerifiedSeoMeta(loaded.creds, created.wpPostId, {
      metaTitle: (a.meta_title as string) || title,
      metaDescription: (a.meta_description as string) || null,
      focusKeyword,
    })
    seoPlugin = seo.plugin
    seoStatus = seo.status
    seoDetail = seo.detail
  } catch (err) {
    seoStatus = 'exact_failure'
    seoDetail = err instanceof WordPressClientError ? err.message : 'seo meta rejected'
    console.warn('[content-wp-export] seo meta failed', { ...logBase, step: 'seo_meta', message: seoDetail })
  }

  // Save WordPress references. Only a successful PUBLISH marks the local row
  // 'published'; draft leaves the local status unchanged.
  const update: Record<string, unknown> = {
    wp_post_id: created.wpPostId,
    wp_post_url: created.wpPostUrl,
    wp_connection_id: connId,
    last_error: null,
    updated_at: new Date().toISOString(),
  }
  if (typeof featuredMedia === 'number') update.wp_featured_media_id = featuredMedia
  if (status === 'publish') { update.status = 'published'; update.published_at = new Date().toISOString() }
  await auth.admin.from('generated_articles').update(update).eq('id', id)

  // Phase 3G.4 — when an article that ORIGINATED from a queue item is PUBLISHED here,
  // mark that queue item published so it leaves the actionable queue. Matched EXACTLY
  // by article_id (each pool item points at one article), so unrelated/future items
  // for the same topic are never touched. Best-effort; never fails the export.
  if (status === 'publish') {
    try {
      await auth.admin.from('article_pool_items')
        .update({ status: 'published', published_at: new Date().toISOString(), last_error: null, locked_at: null, updated_at: new Date().toISOString() })
        .eq('project_id', auth.project.id)
        .eq('article_id', id)
        .neq('status', 'published')
    } catch (err) {
      console.warn('[content-wp-export] pool item sync skipped', { ...logBase, message: err instanceof Error ? err.message : 'pool sync failed' })
    }
  }

  // Phase 3E — on a successful PUBLISH only (never draft), add the topic's
  // primary keyword to the project's tracked keywords. Best-effort: never fails
  // or blocks the publish.
  let keywordAdded = false
  let keywordAddedText: string | null = null
  if (status === 'publish') {
    const kw = await ensureProjectKeywordFromPublishedArticle(auth.admin, id)
    keywordAdded = kw.added
    keywordAddedText = kw.added ? (kw.keyword ?? null) : null
    if (!kw.ok) console.warn('[content-wp-export] keyword add failed', { ...logBase, reason: kw.reason })
  }

  console.log('[content-wp-export] done', { ...logBase, step: 'post_create', wpPostId: created.wpPostId, updated: created.updated, imageWarning: created.imageWarning, taxonomyWarning: created.taxonomyWarning, seoPlugin, seoStatus, keywordAdded })
  return Response.json({
    wp_post_id: created.wpPostId,
    wp_post_url: created.wpPostUrl,
    wp_featured_media_id: featuredMedia ?? null,
    wp_status: status,
    updated: created.updated ?? false,
    imageWarning: created.imageWarning,
    // Phase 4E — taxonomy + SEO outcome (never a silent partial success).
    taxonomy: created.taxonomy
      ? {
          categories: created.taxonomy.categories,
          tags: created.taxonomy.tags,
          invalidCategoryIds: created.taxonomy.invalidCategoryIds,
          invalidTagIds: created.taxonomy.invalidTagIds,
          warning: created.taxonomy.warning,
        }
      : null,
    taxonomyWarning: created.taxonomyWarning ?? false,
    seoPlugin,
    seoStatus,
    ...(seoDetail ? { seoDetail } : {}),
    keywordAdded,
    keyword: keywordAddedText,
  })
}
