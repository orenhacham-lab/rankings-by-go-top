/**
 * Reusable server-side "create a featured image for an article" flow, shared by
 * the manual image route and the auto-image-on-create step in the generate
 * route. Writes a brand-neutral concept, generates the image, normalizes it to
 * JPEG 1600x900, stores it in the content-article-images bucket, and saves
 * featured_image_url / featured_image_storage_path / featured_image_prompt.
 *
 * Never touches article text/audit/anchors/tables or WordPress. Returns a safe
 * error code instead of throwing.
 */

import type { createAdminClient } from '@/lib/supabase/admin'
import { generateArticleImage, normalizeFeaturedImage, writeCommercialSafeConcept } from '@/lib/content/gemini-image'

export const CONTENT_IMAGE_BUCKET = 'content-article-images'

function extFor(mime: string): string {
  if (mime.includes('png')) return 'png'
  if (mime.includes('webp')) return 'webp'
  if (mime.includes('jpeg') || mime.includes('jpg')) return 'jpg'
  return 'jpg'
}

export async function createFeaturedImageForArticle(
  admin: ReturnType<typeof createAdminClient>,
  articleId: string
): Promise<{ featured_image_url: string } | { error: string }> {
  const { data: article } = await admin
    .from('generated_articles')
    .select('id, project_id, title, topic_id, excerpt, meta_description, featured_image_storage_path')
    .eq('id', articleId)
    .maybeSingle()
  if (!article) return { error: 'article_not_found' }
  const a = article as Record<string, unknown>

  // Language + topical context from the linked topic (best-effort).
  let language: 'he' | 'en' = 'he'
  let topicText = ''
  let primaryKeyword = ''
  if (a.topic_id && typeof a.topic_id === 'string') {
    const { data: topic } = await admin.from('article_topics').select('language, topic, primary_keyword').eq('id', a.topic_id).maybeSingle()
    const t = topic as { language?: string; topic?: string; primary_keyword?: string } | null
    language = String(t?.language || '').toLowerCase().startsWith('en') ? 'en' : 'he'
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

  const gen = await generateArticleImage({ title: String(a.title || ''), imagePrompt: concept, topic: topicText || null, language })
  if ('error' in gen) return { error: gen.error }

  // Normalize to JPEG 1600x900 before storing (falls back to raw on sharp error).
  let bytes = gen.data
  let mimeType = gen.mimeType
  try {
    const norm = await normalizeFeaturedImage(gen.data)
    bytes = norm.data
    mimeType = norm.mimeType
  } catch (e) {
    console.warn('[content-article-image] normalize failed, using original', { message: e instanceof Error ? e.message : String(e) })
  }

  const ext = extFor(mimeType)
  const path = `${a.project_id}/${articleId}-${Date.now().toString(36)}.${ext}`
  const up = await admin.storage.from(CONTENT_IMAGE_BUCKET).upload(path, bytes, { contentType: mimeType, upsert: true })
  if (up.error) {
    console.error('[content-article-image] storage upload failed', { message: up.error.message })
    return { error: 'image_upload_failed' }
  }
  const { data: pub } = admin.storage.from(CONTENT_IMAGE_BUCKET).getPublicUrl(path)

  const prev = a.featured_image_storage_path
  if (prev && typeof prev === 'string' && prev !== path) {
    admin.storage.from(CONTENT_IMAGE_BUCKET).remove([prev]).catch(() => {})
  }

  const { error: updErr } = await admin
    .from('generated_articles')
    .update({ featured_image_url: pub.publicUrl, featured_image_storage_path: path, featured_image_prompt: concept, updated_at: new Date().toISOString() })
    .eq('id', articleId)
  if (updErr) {
    console.error('[content-article-image] db update failed', { message: updErr.message })
    return { error: 'image_save_failed' }
  }

  console.log('[content-article-image] created', { articleId, projectId: a.project_id })
  return { featured_image_url: pub.publicUrl }
}
