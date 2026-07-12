/**
 * Shared WordPress "create post" core (extracted from the manual export route).
 *
 * Handles ONLY the WordPress-facing steps — featured-image download+upload and
 * createPost — reusing the existing lib/wordpress/client functions. It does NOT
 * persist to the DB, do ownership, or SEO meta; each caller owns those so it can
 * order persistence for its own safety (the automation service persists
 * wp_post_id BEFORE anything else, for crash recovery).
 *
 * Behavior matches the manual route: when the image upload fails, a blocking
 * caller (publish) aborts with media_upload_failed; a non-blocking caller
 * (draft) proceeds with imageWarning=true.
 */

import type { createAdminClient } from '@/lib/supabase/admin'
import { uploadMedia, createPost, updatePost, getCategories, getTags, WordPressClientError, type WordPressPostStatus } from '@/lib/wordpress/client'
import type { WordPressCredentials } from '@/lib/wordpress/types'
import { reconcileInlineImagesForWordPress, injectInlineImages, type InlineWpResult } from '@/lib/content/inline-images'
import { resolveTaxonomy, type ResolvedTaxonomy } from '@/lib/content/wordpress-taxonomy'

type Admin = ReturnType<typeof createAdminClient>

const BUCKET = 'content-article-images'

function extFromPath(path: string): string {
  const m = path.toLowerCase().match(/\.(png|webp|jpe?g)$/)
  return m ? m[1]!.replace('jpeg', 'jpg') : 'jpg'
}
function mimeFromExt(ext: string): string {
  return ext === 'webp' ? 'image/webp' : ext === 'png' ? 'image/png' : 'image/jpeg'
}

export interface WpArticleForExport {
  /** Phase 4D — when present, inline images for this article are uploaded to WP
   *  media and composed into the body. Optional for back-compat. */
  id?: string
  title: unknown
  slug: unknown
  excerpt: unknown
  meta_title: unknown
  meta_description: unknown
  content_html: unknown
  featured_image_url: unknown
  featured_image_storage_path: string | null
  /** Phase 4E — WordPress taxonomy selection (term IDs). Optional/back-compat;
   *  when all empty, publishing behaves exactly as before. */
  wp_primary_category_id?: number | null
  wp_category_ids?: number[] | null
  wp_tag_ids?: number[] | null
}

export interface WpCreateResult {
  ok: true
  wpPostId: number
  wpPostUrl: string | null
  featuredMediaId: number | null
  imageWarning: boolean
  /** Phase 4D — inline-image upload/reconcile outcome (undefined when none). */
  inlineImages?: InlineWpResult
  /** Phase 4E — resolved taxonomy actually sent (undefined when none selected). */
  taxonomy?: ResolvedTaxonomy
  /** True when a selected term was invalid/deleted (dropped as safe fallback). */
  taxonomyWarning?: boolean
  /** True when this was an in-place update of an existing post (not a new post). */
  updated?: boolean
}
export type WpCreateError = { ok: false; kind: 'media_upload_failed' | 'post_failed'; detail?: string }

/**
 * Upload the featured image (if any) and create the WordPress post. Returns the
 * WP references (not yet persisted). `blockOnImageFailure` defaults to
 * status==='publish' (a publish must never go live without its intended image).
 */
export async function wpCreatePost(
  admin: Admin,
  creds: WordPressCredentials,
  article: WpArticleForExport,
  opts: {
    status: WordPressPostStatus
    blockOnImageFailure?: boolean
    /** Phase 4E — update an existing post in place instead of creating a new one.
     *  Automation never passes this (behavior unchanged). featuredMediaId, when
     *  provided, is REUSED (no re-upload → no duplicate media on re-export). */
    existing?: { postId: number; featuredMediaId?: number | null }
  },
): Promise<WpCreateResult | WpCreateError> {
  const status = opts.status
  const block = opts.blockOnImageFailure ?? status === 'publish'
  const title = String(article.title || 'article')
  const slug = String(article.slug || 'article')

  let featuredMedia: number | undefined
  let imageWarning = false
  // On an in-place update with a known featured media id, REUSE it (never
  // re-upload → no duplicate media). Otherwise fall back to the upload flow.
  if (opts.existing && typeof opts.existing.featuredMediaId === 'number') {
    featuredMedia = opts.existing.featuredMediaId
  } else {
    const storagePath = article.featured_image_storage_path
    if (article.featured_image_url && storagePath) {
      const dl = await admin.storage.from(BUCKET).download(storagePath)
      if (dl.error || !dl.data) {
        if (block) return { ok: false, kind: 'media_upload_failed' }
        imageWarning = true
      } else {
        try {
          const ext = extFromPath(storagePath)
          const media = await uploadMedia(creds, {
            data: Buffer.from(await dl.data.arrayBuffer()),
            filename: `${slug}.${ext}`,
            mimeType: dl.data.type && dl.data.type.startsWith('image/') ? dl.data.type : mimeFromExt(ext),
            altText: title,
            title,
          })
          featuredMedia = media.id
        } catch (err) {
          const detail = err instanceof WordPressClientError ? err.message : 'Media upload failed.'
          if (block) return { ok: false, kind: 'media_upload_failed', detail }
          imageWarning = true
        }
      }
    }
  }

  // Phase 4D — inline images: upload/reconcile each to WP media (idempotent via
  // wp_media_id) and compose the body from the WP URLs. A per-image failure is
  // recorded on its row + reported; the export continues with the valid ones and
  // NEVER emits a temporary storage URL live ('publish' mode skips un-uploaded
  // images). The featured-image handling above is unchanged.
  let content = String(article.content_html || '')
  let inlineImages: InlineWpResult | undefined
  if (typeof article.id === 'string' && article.id) {
    const { images, result } = await reconcileInlineImagesForWordPress(admin, creds, article.id, slug)
    content = injectInlineImages(content, images, 'publish')
    inlineImages = result
    if (result.failed.length > 0) imageWarning = true
  }

  // Phase 4E — resolve taxonomy (primary-in-list, dedupe, drop invalid/deleted
  // terms as a safe fallback). Fetch the site's terms ONLY when something is
  // selected; otherwise publishing is identical to before (no categories/tags
  // key sent). WordPress SETS these arrays, so re-export never duplicates terms.
  let taxonomy: ResolvedTaxonomy | undefined
  const sel = {
    primaryCategoryId: typeof article.wp_primary_category_id === 'number' ? article.wp_primary_category_id : null,
    categoryIds: Array.isArray(article.wp_category_ids) ? article.wp_category_ids : [],
    tagIds: Array.isArray(article.wp_tag_ids) ? article.wp_tag_ids : [],
  }
  const anySelected = sel.primaryCategoryId !== null || sel.categoryIds.length > 0 || sel.tagIds.length > 0
  if (anySelected) {
    let existingCatIds: number[] | null = null
    let existingTagIds: number[] | null = null
    try {
      const [cats, tags] = await Promise.all([getCategories(creds), getTags(creds)])
      existingCatIds = cats.map((c) => c.id)
      existingTagIds = tags.map((t) => t.id)
    } catch {
      // Could not fetch site terms → skip validation (send as-is); still resolves
      // primary-in-list + dedupe. A WP rejection is caught by the post try/catch.
      existingCatIds = null
      existingTagIds = null
    }
    taxonomy = resolveTaxonomy(sel, existingCatIds, existingTagIds)
    // Note: taxonomyWarning is reported separately (below) — it does NOT set the
    // image warning, and an invalid term never fails the post (safe fallback).
  }

  const postFields = {
    title,
    content,
    status,
    slug,
    excerpt: String(article.excerpt || article.meta_description || '') || undefined,
    featuredMedia,
    // Send taxonomy keys only when a selection resolved to something to set.
    ...(taxonomy && taxonomy.hasSelection ? { categories: taxonomy.categories, tags: taxonomy.tags } : {}),
  }

  try {
    const post = opts.existing
      ? await updatePost(creds, opts.existing.postId, postFields)
      : await createPost(creds, postFields)
    return {
      ok: true,
      wpPostId: post.id,
      wpPostUrl: post.link || null,
      featuredMediaId: featuredMedia ?? null,
      imageWarning,
      inlineImages,
      taxonomy,
      taxonomyWarning: taxonomy?.warning ?? false,
      updated: !!opts.existing,
    }
  } catch (err) {
    const detail = err instanceof WordPressClientError ? err.message : 'Post creation failed.'
    return { ok: false, kind: 'post_failed', detail }
  }
}
