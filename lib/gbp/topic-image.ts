/**
 * An AI photo for a post written from a topic (never from an article: an
 * article already has its own image). One generic, unbranded, photorealistic
 * 16:9 scene about the topic, with no text and no logos, returned as a JPEG the
 * composer loads into its usual crop step, which then cuts the 4:3 Google needs.
 * Nothing is stored here; the merchant's own "use this photo" step does that.
 * Server-only (Gemini, sharp).
 */
import { generateArticleImage, normalizeFeaturedImage, writeCommercialSafeConcept } from '@/lib/content/gemini-image'

export const GBP_TOPIC_MAX = 300

export type TopicImageResult =
  | { ok: true; bytes: Buffer }
  /** `reason` is our own classification for the server log, never shown and never a provider's words. */
  | { ok: false; reason: string }

export type GenerateTopicImage = (input: { topic: string }) => Promise<TopicImageResult>

export const generateTopicImage: GenerateTopicImage = async ({ topic }) => {
  // The concept is written in English, the language the image model follows
  // best; the picture has no words in it, so the post's language is irrelevant.
  const concept = await writeCommercialSafeConcept({ title: topic, topic, language: 'en' })
  const out = await generateArticleImage({
    title: topic,
    topic,
    imagePrompt: `${concept} A real-looking photo a local business could post on its Google Business Profile.`,
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
