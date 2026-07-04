/**
 * Gemini-backed featured-image generation (content module).
 *
 * Reuses the existing Gemini provider (GEMINI_API_KEY / getGeminiClient) with an
 * image-capable model (GEMINI_IMAGE_MODEL, default gemini-2.0-flash-preview-
 * image-generation). Produces ONE clean, landscape, professional blog featured
 * image (no text/logos/banners). Returns raw bytes — the caller stores them.
 *
 * Never throws; returns { error } with a safe, credential-free message.
 */

import { getGeminiClient } from '@/lib/ai-visibility/gemini-semantic-classifier'

export interface GeneratedImage {
  data: Buffer
  mimeType: string
  prompt: string
}

// A known-good default image model. gemini-2.5-flash-image-preview is NOT used
// by default because it returns 404 on many keys/API versions.
const DEFAULT_IMAGE_MODEL = 'gemini-2.0-flash-preview-image-generation'

/** Ordered, de-duplicated list of image models to try (env first, then fallback). */
export function imageModelCandidates(): { model: string; source: 'env' | 'fallback' }[] {
  const out: { model: string; source: 'env' | 'fallback' }[] = []
  const seen = new Set<string>()
  const push = (model: string | undefined, source: 'env' | 'fallback') => {
    const m = (model || '').trim()
    if (m && !seen.has(m)) { seen.add(m); out.push({ model: m, source }) }
  }
  push(process.env.GEMINI_IMAGE_MODEL, 'env')
  push(DEFAULT_IMAGE_MODEL, 'fallback')
  return out
}

/** True when the error means "this model can't do generateContent here" → try the next one. */
function isModelUnavailableError(message: string): boolean {
  const m = message.toLowerCase()
  return m.includes('404') || m.includes('not found') || m.includes('not supported') || m.includes('is not supported for generatecontent') || m.includes('unsupported')
}

/** Build a premium, editorial featured-image prompt from the article context. */
export function buildImagePrompt(input: { title: string; topic?: string | null; imagePrompt?: string | null; language?: 'he' | 'en' }): string {
  const base = (input.imagePrompt || '').trim() || (input.topic || '').trim() || input.title.trim()
  return [
    `Create a premium, photorealistic editorial featured image for a professional website blog article.`,
    `Article title: "${input.title.trim()}".`,
    base ? `Base concept (wrap it in the quality rules below): ${base}.` : '',
    `Style: high-end editorial photography, realistic real-world environment, natural lighting, clean and uncluttered composition with a clear focal point, shallow depth of field, LANDSCAPE 16:9 aspect ratio.`,
    `Match the article's topic and search intent; the scene should feel authentic and relevant.`,
    `STRICTLY NO text, NO letters, NO numbers, NO captions, NO logo, NO watermark, NO UI, NO banner, NO sale/price badge, NO collage.`,
    `Do NOT make it a cartoon, illustration, or 3D render unless the topic clearly requires it. Avoid distorted hands/faces, fake labels, and unreadable typography.`,
    `It must look expensive and trustworthy — never cheap or obviously AI-generated. Suitable as a WordPress featured image.`,
  ].filter(Boolean).join(' ')
}

interface InlinePart { inlineData?: { data?: string; mimeType?: string }; text?: string }

/**
 * Generate a single featured image, trying the env model first then a known-good
 * fallback. Returns raw bytes + mime type, or a safe error. Logs the model tried,
 * whether it was env/fallback, and a short error — never the API key or secrets.
 */
export async function generateArticleImage(input: {
  title: string
  topic?: string | null
  imagePrompt?: string | null
  language?: 'he' | 'en'
}): Promise<GeneratedImage | { error: string }> {
  const client = getGeminiClient()
  if (!client) return { error: process.env.GEMINI_API_KEY ? 'gemini_init_failed' : 'missing_gemini_api_key' }

  const prompt = buildImagePrompt(input)
  const candidates = imageModelCandidates()
  let lastWasUnavailable = false

  for (const { model: modelName, source } of candidates) {
    try {
      const model = client.getGenerativeModel({ model: modelName })
      // responseModalities is required for image output; cast to bypass the
      // older SDK's narrower generationConfig type.
      const result = await model.generateContent({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: { responseModalities: ['Text', 'Image'] } as Record<string, unknown>,
      } as unknown as Parameters<ReturnType<typeof client.getGenerativeModel>['generateContent']>[0])

      const parts = (result.response?.candidates?.[0]?.content?.parts || []) as InlinePart[]
      for (const p of parts) {
        const inline = p.inlineData
        if (inline?.data && (inline.mimeType || '').startsWith('image/')) {
          console.log(`[content-article-image] generated model=${modelName} source=${source}`)
          return { data: Buffer.from(inline.data, 'base64'), mimeType: inline.mimeType || 'image/png', prompt }
        }
      }
      // Call succeeded but returned no image → try the next candidate.
      lastWasUnavailable = false
      console.warn(`[content-article-image] no image part model=${modelName} source=${source}`)
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      lastWasUnavailable = isModelUnavailableError(message)
      // Log a short, safe reason only — never the key.
      console.error(`[content-article-image] error model=${modelName} source=${source} unavailable=${lastWasUnavailable} msg=${message.slice(0, 160)}`)
      // Non-availability errors (safety/network) also fall through to the next
      // candidate, but we remember whether the LAST failure was availability.
    }
  }

  return { error: lastWasUnavailable ? 'image_model_unavailable' : 'image_generation_failed' }
}
