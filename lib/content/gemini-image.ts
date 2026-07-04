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

export function articleImageModel(): string {
  return process.env.GEMINI_IMAGE_MODEL || 'gemini-2.0-flash-preview-image-generation'
}

/** Build a clean, editorial featured-image prompt from the article context. */
export function buildImagePrompt(input: { title: string; topic?: string | null; imagePrompt?: string | null; language?: 'he' | 'en' }): string {
  const subject = (input.imagePrompt || '').trim() || (input.topic || '').trim() || input.title.trim()
  return [
    `A professional, clean LANDSCAPE (16:9) featured image for a blog article.`,
    `Article title: "${input.title.trim()}".`,
    subject ? `Visual subject / theme: ${subject}.` : '',
    `Editorial, modern, tasteful photography or subtle illustration; soft natural lighting; uncluttered, minimal composition with clear focal point.`,
    `Absolutely NO text, NO words, NO captions, NO watermark, NO logos, NO UI, NO banners, NO collage.`,
    `Not an advertisement, not marketing-heavy, not cheap-looking, not obviously AI-generated. Suitable as a WordPress blog header image.`,
  ].filter(Boolean).join(' ')
}

interface InlinePart { inlineData?: { data?: string; mimeType?: string }; text?: string }

/**
 * Generate a single featured image. Returns the raw bytes + mime type, or a
 * safe error. The model + key come from env; no secrets are logged.
 */
export async function generateArticleImage(input: {
  title: string
  topic?: string | null
  imagePrompt?: string | null
  language?: 'he' | 'en'
}): Promise<GeneratedImage | { error: string }> {
  const client = getGeminiClient()
  if (!client) return { error: process.env.GEMINI_API_KEY ? 'gemini_init_failed' : 'missing_gemini_api_key' }

  const modelName = articleImageModel()
  const prompt = buildImagePrompt(input)

  try {
    const model = client.getGenerativeModel({ model: modelName })
    // responseModalities is required for image output; cast to bypass the older
    // SDK's narrower generationConfig type.
    const result = await model.generateContent({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: { responseModalities: ['Text', 'Image'] } as Record<string, unknown>,
    } as unknown as Parameters<ReturnType<typeof client.getGenerativeModel>['generateContent']>[0])

    const parts = (result.response?.candidates?.[0]?.content?.parts || []) as InlinePart[]
    for (const p of parts) {
      const inline = p.inlineData
      if (inline?.data && (inline.mimeType || '').startsWith('image/')) {
        return { data: Buffer.from(inline.data, 'base64'), mimeType: inline.mimeType || 'image/png', prompt }
      }
    }
    console.warn('[content-article-image] no image part returned', { model: modelName })
    return { error: 'image_generation_failed' }
  } catch (err) {
    console.error('[content-article-image] generation error', { message: err instanceof Error ? err.message : String(err), model: modelName })
    return { error: 'image_generation_failed' }
  }
}
