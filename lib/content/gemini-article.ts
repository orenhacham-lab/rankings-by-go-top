/**
 * Gemini-backed premium SEO/GEO article generation (content module, Phase 3A
 * Article Quality Upgrade).
 *
 * Gemini returns STRUCTURED data only; the SERVER builds clean HTML (TOC,
 * direct answer, answer-first sections, tables, lists, FAQ). A Yoast/Rank-Math-
 * inspired audit (lib/content/article-audit) gates saving: on blockers, one
 * repair pass runs; if blockers remain, nothing is saved. Article model is
 * GEMINI_ARTICLE_MODEL (default gemini-2.5-pro), independent of the classifier/
 * topic-suggestions model. No Anthropic.
 */

import { getGeminiClient } from '@/lib/ai-visibility/gemini-semantic-classifier'
import { sanitizeArticleHtml } from '@/lib/content/article-html'
import { validateAnchorPlacement } from '@/lib/content/anchors-check'
import { runArticleAudit, thresholdsFor, type AuditResult } from '@/lib/content/article-audit'
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
  // When true, build a manual <nav> table of contents into the HTML. Default
  // false — the article stays "TOC-ready" (clean H2/H3 + ids) so a WordPress
  // TOC plugin/theme can generate it.
  includeManualToc: boolean
  anchors: ArticleTopicAnchor[]
  businessName: string | null
  domain: string | null
  category: string | null
}

export interface GeneratedArticleFaq { question: string; answer: string }
export interface GeneratedArticleContent {
  title: string; slug: string; metaTitle: string; metaDescription: string; excerpt: string
  contentHtml: string; contentMarkdown: string; faq: GeneratedArticleFaq[]; imagePrompt: string; warnings: string[]
}
export interface GeminiUsage { model: string; inputTokens: number; outputTokens: number }

interface ArticleTable { caption: string; columns: string[]; rows: string[][] }
interface Subsection { heading: string; paragraphs: string[] }
interface Section { heading: string; answerFirst: string; paragraphs: string[]; bullets: string[]; table: ArticleTable | null; subsections: Subsection[] }
interface StructuredArticle {
  title: string; slug: string; metaTitle: string; metaDescription: string; excerpt: string
  directAnswer: string; intro: string[]; sections: Section[]; comparisonTables: ArticleTable[]
  faq: GeneratedArticleFaq[]; imagePrompt: string; warnings: string[]
}

const TONE_HINT: Record<string, string> = {
  professional: 'professional and credible', marketing: 'persuasive marketing',
  casual: 'light and casual', luxury: 'premium / upscale', informative: 'informative and neutral',
}
const CTA_HINT: Record<string, string> = {
  gentle: 'a gentle call-to-action', contact: 'a "contact us" call-to-action',
  whatsapp: 'a WhatsApp/phone call-to-action', marketing: 'a stronger marketing call-to-action',
}

export function articleModel(): { model: string; fellBack: boolean } {
  if (process.env.GEMINI_ARTICLE_MODEL) return { model: process.env.GEMINI_ARTICLE_MODEL, fellBack: false }
  return { model: process.env.GEMINI_CLASSIFIER_MODEL || 'gemini-2.5-pro', fellBack: true }
}

// -- prompt -----------------------------------------------------------------

interface GenOpts { repairFailures?: string[] }

const FAILURE_HINT: Record<string, string> = {
  enough_h2: 'add more distinct <h2> sections',
  enough_paragraphs: 'add more real paragraphs',
  enough_h3: 'add <h3> subsections inside broad sections',
  has_list: 'add at least one bulleted list',
  has_faq: 'add more FAQ question/answer pairs',
  faq_answers_have_value: 'expand short/thin FAQ answers to 40-90 words of real value',
  has_table: 'add a comparison/data table where it fits',
  table_recommended: 'this topic needs a real comparison/data table (>=2 columns, >=2 rows) — add one',
  table_structure_valid: 'fix the table to be a real table with >=2 columns and >=2 data rows',
  word_count: 'make the article substantially longer to meet the target length',
  word_count_band: 'make the article a bit longer',
  has_transition_words: 'use more natural transition words',
  paragraphs_not_too_long: 'break long paragraphs into shorter ones (2-4 sentences)',
  varied_sentence_starts: 'vary how sentences begin',
  primary_keyword_in_intro: 'include the primary keyword naturally in the first paragraphs',
  primary_keyword_in_h2: 'include the primary keyword naturally in at least one <h2>',
  primary_keyword_in_meta: 'include the primary keyword in metaTitle/metaDescription',
  meta_description_length: 'make metaDescription 120-160 characters',
  no_cta_when_disabled: 'REMOVE every call-to-action',
  no_brand_when_disabled: 'REMOVE any business/brand name',
  has_early_answer: 'add a clear direct answer in the first paragraph',
  not_generic: 'add practical value: examples, common mistakes, a checklist, or decision criteria',
}

function buildPrompt(brief: ArticleBrief, opts: GenOpts): string {
  const lang = brief.language === 'he' ? 'Hebrew' : 'English'
  const tone = (brief.toneOfVoice && TONE_HINT[brief.toneOfVoice]) || 'professional and credible'
  const words = brief.desiredWordCount || 1000
  const th = thresholdsFor(words)
  const ctaLine = brief.ctaPreference === 'none' || !brief.ctaPreference
    ? 'Do NOT include any call-to-action anywhere.'
    : `Include ${CTA_HINT[brief.ctaPreference] || 'a gentle call-to-action'} only at the end.`
  const brandName = (brief.brandNameToInclude || '').trim()
  const brandLine = brief.includeBrandName && brandName
    ? `You MAY mention the business/brand name "${brandName}" naturally and subtly.`
    : 'Do NOT mention any business or brand name.'
  const anchorTopics = brief.anchors
    .filter((a) => a.anchor_text?.trim() && a.target_url?.trim())
    .map((a) => `  - naturally use the exact phrase "${a.anchor_text}"` + (a.note ? ` (${a.note})` : ''))
  const repairLines = (opts.repairFailures || []).map((f) => `  - ${FAILURE_HINT[f] || f}`)

  return [
    repairLines.length ? `Your previous draft failed these quality checks — fix ALL of them while keeping the good parts:` : '',
    ...repairLines,
    repairLines.length ? '' : '',
    `You are a top SEO/GEO content writer. Write a COMPLETE, premium, PROMOTIONAL-yet-credible article in ${lang} that would score high in Yoast / Rank Math and be quoted by AI answer engines.`,
    ``,
    `Topic: ${brief.topic}`,
    brief.primaryKeyword ? `Primary keyword: "${brief.primaryKeyword}" — MUST appear in title, metaTitle, metaDescription, the first paragraph, and at least one <h2>; used naturally throughout (no stuffing, ~0.8-1.5% density).` : '',
    brief.secondaryKeywords.length ? `Secondary keywords (weave in naturally): ${brief.secondaryKeywords.join(', ')}.` : '',
    brief.searchIntent ? `Search intent: ${brief.searchIntent}.` : '',
    brief.targetAudience ? `Target audience: ${brief.targetAudience}.` : '',
    brief.category ? `Field: ${brief.category}.` : '',
    brief.briefNotes ? `Extra instructions: ${brief.briefNotes}` : '',
    `Tone: ${tone}. Total length: about ${words} words (between ${Math.round(words * 0.85)} and ${Math.round(words * 1.2)}).`,
    brandLine,
    ctaLine,
    ``,
    `Writing rules:`,
    `- directAnswer: a direct 2-3 sentence answer to the main question (will appear at the very top).`,
    `- Each major section starts with "answerFirst": one short sentence answering that section's question.`,
    `- Short paragraphs (2-4 sentences). Short-ish sentences. Mostly ACTIVE voice; avoid passive.`,
    `- Use natural transition words (${brief.language === 'he' ? 'בנוסף, לכן, עם זאת, למשל, לסיכום' : 'additionally, therefore, however, for example, in summary'}).`,
    `- Do not start many sentences with the same word.`,
    `- Relevant entities; practical specifics. Include at least 3 of: examples, common mistakes, a checklist, comparison, tips by situation, budget/price considerations, steps, when-to / when-not-to, what to check before deciding.`,
    `- Weave the most important user questions into the BODY as <h2>/<h3> question-style section headings where natural — do NOT leave all questions only for the FAQ section at the end.`,
    `- FAQ section (end of article): ${th.minFaq}-${th.minFaq + 2} concise pairs; real, specific questions (no generic filler like "what is X?"); answers 40-90 words; never repeat earlier paragraphs word-for-word.`,
    `- Do NOT invent prices/statistics/laws/facts not in this brief; when unsure use hedges ("in most cases", "typically", "prices may vary", "check with the provider").`,
    anchorTopics.length ? `- Naturally use these exact phrases (they will become links):` : '',
    ...anchorTopics,
    ``,
    `MINIMUMS (mandatory): >=${th.minH2} sections (<h2>), >=${th.minP} paragraphs total, ${th.minLists} list(s), ${th.minFaq} FAQ pairs${th.minH3 ? `, >=${th.minH3} subsections (<h3>)` : ''}.`,
    `- When the topic involves comparison, pricing/cost, choosing between options, types, or pros/cons, you MUST include a REAL data/comparison TABLE (>=2 columns AND >=2 rows) via the "table" field — never fake it as a paragraph or a single row.`,
    ``,
    `Return ONLY valid JSON (no markdown, no text outside the JSON), as STRUCTURED DATA (NOT html), plain-text fields:`,
    `{"title":"...","slug":"...","metaTitle":"...","metaDescription":"...","excerpt":"...","searchIntent":"...","directAnswer":"...","intro":["...","..."],`,
    `"sections":[{"heading":"...","answerFirst":"...","paragraphs":["...","..."],"bullets":["..."],"table":{"caption":"...","columns":["...","..."],"rows":[["...","..."]]},"subsections":[{"heading":"...","paragraphs":["..."]}]}],`,
    `"comparisonTables":[{"caption":"...","columns":["...","..."],"rows":[["...","..."]]}],"faq":[{"question":"...","answer":"..."}],"imagePrompt":"...","warnings":[]}`,
    `- Every paragraph/answerFirst/directAnswer is PLAIN TEXT (no HTML). "table"/"bullets"/"subsections" are optional per section.`,
    `- faq answers: 40-90 words, concise, no duplicates. slug: MUST be English (translate, never transliterate Hebrew), lowercase, hyphens. metaTitle <= 60 chars; metaDescription 120-160 chars. imagePrompt in ${lang}.`,
  ].filter((l) => l !== undefined).join('\n')
}

// -- structured → HTML/Markdown --------------------------------------------

function esc(s: string): string { return (s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;') }
function pTag(text: string): string { const t = (text || '').trim(); return t ? `<p>${esc(t)}</p>` : '' }

/**
 * Build a factory that mints stable, clean, slug-safe, UNIQUE English ids for
 * headings so the article is "TOC-ready" (H2/H3 anchor targets) regardless of
 * whether a manual TOC is injected. Falls back to a deterministic prefix when a
 * heading has no latin/digit characters (e.g. Hebrew-only headings).
 */
function makeIdFactory(): (heading: string, fallbackPrefix: string, i: number) => string {
  const used = new Set<string>()
  return (heading, fallbackPrefix, i) => {
    let base = (heading || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40)
    if (!base || !/[a-z0-9]/.test(base)) base = `${fallbackPrefix}-${i + 1}`
    let id = base
    let n = 2
    while (used.has(id)) { id = `${base}-${n++}` }
    used.add(id)
    return id
  }
}
function tableHtml(t: ArticleTable | null): string {
  if (!t || !Array.isArray(t.columns) || t.columns.length === 0 || !Array.isArray(t.rows)) return ''
  const rows = t.rows.filter((r) => Array.isArray(r) && r.length)
  if (!rows.length) return ''
  const cap = (t.caption || '').trim() ? `<caption>${esc(t.caption.trim())}</caption>` : ''
  const head = `<thead><tr>${t.columns.map((c) => `<th>${esc(String(c))}</th>`).join('')}</tr></thead>`
  const body = `<tbody>${rows.map((r) => `<tr>${r.map((c) => `<td>${esc(String(c))}</td>`).join('')}</tr>`).join('')}</tbody>`
  return `<table>${cap}${head}${body}</table>`
}

/**
 * Build clean article HTML. Every H2/H3 gets a stable slug-safe id (TOC-ready).
 * A manual <nav> table of contents is injected ONLY when includeManualToc is
 * true — by default the article is TOC-ready but carries no manual TOC HTML, so
 * a WordPress TOC plugin/theme can render one. No <h1> is ever emitted.
 */
function buildHtml(a: StructuredArticle, language: SuggestionLanguage, includeManualToc: boolean): string {
  const out: string[] = []
  const makeId = makeIdFactory()
  if (a.directAnswer?.trim()) out.push(`<p><strong>${esc(a.directAnswer.trim())}</strong></p>`)
  for (const intro of a.intro || []) { const t = pTag(intro); if (t) out.push(t) }

  // Assign section ids up front so an optional manual TOC can link to them.
  const sections = a.sections || []
  const sectionIds = sections.map((s, i) => makeId(s.heading, 'section', i))
  if (includeManualToc) {
    const toc = sections.map((s, i) => s.heading?.trim() ? `<li><a href="#${sectionIds[i]}">${esc(s.heading.trim())}</a></li>` : '').filter(Boolean).join('')
    if (toc) out.push(`<nav class="toc" aria-label="${language === 'he' ? 'תוכן העניינים' : 'Table of contents'}"><ul>${toc}</ul></nav>`)
  }

  sections.forEach((s, i) => {
    if (s.heading?.trim()) out.push(`<h2 id="${sectionIds[i]}">${esc(s.heading.trim())}</h2>`)
    if (s.answerFirst?.trim()) out.push(pTag(s.answerFirst))
    for (const para of s.paragraphs || []) { const t = pTag(para); if (t) out.push(t) }
    const bullets = (s.bullets || []).map((b) => (b || '').trim()).filter(Boolean)
    if (bullets.length) out.push(`<ul>${bullets.map((b) => `<li>${esc(b)}</li>`).join('')}</ul>`)
    const tbl = tableHtml(s.table)
    if (tbl) out.push(tbl)
    ;(s.subsections || []).forEach((sub, j) => {
      if (sub.heading?.trim()) out.push(`<h3 id="${makeId(sub.heading, `section-${i + 1}-sub`, j)}">${esc(sub.heading.trim())}</h3>`)
      for (const para of sub.paragraphs || []) { const t = pTag(para); if (t) out.push(t) }
    })
  })

  for (const t of a.comparisonTables || []) { const h = tableHtml(t); if (h) out.push(h) }

  if ((a.faq || []).length) {
    out.push(`<h2 id="${makeId('faq', 'faq', 0)}">${language === 'he' ? 'שאלות נפוצות' : 'Frequently Asked Questions'}</h2>`)
    a.faq.forEach((f, k) => {
      if (f.question?.trim() && f.answer?.trim()) {
        out.push(`<h3 id="${makeId(f.question, 'faq-q', k)}">${esc(f.question.trim())}</h3>`)
        const t = pTag(f.answer); if (t) out.push(t)
      }
    })
  }
  return out.join('\n')
}

function buildMarkdown(a: StructuredArticle, language: SuggestionLanguage): string {
  const out: string[] = []
  if (a.directAnswer?.trim()) out.push(`**${a.directAnswer.trim()}**`)
  for (const intro of a.intro || []) if (intro?.trim()) out.push(intro.trim())
  for (const s of a.sections || []) {
    if (s.heading?.trim()) out.push(`## ${s.heading.trim()}`)
    if (s.answerFirst?.trim()) out.push(s.answerFirst.trim())
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

// -- English slug + deterministic anchor insertion --------------------------

export function toEnglishSlug(geminiSlug: string, primaryKeyword: string | null): string {
  const clean = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').replace(/-{2,}/g, '-').slice(0, 80)
  const a = clean(geminiSlug || ''); if (a.length >= 3 && /[a-z]/.test(a)) return a
  const b = clean(primaryKeyword || ''); if (b.length >= 3 && /[a-z]/.test(b)) return b
  return ''
}
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

// -- parse + generate -------------------------------------------------------

function str(v: unknown): string { return typeof v === 'string' ? v : '' }
function strArr(v: unknown): string[] { return Array.isArray(v) ? v.map(str).map((s) => s.trim()).filter(Boolean) : [] }
function parseTable(v: unknown): ArticleTable | null {
  if (!v || typeof v !== 'object') return null
  const o = v as Record<string, unknown>
  const columns = strArr(o.columns)
  const rows = Array.isArray(o.rows) ? (o.rows as unknown[]).filter(Array.isArray).map((r) => (r as unknown[]).map((c) => str(c).trim())) : []
  if (columns.length === 0 || rows.length === 0) return null
  return { caption: str(o.caption).trim(), columns, rows }
}
function parseStructured(parsed: Record<string, unknown>): StructuredArticle {
  const sections: Section[] = Array.isArray(parsed.sections) ? (parsed.sections as Record<string, unknown>[]).map((s) => ({
    heading: str(s?.heading), answerFirst: str(s?.answerFirst), paragraphs: strArr(s?.paragraphs), bullets: strArr(s?.bullets),
    table: parseTable(s?.table),
    subsections: Array.isArray(s?.subsections) ? (s.subsections as Record<string, unknown>[]).map((ss) => ({ heading: str(ss?.heading), paragraphs: strArr(ss?.paragraphs) })) : [],
  })) : []
  const faq: GeneratedArticleFaq[] = Array.isArray(parsed.faq) ? (parsed.faq as Record<string, unknown>[])
    .map((f) => ({ question: str(f?.question).trim(), answer: str(f?.answer).trim() })).filter((f) => f.question && f.answer).slice(0, 12) : []
  const comparisonTables = Array.isArray(parsed.comparisonTables) ? (parsed.comparisonTables as unknown[]).map(parseTable).filter((t): t is ArticleTable => !!t) : []
  return {
    title: str(parsed.title).trim(), slug: str(parsed.slug).trim(), metaTitle: str(parsed.metaTitle).trim(),
    metaDescription: str(parsed.metaDescription).trim(), excerpt: str(parsed.excerpt).trim(),
    directAnswer: str(parsed.directAnswer).trim(), intro: strArr(parsed.intro), sections, comparisonTables, faq,
    imagePrompt: str(parsed.imagePrompt).trim(), warnings: Array.isArray(parsed.warnings) ? (parsed.warnings as unknown[]).filter((w): w is string => typeof w === 'string') : [],
  }
}

async function callGemini(brief: ArticleBrief, opts: GenOpts, modelName: string): Promise<{ structured: StructuredArticle; usage: GeminiUsage | null } | { error: string }> {
  const client = getGeminiClient()
  if (!client) return { error: process.env.GEMINI_API_KEY ? 'gemini_init_failed' : 'missing_gemini_api_key' }
  try {
    const model = client.getGenerativeModel({ model: modelName, generationConfig: { responseMimeType: 'application/json', temperature: 0.75 } })
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
  audit: AuditResult
  model: string
}

function auditFor(brief: ArticleBrief, structured: StructuredArticle, safeHtml: string, slug: string): AuditResult {
  return runArticleAudit({
    language: brief.language, desiredWordCount: brief.desiredWordCount || 1000,
    primaryKeyword: brief.primaryKeyword, secondaryKeywords: brief.secondaryKeywords,
    ctaPreference: brief.ctaPreference, includeBrandName: brief.includeBrandName,
    brandName: brief.brandNameToInclude, businessName: brief.businessName,
    title: structured.title, metaTitle: structured.metaTitle, metaDescription: structured.metaDescription,
    slug, excerpt: structured.excerpt, contentHtml: safeHtml, faq: structured.faq, anchors: brief.anchors,
  })
}

/** Generate → build → audit → repair (once) → audit. Never saves a bad draft. */
export async function generateValidatedArticle(brief: ArticleBrief): Promise<ValidatedArticle | { error: string; reason?: string }> {
  const language = brief.language
  const { model, fellBack } = articleModel()
  if (fellBack) console.warn('[content-article-generation] GEMINI_ARTICLE_MODEL missing, falling back to classifier model')
  console.log(`[content-article-generation] model=${model}`)

  let best: { structured: StructuredArticle; usage: GeminiUsage | null; safe: string; slug: string; audit: AuditResult } | null = null

  for (let attempt = 0; attempt < 2; attempt++) {
    const opts: GenOpts = attempt === 0 ? {} : { repairFailures: [...(best?.audit.blockers || []), ...(best?.audit.warnings || [])] }
    const g = await callGemini(brief, opts, model)
    if ('error' in g) { if (!best) continue; else break }

    let safe = sanitizeArticleHtml(buildHtml(g.structured, language, brief.includeManualToc))
    // Enforce required anchors on the built HTML before auditing.
    const preAnchors = validateAnchorPlacement(brief.anchors, safe)
    if (preAnchors.hasBlockingIssues) {
      const missing = preAnchors.missingRequired.map((a) => ({ anchorText: a.anchorText, targetUrl: a.targetUrl }))
      safe = sanitizeArticleHtml(insertAnchors(safe, missing, language))
    }
    const slug = toEnglishSlug(g.structured.slug, brief.primaryKeyword)
    const audit = auditFor(brief, g.structured, safe, slug)

    console.log(`[content-article-generation] ${attempt ? 'repair ' : ''}h2=${audit.counts.h2} h3=${audit.counts.h3} p=${audit.counts.p} words=${audit.counts.words} faq=${audit.counts.faq} tables=${audit.counts.tables} score=${audit.score}`)
    console.log(`[content-article-generation] ${attempt ? 'repair ' : ''}blockers=[${audit.blockers.join(',')}]`)

    best = { structured: g.structured, usage: g.usage, safe, slug, audit }
    if (audit.blockers.length === 0) break
  }

  if (!best) return { error: 'Article generation failed', reason: 'gemini_request_failed' }
  if (!best.safe) return { error: 'Article generation failed', reason: 'empty_after_sanitize' }
  if (best.audit.blockers.length > 0) {
    const reason = best.audit.requiredAnchorsMissing > 0 ? 'required_anchor_missing' : 'article_quality_gate_failed'
    return { error: 'Article generation failed', reason }
  }

  const a = best.structured
  const article: GeneratedArticleContent = {
    title: a.title, slug: a.slug, metaTitle: a.metaTitle, metaDescription: a.metaDescription, excerpt: a.excerpt,
    contentHtml: best.safe, contentMarkdown: buildMarkdown(a, language), faq: a.faq, imagePrompt: a.imagePrompt,
    warnings: [...a.warnings, ...best.audit.warnings],
  }
  return { article, safeHtml: best.safe, slug: best.slug || `article-${Date.now().toString(36)}`, usage: best.usage, audit: best.audit, model }
}
