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
import { getGeminiClient, GEMINI_REQUEST_TIMEOUT_MS } from '@/lib/ai-visibility/gemini-semantic-classifier'
import { imageStylePrompt } from '@/lib/content/article-style/image-prompt'
import type { HeroRatio, ImageStyle } from '@/lib/content/article-style/types'
import { type ContentLanguage } from '@/lib/content/language'
import { languageNameInEnglish, normalizeContentLanguage } from '@/lib/content/language'

export interface GeneratedImage {
  data: Buffer
  mimeType: string
  prompt: string
}

// Final featured-image dimensions (WordPress-friendly 16:9 hero).
export const FEATURED_IMAGE_WIDTH = 1600
export const FEATURED_IMAGE_HEIGHT = 900
// The square hero a project can choose instead (lib/content/article-style).
export const SQUARE_IMAGE_SIZE = 1200

/**
 * Normalize any generated image to a consistent WordPress-friendly asset:
 * JPEG, 1600x900 (16:9), quality 85, cover-cropped (no distortion). Applies ONLY
 * to the image bytes — never to article text/HTML/anchors.
 */
export async function normalizeFeaturedImage(input: Buffer, ratio: HeroRatio = '16:9'): Promise<{ data: Buffer; mimeType: 'image/jpeg' }> {
  const [width, height] = ratio === '1:1' ? [SQUARE_IMAGE_SIZE, SQUARE_IMAGE_SIZE] : [FEATURED_IMAGE_WIDTH, FEATURED_IMAGE_HEIGHT]
  const data = await sharp(input)
    .resize(width, height, { fit: 'cover', position: 'centre' })
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
export function buildImagePrompt(input: {
  title: string
  topic?: string | null
  imagePrompt?: string | null
  language?: ContentLanguage
  /** The project's image style (lib/content/article-style); absent is the realistic photo it always was. */
  style?: ImageStyle | null
  /** Brand colours an illustrated style builds its palette around. */
  brandColors?: readonly string[]
  aspectRatio?: HeroRatio
  /**
   * What the article is ABOUT (its main keyword, else its topic, else its
   * title). The concept alone once drifted to a mood metaphor (an article on
   * eau de cologne got "water drops over green citrus leaves") because the
   * title never reached the image model once a concept existed. When given,
   * the subject is pinned as the focal point; absent, the prompt is unchanged.
   */
  subject?: string | null
}): string {
  const rawConcept = (input.imagePrompt || '').trim() || (input.topic || '').trim() || input.title.trim()
  const concept = sanitizeImageConceptForCommercialUse(rawConcept)
  const subject = sanitizeImageConceptForCommercialUse(input.subject || '')
  const look = imageStylePrompt(input.style, input.brandColors)
  const photo = !input.style || input.style === 'realistic'
  const ratio = input.aspectRatio === '1:1' ? 'SQUARE 1:1' : 'LANDSCAPE 16:9'
  return [
    photo
      ? `Create a premium, photorealistic EDITORIAL featured image for a professional website blog article.`
      : `Create a premium EDITORIAL featured image for a professional website blog article.`,
    subject && subject !== concept
      ? `MAIN SUBJECT (the article is about this; it must be the clear, instantly recognizable focal point of the image): ${subject}. Show the subject itself as a concrete generic, unbranded object or scene; never replace it with an abstract metaphor, mood, texture, ingredient or nature scene.`
      : '',
    concept ? `Depict a GENERIC, UNBRANDED, category-relevant scene for this concept: ${concept}.` : `Depict a generic, unbranded, category-relevant editorial scene.`,
    `${look.look.replace(/\.$/, '')}, ${ratio}. It must look expensive and trustworthy, never cheap or obviously AI-generated.`,
    // --- Commercial-safety policy (applied to EVERY image) ---
    `COMMERCIAL-SAFETY RULES (must all hold): use ONLY generic, unbranded objects. Do NOT generate real logos, readable brand names, trademarked packaging, exact product labels, recognizable branded products, or official-looking replicas. Do NOT recreate any known product design, bottle, package, treadmill/appliance model, or branded trade dress. Use blank or no labels. Absolutely NO text, letters, numbers, captions, labels, badges, watermarks, UI, posters, banners, price tags, or sale graphics.`,
    `If the article is about a specific brand or product, represent the CATEGORY and intent with an unbranded, generic scene instead of the real product. Examples: perfume → elegant unbranded fragrance bottles with blank labels; treadmill/fitness → a generic home-gym or generic treadmill silhouette with no readable screen/UI; flower delivery → a natural bouquet/delivery scene with no shop logo or signage.`,
    `${look.avoid} Avoid distorted hands/faces and unreadable typography. The image must be safe for commercial website use.`,
  ].filter(Boolean).join(' ')
}

/**
 * Write a concise, BRAND-NEUTRAL visual concept for the article's hero image
 * (in the article's language) from title/excerpt/topic/keyword. Uses the cheap
 * classifier text model, and is instructed to describe a generic, category-based
 * scene — never a brand/product/model name, logo, packaging, or real product.
 * On any failure it returns a safe deterministic fallback. This is what gets
 * stored as featured_image_prompt and fed (sanitized) to the image model.
 */
/** The concept used when no model call is possible, in the content language. */
const CONCEPT_FALLBACK: Record<ContentLanguage, (subject: string) => string> = {
  he: (s) => `סצנה עריכתית פרימיום, נקייה ופוטוריאליסטית בנושא ${s || 'התוכן'}, גנרית ולא ממותגת, ללא לוגו, ללא טקסט וללא אריזות רשמיות.`,
  en: (s) => `A premium, clean, photorealistic editorial scene about ${s || 'the topic'}, generic and unbranded, no logo, no text, no official packaging.`,
  es: (s) => `Una escena editorial premium, limpia y fotorrealista sobre ${s || 'el tema'}, genérica y sin marca, sin logotipos, sin texto y sin envases oficiales.`,
}

export async function writeCommercialSafeConcept(input: {
  title: string
  excerpt?: string | null
  topic?: string | null
  primaryKeyword?: string | null
  language?: ContentLanguage
}): Promise<string> {
  const lang = normalizeContentLanguage(input.language)
  const fallback = (): string => {
    const base = sanitizeImageConceptForCommercialUse(input.title || input.topic || '')
    return CONCEPT_FALLBACK[lang](base)
  }

  const client = getGeminiClient()
  if (!client) return fallback()
  const modelName = process.env.GEMINI_CLASSIFIER_MODEL || 'gemini-2.5-flash-lite'
  const outLang = languageNameInEnglish(lang)
  const ctx = [input.excerpt, input.topic, input.primaryKeyword].map((x) => (x || '').trim()).filter(Boolean).join(' | ')
  const prompt = [
    `Write ONE concise ${outLang} visual concept (1-2 sentences) for a PREMIUM EDITORIAL blog hero image about the article below.`,
    `Article title: ${input.title}`,
    input.primaryKeyword?.trim() ? `Main subject: ${input.primaryKeyword.trim()}` : '',
    ctx ? `Context: ${ctx}` : '',
    `Rules: the scene MUST literally show the article's main subject as a concrete, recognizable object or scene and make it the focal point (for a product category, show a generic unbranded example of that product, e.g. an unbranded perfume or cologne bottle with a blank label). NEVER replace the subject with an abstract metaphor, mood, texture, ingredient or nature scene (water drops, leaves, light, colour layers) that would not tell a reader what the article is about.`,
    `Describe a GENERIC, UNBRANDED, CATEGORY-BASED scene (subject + mood + scene + composition). NEVER mention any brand name, product or model name, or SKU-like identifier. NEVER request a real branded bottle/product, official packaging, logo, label text, or branded object. No text/letters in the image. Editorial, premium, photorealistic, clean, commercial-safe.`,
    `Output ONLY the concept sentence(s) in ${outLang}. No quotes, no preamble.`,
  ].filter(Boolean).join('\n')

  try {
    const model = client.getGenerativeModel({ model: modelName })
    // 3rd review correction — bounded provider timeout; see
    // GEMINI_REQUEST_TIMEOUT_MS's definition for the full rationale.
    const res = await model.generateContent(prompt, { timeout: GEMINI_REQUEST_TIMEOUT_MS })
    const text = (res.response.text() || '').trim().replace(/^["'\s]+|["'\s]+$/g, '')
    if (!text || text.length < 8) return fallback()
    return text
  } catch (err) {
    console.warn('[content-article-image] concept writer failed, using fallback', { message: err instanceof Error ? err.message : String(err), model: modelName })
    return fallback()
  }
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
  language?: ContentLanguage
  style?: ImageStyle | null
  brandColors?: readonly string[]
  aspectRatio?: HeroRatio
  subject?: string | null
}): Promise<GeneratedImage | { error: string }> {
  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) return { error: 'missing_gemini_api_key' }

  let ai: GoogleGenAI
  try {
    // 3rd review correction — httpOptions.timeout bounds EVERY HTTP request
    // this client instance makes (each candidate model's interactions.create
    // call below included) to GEMINI_REQUEST_TIMEOUT_MS. See that constant's
    // definition for the full rationale.
    ai = new GoogleGenAI({ apiKey, httpOptions: { timeout: GEMINI_REQUEST_TIMEOUT_MS } })
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
        response_format: { type: 'image', mime_type: 'image/jpeg', aspect_ratio: input.aspectRatio === '1:1' ? '1:1' : '16:9', image_size: '2K' },
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
