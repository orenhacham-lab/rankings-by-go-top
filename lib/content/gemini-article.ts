/**
 * Gemini-backed full SEO/GEO article generation (content module, Phase 3A
 * hardening).
 *
 * Reuses the SAME Gemini client/env as topic suggestions. Enforces real article
 * structure (>=4 H2, paragraphs, length), brand/CTA gating, required-anchor
 * placement (with a repair retry), and an English slug. Never returns a
 * fake-success article: structurally-invalid or missing-required-anchor results
 * become a clear error.
 */

import { getGeminiClient } from '@/lib/ai-visibility/gemini-semantic-classifier'
import { sanitizeArticleHtml } from '@/lib/content/article-html'
import { validateAnchorPlacement, type AnchorValidation } from '@/lib/content/anchors-check'
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
  includeBrandName: boolean
  anchors: ArticleTopicAnchor[]
  businessName: string | null
  domain: string | null
  category: string | null
}

export interface GeneratedArticleFaq { question: string; answer: string }

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

export interface GeminiUsage { model: string; inputTokens: number; outputTokens: number }

const TONE_HINT: Record<string, string> = {
  professional: 'professional and credible', marketing: 'persuasive marketing',
  casual: 'light and casual', luxury: 'premium / upscale', informative: 'informative and neutral',
}
const CTA_HINT: Record<string, string> = {
  gentle: 'a gentle call-to-action', contact: 'a "contact us" call-to-action',
  whatsapp: 'a WhatsApp/phone call-to-action', marketing: 'a stronger marketing call-to-action',
}

interface GenOpts { strengthen?: boolean; repairAnchors?: ArticleTopicAnchor[] }

function buildArticlePrompt(brief: ArticleBrief, opts: GenOpts): string {
  const lang = brief.language === 'he' ? 'Hebrew' : 'English'
  const tone = (brief.toneOfVoice && TONE_HINT[brief.toneOfVoice]) || 'professional and credible'
  const words = brief.desiredWordCount || 1000
  const lo = Math.round(words * 0.85)
  const hi = Math.round(words * 1.2)

  const ctaLine = brief.ctaPreference === 'none' || !brief.ctaPreference
    ? 'Do NOT include any call-to-action.'
    : `End with ${CTA_HINT[brief.ctaPreference] || 'a gentle call-to-action'}.`

  const brandLine = brief.includeBrandName && brief.businessName
    ? `You MAY mention the business name "${brief.businessName}" naturally and subtly (do not overuse it).`
    : 'Do NOT mention any business or brand name.'

  const anchorList = brief.anchors
    .filter((a) => a.anchor_text?.trim() && a.target_url?.trim())
    .map((a) => `  - ${a.required ? '[REQUIRED]' : '[optional]'} link the exact text "${a.anchor_text}" to ${a.target_url}` + (a.note ? ` (context: ${a.note})` : ''))

  const repairList = (opts.repairAnchors || [])
    .filter((a) => a.anchor_text?.trim() && a.target_url?.trim())
    .map((a) => `  - <a href="${a.target_url}">${a.anchor_text}</a>`)

  return [
    opts.strengthen ? `Your previous response did not meet the required article structure (needs at least 4 <h2> sections, real <p> paragraphs, and the correct length). Regenerate a proper, well-structured article.` : '',
    `You are an expert SEO/GEO content writer. Write a COMPLETE, high-quality article in ${lang}.`,
    ``,
    `Topic: ${brief.topic}`,
    brief.primaryKeyword ? `Primary keyword: "${brief.primaryKeyword}" — use it naturally, no stuffing.` : '',
    brief.secondaryKeywords.length ? `Secondary keywords (weave in naturally): ${brief.secondaryKeywords.join(', ')}.` : '',
    brief.searchIntent ? `Search intent: ${brief.searchIntent}.` : '',
    brief.targetAudience ? `Target audience: ${brief.targetAudience}.` : '',
    brief.category ? `Field: ${brief.category}.` : '',
    brief.briefNotes ? `Extra instructions: ${brief.briefNotes}` : '',
    `Tone: ${tone}. Length: about ${words} words (between ${lo} and ${hi}).`,
    brandLine,
    ctaLine,
    ``,
    `STRUCTURE (mandatory):`,
    `- Do NOT include an <h1> — the title is stored separately.`,
    `- The body MUST contain AT LEAST 4 <h2> section headings, and use <h3> where helpful.`,
    `- Each <h2> is followed by 1-3 real <p> paragraphs. Use <ul>/<ol> lists where appropriate.`,
    `- Do NOT return one long text block or line breaks only.`,
    `- Give useful, specific content matching the search intent; GEO/AI-friendly with clear direct answers and relevant entities.`,
    `- Include an FAQ (3-6 Q&A) if it fits, and mirror it in the "faq" JSON field.`,
    `- Do NOT invent prices, statistics or facts not given in this brief.`,
    `- Clean HTML only: <h2>,<h3>,<p>,<ul>,<ol>,<li>,<strong>,<a>. No <script>, no inline styles, no <html>/<body>, no images.`,
    anchorList.length ? `Links to include (REQUIRED ones MUST appear as real clickable <a href> links in the body):` : '',
    ...anchorList,
    repairList.length ? `You MUST insert these REQUIRED links naturally into the body:` : '',
    ...repairList,
    ``,
    `Return ONLY valid JSON (no markdown fences, no text outside the JSON):`,
    `{"title":"...","slug":"...","metaTitle":"...","metaDescription":"...","excerpt":"...","contentHtml":"...","contentMarkdown":"...","faq":[{"question":"...","answer":"..."}],"imagePrompt":"...","anchorsPlaced":[{"anchorText":"...","targetUrl":"...","placed":true}],"warnings":[]}`,
    `- title: compelling ${lang} title. slug: MUST be in English — translate the concept, NEVER transliterate Hebrew; lowercase, hyphen-separated.`,
    `- metaTitle <= 60 chars. metaDescription <= 155 chars. excerpt: 1-2 sentences. contentMarkdown: same content as Markdown.`,
    `- imagePrompt: a short prompt for a future featured image, written in ${lang} (do NOT generate an image).`,
  ].filter(Boolean).join('\n')
}

function str(v: unknown): string { return typeof v === 'string' ? v : '' }

// -- structure validation ---------------------------------------------------

export interface StructureCheck {
  ok: boolean
  issues: string[]
  h2Count: number
  pCount: number
  wordCount: number
}

function countTag(html: string, tag: string): number {
  const m = html.match(new RegExp(`<${tag}[\\s>]`, 'gi'))
  return m ? m.length : 0
}
function textFromHtml(html: string): string {
  return html.replace(/<[^>]+>/g, ' ').replace(/&[a-z]+;/gi, ' ').replace(/\s+/g, ' ').trim()
}

export function validateArticleStructure(
  html: string,
  opts: { language: SuggestionLanguage; desiredWordCount: number }
): StructureCheck {
  const issues: string[] = []
  const h2Count = countTag(html, 'h2')
  const pCount = countTag(html, 'p')
  const text = textFromHtml(html)
  const wordCount = text ? text.split(/\s+/).length : 0

  if (h2Count < 4) issues.push('too_few_h2')
  if (pCount < 8) issues.push('too_few_paragraphs')
  if (wordCount < Math.round(opts.desiredWordCount * 0.7)) issues.push('too_short')

  if (opts.language === 'he') {
    const hebrew = (text.match(/[֐-׿]/g) || []).length
    const latin = (text.match(/[A-Za-z]/g) || []).length
    if (hebrew < latin) issues.push('wrong_language')
  }

  return { ok: issues.length === 0, issues, h2Count, pCount, wordCount }
}

// -- English slug -----------------------------------------------------------

/** Best-effort English slug; returns '' when it can't produce a real one. */
export function toEnglishSlug(geminiSlug: string, primaryKeyword: string | null, _title: string): string {
  const clean = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').replace(/-{2,}/g, '-').slice(0, 80)
  const a = clean(geminiSlug || '')
  if (a.length >= 3 && /[a-z]/.test(a)) return a
  const b = clean(primaryKeyword || '')
  if (b.length >= 3 && /[a-z]/.test(b)) return b
  return ''
}

// -- generation -------------------------------------------------------------

async function callGemini(brief: ArticleBrief, opts: GenOpts): Promise<{ article: GeneratedArticleContent; usage: GeminiUsage | null } | { error: string }> {
  const client = getGeminiClient()
  if (!client) return { error: process.env.GEMINI_API_KEY ? 'gemini_init_failed' : 'missing_gemini_api_key' }
  const modelName = process.env.GEMINI_CLASSIFIER_MODEL || 'gemini-2.5-flash-lite'
  try {
    const model = client.getGenerativeModel({ model: modelName, generationConfig: { responseMimeType: 'application/json', temperature: 0.8 } })
    const result = await model.generateContent(buildArticlePrompt(brief, opts))
    const text = result.response.text()
    let parsed: Record<string, unknown>
    try { parsed = JSON.parse(text) } catch {
      const m = text.match(/\{[\s\S]*\}/)
      if (!m) return { error: 'gemini_no_json' }
      parsed = JSON.parse(m[0])
    }
    const title = str(parsed.title).trim()
    const contentHtml = str(parsed.contentHtml).trim()
    if (!title || !contentHtml) return { error: 'gemini_missing_required_fields' }

    const faq = (Array.isArray(parsed.faq) ? parsed.faq : [])
      .map((f) => ({ question: str((f as Record<string, unknown>)?.question).trim(), answer: str((f as Record<string, unknown>)?.answer).trim() }))
      .filter((f) => f.question && f.answer).slice(0, 10)
    const warnings = Array.isArray(parsed.warnings) ? (parsed.warnings as unknown[]).filter((w): w is string => typeof w === 'string') : []

    const um = (result.response as { usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number } }).usageMetadata
    const usage: GeminiUsage | null = um ? { model: modelName, inputTokens: um.promptTokenCount ?? 0, outputTokens: um.candidatesTokenCount ?? 0 } : null

    return {
      article: {
        title, slug: str(parsed.slug).trim(), metaTitle: str(parsed.metaTitle).trim(),
        metaDescription: str(parsed.metaDescription).trim(), excerpt: str(parsed.excerpt).trim(),
        contentHtml, contentMarkdown: str(parsed.contentMarkdown), faq, imagePrompt: str(parsed.imagePrompt).trim(), warnings,
      },
      usage,
    }
  } catch (err) {
    console.error('[content-article-generation] gemini error', { message: err instanceof Error ? err.message : String(err) })
    return { error: 'gemini_request_failed' }
  }
}

export interface ValidatedArticle {
  article: GeneratedArticleContent
  safeHtml: string
  slug: string
  usage: GeminiUsage | null
  anchorValidation: AnchorValidation
  structure: StructureCheck
}

/**
 * Generate a structurally-valid article with required anchors placed.
 * Retries once for structure, once to repair missing required anchors.
 * Returns { error } (never a fake-success draft) when it cannot comply.
 */
export async function generateValidatedArticle(brief: ArticleBrief): Promise<ValidatedArticle | { error: string }> {
  const language = brief.language
  const desired = brief.desiredWordCount || 1000

  // Structure pass (attempt, then a strengthened retry).
  let best: { article: GeneratedArticleContent; usage: GeminiUsage | null; safe: string; structure: StructureCheck } | null = null
  for (const strengthen of [false, true]) {
    const g = await callGemini(brief, { strengthen })
    if ('error' in g) { if (!best) continue; else break }
    const safe = sanitizeArticleHtml(g.article.contentHtml)
    const structure = validateArticleStructure(safe, { language, desiredWordCount: desired })
    best = { article: g.article, usage: g.usage, safe, structure }
    if (structure.ok) break
  }
  if (!best) return { error: 'gemini_request_failed' }
  if (!best.safe) return { error: 'empty_after_sanitize' }
  if (!best.structure.ok) return { error: 'article_structure_invalid' }

  // Required-anchor pass (repair retry if any required anchor is missing).
  let safe = best.safe
  let anchorValidation = validateAnchorPlacement(brief.anchors, safe)
  if (anchorValidation.hasBlockingIssues) {
    const missing = anchorValidation.missingRequired.map((a) => ({ anchor_text: a.anchorText, target_url: a.targetUrl, required: true, type: a.type, note: '' }))
    const repair = await callGemini(brief, { repairAnchors: missing })
    if ('article' in repair) {
      const rSafe = sanitizeArticleHtml(repair.article.contentHtml)
      const rStruct = validateArticleStructure(rSafe, { language, desiredWordCount: desired })
      const rAnchors = validateAnchorPlacement(brief.anchors, rSafe)
      if (rStruct.ok && !rAnchors.hasBlockingIssues) {
        best = { article: repair.article, usage: repair.usage, safe: rSafe, structure: rStruct }
        safe = rSafe
        anchorValidation = rAnchors
      }
    }
    if (anchorValidation.hasBlockingIssues) return { error: 'required_anchor_missing' }
  }

  const slug = toEnglishSlug(best.article.slug, brief.primaryKeyword, best.article.title)
  return { article: best.article, safeHtml: safe, slug, usage: best.usage, anchorValidation, structure: best.structure }
}
