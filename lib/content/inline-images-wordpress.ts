/**
 * Inline images, the WordPress half: give every ready image a media id and url.
 *
 * It sits apart from lib/content/inline-images.ts, which GENERATES images and
 * therefore imports sharp — about 19 MB of prebuilt libvips in every function
 * that can reach it. This half only moves bytes that already exist from our
 * storage to the customer's site, and the two publishers that call it
 * (wordpress-publish.ts and wordpress-plugin-publish.ts, and so every publish
 * route) never open an image. lib/__qa__/function-storage.qa.ts guards that.
 */
import type { createAdminClient } from '@/lib/supabase/admin'
import type { WordPressCredentials } from '@/lib/wordpress/types'
import { uploadMedia, WordPressClientError } from '@/lib/wordpress/client'
import { CONTENT_IMAGE_BUCKET } from '@/lib/content/image-bucket'
import type { InlineImage } from '@/lib/content/inline-images-compose'

type Admin = ReturnType<typeof createAdminClient>

function extFromPath(path: string): string { const m = path.toLowerCase().match(/\.(png|webp|jpe?g)$/); return m ? m[1]!.replace('jpeg', 'jpg') : 'jpg' }
function mimeFromExt(ext: string): string { return ext === 'webp' ? 'image/webp' : ext === 'png' ? 'image/png' : 'image/jpeg' }

export interface InlineWpResult { uploaded: number; reconciled: number; failed: { id: string; error: string }[] }

/**
 * Ensure every ready inline image for an article has a WordPress media id/url.
 * RECONCILES: an image that already has wp_media_id is reused (no re-upload → no
 * duplicate media on retry). A fresh one is downloaded from storage + uploaded,
 * and its wp_media_id/url persisted. A per-image upload failure is recorded
 * (last_error) and reported — never silently dropped. Returns the refreshed
 * image rows so the caller composes the body from the WordPress URLs.
 */
export async function reconcileInlineImagesForWordPress(
  admin: Admin, creds: WordPressCredentials, articleId: string, slug: string,
): Promise<{ images: InlineImage[]; result: InlineWpResult }> {
  const nowIso = () => new Date().toISOString()
  const { data } = await admin.from('article_inline_images').select('*').eq('article_id', articleId).order('position', { ascending: true })
  const images = ((data ?? []) as InlineImage[])
  const result: InlineWpResult = { uploaded: 0, reconciled: 0, failed: [] }
  for (const img of images) {
    if (img.wp_media_id && img.wp_media_url) { result.reconciled++; continue } // idempotent reuse
    if (img.status !== 'ready' || !img.storage_path) continue
    try {
      await admin.from('article_inline_images').update({ status: 'uploading', updated_at: nowIso() }).eq('id', img.id)
      const dl = await admin.storage.from(CONTENT_IMAGE_BUCKET).download(img.storage_path)
      if (dl.error || !dl.data) throw new WordPressClientError('storage_download_failed')
      const ext = extFromPath(img.storage_path)
      const media = await uploadMedia(creds, {
        data: Buffer.from(await dl.data.arrayBuffer()),
        filename: `${slug}-inline-${img.position + 1}.${ext}`,
        mimeType: dl.data.type && dl.data.type.startsWith('image/') ? dl.data.type : mimeFromExt(ext),
        altText: img.alt_text || '', title: img.alt_text || `${slug} image`,
      })
      img.wp_media_id = media.id; img.wp_media_url = media.sourceUrl
      await admin.from('article_inline_images').update({ wp_media_id: media.id, wp_media_url: media.sourceUrl, status: 'uploaded', last_error: null, updated_at: nowIso() }).eq('id', img.id)
      result.uploaded++
    } catch (err) {
      const detail = err instanceof WordPressClientError ? err.message : (err instanceof Error ? err.message : 'inline_media_upload_failed')
      await admin.from('article_inline_images').update({ status: 'failed', last_error: detail.slice(0, 300), updated_at: nowIso() }).eq('id', img.id)
      result.failed.push({ id: img.id, error: detail })
    }
  }
  return { images, result }
}
