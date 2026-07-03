/**
 * Gemini-backed full SEO/GEO article generation (content module, Phase 3A).
 *
 * Reuses the SAME Gemini client/env as topic suggestions / AI-recommended
 * questions (getGeminiClient + GEMINI_CLASSIFIER_MODEL). Builds the prompt from
 * a server-side brief, returns structured JSON, and reports token usage when
 * available. NO Anthropic, no new provider. Returns { error } on any failure so
 * the caller never saves an empty/bad article.
 */

import { getGeminiClient } from '@/lib/ai-visibility/gemini-semantic-classifier'
import type { ArticleTopicAnchor } from '@/lib/supabase/types'
import type { SuggestionLanguage } from '@/lib/content/topic-suggestions'

export interface ArticleBrief {
  language: SuggestionLanguage
  topic: string
  primaryKeyword: string | null
  secondaryKeywords: string[]
  searchIntent: string | null
  targetAudience: string | null
  toneOfVoice: string | null
  desiredWordCount: number | null
  ctaPreference: string | null
  briefNotes: string | null
  anchors: ArticleTopicAnchor[]
  businessName: string | null
  domain: string | null
  category: string | null
}

export interface GeneratedArticleFaq {
  question: string
  answer: string
}

export interface GeneratedArticleContent {
  title: string
  slug: string
  metaTitle: string
  metaDescription: string
  excerpt: string
  contentHtml: string
  contentMarkdown: string
  faq: GeneratedArticleFaq[]
  imagePrompt: string
  warnings: string[]
}

export interface GeminiUsage {
  model: string
  inputTokens: number
  outputTokens: number
}

export type ArticleGenResult =
  | { article: GeneratedArticleContent; usage: GeminiUsage | null }
  | { error: string }

const TONE_HINT: Record<string, string> = {
  professional: 'professional and credible',
  marketing: 'persuasive marketing',
  casual: 'light and casual',
  luxury: 'premium / upscale',
  informative: 'informative and neutral',
}
const CTA_HINT: Record<string, string> = {
  gentle: 'a gentle call-to-action at the end',
  none: 'no call-to-action',
  contact: 'a "contact us" call-to-action at the end',
  whatsapp: 'a WhatsApp/phone call-to-action at the end',
  marketing: 'a stronger marketing call-to-action at the end',
}

function buildArticlePrompt(brief: ArticleBrief): string {
  const lang = brief.language === 'he' ? 'Hebrew' : 'English'
  const tone = (brief.toneOfVoice && TONE_HINT[brief.toneOfVoice]) || 'professional and credible'
  const cta = (brief.ctaPreference && CTA_HINT[brief.ctaPreference]) || 'a gentle call-to-action at the end'
  const words = brief.desiredWordCount || 1000

  const anchorLines = brief.anchors
    .filter((a) => a.anchor_text?.trim() && a.target_url?.trim())
    .map(
      (a) =>
        `  - ${a.required ? '[REQUIRED]' : '[optional]'} link the text "${a.anchor_text}" to ${a.target_url}` +
        (a.note ? ` (context: ${a.note})` : '')
    )

  return [
    `You are an expert SEO/GEO content writer. Write a COMPLETE article in ${lang}.`,
    ``,
    `Topic: ${brief.topic}`,
    brief.primaryKeyword ? `Primary keyword: "${brief.primaryKeyword}" — use it naturally, no stuffing.` : '',
    brief.secondaryKeywords.length ? `Secondary keywords (weave in naturally): ${brief.secondaryKeywords.join(', ')}.` : '',
    brief.searchIntent ? `Search intent: ${brief.searchIntent}.` : '',
    brief.targetAudience ? `Target audience: ${brief.targetAudience}.` : '',
    brief.businessName ? `Business: ${brief.businessName}.` : '',
    brief.domain ? `Website: ${brief.domain}.` : '',
    brief.category ? `Field: ${brief.category}.` : '',
    brief.briefNotes ? `Extra instructions: ${brief.briefNotes}` : '',
    `Tone: ${tone}. Target length: about ${words} words. End with ${cta}.`,
    ``,
    `SEO/GEO requirements:`,
    `- Clear H2/H3 structure, readable paragraphs, an intro that frames the topic.`,
    `- Give genuinely useful, specific content that matches the search intent.`,
    `- GEO/AI-search friendly: clear direct answers, relevant entities, phrasing an AI engine could quote.`,
    `- Include an FAQ section (3-6 Q&A) only if it fits the topic.`,
    `- Do NOT invent prices, statistics, or facts that are not in this brief. If unsure, speak generally.`,
    `- Output clean HTML suitable for WordPress: use <h2>,<h3>,<p>,<ul>,<ol>,<li>,<strong>,<a>. No <script>, no inline styles, no <html>/<body> wrapper, no images.`,
    anchorLines.length ? `Links to include (REQUIRED ones MUST appear as real <a href> links in the body):` : '',
    ...anchorLines,
    ``,
    `Return ONLY valid JSON (no markdown fences, no text outside the JSON), exactly:`,
    `{"title":"...","slug":"...","metaTitle":"...","metaDescription":"...","excerpt":"...","contentHtml":"...","contentMarkdown":"...","faq":[{"question":"...","answer":"..."}],"imagePrompt":"...","anchorsPlaced":[{"anchorText":"...","targetUrl":"...","placed":true}],"warnings":[]}`,
    `- title: compelling ${lang} title. slug: url-safe (lowercase, hyphens).`,
    `- metaTitle: <= 60 chars. metaDescription: <= 155 chars. excerpt: 1-2 sentences.`,
    `- contentHtml: the full article body as HTML. contentMarkdown: same content as Markdown.`,
    `- imagePrompt: a short prompt for a future featured image (do NOT generate an image).`,
  ].filter(Boolean).join('\n')
}

function str(v: unknown): string {
  return typeof v === 'string' ? v : ''
}

export async function generateArticleWithGemini(brief: ArticleBrief): Promise<ArticleGenResult> {
  const client = getGeminiClient()
  if (!client) {
    return { error: process.env.GEMINI_API_KEY ? 'gemini_init_failed' : 'missing_gemini_api_key' }
  }

  const modelName = process.env.GEMINI_CLASSIFIER_MODEL || 'gemini-2.5-flash-lite'
  try {
    const model = client.getGenerativeModel({
      model: modelName,
      generationConfig: { responseMimeType: 'application/json', temperature: 0.8 },
    })
    const result = await model.generateContent(buildArticlePrompt(brief))
    const text = result.response.text()

    let parsed: Record<string, unknown>
    try {
      parsed = JSON.parse(text)
    } catch {
      const m = text.match(/\{[\s\S]*\}/)
      if (!m) return { error: 'gemini_no_json' }
      parsed = JSON.parse(m[0])
    }

    const title = str(parsed.title).trim()
    const contentHtml = str(parsed.contentHtml).trim()
    if (!title || !contentHtml) return { error: 'gemini_missing_required_fields' }

    const faqRaw = Array.isArray(parsed.faq) ? parsed.faq : []
    const faq: GeneratedArticleFaq[] = faqRaw
      .map((f) => ({ question: str((f as Record<string, unknown>)?.question).trim(), answer: str((f as Record<string, unknown>)?.answer).trim() }))
      .filter((f) => f.question && f.answer)
      .slice(0, 10)

    const warnings = Array.isArray(parsed.warnings)
      ? (parsed.warnings as unknown[]).filter((w): w is string => typeof w === 'string')
      : []

    // Token usage (best-effort — shape may vary by SDK version).
    const um = (result.response as { usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number } }).usageMetadata
    const usage: GeminiUsage | null = um
      ? { model: modelName, inputTokens: um.promptTokenCount ?? 0, outputTokens: um.candidatesTokenCount ?? 0 }
      : null

    return {
      article: {
        title,
        slug: str(parsed.slug).trim(),
        metaTitle: str(parsed.metaTitle).trim(),
        metaDescription: str(parsed.metaDescription).trim(),
        excerpt: str(parsed.excerpt).trim(),
        contentHtml,
        contentMarkdown: str(parsed.contentMarkdown),
        faq,
        imagePrompt: str(parsed.imagePrompt).trim(),
        warnings,
      },
      usage,
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[content-article-generation] gemini error', { message: msg })
    return { error: 'gemini_request_failed' }
  }
}
