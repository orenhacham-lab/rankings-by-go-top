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
import { uploadMedia, createPost, WordPressClientError, type WordPressPostStatus } from '@/lib/wordpress/client'
import type { WordPressCredentials } from '@/lib/wordpress/types'
import { reconcileInlineImagesForWordPress, injectInlineImages, type InlineWpResult } from '@/lib/content/inline-images'

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
}

export interface WpCreateResult {
  ok: true
  wpPostId: number
  wpPostUrl: string | null
  featuredMediaId: number | null
  imageWarning: boolean
  /** Phase 4D — inline-image upload/reconcile outcome (undefined when none). */
  inlineImages?: InlineWpResult
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
  opts: { status: WordPressPostStatus; blockOnImageFailure?: boolean },
): Promise<WpCreateResult | WpCreateError> {
  const status = opts.status
  const block = opts.blockOnImageFailure ?? status === 'publish'
  const title = String(article.title || 'article')
  const slug = String(article.slug || 'article')

  let featuredMedia: number | undefined
  let imageWarning = false
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

  try {
    const post = await createPost(creds, {
      title,
      content,
      status,
      slug,
      excerpt: String(article.excerpt || article.meta_description || '') || undefined,
      featuredMedia,
    })
    return { ok: true, wpPostId: post.id, wpPostUrl: post.link || null, featuredMediaId: featuredMedia ?? null, imageWarning, inlineImages }
  } catch (err) {
    const detail = err instanceof WordPressClientError ? err.message : 'Post creation failed.'
    return { ok: false, kind: 'post_failed', detail }
  }
}
