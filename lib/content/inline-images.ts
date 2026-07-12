/**
 * Phase 4D — inline article images: placement engine + compose + generation +
 * WordPress upload/reconcile. Inline images are persisted rows (article_inline_
 * images), NOT baked into content_html; they are composed into <figure> blocks
 * on demand (editor preview + publish). Because content_html stays image-free,
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

type Admin = ReturnType<typeof createAdminClient>

export const INLINE_IMAGE_MAX = 3

export interface InlineImage {
  id: string
  article_id: string
  section_id: string
  prompt: string | null
  alt_text: string | null
  caption: string | null
  storage_url: string | null
  storage_path: string | null
  wp_media_id: number | null
  wp_media_url: string | null
  position: number
  status: string
  last_error: string | null
}

function escRe(s: string): string { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') }
function esc(s: string): string { return (s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;') }
function stripTags(s: string): string { return (s || '').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim() }

/** A section is "FAQ" (never eligible) when its id or title marks it as the FAQ block. */
function isFaqSection(id: string, title: string): boolean {
  return /(^|-)faq(-|$)/i.test(id) || /שאלות נפוצות|frequently asked/i.test(title)
}

/** Regex matching a section's H2 through its FIRST paragraph, bounded to the
 *  section (never crossing into the next <h2>). No match ⇒ the section has no
 *  eligible paragraph (e.g. only a table/list) ⇒ not eligible. */
function sectionFirstParagraphRe(sectionId: string): RegExp {
  return new RegExp(`(<h2\\b[^>]*\\bid="${escRe(sectionId)}"[^>]*>(?:(?!<h2\\b)[\\s\\S])*?<\\/p>)`, 'i')
}

/** Eligible target sections: every H2 (with an id) that has a first paragraph and
 *  is NOT the FAQ block. The intro (before the first H2) is never eligible. */
export function eligibleSections(html: string): { sectionId: string; title: string }[] {
  const out: { sectionId: string; title: string }[] = []
  const re = /<h2\b[^>]*\bid="([^"]*)"[^>]*>([\s\S]*?)<\/h2>/gi
  let m: RegExpExecArray | null
  while ((m = re.exec(html || '')) !== null) {
    const id = m[1]
    const title = stripTags(m[2] || '')
    if (!id || isFaqSection(id, title)) continue
    if (sectionFirstParagraphRe(id).test(html)) out.push({ sectionId: id, title })
  }
  return out
}

/** The <figure> block for one inline image (responsive, lazy, safe). */
export function figureHtml(img: { id: string; url: string; alt: string | null; caption: string | null }): string {
  const alt = esc(img.alt || '')
  const cap = (img.caption || '').trim()
  const capHtml = cap ? `<figcaption>${esc(cap)}</figcaption>` : ''
  return `<figure class="article-inline-image" data-inline-image-id="${esc(img.id)}"><img src="${esc(img.url)}" alt="${alt}" loading="lazy" /></figure>`.replace('</figure>', `${capHtml}</figure>`)
}

/**
 * Compose inline images into the body: insert each image's <figure> right AFTER
 * its target section's first paragraph. Rules: max ONE image per section (first
 * by position), max 3 total, never in the intro / heading / list / table / FAQ.
 * `mode` picks the URL: 'publish' uses ONLY the WordPress URL (skips images not
 * yet uploaded — never emits a temporary URL live); 'preview' falls back to the
 * storage URL. Idempotent: skips a section already carrying that image's figure.
 */
export function injectInlineImages(html: string, images: InlineImage[], mode: 'preview' | 'publish'): string {
  if (!html) return html || ''
  const ordered = [...(images || [])].sort((a, b) => a.position - b.position)
  const usedSections = new Set<string>()
  let out = html
  let placed = 0
  for (const img of ordered) {
    if (placed >= INLINE_IMAGE_MAX) break
    const url = mode === 'publish' ? img.wp_media_url : (img.wp_media_url || img.storage_url)
    if (!url) continue                                            // no usable URL → skip (never a broken temp URL live)
    if (usedSections.has(img.section_id)) continue                // one image per section
    if (out.includes(`data-inline-image-id="${img.id}"`)) { usedSections.add(img.section_id); placed++; continue } // idempotent
    const re = sectionFirstParagraphRe(img.section_id)
    if (!re.test(out)) continue                                   // section not eligible in this html
    out = out.replace(re, `$1${figureHtml({ id: img.id, url, alt: img.alt_text, caption: img.caption })}`)
    usedSections.add(img.section_id)
    placed++
  }
  return out
}

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
