/**
 * Publishing an article to WordPress through the GO TOP SEO Bridge plugin 3.0.0 (WordPress.org,
 * slug go-top-seo-bridge), so ONE plugin connection covers site health AND publishing.
 *
 * WHICH PATH. A project publishes through the plugin when its plugin link (site_fix_plugin_links)
 * is `connected` and reports plugin_version >= 3.0.0 (the first version with the signed /terms,
 * /media and /publish routes, includes/publish.php). Everything else (no plugin, a 2.x plugin, a
 * plugin that is pending or disconnected, a key that cannot be decrypted) publishes exactly as
 * before, over the application password in wordpress_connections, through wpCreatePost.
 *
 * WHAT IS SENT (mirrors wpCreatePost, same result shape):
 *   featured image  /media with the image's public GO TOP storage address (the plugin downloads
 *                   only from that storage, once per address); reused when already known
 *   inline images   /media each, persisted on article_inline_images like the app-password upload
 *   design          the project's article design, as before (applyArticleDesign)
 *   categories/tags /terms to drop deleted terms (resolveTaxonomy, the same safe fallback)
 *   the post        /publish tied to the article id: a new post, or an update of the post the
 *                   plugin made for that same article (never another post; not_ours otherwise)
 *   schema          the existing /fix schema_jsonld step (publishArticleSchemaToWordPress)
 *   SEO meta        /fix seo_title, meta_description, focus_keyphrase (publishArticleSeoViaPlugin)
 *
 * A POST MADE OVER THE APPLICATION PASSWORD BEFORE. The plugin does not know it (no
 * _gotop_article_id), so an update of it is refused with not_ours BEFORE anything is written. Then
 * the application password is used when the project still has one; otherwise the update fails
 * with a code, and no second post is ever created for the article.
 *
 * ONE POST PER ARTICLE. The plugin keeps one post per GO TOP article, so the publish route's
 * legacy `force` (a NEW separate post) updates that post when the plugin made it; and a retry after
 * a crash before wp_post_id was saved updates the same post instead of creating a duplicate.
 *
 * The service role bypasses RLS: the plugin link is read by project AND its owner, and a caller
 * that knows the signed-in user passes it so a mismatch reads as "no plugin".
 */
import crypto from 'node:crypto'
import type { createAdminClient } from '@/lib/supabase/admin'
import type { WordPressCredentials } from '@/lib/wordpress/types'
import type { WordPressErrorMeta, WordPressPostStatus } from '@/lib/wordpress/client'
import { loadWordPressCredentials } from '@/lib/content/api-auth'
import { decryptCredential } from '@/lib/security/credentials-crypto'
import { readPluginLink } from '@/lib/site-fix/store'
import { versionAtLeast } from '@/lib/site-fix/types'
import {
  pluginFix, pluginMedia, pluginPublish, pluginTerms,
  type PluginAnswer, type PluginLink, type PluginPost, type PluginPublishRequest,
} from '@/lib/site-fix/plugin-client'
import { CONTENT_IMAGE_BUCKET } from '@/lib/content/featured-image'
import { injectInlineImages, type InlineImage, type InlineWpResult } from '@/lib/content/inline-images'
import { applyArticleDesign } from '@/lib/content/article-style/publish'
import { resolveTaxonomy, type ResolvedTaxonomy, type SeoPlugin } from '@/lib/content/wordpress-taxonomy'
import { publishArticleSchemaToWordPress, type ArticleSchemaOutcome } from '@/lib/content/wordpress-schema'
import { loadFocusKeyword, persistSeoOutcome, publishArticleSeo, type SeoPublishResult } from '@/lib/content/seo-publish'
import { wpCreatePost, type WpArticleForExport, type WpCreateError, type WpCreateResult } from '@/lib/content/wordpress-publish'

type Admin = ReturnType<typeof createAdminClient>

/** The first plugin version that publishes (includes/publish.php). */
export const PUBLISH_PLUGIN_MIN_VERSION = '3.0.0'

export interface PublishPlugin {
  link: PluginLink
  version: string
  seoPlugin: 'yoast' | 'rankmath' | 'none' | null
}

export interface PluginPublishDeps {
  decrypt?: (s: string) => string
  post?: PluginPost
  now?: () => Date
  /** Tests only: the application-password path (wpCreatePost). */
  appPassword?: typeof wpCreatePost
}

/**
 * The project's plugin link when it can publish (connected, >= 3.0.0, key readable), else null.
 * Filtered by the project AND its owner; `ownerId`, when given, must be that owner.
 */
export async function loadPublishPlugin(
  admin: Admin, projectId: string, opts: { ownerId?: string | null; decrypt?: (s: string) => string } = {},
): Promise<PublishPlugin | null> {
  try {
    const { data: proj } = await admin.from('projects').select('id, user_id').eq('id', projectId).maybeSingle()
    const owner = (proj as { user_id?: string | null } | null)?.user_id ?? null
    if (!owner) return null
    if (opts.ownerId !== undefined && opts.ownerId !== owner) return null
    const row = await readPluginLink(admin, { projectId, userId: owner })
    if (!row || row.status !== 'connected' || !row.plugin_version) return null
    if (!versionAtLeast(row.plugin_version, PUBLISH_PLUGIN_MIN_VERSION)) return null
    const secret = (opts.decrypt ?? decryptCredential)(row.secret_encrypted)
    return { link: { siteUrl: row.site_url, keyId: row.key_id, secret }, version: row.plugin_version, seoPlugin: row.seo_plugin ?? null }
  } catch {
    return null
  }
}

/** How this project publishes to WordPress. */
export type WordPressPublisher =
  | { via: 'app_password'; creds: WordPressCredentials; connectionId: string; plugin: null }
  | { via: 'plugin'; plugin: PublishPlugin; creds: WordPressCredentials | null; connectionId: string | null }

/**
 * The plugin when it can publish, otherwise the application password exactly as
 * loadWordPressCredentials answers (same error and status when there is neither).
 */
export async function loadWordPressPublisher(
  admin: Admin, projectId: string, opts: { ownerId?: string | null; decrypt?: (s: string) => string } = {},
): Promise<WordPressPublisher | { error: string; status: 404 | 500 }> {
  const [loaded, plugin] = await Promise.all([loadWordPressCredentials(admin, projectId), loadPublishPlugin(admin, projectId, opts)])
  if (plugin) {
    return 'error' in loaded
      ? { via: 'plugin', plugin, creds: null, connectionId: null }
      : { via: 'plugin', plugin, creds: loaded.creds, connectionId: loaded.connection.id }
  }
  if ('error' in loaded) return loaded
  return { via: 'app_password', creds: loaded.creds, connectionId: loaded.connection.id, plugin: null }
}

/** The project can publish to WordPress at all: an application-password row, or a plugin >= 3.0.0. */
export async function hasPublishPlugin(admin: Admin, projectId: string, ownerId?: string | null): Promise<boolean> {
  return !!(await loadPublishPlugin(admin, projectId, { ownerId }))
}

// ── Values the plugin accepts (fixes.php gotop_seo_bridge_text_ok: no < >, length bounds) ─────

/** Plain text for the plugin: no "<" or ">", whitespace collapsed, at most `max` characters. */
export function pluginText(raw: unknown, max: number): string {
  const s = String(raw ?? '').replace(/[<>]/g, ' ').replace(/\s+/g, ' ').trim()
  const chars = Array.from(s)
  return chars.length > max ? chars.slice(0, max).join('').trim() : s
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/

/** A plugin refusal as the same failure shape wpCreatePost returns (our own detail words only). */
function failure(kind: WpCreateError['kind'], stage: WpCreateError['stage'], answer: Extract<PluginAnswer<unknown>, { ok: false }>): WpCreateError & { pluginCode?: string } {
  const status = answer.code === 'plugin_not_connected' ? 401
    : answer.code === 'plugin_outdated' ? 404
    : answer.pluginCode === 'no_author' ? 403
    : answer.pluginCode === 'not_ours' ? 409
    : answer.pluginCode === 'not_an_image' ? 415
    : answer.code === 'plugin_unreachable' || answer.pluginCode === 'download_failed' || answer.pluginCode === 'write_failed' ? 502
    : 400
  const meta: WordPressErrorMeta = { status, responseFormat: 'json' }
  return { ok: false, kind, stage, detail: `plugin_${answer.pluginCode ?? answer.code}`, wpErrorMeta: meta, ...(answer.pluginCode ? { pluginCode: answer.pluginCode } : {}) }
}

function publicImageUrl(admin: Admin, storagePath: string): string | null {
  try {
    const url = admin.storage.from(CONTENT_IMAGE_BUCKET).getPublicUrl(storagePath).data.publicUrl
    return /^https:\/\//i.test(url) ? url : null
  } catch {
    return null
  }
}

/** Every ready inline image gets a Media Library id/url through /media; known ones are reused. */
async function reconcileInlineImagesViaPlugin(
  admin: Admin, link: PluginLink, articleId: string, post?: PluginPost,
): Promise<{ images: InlineImage[]; result: InlineWpResult }> {
  const nowIso = () => new Date().toISOString()
  const { data } = await admin.from('article_inline_images').select('*').eq('article_id', articleId).order('position', { ascending: true })
  const images = ((data ?? []) as InlineImage[])
  const result: InlineWpResult = { uploaded: 0, reconciled: 0, failed: [] }
  for (const img of images) {
    if (img.wp_media_id && img.wp_media_url) { result.reconciled++; continue }
    if (img.status !== 'ready' || !img.storage_path) continue
    const url = publicImageUrl(admin, img.storage_path)
    const answer = url ? await pluginMedia(link, { url, alt: pluginText(img.alt_text, 250) }, post) : null
    if (answer?.ok && typeof answer.body.url === 'string' && answer.body.url) {
      img.wp_media_id = answer.body.media_id; img.wp_media_url = answer.body.url
      await admin.from('article_inline_images').update({ wp_media_id: answer.body.media_id, wp_media_url: answer.body.url, status: 'uploaded', last_error: null, updated_at: nowIso() }).eq('id', img.id)
      result.uploaded++
    } else {
      const detail = answer && !answer.ok ? `plugin_${answer.pluginCode ?? answer.code}` : 'inline_media_upload_failed'
      await admin.from('article_inline_images').update({ status: 'failed', last_error: detail, updated_at: nowIso() }).eq('id', img.id)
      result.failed.push({ id: img.id, error: detail })
    }
  }
  return { images, result }
}

/**
 * wpCreatePost's contract over the plugin: the same input, the same result shape, the same
 * rules (a publish never goes live without its intended image; a draft goes on with a warning;
 * a deleted term is dropped, never fails the post).
 */
export async function pluginCreatePost(
  admin: Admin,
  plugin: PublishPlugin,
  article: WpArticleForExport,
  opts: { status: WordPressPostStatus; blockOnImageFailure?: boolean; existing?: { postId: number; featuredMediaId?: number | null } },
  deps: PluginPublishDeps = {},
): Promise<WpCreateResult | (WpCreateError & { pluginCode?: string })> {
  const link = plugin.link
  const status = opts.status
  // The plugin publishes or drafts; it never schedules.
  if (status !== 'publish' && status !== 'draft') return { ok: false, kind: 'post_failed', detail: 'plugin_status_unsupported', stage: 'post_creation' }
  const articleId = typeof article.id === 'string' ? article.id.toLowerCase() : ''
  if (!UUID.test(articleId)) return { ok: false, kind: 'post_failed', detail: 'plugin_needs_article_id', stage: 'post_creation' }
  const block = opts.blockOnImageFailure ?? status === 'publish'
  const title = pluginText(article.title || 'article', 300) || 'article'
  const slug = String(article.slug || 'article')

  let featuredMedia: number | undefined
  let imageWarning = false
  if (opts.existing && typeof opts.existing.featuredMediaId === 'number') {
    featuredMedia = opts.existing.featuredMediaId
  } else if (article.featured_image_url && article.featured_image_storage_path) {
    const url = publicImageUrl(admin, article.featured_image_storage_path)
    if (!url) {
      if (block) return { ok: false, kind: 'media_upload_failed', stage: 'media_upload' }
      imageWarning = true
    } else {
      const media = await pluginMedia(link, { url, alt: pluginText(article.title, 250) }, deps.post)
      if (media.ok) featuredMedia = media.body.media_id
      else if (block) return failure('media_upload_failed', 'media_upload', media)
      else imageWarning = true
    }
  }

  let content = String(article.content_html || '')
  let inlineImages: InlineWpResult | undefined
  {
    const { images, result } = await reconcileInlineImagesViaPlugin(admin, link, articleId, deps.post)
    content = injectInlineImages(content, images, 'publish')
    inlineImages = result
    if (result.failed.length > 0) imageWarning = true
  }
  content = await applyArticleDesign(admin, articleId, content, 'wordpress')

  let taxonomy: ResolvedTaxonomy | undefined
  const sel = {
    primaryCategoryId: typeof article.wp_primary_category_id === 'number' ? article.wp_primary_category_id : null,
    categoryIds: Array.isArray(article.wp_category_ids) ? article.wp_category_ids : [],
    tagIds: Array.isArray(article.wp_tag_ids) ? article.wp_tag_ids : [],
  }
  if (sel.primaryCategoryId !== null || sel.categoryIds.length > 0 || sel.tagIds.length > 0) {
    const [cats, tags] = await Promise.all([pluginTerms(link, 'category', deps.post), pluginTerms(link, 'post_tag', deps.post)])
    // The plugin refuses the WHOLE post for an unknown term id, so an unreadable list sends none.
    taxonomy = cats.ok && tags.ok
      ? resolveTaxonomy(sel, cats.body.items.map((c) => c.id), tags.body.items.map((t) => t.id))
      : { ...resolveTaxonomy(sel, [], []), warning: true }
  }

  const excerpt = pluginText(article.excerpt || article.meta_description || '', 1000)
  const req: PluginPublishRequest = {
    article_id: articleId,
    title,
    content,
    status,
    slug,
    ...(excerpt ? { excerpt } : {}),
    ...(taxonomy && taxonomy.hasSelection ? { categories: taxonomy.categories, tags: taxonomy.tags } : {}),
    ...(typeof featuredMedia === 'number' ? { featured_media: featuredMedia } : {}),
    ...(opts.existing ? { post_id: opts.existing.postId } : {}),
  }
  const answer = await pluginPublish(link, req, deps.post)
  if (!answer.ok) return failure('post_failed', 'post_creation', answer)

  let schema: ArticleSchemaOutcome | undefined
  if (status === 'publish') {
    schema = await publishArticleSchemaToWordPress(admin, { articleId, postUrl: answer.body.link, status }, { decrypt: deps.decrypt ?? decryptCredential, post: deps.post, now: deps.now })
    if (schema !== 'no_plugin') console.log('[wordpress-publish] article schema', { outcome: schema, via: 'plugin' })
  }
  return {
    ok: true,
    wpPostId: answer.body.post_id,
    wpPostUrl: answer.body.link || null,
    featuredMediaId: featuredMedia ?? null,
    imageWarning,
    inlineImages,
    taxonomy,
    taxonomyWarning: taxonomy?.warning ?? false,
    updated: answer.body.status === 'updated',
    ...(schema ? { schema } : {}),
  }
}

/**
 * The one entry the publish route and the automation call: the plugin when the project
 * publishes through it, otherwise wpCreatePost exactly as before.
 */
export async function publishArticleToWordPress(
  admin: Admin,
  publisher: WordPressPublisher,
  article: WpArticleForExport,
  opts: { status: WordPressPostStatus; blockOnImageFailure?: boolean; existing?: { postId: number; featuredMediaId?: number | null } },
  deps: PluginPublishDeps = {},
): Promise<(WpCreateResult & { via: 'plugin' | 'app_password' }) | WpCreateError> {
  const viaAppPassword = deps.appPassword ?? wpCreatePost
  if (publisher.via === 'app_password') {
    const r = await viaAppPassword(admin, publisher.creds, article, opts)
    return r.ok ? { ...r, via: 'app_password' } : r
  }
  const r = await pluginCreatePost(admin, publisher.plugin, article, opts, deps)
  if (r.ok) return { ...r, via: 'plugin' }
  // The post was made over the application password before: the plugin refused before writing.
  if (r.pluginCode === 'not_ours' && publisher.creds) {
    const again = await viaAppPassword(admin, publisher.creds, article, opts)
    return again.ok ? { ...again, via: 'app_password' } : again
  }
  const { pluginCode: _code, ...rest } = r
  void _code
  return rest
}

// ── SEO meta ────────────────────────────────────────────────────────────────

/** A stable job id (UUID-shaped, as the plugin requires) for this article, field and value. */
export function seoJobId(articleId: string, type: string, value: string): string {
  const h = crypto.createHash('sha256').update(`article-seo:${articleId}:${type}:${value}`).digest('hex')
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-8${h.slice(17, 20)}-${h.slice(20, 32)}`
}

/**
 * The article's SEO title, description and focus keyphrase through the plugin's /fix (Yoast or
 * Rank Math keys when the site runs one, the plugin's own otherwise, which it prints itself).
 * Verified when every field is applied or already in place. Persisted like publishArticleSeo.
 */
export async function publishArticleSeoViaPlugin(
  admin: Admin,
  plugin: PublishPlugin,
  postUrl: string | null,
  opts: { articleId: string; metaTitle: string; metaDescription: string | null; topicId: string | null | undefined },
  deps: PluginPublishDeps = {},
): Promise<SeoPublishResult> {
  const where: SeoPlugin = plugin.seoPlugin ?? 'none'
  let seo: SeoPublishResult
  if (!postUrl || !/^https?:\/\//i.test(postUrl)) {
    seo = { plugin: where, status: 'exact_failure', detail: 'plugin_no_post_url' }
  } else {
    const focus = await loadFocusKeyword(admin, opts.topicId)
    const all: { type: 'seo_title' | 'meta_description' | 'focus_keyphrase'; value: string; min: number }[] = [
      { type: 'seo_title', value: pluginText(opts.metaTitle, 120), min: 1 },
      { type: 'meta_description', value: pluginText(opts.metaDescription, 320), min: 1 },
      { type: 'focus_keyphrase', value: pluginText(focus, 100), min: 2 },
    ]
    const fields = all.filter((f) => Array.from(f.value).length >= f.min)
    let ok = 0
    let lastCode: string | null = null
    for (const f of fields) {
      const r = await pluginFix(plugin.link, { jobId: seoJobId(opts.articleId, f.type, f.value), type: f.type, url: postUrl, value: { value: f.value }, expected: null }, deps.post)
      if (r.ok) ok++
      else lastCode = r.code
    }
    seo = fields.length === 0 ? { plugin: where, status: 'plugin_unavailable' }
      : ok === fields.length ? { plugin: where, status: 'verified' }
      : { plugin: where, status: 'exact_failure', detail: `plugin_${lastCode ?? 'refused'}` }
  }
  await persistSeoOutcome(admin, opts.articleId, seo)
  return seo
}

/** SEO meta along the path the post went: the plugin, or the application password as before. */
export async function publishSeoFor(
  admin: Admin,
  publisher: WordPressPublisher,
  created: { wpPostId: number; wpPostUrl: string | null; via: 'plugin' | 'app_password' },
  opts: { articleId: string; metaTitle: string; metaDescription: string | null; topicId: string | null | undefined },
  deps: PluginPublishDeps = {},
): Promise<SeoPublishResult> {
  if (created.via === 'plugin' && publisher.via === 'plugin') return publishArticleSeoViaPlugin(admin, publisher.plugin, created.wpPostUrl, opts, deps)
  if (!publisher.creds) return { plugin: 'unknown', status: 'plugin_unavailable' }
  return publishArticleSeo(admin, publisher.creds, created.wpPostId, opts)
}
