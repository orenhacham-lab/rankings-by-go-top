/**
 * Gemini-backed full SEO/GEO article generation (content module, Phase 3A QA).
 *
 * Robust approach: Gemini returns a STRUCTURED article (intro/sections/
 * subsections/bullets/FAQ as data — not raw HTML), and the SERVER builds clean,
 * consistent HTML deterministically. This removes any dependence on Gemini
 * emitting well-formed HTML, and guarantees real <h2>/<h3>/<p>/<ul> structure.
 *
 * Reuses the SAME Gemini client/env as topic suggestions. Article model is
 * GEMINI_ARTICLE_MODEL (falls back to GEMINI_CLASSIFIER_MODEL to avoid breaking
 * production). Enforces a per-length quality gate, brand/CTA gating, required-
 * anchor placement, and an English slug. Never returns a fake-success article.
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
  brandNameToInclude: string | null
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

interface Subsection { heading: string; paragraphs: string[] }
interface Section { heading: string; paragraphs: string[]; bullets: string[]; subsections: Subsection[] }
interface StructuredArticle {
  title: string; slug: string; metaTitle: string; metaDescription: string; excerpt: string
  intro: string[]; sections: Section[]; faq: GeneratedArticleFaq[]; imagePrompt: string; warnings: string[]
}

const TONE_HINT: Record<string, string> = {
  professional: 'professional and credible', marketing: 'persuasive marketing',
  casual: 'light and casual', luxury: 'premium / upscale', informative: 'informative and neutral',
}
const CTA_HINT: Record<string, string> = {
  gentle: 'a gentle call-to-action', contact: 'a "contact us" call-to-action',
  whatsapp: 'a WhatsApp/phone call-to-action', marketing: 'a stronger marketing call-to-action',
}

function articleModel(): string {
  return process.env.GEMINI_ARTICLE_MODEL || process.env.GEMINI_CLASSIFIER_MODEL || 'gemini-2.5-flash-lite'
}

// -- per-length quality thresholds -----------------------------------------

export interface QualityThresholds { minH2: number; minParagraphs: number; minFaq: number; minLists: number }
export function qualityThresholds(desired: number): QualityThresholds {
  if (desired <= 500) return { minH2: 3, minParagraphs: 5, minFaq: 0, minLists: 0 }
  if (desired <= 1000) return { minH2: 5, minParagraphs: 10, minFaq: 3, minLists: 1 }
  if (desired <= 1500) return { minH2: 6, minParagraphs: 14, minFaq: 4, minLists: 1 }
  return { minH2: 8, minParagraphs: 18, minFaq: 5, minLists: 1 }
}

// -- prompt -----------------------------------------------------------------

interface GenOpts { strengthen?: boolean }

function buildPrompt(brief: ArticleBrief, opts: GenOpts): string {
  const lang = brief.language === 'he' ? 'Hebrew' : 'English'
  const tone = (brief.toneOfVoice && TONE_HINT[brief.toneOfVoice]) || 'professional and credible'
  const words = brief.desiredWordCount || 1000
  const th = qualityThresholds(words)

  const ctaLine = brief.ctaPreference === 'none' || !brief.ctaPreference
    ? 'Do NOT include any call-to-action anywhere.'
    : `Include ${CTA_HINT[brief.ctaPreference] || 'a gentle call-to-action'} in the LAST section's paragraphs.`
  const brandName = (brief.brandNameToInclude || '').trim()
  const brandLine = brief.includeBrandName && brandName
    ? `You MAY mention the business/brand name "${brandName}" naturally and subtly.`
    : 'Do NOT mention any business or brand name.'
  const anchorTopics = brief.anchors
    .filter((a) => a.anchor_text?.trim() && a.target_url?.trim())
    .map((a) => `  - naturally discuss and use the phrase "${a.anchor_text}"` + (a.note ? ` (${a.note})` : ''))

  return [
    opts.strengthen ? `Your previous article was too thin or unstructured. Produce a RICHER, longer, well-sectioned article that meets every minimum below.` : '',
    `You are an expert SEO/GEO content writer. Produce a COMPLETE, high-quality, PROMOTIONAL-yet-credible article in ${lang}.`,
    ``,
    `Topic: ${brief.topic}`,
    brief.primaryKeyword ? `Primary keyword: "${brief.primaryKeyword}" — use it naturally, no stuffing.` : '',
    brief.secondaryKeywords.length ? `Secondary keywords (weave in naturally): ${brief.secondaryKeywords.join(', ')}.` : '',
    brief.searchIntent ? `Search intent: ${brief.searchIntent}.` : '',
    brief.targetAudience ? `Target audience: ${brief.targetAudience}.` : '',
    brief.category ? `Field: ${brief.category}.` : '',
    brief.briefNotes ? `Extra instructions: ${brief.briefNotes}` : '',
    `Tone: ${tone}. Total length: about ${words} words (between ${Math.round(words * 0.85)} and ${Math.round(words * 1.2)}).`,
    brandLine,
    ctaLine,
    ``,
    `Write for BOTH Google SEO and AI/GEO answer engines:`,
    `- Start with a short intro that says what the reader will get, and give a DIRECT answer to the main question early.`,
    `- Clear section structure; short, readable paragraphs; practical specifics (not vague filler).`,
    `- Relevant entities; phrasing an AI engine could quote; cover common questions in the FAQ.`,
    `- Do NOT invent prices, statistics or facts not in this brief.`,
    anchorTopics.length ? `Make sure to naturally use these exact phrases somewhere in the body (they will become links):` : '',
    ...anchorTopics,
    ``,
    `MINIMUMS (mandatory):`,
    `- At least ${th.minH2} sections (each a distinct <h2> topic).`,
    `- At least ${th.minParagraphs} paragraphs total across intro + sections + subsections.`,
    th.minLists ? `- At least ${th.minLists} bulleted list where it helps.` : '',
    th.minFaq ? `- An FAQ of ${th.minFaq}-${th.minFaq + 2} question/answer pairs.` : '',
    `- Use subsections (h3) inside broader sections where helpful.`,
    ``,
    `Return ONLY valid JSON (no markdown, no text outside the JSON) as STRUCTURED DATA (NOT html):`,
    `{`,
    `  "title":"...","slug":"...","metaTitle":"...","metaDescription":"...","excerpt":"...",`,
    `  "intro":["paragraph","paragraph"],`,
    `  "sections":[{"heading":"...","paragraphs":["...","..."],"bullets":["...","..."],"subsections":[{"heading":"...","paragraphs":["..."]}]}],`,
    `  "faq":[{"question":"...","answer":"..."}],`,
    `  "imagePrompt":"...","warnings":[]`,
    `}`,
    `- Every paragraph is PLAIN TEXT (no HTML tags). bullets/subsections are optional per section.`,
    `- title: compelling ${lang} title. slug: MUST be English — translate the concept, NEVER transliterate Hebrew; lowercase, hyphens.`,
    `- metaTitle <= 60 chars. metaDescription <= 155 chars. excerpt: 1-2 sentences. imagePrompt in ${lang}.`,
  ].filter(Boolean).join('\n')
}

// -- structured → HTML/Markdown --------------------------------------------

function esc(s: string): string {
  return (s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}
function pTag(text: string): string { const t = (text || '').trim(); return t ? `<p>${esc(t)}</p>` : '' }

function buildHtml(a: StructuredArticle, language: SuggestionLanguage): string {
  const out: string[] = []
  for (const intro of a.intro || []) { const t = pTag(intro); if (t) out.push(t) }
  for (const s of a.sections || []) {
    if (s.heading?.trim()) out.push(`<h2>${esc(s.heading.trim())}</h2>`)
    for (const para of s.paragraphs || []) { const t = pTag(para); if (t) out.push(t) }
    const bullets = (s.bullets || []).map((b) => (b || '').trim()).filter(Boolean)
    if (bullets.length) out.push(`<ul>${bullets.map((b) => `<li>${esc(b)}</li>`).join('')}</ul>`)
    for (const sub of s.subsections || []) {
      if (sub.heading?.trim()) out.push(`<h3>${esc(sub.heading.trim())}</h3>`)
      for (const para of sub.paragraphs || []) { const t = pTag(para); if (t) out.push(t) }
    }
  }
  if ((a.faq || []).length) {
    out.push(`<h2>${language === 'he' ? 'שאלות נפוצות' : 'Frequently Asked Questions'}</h2>`)
    for (const f of a.faq) {
      if (f.question?.trim() && f.answer?.trim()) { out.push(`<h3>${esc(f.question.trim())}</h3>`); const t = pTag(f.answer); if (t) out.push(t) }
    }
  }
  return out.join('\n')
}

function buildMarkdown(a: StructuredArticle, language: SuggestionLanguage): string {
  const out: string[] = []
  for (const intro of a.intro || []) if (intro?.trim()) out.push(intro.trim())
  for (const s of a.sections || []) {
    if (s.heading?.trim()) out.push(`## ${s.heading.trim()}`)
    for (const para of s.paragraphs || []) if (para?.trim()) out.push(para.trim())
    for (const b of (s.bullets || []).map((x) => (x || '').trim()).filter(Boolean)) out.push(`- ${b}`)
    for (const sub of s.subsections || []) {
      if (sub.heading?.trim()) out.push(`### ${sub.heading.trim()}`)
      for (const para of sub.paragraphs || []) if (para?.trim()) out.push(para.trim())
    }
  }
  if ((a.faq || []).length) {
    out.push(`## ${language === 'he' ? 'שאלות נפוצות' : 'Frequently Asked Questions'}`)
    for (const f of a.faq) if (f.question?.trim() && f.answer?.trim()) { out.push(`### ${f.question.trim()}`); out.push(f.answer.trim()) }
  }
  return out.join('\n\n')
}

// -- counts + quality gate --------------------------------------------------

export interface StructureCounts { h2: number; h3: number; p: number; li: number; words: number; faq: number }
function countTag(html: string, tag: string): number { const m = html.match(new RegExp(`<${tag}[\\s>]`, 'gi')); return m ? m.length : 0 }
function textOf(html: string): string { return html.replace(/<[^>]+>/g, ' ').replace(/&[a-z]+;/gi, ' ').replace(/\s+/g, ' ').trim() }

export function countStructure(html: string, faqCount: number): StructureCounts {
  const text = textOf(html)
  return { h2: countTag(html, 'h2'), h3: countTag(html, 'h3'), p: countTag(html, 'p'), li: countTag(html, 'li'), words: text ? text.split(/\s+/).length : 0, faq: faqCount }
}

export interface QualityResult { ok: boolean; issues: string[]; warnings: string[]; counts: StructureCounts }
export function evaluateQuality(html: string, faqCount: number, opts: { language: SuggestionLanguage; desiredWordCount: number }): QualityResult {
  const th = qualityThresholds(opts.desiredWordCount)
  const counts = countStructure(html, faqCount)
  const issues: string[] = []
  const warnings: string[] = []

  if (counts.h2 < th.minH2) issues.push('too_few_h2')
  if (counts.p < th.minParagraphs) issues.push('too_few_paragraphs')
  if (th.minLists && countTag(html, 'ul') + countTag(html, 'ol') < th.minLists) warnings.push('no_list')
  if (th.minFaq && faqCount < th.minFaq) warnings.push('too_few_faq')

  const ratio = counts.words / opts.desiredWordCount
  if (ratio < 0.7) issues.push('too_short')
  else if (ratio < 0.85) warnings.push('slightly_short')

  if (opts.language === 'he') {
    const t = textOf(html)
    const hebrew = (t.match(/[֐-׿]/g) || []).length
    const latin = (t.match(/[A-Za-z]/g) || []).length
    if (hebrew < latin) issues.push('wrong_language')
  }
  return { ok: issues.length === 0, issues, warnings, counts }
}

// -- English slug -----------------------------------------------------------

export function toEnglishSlug(geminiSlug: string, primaryKeyword: string | null): string {
  const clean = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').replace(/-{2,}/g, '-').slice(0, 80)
  const a = clean(geminiSlug || '')
  if (a.length >= 3 && /[a-z]/.test(a)) return a
  const b = clean(primaryKeyword || '')
  if (b.length >= 3 && /[a-z]/.test(b)) return b
  return ''
}

// -- deterministic anchor insertion ----------------------------------------

function escAttr(s: string): string { return s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;') }
function insertAnchors(html: string, missing: { anchorText: string; targetUrl: string }[], language: SuggestionLanguage): string {
  let out = html
  for (const a of missing) {
    const text = (a.anchorText || '').trim(); const url = (a.targetUrl || '').trim()
    if (!text || !/^https?:\/\//i.test(url)) continue
    const parts = out.split(/(<[^>]+>)/); let placed = false; let insideLink = false
    for (let i = 0; i < parts.length; i++) {
      const seg = parts[i]
      if (seg.startsWith('<')) { if (/^<a[\s>]/i.test(seg)) insideLink = true; else if (/^<\/a>/i.test(seg)) insideLink = false; continue }
      if (insideLink) continue
      const idx = seg.toLowerCase().indexOf(text.toLowerCase())
      if (idx >= 0) { parts[i] = `${seg.slice(0, idx)}<a href="${escAttr(url)}">${seg.slice(idx, idx + text.length)}</a>${seg.slice(idx + text.length)}`; out = parts.join(''); placed = true; break }
    }
    if (placed) continue
    const lead = language === 'he' ? 'למידע נוסף: ' : 'Learn more: '
    out = `${out}\n<p>${lead}<a href="${escAttr(url)}">${escAttr(text)}</a></p>`
  }
  return out
}

// -- generation -------------------------------------------------------------

function str(v: unknown): string { return typeof v === 'string' ? v : '' }
function strArr(v: unknown): string[] { return Array.isArray(v) ? v.map(str).map((s) => s.trim()).filter(Boolean) : [] }

function parseStructured(parsed: Record<string, unknown>): StructuredArticle {
  const sections: Section[] = Array.isArray(parsed.sections) ? (parsed.sections as Record<string, unknown>[]).map((s) => ({
    heading: str(s?.heading), paragraphs: strArr(s?.paragraphs), bullets: strArr(s?.bullets),
    subsections: Array.isArray(s?.subsections) ? (s.subsections as Record<string, unknown>[]).map((ss) => ({ heading: str(ss?.heading), paragraphs: strArr(ss?.paragraphs) })) : [],
  })) : []
  const faq: GeneratedArticleFaq[] = Array.isArray(parsed.faq) ? (parsed.faq as Record<string, unknown>[])
    .map((f) => ({ question: str(f?.question).trim(), answer: str(f?.answer).trim() })).filter((f) => f.question && f.answer).slice(0, 10) : []
  return {
    title: str(parsed.title).trim(), slug: str(parsed.slug).trim(), metaTitle: str(parsed.metaTitle).trim(),
    metaDescription: str(parsed.metaDescription).trim(), excerpt: str(parsed.excerpt).trim(),
    intro: strArr(parsed.intro), sections, faq, imagePrompt: str(parsed.imagePrompt).trim(),
    warnings: Array.isArray(parsed.warnings) ? (parsed.warnings as unknown[]).filter((w): w is string => typeof w === 'string') : [],
  }
}

async function callGemini(brief: ArticleBrief, opts: GenOpts): Promise<{ structured: StructuredArticle; usage: GeminiUsage | null } | { error: string }> {
  const client = getGeminiClient()
  if (!client) return { error: process.env.GEMINI_API_KEY ? 'gemini_init_failed' : 'missing_gemini_api_key' }
  const modelName = articleModel()
  try {
    const model = client.getGenerativeModel({ model: modelName, generationConfig: { responseMimeType: 'application/json', temperature: 0.8 } })
    const result = await model.generateContent(buildPrompt(brief, opts))
    const text = result.response.text()
    let parsed: Record<string, unknown>
    try { parsed = JSON.parse(text) } catch { const m = text.match(/\{[\s\S]*\}/); if (!m) return { error: 'gemini_no_json' }; parsed = JSON.parse(m[0]) }
    const structured = parseStructured(parsed)
    if (!structured.title || (structured.intro.length === 0 && structured.sections.length === 0)) return { error: 'gemini_missing_required_fields' }
    const um = (result.response as { usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number } }).usageMetadata
    const usage: GeminiUsage | null = um ? { model: modelName, inputTokens: um.promptTokenCount ?? 0, outputTokens: um.candidatesTokenCount ?? 0 } : null
    return { structured, usage }
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
  quality: QualityResult
  model: string
  rawCounts: StructureCounts
}

/**
 * Generate a structured article, build clean HTML, enforce the per-length
 * quality gate (one strengthened retry) and required anchors. Returns { error }
 * (never a fake-success draft) when it cannot comply.
 */
export async function generateValidatedArticle(brief: ArticleBrief): Promise<ValidatedArticle | { error: string; reason?: string }> {
  const language = brief.language
  const desired = brief.desiredWordCount || 1000
  const model = articleModel()

  let best: { structured: StructuredArticle; usage: GeminiUsage | null; raw: string; safe: string; quality: QualityResult; rawCounts: StructureCounts } | null = null

  for (const strengthen of [false, true]) {
    const g = await callGemini(brief, { strengthen })
    if ('error' in g) { if (!best) continue; else break }
    const rawHtml = buildHtml(g.structured, language)
    const rawCounts = countStructure(rawHtml, g.structured.faq.length)
    const safe = sanitizeArticleHtml(rawHtml)
    const quality = evaluateQuality(safe, g.structured.faq.length, { language, desiredWordCount: desired })
    console.log(`[content-article-generation] ${strengthen ? 'retry ' : ''}raw h2=${rawCounts.h2} h3=${rawCounts.h3} p=${rawCounts.p} words=${rawCounts.words} faq=${rawCounts.faq}`)
    console.log(`[content-article-generation] ${strengthen ? 'retry ' : ''}quality passed=${quality.ok} issues=[${quality.issues.join(',')}]`)
    best = { structured: g.structured, usage: g.usage, raw: rawHtml, safe, quality, rawCounts }
    if (quality.ok) break
  }

  if (!best) return { error: 'Article generation failed', reason: 'gemini_request_failed' }
  if (!best.safe) return { error: 'Article generation failed', reason: 'empty_after_sanitize' }
  if (!best.quality.ok) return { error: 'Article generation failed', reason: 'article_quality_gate_failed' }

  // Required anchors — deterministic insertion on the built HTML.
  let safe = best.safe
  let anchorValidation = validateAnchorPlacement(brief.anchors, safe)
  if (anchorValidation.hasBlockingIssues) {
    const missing = anchorValidation.missingRequired.map((a) => ({ anchorText: a.anchorText, targetUrl: a.targetUrl }))
    const inserted = sanitizeArticleHtml(insertAnchors(safe, missing, language))
    const reAnchors = validateAnchorPlacement(brief.anchors, inserted)
    if (!reAnchors.hasBlockingIssues) { safe = inserted; anchorValidation = reAnchors }
    if (anchorValidation.hasBlockingIssues) return { error: 'Article generation failed', reason: 'required_anchor_missing' }
  }

  const a = best.structured
  const article: GeneratedArticleContent = {
    title: a.title, slug: a.slug, metaTitle: a.metaTitle, metaDescription: a.metaDescription, excerpt: a.excerpt,
    contentHtml: safe, contentMarkdown: buildMarkdown(a, language), faq: a.faq, imagePrompt: a.imagePrompt, warnings: [...a.warnings, ...best.quality.warnings],
  }
  return { article, safeHtml: safe, slug: toEnglishSlug(a.slug, brief.primaryKeyword), usage: best.usage, anchorValidation, quality: best.quality, model, rawCounts: best.rawCounts }
}
