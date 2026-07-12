/**
 * Phase 4D — inline article images: SERVER-side generation + WordPress upload/
 * reconcile. The PURE placement/compose engine lives in inline-images-compose.ts
 * (client-safe) and is re-exported here so existing server imports are unchanged.
 * Inline images are persisted rows (article_inline_images), NOT baked into
 * content_html; figures are composed on demand (editor preview + publish), so
 * composition is idempotent — re-composing never duplicates a <figure>.
 *
 * Reuses the featured-image helpers (gemini-image + CONTENT_IMAGE_BUCKET) and
 * the WordPress uploadMedia client; the featured-image flow itself is untouched.
 */

import type { createAdminClient } from '@/lib/supabase/admin'
import type { WordPressCredentials } from '@/lib/wordpress/types'
import { uploadMedia, WordPressClientError } from '@/lib/wordpress/client'
import { generateArticleImage, normalizeFeaturedImage, writeCommercialSafeConcept } from '@/lib/content/gemini-image'
import { CONTENT_IMAGE_BUCKET } from '@/lib/content/featured-image'
import { INLINE_IMAGE_MAX, eligibleSections, figureHtml, injectInlineImages, type InlineImage, type ComposableInlineImage } from '@/lib/content/inline-images-compose'

// Re-export the pure engine (back-compat for existing server-side imports).
export { INLINE_IMAGE_MAX, eligibleSections, figureHtml, injectInlineImages }
export type { InlineImage, ComposableInlineImage }

type Admin = ReturnType<typeof createAdminClient>

function extFor(mime: string): string { return mime.includes('png') ? 'png' : mime.includes('webp') ? 'webp' : 'jpg' }

/**
 * Generate (or regenerate) ONE inline image via the shared image model, store it
 * in the content bucket, and update the row (storage_url/status). Best-effort:
 * on failure the row is marked 'failed' with last_error. Never throws.
 */
export async function generateInlineImage(admin: Admin, imageId: string): Promise<{ ok: true; url: string } | { ok: false; error: string }> {
  const { data } = await admin.from('article_inline_images').select('id, project_id, article_id, prompt, alt_text, storage_path').eq('id', imageId).maybeSingle()
  const row = data as { id: string; project_id: string; article_id: string; prompt: string | null; alt_text: string | null; storage_path: string | null } | null
  if (!row) return { ok: false, error: 'image_not_found' }
  const nowIso = () => new Date().toISOString()
  await admin.from('article_inline_images').update({ status: 'generating', last_error: null, updated_at: nowIso() }).eq('id', imageId)
  try {
    const { data: art } = await admin.from('generated_articles').select('title, topic_id').eq('id', row.article_id).maybeSingle()
    const title = String((art as { title?: string } | null)?.title || '')
    let language: 'he' | 'en' = 'he'
    const topicId = (art as { topic_id?: string } | null)?.topic_id
    if (topicId) { const { data: t } = await admin.from('article_topics').select('language').eq('id', topicId).maybeSingle(); language = String((t as { language?: string } | null)?.language || '').toLowerCase().startsWith('en') ? 'en' : 'he' }
    // Brand-neutral concept from the user's prompt (sanitized by the shared helper).
    const concept = await writeCommercialSafeConcept({ title, excerpt: row.prompt || null, topic: null, primaryKeyword: null, language })
    const gen = await generateArticleImage({ title, imagePrompt: row.prompt || concept, topic: null, language })
    if ('error' in gen) { await admin.from('article_inline_images').update({ status: 'failed', last_error: gen.error, updated_at: nowIso() }).eq('id', imageId); return { ok: false, error: gen.error } }
    let bytes = gen.data, mimeType = gen.mimeType
    try { const norm = await normalizeFeaturedImage(gen.data); bytes = norm.data; mimeType = norm.mimeType } catch { /* keep original */ }
    const path = `${row.project_id}/inline/${row.article_id}/${imageId}-${Date.now().toString(36)}.${extFor(mimeType)}`
    const up = await admin.storage.from(CONTENT_IMAGE_BUCKET).upload(path, bytes, { contentType: mimeType, upsert: true })
    if (up.error) { await admin.from('article_inline_images').update({ status: 'failed', last_error: 'image_upload_failed', updated_at: nowIso() }).eq('id', imageId); return { ok: false, error: 'image_upload_failed' } }
    const { data: pub } = admin.storage.from(CONTENT_IMAGE_BUCKET).getPublicUrl(path)
    // Regenerate/replace invalidates any prior WP media reference (re-upload next publish).
    if (row.storage_path && row.storage_path !== path) admin.storage.from(CONTENT_IMAGE_BUCKET).remove([row.storage_path]).catch(() => {})
    await admin.from('article_inline_images').update({ storage_url: pub.publicUrl, storage_path: path, wp_media_id: null, wp_media_url: null, status: 'ready', last_error: null, updated_at: nowIso() }).eq('id', imageId)
    return { ok: true, url: pub.publicUrl }
  } catch (e) {
    await admin.from('article_inline_images').update({ status: 'failed', last_error: (e instanceof Error ? e.message : 'unexpected').slice(0, 300), updated_at: nowIso() }).eq('id', imageId)
    return { ok: false, error: 'unexpected_error' }
  }
}

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
