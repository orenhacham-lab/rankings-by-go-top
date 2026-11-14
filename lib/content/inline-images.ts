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
import { generateArticleImage, normalizeFeaturedImage, writeCommercialSafeConcept } from '@/lib/content/gemini-image'
import { CONTENT_IMAGE_BUCKET } from '@/lib/content/image-bucket'
import { INLINE_IMAGE_MAX, eligibleSections, figureHtml, injectInlineImages, type InlineImage, type ComposableInlineImage } from '@/lib/content/inline-images-compose'
import { assertContentGenerationAllowedForProject, gateDenialCode, isTransientGateDenial } from '@/lib/content/entitlement-guard'
import { readArticleStyleForArticle } from '@/lib/content/article-style/store'
import type { ImageStyle } from '@/lib/content/article-style/types'
import { DEFAULT_CONTENT_LANGUAGE, type ContentLanguage } from '@/lib/content/language'

// Re-export the pure engine (back-compat for existing server-side imports).
export { INLINE_IMAGE_MAX, eligibleSections, figureHtml, injectInlineImages }
export type { InlineImage, ComposableInlineImage }

type Admin = ReturnType<typeof createAdminClient>

function extFor(mime: string): string { return mime.includes('png') ? 'png' : mime.includes('webp') ? 'webp' : 'jpg' }

/** The fields of an inline-image row that generating one needs. */
export interface InlineImageRow {
  id: string
  project_id: string
  article_id: string
  prompt: string | null
  alt_text: string | null
  storage_path: string | null
}

const INLINE_ROW_COLUMNS = 'id, project_id, article_id, prompt, alt_text, storage_path'

export async function readInlineImageRow(admin: Admin, imageId: string): Promise<InlineImageRow | null> {
  const { data } = await admin.from('article_inline_images').select(INLINE_ROW_COLUMNS).eq('id', imageId).maybeSingle()
  return (data as InlineImageRow | null) ?? null
}

/** Mark a row failed with a reason the editor can show. Never throws. */
export async function markInlineImageFailed(admin: Admin, imageId: string, reason: string): Promise<void> {
  await admin.from('article_inline_images')
    .update({ status: 'failed', last_error: reason.slice(0, 300), updated_at: new Date().toISOString() })
    .eq('id', imageId)
}

/**
 * The entitlement gate, checked before anything is spent. Returns the denial
 * code (which the editor localizes) or null when generation is allowed.
 *
 * It is a function of its own because the BATCH lane
 * (lib/content/image-batch/inline-image-batch.ts) has to make the same check at
 * the same point: a batch request costs money as surely as a live call.
 */
export async function inlineImageGateDenial(
  admin: Admin,
  projectId: string,
  nowFn: () => Date = () => new Date(),
): Promise<{ code: string; transient: boolean } | null> {
  const gate = await assertContentGenerationAllowedForProject(admin, projectId, nowFn)
  if (gate.allowed) return null
  return { code: gateDenialCode(gate), transient: isTransientGateDenial(gate) }
}

/** Exactly what generateArticleImage and buildImagePrompt both take. */
export interface InlineImageModelInput {
  title: string
  imagePrompt: string
  language: ContentLanguage
  style: ImageStyle | null
  brandColors: readonly string[]
}

/**
 * WHAT THE IMAGE MODEL IS ASKED FOR, built in one place.
 *
 * The live call hands this to generateArticleImage; the batch lane turns the
 * same object into a prompt with buildImagePrompt. Both therefore ask for the
 * same picture: the article's language, the project's image style and brand
 * colours, and the brand-neutral concept written from the section's own text.
 */
export async function inlineImageModelInput(
  admin: Admin,
  row: InlineImageRow,
): Promise<InlineImageModelInput> {
  const { data: art } = await admin.from('generated_articles').select('title, topic_id').eq('id', row.article_id).maybeSingle()
  const title = String((art as { title?: string } | null)?.title || '')
  let language: ContentLanguage = DEFAULT_CONTENT_LANGUAGE
  const topicId = (art as { topic_id?: string } | null)?.topic_id
  if (topicId) {
    const { data: t } = await admin.from('article_topics').select('language').eq('id', topicId).maybeSingle()
    language = String((t as { language?: string } | null)?.language || '').toLowerCase().startsWith('en') ? 'en' : 'he'
  }
  // Brand-neutral concept, written only when the row has no prompt of its own.
  // The queue always writes one (the section's heading and opening lines), so
  // this classifier call almost never runs — and asking for a concept we would
  // then discard was a model call per image, paid for and thrown away.
  const concept = row.prompt
    ? ''
    : await writeCommercialSafeConcept({ title, excerpt: null, topic: null, primaryKeyword: null, language })
  // The project's image style (lib/content/article-style), so the inline images match the hero. Always 16:9 inside the body.
  const { style } = await readArticleStyleForArticle(admin, row.article_id)
  return { title, imagePrompt: row.prompt || concept, language, style: style.imageStyle, brandColors: style.brandColors }
}

/**
 * The bytes have arrived: normalize, store in the content bucket and finish the
 * row. Shared by the live call and the batch collect pass, so an image that
 * came back hours later is stored, named and published exactly like one that
 * came back in thirty seconds. Never throws.
 */
export async function storeInlineImageBytes(
  admin: Admin,
  row: InlineImageRow,
  input: { data: Buffer; mimeType: string },
): Promise<{ ok: true; url: string } | { ok: false; error: string }> {
  const nowIso = () => new Date().toISOString()
  try {
    let bytes = input.data, mimeType = input.mimeType
    try { const norm = await normalizeFeaturedImage(input.data); bytes = norm.data; mimeType = norm.mimeType } catch { /* keep original */ }
    const path = `${row.project_id}/inline/${row.article_id}/${row.id}-${Date.now().toString(36)}.${extFor(mimeType)}`
    const up = await admin.storage.from(CONTENT_IMAGE_BUCKET).upload(path, bytes, { contentType: mimeType, upsert: true })
    if (up.error) { await markInlineImageFailed(admin, row.id, 'image_upload_failed'); return { ok: false, error: 'image_upload_failed' } }
    const { data: pub } = admin.storage.from(CONTENT_IMAGE_BUCKET).getPublicUrl(path)
    // Regenerate/replace invalidates any prior WP media reference (re-upload next publish).
    if (row.storage_path && row.storage_path !== path) admin.storage.from(CONTENT_IMAGE_BUCKET).remove([row.storage_path]).catch(() => {})
    await admin.from('article_inline_images').update({ storage_url: pub.publicUrl, storage_path: path, wp_media_id: null, wp_media_url: null, status: 'ready', last_error: null, updated_at: nowIso() }).eq('id', row.id)
    return { ok: true, url: pub.publicUrl }
  } catch (e) {
    await markInlineImageFailed(admin, row.id, e instanceof Error ? e.message : 'unexpected')
    return { ok: false, error: 'unexpected_error' }
  }
}

/**
 * Generate (or regenerate) ONE inline image via the shared image model, store it
 * in the content bucket, and update the row (storage_url/status). Best-effort:
 * on failure the row is marked 'failed' with last_error. Never throws.
 */
export async function generateInlineImage(
  admin: Admin,
  imageId: string,
  /** Injectable clock, threaded to the entitlement gate's cache-freshness
   *  check — same convention as generateArticleForTopic. Production passes
   *  nothing and uses the real clock. */
  nowFn: () => Date = () => new Date(),
): Promise<{ ok: true; url: string } | { ok: false; error: string; transient?: boolean }> {
  const row = await readInlineImageRow(admin, imageId)
  if (!row) return { ok: false, error: 'image_not_found' }

  // Blocker D fix — central gate, checked BEFORE marking the row
  // 'generating' and before any Gemini call.
  //
  // A denial IS still marked 'failed'. An earlier revision left the status
  // untouched for the transient case, reasoning that an outage should not look
  // permanent — but ArticleInlineImagesPanel surfaces a failure ONLY via
  // `status === 'failed'`, so that turned a visible error into a silent one:
  // the row sat at 'pending' forever and the merchant was told nothing.
  // 'failed' here means "this attempt failed", not "you did not pay"; the row
  // stays regenerable, and the DISTINCT code is what the UI localizes.
  const denial = await inlineImageGateDenial(admin, row.project_id, nowFn)
  if (denial) {
    await markInlineImageFailed(admin, imageId, denial.code)
    return { ok: false, error: denial.code, transient: denial.transient }
  }

  await admin.from('article_inline_images').update({ status: 'generating', last_error: null, updated_at: new Date().toISOString() }).eq('id', imageId)
  try {
    const gen = await generateArticleImage(await inlineImageModelInput(admin, row))
    if ('error' in gen) { await markInlineImageFailed(admin, imageId, gen.error); return { ok: false, error: gen.error } }
    return await storeInlineImageBytes(admin, row, { data: gen.data, mimeType: gen.mimeType })
  } catch (e) {
    await markInlineImageFailed(admin, imageId, e instanceof Error ? e.message : 'unexpected')
    return { ok: false, error: 'unexpected_error' }
  }
}
