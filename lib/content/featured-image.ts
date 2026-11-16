/**
 * Reusable server-side "create a featured image for an article" flow, shared by
 * the manual image route and the auto-image-on-create step in the generate
 * route. Writes a brand-neutral concept, generates the image, normalizes it to
 * JPEG 1600x900, stores it in the content-article-images bucket, and saves
 * featured_image_url / featured_image_storage_path / featured_image_prompt.
 *
 * Never touches article text/audit/anchors/tables or WordPress. Returns a safe
 * error code instead of throwing.
 *
 * THE FLOW IS IN THREE PARTS, and they are exported separately because the hero
 * can also be ORDERED from the Batch API at half price instead of called for
 * (lib/content/image-batch/hero-image-batch.ts). The batch lane has to build
 * exactly the request this file would have made, and store the bytes exactly
 * the way this file would have stored them — days apart, in two different
 * processes. Sharing the functions rather than copying them is what makes a
 * batched hero the same picture, named, sized and saved the same way:
 *
 *   prepareHeroImage  — read the article, run the entitlement gate, write the
 *                       concept, read the style: everything up to the request.
 *   generateArticleImage (gemini-image.ts) — the live call. The batch lane
 *                       replaces ONLY this step.
 *   storeHeroImageBytes — normalize, upload, save the columns, drop the old file.
 */

import type { createAdminClient } from '@/lib/supabase/admin'
import { generateArticleImage, normalizeFeaturedImage, sanitizeImageConceptForCommercialUse, writeCommercialSafeConcept } from '@/lib/content/gemini-image'
import { assertContentGenerationAllowedForProject, gateDenialCode } from '@/lib/content/entitlement-guard'
import { readArticleStyleForArticle } from '@/lib/content/article-style/store'
import { DEFAULT_CONTENT_LANGUAGE, normalizeContentLanguage, type ContentLanguage } from '@/lib/content/language'
import { CONTENT_IMAGE_BUCKET } from '@/lib/content/image-bucket'
import type { HeroRatio } from '@/lib/content/article-style/types'

function extFor(mime: string): string {
  if (mime.includes('png')) return 'png'
  if (mime.includes('webp')) return 'webp'
  if (mime.includes('jpeg') || mime.includes('jpg')) return 'jpg'
  return 'jpg'
}

/** Everything the hero's image request needs, and everything storing it needs. */
export interface PreparedHeroImage {
  articleId: string
  projectId: string
  /** The brand-neutral concept, saved as featured_image_prompt when the bytes land. */
  concept: string
  /** The hero's shape, which decides both the request and the normalized size. */
  heroRatio: HeroRatio
  /** The exact argument the live call passes to generateArticleImage. */
  request: Parameters<typeof generateArticleImage>[0]
  /** The file this hero replaces, removed only once the new one is stored. */
  previousStoragePath: string | null
}

/**
 * Everything up to the image request: the article, the entitlement gate, the
 * concept and the project's style. Returns a safe error code, never throws.
 *
 * Extracted unchanged out of createFeaturedImageForArticle so that the live
 * call and the batch order ask for the very same picture.
 */
export async function prepareHeroImage(
  admin: ReturnType<typeof createAdminClient>,
  articleId: string,
  nowFn: () => Date = () => new Date(),
): Promise<PreparedHeroImage | { error: string }> {
  const { data: article } = await admin
    .from('generated_articles')
    .select('id, project_id, title, topic_id, excerpt, meta_description, featured_image_storage_path')
    .eq('id', articleId)
    .maybeSingle()
  if (!article) return { error: 'article_not_found' }
  const a = article as Record<string, unknown>

  // Blocker D fix — central gate for the STANDALONE image-regenerate route
  // (the auto-image call from generateArticleForTopic is already gated
  // there; this covers the path that does NOT go through it).
  const gate = await assertContentGenerationAllowedForProject(admin, String(a.project_id), nowFn)
  // The DISTINCT reason survives: an outage is 'entitlement_unavailable', not
  // a billing verdict the caller would surface as "buy a plan".
  if (!gate.allowed) return { error: gateDenialCode(gate) }

  // Language + topical context from the linked topic (best-effort).
  let language: ContentLanguage = DEFAULT_CONTENT_LANGUAGE
  let topicText = ''
  let primaryKeyword = ''
  if (a.topic_id && typeof a.topic_id === 'string') {
    const { data: topic } = await admin.from('article_topics').select('language, topic, primary_keyword').eq('id', a.topic_id).maybeSingle()
    const t = topic as { language?: string; topic?: string; primary_keyword?: string } | null
    language = normalizeContentLanguage(t?.language)
    topicText = t?.topic || ''
    primaryKeyword = t?.primary_keyword || ''
  }

  // Brand-neutral visual concept (stored + fed, sanitized, to the image model).
  const concept = await writeCommercialSafeConcept({
    title: String(a.title || ''),
    excerpt: (a.excerpt as string) || (a.meta_description as string) || null,
    topic: topicText || null,
    primaryKeyword: primaryKeyword || null,
    language,
  })

  // The project's image style and hero shape (lib/content/article-style). No
  // setting, or no table yet, is the realistic 16:9 hero this always made.
  const { style } = await readArticleStyleForArticle(admin, articleId)

  const prev = a.featured_image_storage_path
  return {
    articleId,
    projectId: String(a.project_id),
    concept,
    heroRatio: style.heroRatio,
    previousStoragePath: typeof prev === 'string' && prev ? prev : null,
    request: {
      title: String(a.title || ''), imagePrompt: concept, topic: topicText || null, language,
      style: style.imageStyle, brandColors: style.brandColors, aspectRatio: style.heroRatio,
      // The article's subject is pinned as the focal point, so a mood-only concept cannot drift off topic.
      // A candidate that is only a brand name sanitizes to nothing, so the next one is used.
      subject: [primaryKeyword, topicText, String(a.title || '')].find((c) => sanitizeImageConceptForCommercialUse(c)) || null,
    },
  }
}

/**
 * The bytes have arrived: normalize, store in the content bucket and finish the
 * article's featured_image_* columns. Shared by the live call and the hero
 * batch's collect pass, so a hero that came back minutes later is stored, named
 * and published exactly like one that came back in thirty seconds.
 */
export async function storeHeroImageBytes(
  admin: ReturnType<typeof createAdminClient>,
  prepared: Pick<PreparedHeroImage, 'articleId' | 'projectId' | 'concept' | 'heroRatio' | 'previousStoragePath'>,
  bytesIn: { data: Buffer; mimeType: string },
): Promise<{ featured_image_url: string } | { error: string }> {
  // Normalize to JPEG 1600x900 (or 1200x1200 for a square hero) before storing (falls back to raw on sharp error).
  let bytes = bytesIn.data
  let mimeType = bytesIn.mimeType
  try {
    const norm = await normalizeFeaturedImage(bytesIn.data, prepared.heroRatio)
    bytes = norm.data
    mimeType = norm.mimeType
  } catch (e) {
    console.warn('[content-article-image] normalize failed, using original', { message: e instanceof Error ? e.message : String(e) })
  }

  const ext = extFor(mimeType)
  const path = `${prepared.projectId}/${prepared.articleId}-${Date.now().toString(36)}.${ext}`
  const up = await admin.storage.from(CONTENT_IMAGE_BUCKET).upload(path, bytes, { contentType: mimeType, upsert: true })
  if (up.error) {
    console.error('[content-article-image] storage upload failed', { message: up.error.message })
    return { error: 'image_upload_failed' }
  }
  const { data: pub } = admin.storage.from(CONTENT_IMAGE_BUCKET).getPublicUrl(path)

  const prev = prepared.previousStoragePath
  if (prev && prev !== path) {
    admin.storage.from(CONTENT_IMAGE_BUCKET).remove([prev]).catch(() => {})
  }

  const { error: updErr } = await admin
    .from('generated_articles')
    .update({ featured_image_url: pub.publicUrl, featured_image_storage_path: path, featured_image_prompt: prepared.concept, updated_at: new Date().toISOString() })
    .eq('id', prepared.articleId)
  if (updErr) {
    console.error('[content-article-image] db update failed', { message: updErr.message })
    return { error: 'image_save_failed' }
  }

  console.log('[content-article-image] created', { articleId: prepared.articleId, projectId: prepared.projectId })
  return { featured_image_url: pub.publicUrl }
}

export async function createFeaturedImageForArticle(
  admin: ReturnType<typeof createAdminClient>,
  articleId: string,
  /** Injectable clock, threaded to the entitlement gate's cache-freshness
   *  check — same convention as generateArticleForTopic. Production passes
   *  nothing and uses the real clock. */
  nowFn: () => Date = () => new Date(),
): Promise<{ featured_image_url: string } | { error: string }> {
  const prepared = await prepareHeroImage(admin, articleId, nowFn)
  if ('error' in prepared) return prepared

  const gen = await generateArticleImage(prepared.request)
  if ('error' in gen) return { error: gen.error }

  return storeHeroImageBytes(admin, prepared, { data: gen.data, mimeType: gen.mimeType })
}
