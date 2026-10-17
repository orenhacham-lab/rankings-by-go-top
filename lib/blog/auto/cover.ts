/**
 * THE COVER IMAGE FOR AN AUTO-WRITTEN BLOG ARTICLE.
 *
 * The code already refuses to publish an article without one
 * (lib/articles/publish-rules.ts), so this runs before the publish, and a
 * failure here means the article is not published today rather than published
 * bare.
 *
 * The customer path (lib/content/featured-image.ts) cannot be reused: it reads
 * and writes `generated_articles` and checks the project's entitlement. This
 * uses the same two primitives underneath — Gemini for the image, sharp for the
 * 1600x900 JPEG — and puts the file in the public blog's own bucket, the one the
 * admin upload screen writes to.
 */

import type { createAdminClient } from '@/lib/supabase/admin'
import { generateArticleImage, normalizeFeaturedImage } from '@/lib/content/gemini-image'
import type { BlogAutoLocale } from '@/lib/blog/auto/rotation'

export const BLOG_IMAGE_BUCKET = 'article-images'

export type CoverResult = { ok: true; url: string } | { ok: false; reason: string }

export async function createBlogCover(
  admin: ReturnType<typeof createAdminClient>,
  input: { slug: string; title: string; topic: string; imagePrompt: string | null; locale: BlogAutoLocale },
): Promise<CoverResult> {
  const generated = await generateArticleImage({
    title: input.title,
    topic: input.topic,
    imagePrompt: input.imagePrompt,
    language: input.locale,
    aspectRatio: '16:9',
    // What the article is about, so the image stays on the subject instead of
    // drifting to a metaphor of the concept.
    subject: input.topic,
  })
  if ('error' in generated) return { ok: false, reason: generated.error }

  let bytes: Buffer
  try {
    const normalized = await normalizeFeaturedImage(generated.data, '16:9')
    bytes = normalized.data
  } catch {
    return { ok: false, reason: 'image_normalize_failed' }
  }

  const path = `auto/${input.slug}-${Date.now()}.jpg`
  const { error } = await admin.storage.from(BLOG_IMAGE_BUCKET).upload(path, bytes, {
    contentType: 'image/jpeg',
    upsert: false,
  })
  if (error) return { ok: false, reason: 'image_upload_failed' }

  const { data } = admin.storage.from(BLOG_IMAGE_BUCKET).getPublicUrl(path)
  if (!data?.publicUrl) return { ok: false, reason: 'image_url_missing' }
  return { ok: true, url: data.publicUrl }
}
