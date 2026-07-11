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

  try {
    const post = await createPost(creds, {
      title,
      content: String(article.content_html || ''),
      status,
      slug,
      excerpt: String(article.excerpt || article.meta_description || '') || undefined,
      featuredMedia,
    })
    return { ok: true, wpPostId: post.id, wpPostUrl: post.link || null, featuredMediaId: featuredMedia ?? null, imageWarning }
  } catch (err) {
    const detail = err instanceof WordPressClientError ? err.message : 'Post creation failed.'
    return { ok: false, kind: 'post_failed', detail }
  }
}
