/**
 * An AI photo for a post written from a topic (never from an article: an
 * article already has its own image). One generic, unbranded, photorealistic
 * 16:9 scene about the topic, with no text and no logos, returned as a JPEG the
 * composer loads into its usual crop step, which then cuts the 4:3 Google needs.
 * Nothing is stored here; the merchant's own "use this photo" step does that.
 * Server-only (Gemini, sharp).
 */
import { generateArticleImage, normalizeFeaturedImage } from '@/lib/content/gemini-image'

export const GBP_TOPIC_MAX = 300

export type TopicImageResult =
  | { ok: true; bytes: Buffer }
  /** `reason` is our own classification for the server log, never shown and never a provider's words. */
  | { ok: false; reason: string }

export type GenerateTopicImage = (input: { topic: string }) => Promise<TopicImageResult>

export const generateTopicImage: GenerateTopicImage = async ({ topic }) => {
  // No separate text-model call for a concept: that writer pins a text model by
  // name, which this project must not do (lib/gbp/generate.ts). buildImagePrompt
  // already strips brand names and adds the no-text, no-logo, unbranded rules.
  const out = await generateArticleImage({
    title: topic,
    topic,
    // Never "real-looking": the photo must not pass for one of the business itself (legal review).
    imagePrompt: `A generic, unbranded illustrative photo about: ${topic}. Not a photo of any specific business, its premises, its staff or its products, and no identifiable people.`,
    subject: topic,
    aspectRatio: '16:9',
    language: 'en',
  })
  if ('error' in out) return { ok: false, reason: out.error }
  try {
    const { data } = await normalizeFeaturedImage(out.data, '16:9')
    return { ok: true, bytes: data }
  } catch {
    return { ok: false, reason: 'image_normalize_failed' }
  }
}
