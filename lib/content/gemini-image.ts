/**
 * Gemini-backed featured-image generation (content module).
 *
 * Uses the @google/genai Interactions API (ai.interactions.create with an image
 * response_format) — NOT the older @google/generative-ai generateContent, which
 * 404s for the current image models. Produces ONE clean, premium, landscape
 * (16:9) blog featured image (no text/logos/banners). Returns raw bytes.
 *
 * Never throws; returns { error } with a safe, credential-free message. Trying
 * order: GEMINI_IMAGE_MODEL (if set) → gemini-3.1-flash-image →
 * gemini-3.1-flash-lite-image → gemini-2.5-flash-image.
 */

import { GoogleGenAI } from '@google/genai'

export interface GeneratedImage {
  data: Buffer
  mimeType: string
  prompt: string
}

// Known-good defaults for the Interactions API (in fallback order). The old
// preview models (gemini-2.5-flash-image-preview / gemini-2.0-flash-preview-
// image-generation) are intentionally excluded — they 404 via this API.
const FALLBACK_IMAGE_MODELS = ['gemini-3.1-flash-image', 'gemini-3.1-flash-lite-image', 'gemini-2.5-flash-image']

/** Ordered, de-duplicated list of image models to try (env first, then fallbacks). */
export function imageModelCandidates(): { model: string; source: 'env' | 'fallback' }[] {
  const out: { model: string; source: 'env' | 'fallback' }[] = []
  const seen = new Set<string>()
  const push = (model: string | undefined, source: 'env' | 'fallback') => {
    const m = (model || '').trim()
    if (m && !seen.has(m)) { seen.add(m); out.push({ model: m, source }) }
  }
  push(process.env.GEMINI_IMAGE_MODEL, 'env')
  for (const m of FALLBACK_IMAGE_MODELS) push(m, 'fallback')
  return out
}

/** True when the error means "this model can't do this here" → try the next one. */
function isModelUnavailableError(message: string): boolean {
  const m = message.toLowerCase()
  return m.includes('404') || m.includes('not found') || m.includes('not supported') || m.includes('unsupported') || m.includes('is not available')
}

/** Build a premium, editorial featured-image prompt from the article context. */
export function buildImagePrompt(input: { title: string; topic?: string | null; imagePrompt?: string | null; language?: 'he' | 'en' }): string {
  const base = (input.imagePrompt || '').trim() || (input.topic || '').trim() || input.title.trim()
  return [
    `Create a premium, photorealistic editorial featured image for a professional website blog article.`,
    `Article title: "${input.title.trim()}".`,
    base ? `Base concept (wrap it in the quality rules below): ${base}.` : '',
    `Style: high-end editorial photography, realistic real-world environment, natural lighting, clean and uncluttered composition with a clear focal point, shallow depth of field, LANDSCAPE 16:9.`,
    `Match the article's topic and search intent; the scene should feel authentic and relevant.`,
    `STRICTLY NO text, NO letters, NO numbers, NO captions, NO logo, NO watermark, NO UI, NO banner, NO sale/price badge, NO collage.`,
    `Do NOT make it a cartoon, illustration, or 3D render unless the topic clearly requires it. Avoid distorted hands/faces, fake labels, and unreadable typography.`,
    `It must look expensive and trustworthy — never cheap or obviously AI-generated. Suitable as a WordPress featured image.`,
  ].filter(Boolean).join(' ')
}

interface InteractionImage { output_image?: { data?: string; mime_type?: string } }

/**
 * Generate a single featured image via the Interactions API, trying the env
 * model first then known-good fallbacks. Returns raw bytes + mime type, or a
 * safe error. Logs the model, whether it was env/fallback, and a short error —
 * never the API key or any secret.
 */
export async function generateArticleImage(input: {
  title: string
  topic?: string | null
  imagePrompt?: string | null
  language?: 'he' | 'en'
}): Promise<GeneratedImage | { error: string }> {
  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) return { error: 'missing_gemini_api_key' }

  let ai: GoogleGenAI
  try {
    ai = new GoogleGenAI({ apiKey })
  } catch {
    return { error: 'gemini_init_failed' }
  }

  const prompt = buildImagePrompt(input)
  const candidates = imageModelCandidates()
  let lastWasUnavailable = false

  for (const { model, source } of candidates) {
    try {
      const interaction = (await ai.interactions.create({
        model,
        input: prompt,
        response_format: { type: 'image', mime_type: 'image/jpeg', aspect_ratio: '16:9', image_size: '2K' },
      } as Parameters<typeof ai.interactions.create>[0])) as unknown as InteractionImage

      const data = interaction.output_image?.data
      if (data) {
        const mimeType = interaction.output_image?.mime_type || 'image/jpeg'
        console.log(`[content-article-image] generated model=${model} source=${source}`)
        return { data: Buffer.from(data, 'base64'), mimeType, prompt }
      }
      lastWasUnavailable = false
      console.warn(`[content-article-image] no image returned model=${model} source=${source}`)
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      lastWasUnavailable = isModelUnavailableError(message)
      console.error(`[content-article-image] error model=${model} source=${source} unavailable=${lastWasUnavailable} msg=${message.slice(0, 160)}`)
    }
  }

  return { error: lastWasUnavailable ? 'image_model_unavailable' : 'image_generation_failed' }
}
