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
import { updatePostSeoMeta, WordPressClientError, type WordPressPostStatus } from '@/lib/wordpress/client'
import { wpCreatePost } from '@/lib/content/wordpress-publish'
import { ensureProjectKeywordFromPublishedArticle } from '@/lib/content/keyword-from-article'

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!isContentModuleEnabled()) return Response.json({ error: 'Not found' }, { status: 404 })
  const { id } = await params

  let body: { status?: string; force?: boolean }
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

  const admin = createAdminClient()
  const { data: article, error } = await admin
    .from('generated_articles')
    .select('id, project_id, title, slug, excerpt, meta_title, meta_description, content_html, status, featured_image_url, featured_image_storage_path, wp_post_id, wp_post_url')
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

  // Duplicate protection: already exported → require an explicit force to make a NEW post.
  if (a.wp_post_id && !force) {
    return Response.json(
      { error: 'already_exported', reason: 'already_exported', wp_post_id: a.wp_post_id, wp_post_url: a.wp_post_url ?? null },
      { status: 409 },
    )
  }

  // WordPress connection (decrypted server-side).
  const loaded = await loadWordPressCredentials(auth.admin, auth.project.id)
  if ('error' in loaded) {
    const reason = loaded.status === 404 ? 'no_wordpress_connection' : 'wordpress_connection_error'
    return Response.json({ error: reason, reason }, { status: loaded.status === 404 ? 400 : loaded.status })
  }
  const connId = loaded.connection.id
  const title = String(a.title || 'article')
  const logBase = { articleId: id, projectId: auth.project.id, connId, status }

  // Featured image + createPost via the shared WordPress core (same behavior:
  // publish blocks on image-upload failure; draft proceeds with a warning).
  const created = await wpCreatePost(auth.admin, loaded.creds, a as never, { status })
  if (!created.ok) {
    if (created.kind === 'media_upload_failed') {
      console.warn('[content-wp-export] media upload failed', { ...logBase, step: 'media_upload' })
      return Response.json({ error: 'wordpress_media_upload_failed', reason: 'wordpress_media_upload_failed', ...(created.detail ? { detail: created.detail } : {}) }, { status: 502 })
    }
    console.log('[content-wp-export] post create failed', { ...logBase, step: 'post_create' })
    return Response.json({ error: 'wordpress_post_failed', reason: 'wordpress_post_failed', ...(created.detail ? { detail: created.detail } : {}) }, { status: 502 })
  }
  const featuredMedia = created.featuredMediaId ?? undefined

  // Best-effort SEO meta — never fails the export.
  try {
    await updatePostSeoMeta(loaded.creds, created.wpPostId, { metaTitle: (a.meta_title as string) || title, metaDescription: (a.meta_description as string) || null })
  } catch (err) {
    console.warn('[content-wp-export] seo meta skipped', { ...logBase, step: 'seo_meta', message: err instanceof WordPressClientError ? err.message : 'seo meta rejected' })
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

  console.log('[content-wp-export] done', { ...logBase, step: 'post_create', wpPostId: created.wpPostId, imageWarning: created.imageWarning, keywordAdded })
  return Response.json({
    wp_post_id: created.wpPostId,
    wp_post_url: created.wpPostUrl,
    wp_featured_media_id: featuredMedia ?? null,
    wp_status: status,
    imageWarning: created.imageWarning,
    keywordAdded,
    keyword: keywordAddedText,
  })
}
