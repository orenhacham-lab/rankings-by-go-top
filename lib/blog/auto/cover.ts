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
import { reviewGeneratedImage, retryGuidanceFor, type ImageDefect, type ReviewDeps } from '@/lib/content/image-quality'
import type { BlogAutoLocale } from '@/lib/blog/auto/rotation'

export const BLOG_IMAGE_BUCKET = 'article-images'

export type CoverResult = { ok: true; url: string } | { ok: false; reason: string }

/**
 * ONE SECOND CHANCE, AND NEVER A BLOCKED ARTICLE.
 *
 * The image is looked at before it is published (lib/content/image-quality.ts).
 * When the review names a fault, the image is asked for again ONCE with that
 * fault named, and whichever attempt is cleaner is the one that ships. If the
 * second is no better, the article still publishes with it: an article with an
 * imperfect image beats no article, which is what blocking here would mean (the
 * runner treats a cover failure as "not today"). The review never blocks either
 * — it answers `ok` whenever it cannot run.
 *
 * The cost is one cheap vision call per article, and a second image only for an
 * article that needed one.
 */
export async function createBlogCover(
  admin: ReturnType<typeof createAdminClient>,
  input: { slug: string; title: string; topic: string; imagePrompt: string | null; locale: BlogAutoLocale },
  deps: { review?: ReviewDeps } = {},
): Promise<CoverResult> {
  const order = (retryGuidance?: string) => generateArticleImage({
    title: input.title,
    topic: input.topic,
    imagePrompt: input.imagePrompt,
    language: input.locale,
    aspectRatio: '16:9',
    // What the article is about, so the image stays on the subject instead of
    // drifting to a metaphor of the concept.
    subject: input.topic,
    retryGuidance: retryGuidance ?? null,
  })

  const generated = await order()
  if ('error' in generated) return { ok: false, reason: generated.error }

  let bytes: Buffer
  try {
    const normalized = await normalizeFeaturedImage(generated.data, '16:9')
    bytes = normalized.data
  } catch {
    return { ok: false, reason: 'image_normalize_failed' }
  }

  let defects: ImageDefect[] = []
  const first = await reviewGeneratedImage(bytes, 'image/jpeg', deps.review)
  if (!first.ok) {
    defects = first.defects
    console.warn('[blog-cover] image refused by review, asking once more', {
      slug: input.slug, locale: input.locale, defects: first.defects,
    })
    const again = await order(retryGuidanceFor(first.defects))
    if (!('error' in again)) {
      try {
        const normalized = await normalizeFeaturedImage(again.data, '16:9')
        const second = await reviewGeneratedImage(normalized.data, 'image/jpeg', deps.review)
        // Keep the second only when it is genuinely cleaner; a retry that
        // swapped one fault for two is not an improvement.
        if (second.defects.length < first.defects.length) {
          bytes = normalized.data
          defects = second.defects
        }
      } catch { /* keep the first image */ }
    }
    if (defects.length > 0) {
      console.warn('[blog-cover] publishing an image the review still faults', {
        slug: input.slug, locale: input.locale, defects,
      })
    }
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
