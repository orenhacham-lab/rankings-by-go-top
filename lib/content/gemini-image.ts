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
import sharp from 'sharp'

export interface GeneratedImage {
  data: Buffer
  mimeType: string
  prompt: string
}

// Final featured-image dimensions (WordPress-friendly 16:9 hero).
export const FEATURED_IMAGE_WIDTH = 1600
export const FEATURED_IMAGE_HEIGHT = 900

/**
 * Normalize any generated image to a consistent WordPress-friendly asset:
 * JPEG, 1600x900 (16:9), quality 85, cover-cropped (no distortion). Applies ONLY
 * to the image bytes — never to article text/HTML/anchors.
 */
export async function normalizeFeaturedImage(input: Buffer): Promise<{ data: Buffer; mimeType: 'image/jpeg' }> {
  const data = await sharp(input)
    .resize(FEATURED_IMAGE_WIDTH, FEATURED_IMAGE_HEIGHT, { fit: 'cover', position: 'centre' })
    .jpeg({ quality: 85 })
    .toBuffer()
  return { data, mimeType: 'image/jpeg' }
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

// Risky descriptor words → safe alternatives (never reproduce trade dress).
const CONCEPT_REPLACEMENTS: [RegExp, string][] = [
  [/\bofficial packaging\b/gi, 'plain unbranded packaging'],
  [/\breal product\b/gi, 'generic product'],
  [/\bbrand names?\b/gi, ''],
  [/\btrademarked?\b/gi, ''],
  [/\bbranded\b/gi, 'unbranded'],
  [/\bpackaging\b/gi, 'plain unbranded packaging'],
  [/\blogos?\b/gi, ''],
  [/\blabels?\b/gi, 'blank label'],
  [/\bbrand\b/gi, 'category'],
]

/**
 * Neutralize a visual concept so the generated image is commercial-safe: strips
 * capitalized Latin proper-noun/brand runs (e.g. "Abercrombie", "Narciso
 * Rodriguez", "Kingsmith WalkingPad X21"), and swaps risky words (logo/label/
 * branded/packaging...) for safe alternatives. This is a PROMPT-LEVEL mitigation
 * only — it never touches article text, anchors, URLs, or WordPress content, and
 * it is NOT a trademark classifier.
 */
export function sanitizeImageConceptForCommercialUse(input: string): string {
  let s = (input || '').trim()
  if (!s) return ''
  // Remove capitalized Latin runs (brand/product proper nouns).
  s = s.replace(/\b[A-Z][A-Za-z0-9&'’.-]*(?:\s+[A-Z0-9][A-Za-z0-9&'’.-]*)*/g, ' ')
  for (const [re, repl] of CONCEPT_REPLACEMENTS) s = s.replace(re, repl)
  // Tidy whitespace/punctuation left behind.
  s = s.replace(/\s{2,}/g, ' ').replace(/\s+([,.;:])/g, '$1').replace(/(^[\s,.;:-]+|[\s,.;:-]+$)/g, '').trim()
  return s
}

/**
 * Build a premium, editorial, COMMERCIAL-SAFE featured-image prompt. The article
 * concept is sanitized first (brand/product names neutralized) so the model is
 * asked for a generic, category-relevant scene — never a branded replica.
 */
export function buildImagePrompt(input: { title: string; topic?: string | null; imagePrompt?: string | null; language?: 'he' | 'en' }): string {
  const rawConcept = (input.imagePrompt || '').trim() || (input.topic || '').trim() || input.title.trim()
  const concept = sanitizeImageConceptForCommercialUse(rawConcept)
  return [
    `Create a premium, photorealistic EDITORIAL featured image for a professional website blog article.`,
    concept ? `Depict a GENERIC, UNBRANDED, category-relevant scene for this concept: ${concept}.` : `Depict a generic, unbranded, category-relevant editorial scene.`,
    `Style: high-end editorial photography, realistic real-world environment, natural lighting, clean uncluttered composition with a clear focal point, shallow depth of field, LANDSCAPE 16:9. It must look expensive and trustworthy, never cheap or obviously AI-generated.`,
    // --- Commercial-safety policy (applied to EVERY image) ---
    `COMMERCIAL-SAFETY RULES (must all hold): use ONLY generic, unbranded objects. Do NOT generate real logos, readable brand names, trademarked packaging, exact product labels, recognizable branded products, or official-looking replicas. Do NOT recreate any known product design, bottle, package, treadmill/appliance model, or branded trade dress. Use blank or no labels. Absolutely NO text, letters, numbers, captions, labels, badges, watermarks, UI, posters, banners, price tags, or sale graphics.`,
    `If the article is about a specific brand or product, represent the CATEGORY and intent with an unbranded, generic scene instead of the real product. Examples: perfume → elegant unbranded fragrance bottles with blank labels; treadmill/fitness → a generic home-gym or generic treadmill silhouette with no readable screen/UI; flower delivery → a natural bouquet/delivery scene with no shop logo or signage.`,
    `Do NOT make it a cartoon, illustration, or 3D render unless the topic clearly requires it. Avoid distorted hands/faces and unreadable typography. The image must be safe for commercial website use.`,
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
