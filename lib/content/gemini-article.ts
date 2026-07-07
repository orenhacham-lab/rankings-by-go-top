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
import {
  validateAnchorPlacement, scanAnchorHits, isAnchorTooEarly,
  ANCHOR_MIN_WORDS_BEFORE_FIRST, ANCHOR_MIN_PARAGRAPHS_BEFORE_FIRST, ANCHOR_MIN_WORD_GAP,
} from '@/lib/content/anchors-check'
import { runArticleAudit, thresholdsFor, auditSummary, type AuditResult, type AuditSummary } from '@/lib/content/article-audit'
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
  // Concrete CTA contact details (used only when ctaPreference !== 'none').
  ctaText: string | null
  ctaPhone: string | null
  ctaWhatsApp: string | null
  ctaUrl: string | null
  briefNotes: string | null
  includeBrandName: boolean
  brandNameToInclude: string | null
  // When true, build a manual <nav> table of contents into the HTML. Default
  // false — the article stays "TOC-ready" (clean H2/H3 + ids) so a WordPress
  // TOC plugin/theme can generate it.
  includeManualToc: boolean
  anchors: ArticleTopicAnchor[]
  // Planned internal-link anchors (phrase-only): weave each exact phrase into the
  // body naturally, but do NOT turn it into a link — the editor inserts links.
  plannedInternalAnchors?: string[]
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
  whatsapp: 'a WhatsApp call-to-action', phone: 'a phone call-to-action',
  marketing: 'a stronger marketing call-to-action',
}

export function articleModel(): { model: string; fellBack: boolean } {
  if (process.env.GEMINI_ARTICLE_MODEL) return { model: process.env.GEMINI_ARTICLE_MODEL, fellBack: false }
  return { model: process.env.GEMINI_CLASSIFIER_MODEL || 'gemini-2.5-pro', fellBack: true }
}

// -- prompt -----------------------------------------------------------------

interface GenOpts { repairFailures?: string[] }

const FAILURE_HINT: Record<string, string> = {
  too_few_h2: 'add more distinct <h2> sections',
  h2_below_ideal: 'add a few more distinct <h2> sections',
  enough_paragraphs: 'add more real paragraphs',
  too_few_paragraphs: 'add more real paragraphs',
  paragraphs_below_ideal: 'add a few more real paragraphs',
  too_short: 'make the article substantially longer to meet the target length',
  enough_h3: 'add <h3> subsections inside broad sections',
  has_list: 'add at least one bulleted list',
  has_faq: 'add more FAQ question/answer pairs',
  faq_answers_have_value: 'expand short/thin FAQ answers to 40-90 words of real value',
  has_table: 'add a comparison/data table where it fits',
  table_recommended: 'this topic needs a real comparison/data table (>=2 columns, >=2 rows) — add one',
  table_structure_valid: 'fix the table to be a real table with >=2 columns and >=2 data rows',
  word_count_band: 'make the article a bit longer',
  has_transition_words: 'use more natural transition words',
  paragraphs_not_too_long: 'break long paragraphs into shorter ones (2-4 sentences)',
  varied_sentence_starts: 'vary how sentences begin',
  primary_keyword_in_intro: 'include the primary keyword naturally in the first paragraphs',
  primary_keyword_in_h2: 'include the primary keyword naturally in at least one <h2>',
  primary_keyword_in_meta: 'include the primary keyword in metaTitle/metaDescription',
  meta_description_length: 'make metaDescription 120-160 characters',
  cta_present_when_disabled: 'REMOVE every call-to-action',
  cta_details_missing: 'the CTA is missing usable contact details — use only the provided phone/WhatsApp/URL',
  cta_too_early: 'move the call-to-action to the END of the article, not the opening',
  brand_mention_when_disabled: 'remove the business/brand name from the article text — it may appear ONLY inside a requested link, nowhere else',
  markdown_artifacts_absent: 'do NOT use any Markdown (**bold**, ## headings, [text](url), backticks) — plain text only',
  has_early_answer: 'add a clear direct answer in the first paragraph',
  not_generic: 'add practical value: examples, common mistakes, a checklist, or decision criteria',
  anchor_too_early: 'move the required link OUT of the direct answer / first paragraph — place it only after the article has established context',
  anchor_spacing_too_close: 'spread the links across different sections (>=2 paragraphs apart), never two in the same paragraph',
  anchor_inserted_mechanically: 'integrate each link into a genuinely relevant sentence — no "read more", "click here", "אתר כמו", "למידע נוסף"',
}

function buildPrompt(brief: ArticleBrief, opts: GenOpts): string {
  const lang = brief.language === 'he' ? 'Hebrew' : 'English'
  const tone = (brief.toneOfVoice && TONE_HINT[brief.toneOfVoice]) || 'professional and credible'
  const words = brief.desiredWordCount || 1000
  const th = thresholdsFor(words)
  const ctaEnabled = !(brief.ctaPreference === 'none' || !brief.ctaPreference)
  const ctaDetailLines: string[] = []
  if (ctaEnabled) {
    ctaDetailLines.push(`Include ${CTA_HINT[brief.ctaPreference!] || 'a gentle call-to-action'} ONLY near the END of the article, phrased naturally.`)
    if (brief.ctaText?.trim()) ctaDetailLines.push(`Preferred CTA wording (adapt naturally, keep the intent): "${brief.ctaText.trim()}".`)
    if (brief.ctaWhatsApp?.trim()) ctaDetailLines.push(`WhatsApp number to use (use EXACTLY this, never invent one): ${brief.ctaWhatsApp.trim()}.`)
    if (brief.ctaPhone?.trim()) ctaDetailLines.push(`Phone number to use (use EXACTLY this, never invent one): ${brief.ctaPhone.trim()}.`)
    if (brief.ctaUrl?.trim()) ctaDetailLines.push(`Contact/landing URL to link the CTA to (use EXACTLY this): ${brief.ctaUrl.trim()}.`)
    ctaDetailLines.push('NEVER fabricate a phone number, WhatsApp number, email, or link. Use only the contact details provided above; if a channel has no value, do not state one.')
  }
  const ctaLine = ctaEnabled ? ctaDetailLines.join('\n') : 'Do NOT include any call-to-action anywhere.'
  const brandName = (brief.brandNameToInclude || '').trim()
  const brandLine = brief.includeBrandName && brandName
    ? `You MAY mention the business/brand name "${brandName}" naturally and subtly.`
    : 'Do NOT mention any business or brand name in the article text. EXCEPTION: if one of the required link phrases below is (or contains) the business name, use it ONLY inside that exact link and add NO other brand mentions anywhere.'
  const anchorTopics = brief.anchors
    .filter((a) => a.anchor_text?.trim() && a.target_url?.trim())
    .map((a) => `  - naturally use the exact phrase "${a.anchor_text}"` + (a.note ? ` (${a.note})` : ''))
  // Phrase-only internal-link anchors: include the exact phrase, do NOT link it.
  const plannedPhrases = Array.from(new Set((brief.plannedInternalAnchors || []).map((p) => p.trim()).filter(Boolean)))
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
    brief.briefNotes ? `Extra instructions from the brief (obey these): ${brief.briefNotes}` : '',
    brief.briefNotes ? `- Treat [ARTICLE ANGLE] as the STRATEGIC angle of the whole article — make it less generic and focus the piece around it.` : '',
    brief.briefNotes ? `- Treat [MUST INCLUDE] items as important content requirements: don't mention them once and move on — turn them into sections, bullet points, examples, FAQ answers, or comparison-table rows, woven naturally and prominently.` : '',
    brief.briefNotes ? `- Treat [MUST AVOID] items as hard negative constraints: never make those claims or use those phrases.` : '',
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
    `- For any list-worthy section (tips, common mistakes, a checklist, steps, how-to-choose, what-to-check, pros/cons), put the items in the section's "bullets" array — NOT as dash lines inside a paragraph. At least one real list in the article.`,
    `- Weave the most important user questions into the BODY as <h2>/<h3> question-style section headings where natural — do NOT leave all questions only for the FAQ section at the end.`,
    `- FAQ section (end of article): ${th.minFaq}-${th.minFaq + 2} concise pairs; real, specific questions (no generic filler like "what is X?"); answers 40-90 words; never repeat earlier paragraphs word-for-word.`,
    `- Do NOT invent prices/statistics/laws/facts not in this brief; when unsure use hedges ("in most cases", "typically", "prices may vary", "check with the provider").`,
    `- Never add a year (e.g. 2024/2025/2026) to the title, metaTitle, slug, headings, or content UNLESS that exact year appears in the topic, keyword, or brief above. If the topic is evergreen, keep it evergreen; never use outdated years.`,
    `- SEO/GEO depth: be practical, specific and useful — never generic. Include concrete criteria, examples, checks, warning signs and decision-making guidance; add related subtopics naturally when relevant. For commercial/comparison/price/cost/choice topics include a useful comparison TABLE.`,
    `- Avoid generic filler openings (e.g. "בעולם שבו כולם מחפשים…"). Open directly and match search intent — the FIRST paragraph answers the query. Each <h2> should answer a real user question, comparison point, or decision factor. In Hebrew, write naturally for Israeli readers.`,
    brief.language === 'he' ? `- Hebrew writing quality: VARY sentence and paragraph openings — do not start many consecutive sentences/paragraphs with the same word (avoid over-using "בנוסף", "אחד", "היתרון", "המשמעות", "כדי", "כאשר"). Mix openings like "מעבר לכך", "בפועל", "לכן", "מצד שני", "במקרים רבים", "בשלב הבא", "חשוב לזכור", "בשורה התחתונה", "לצד זאת", "מבחינה פרקטית", "עבור משתמשים ביתיים", "בהשוואה לדגמים רגילים" — but naturally, NOT a transition word in every sentence. Prefer clear, practical, promotional SEO writing over poetic language; avoid repetitive paragraph structure.` : '',
    brief.language === 'he' ? `- Keep brand/product names in their proper English casing (e.g. "Kingsmith WalkingPad X21", not "kingsmith walkingpad x21"). Never write the hyphenated Hebrew article before a name ("ה-Kingsmith", "ה-הליכון") — write "Kingsmith…", "הליכון…", or "דגם/מכשיר Kingsmith…".` : '',
    anchorTopics.length ? `- Naturally use these exact phrases (they will become links):` : '',
    ...anchorTopics,
    anchorTopics.length ? `- LINK PLACEMENT RULES: never place a link in the directAnswer or the first paragraph; place the first link only after the article has established context (after the first <h2> and a couple of paragraphs). If there are multiple links, distribute them across DIFFERENT sections — never two links in the same paragraph or back-to-back. Integrate every link into a genuinely relevant sentence; do NOT use generic phrases like "read more", "click here", "אתר כמו", "למידע נוסף".` : '',
    plannedPhrases.length ? `- INTERNAL-LINK PHRASES: include EACH of the following exact phrases verbatim, at most ONCE, woven naturally into a normal prose paragraph (a list item is acceptable) — NEVER in a heading, table, button/CTA, FAQ question, image alt text, navigation-like text, or the first paragraph. Do NOT wrap them in an HTML link, a markdown link, or any markup — they will be linked later by the editor. Only include a phrase if it genuinely fits the topic; if it would feel forced, SKIP it rather than forcing it:` : '',
    ...plannedPhrases.map((p) => `  - "${p}"`),
    ``,
    `MINIMUMS (mandatory): >=${th.minH2} sections (<h2>), >=${th.minP} paragraphs total, ${th.minLists} list(s), ${th.minFaq} FAQ pairs${th.minH3 ? `, >=${th.minH3} subsections (<h3>)` : ''}.`,
    `- When the topic involves comparison, pricing/cost, choosing between options, types, or pros/cons, you MUST include a REAL data/comparison TABLE (>=2 columns AND >=2 rows) via the "table" field — never fake it as a paragraph or a single row.`,
    ``,
    `Return ONLY valid JSON (no markdown, no text outside the JSON), as STRUCTURED DATA (NOT html), plain-text fields:`,
    `{"title":"...","slug":"...","metaTitle":"...","metaDescription":"...","excerpt":"...","searchIntent":"...","directAnswer":"...","intro":["...","..."],`,
    `"sections":[{"heading":"...","answerFirst":"...","paragraphs":["...","..."],"bullets":["..."],"table":{"caption":"...","columns":["...","..."],"rows":[["...","..."]]},"subsections":[{"heading":"...","paragraphs":["..."]}]}],`,
    `"comparisonTables":[{"caption":"...","columns":["...","..."],"rows":[["...","..."]]}],"faq":[{"question":"...","answer":"..."}],"imagePrompt":"...","warnings":[]}`,
    `- Every paragraph/answerFirst/directAnswer is PLAIN TEXT (no HTML). "table"/"bullets"/"subsections" are optional per section.`,
    `- Do NOT use Markdown syntax in ANY field: no **bold**, no __bold__, no ##/### headings, no [text](url) links, no backticks. Return plain readable text only — the server builds all HTML and structure.`,
    `- faq answers: 40-90 words, concise, no duplicates. slug: MUST be English (translate, never transliterate Hebrew), lowercase, hyphens. metaTitle <= 60 chars; metaDescription 120-160 chars. imagePrompt in ${lang}.`,
  ].filter((l) => l !== undefined).join('\n')
}

// -- structured → HTML/Markdown --------------------------------------------

function esc(s: string): string { return (s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;') }
function pTag(text: string): string { const t = (text || '').trim(); return t ? `<p>${esc(t)}</p>` : '' }

// Detect list-like lines that Gemini sometimes emits as plain paragraphs so we
// can render REAL <ul>/<ol> (the audit only counts real lists; dash-lines in a
// paragraph don't count and render as flat text).
const BULLET_RE = /^\s*(?:[-–—•*·])\s+/
const NUM_RE = /^\s*\d{1,2}[.)]\s+/
function stripListMarker(s: string): string { return s.replace(BULLET_RE, '').replace(NUM_RE, '').trim() }
/** Emit paragraphs, converting runs of bullet/numbered lines into real lists. */
function emitParagraphs(out: string[], paras: string[] | undefined): void {
  const lines: string[] = []
  for (const p of paras || []) {
    const t = (p || '').trim()
    if (!t) continue
    for (const ln of t.split(/\n+/).map((x) => x.trim()).filter(Boolean)) lines.push(ln)
  }
  let buf: string[] = []
  let ordered = false
  const flush = () => {
    if (!buf.length) return
    const tag = ordered ? 'ol' : 'ul'
    out.push(`<${tag}>${buf.map((b) => `<li>${esc(b)}</li>`).join('')}</${tag}>`)
    buf = []
  }
  for (const ln of lines) {
    const isNum = NUM_RE.test(ln)
    const isBullet = BULLET_RE.test(ln)
    if (isNum || isBullet) {
      if (buf.length && ordered !== isNum) flush()
      ordered = isNum
      buf.push(stripListMarker(ln))
    } else {
      flush()
      const tp = pTag(ln)
      if (tp) out.push(tp)
    }
  }
  flush()
}

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
function tableHtml(t: ArticleTable | null, language: SuggestionLanguage): string {
  if (!t || !Array.isArray(t.columns) || t.columns.length === 0 || !Array.isArray(t.rows)) return ''
  const rows = t.rows.filter((r) => Array.isArray(r) && r.length)
  if (!rows.length) return ''
  const head = `<thead><tr>${t.columns.map((c) => `<th>${esc(String(c))}</th>`).join('')}</tr></thead>`
  const body = `<tbody>${rows.map((r) => `<tr>${r.map((c) => `<td>${esc(String(c))}</td>`).join('')}</tr>`).join('')}</tbody>`
  // Hebrew tables render RTL so the first (attribute) column sits on the RIGHT;
  // English tables stay LTR. dir travels with the HTML to WordPress.
  const dir = language === 'he' ? ' dir="rtl"' : ''
  // The table TITLE is a sibling <p> ABOVE the table — NOT a <caption> (TipTap's
  // table schema has no caption and would push it into a stray first row).
  const titleText = (t.caption || '').trim()
  const title = titleText ? `<p class="article-table-title"${dir || ' dir="ltr"'}>${esc(titleText)}</p>` : ''
  return `${title}<table${dir}>${head}${body}</table>`
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
    emitParagraphs(out, s.paragraphs)
    const bullets = (s.bullets || []).map((b) => stripListMarker(b)).filter(Boolean)
    if (bullets.length) out.push(`<ul>${bullets.map((b) => `<li>${esc(b)}</li>`).join('')}</ul>`)
    const tbl = tableHtml(s.table, language)
    if (tbl) out.push(tbl)
    ;(s.subsections || []).forEach((sub, j) => {
      if (sub.heading?.trim()) out.push(`<h3 id="${makeId(sub.heading, `section-${i + 1}-sub`, j)}">${esc(sub.heading.trim())}</h3>`)
      emitParagraphs(out, sub.paragraphs)
    })
  })

  for (const t of a.comparisonTables || []) { const h = tableHtml(t, language); if (h) out.push(h) }

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

function escapeRegExp(s: string): string { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') }

/** Extract maximal runs of Latin/number tokens (brand/product names) from a source. */
function extractLatinPhrases(src: string): string[] {
  const out: string[] = []
  const re = /[A-Za-z0-9][A-Za-z0-9&'’./+-]*(?:\s+[A-Za-z0-9&'’./+-]+)*/g
  let m: RegExpExecArray | null
  while ((m = re.exec(src || '')) !== null) {
    const phrase = m[0].trim()
    if (/[A-Za-z]/.test(phrase)) out.push(phrase)
  }
  return out
}

interface CasingTerm { re: RegExp; replacement: string }
/**
 * Build case-restoring rules from the user's own inputs (topic / keyword /
 * secondary / anchor text / brand). Gemini often lowercases brand/product names
 * ("kingsmith walkingpad x21"); we restore the exact casing the user typed
 * ("Kingsmith WalkingPad X21"). Longest phrases first so multi-word names win.
 */
function buildCasingTerms(brief: ArticleBrief): CasingTerm[] {
  const sources = [
    brief.topic,
    brief.primaryKeyword || '',
    ...(brief.secondaryKeywords || []),
    ...(brief.anchors || []).map((a) => a.anchor_text || ''),
    brief.brandNameToInclude || '',
  ]
  const map = new Map<string, string>() // lowercase → original casing (first wins)
  for (const src of sources) {
    for (const phrase of extractLatinPhrases(src)) {
      const add = (term: string) => {
        const key = term.toLowerCase()
        if (term.length >= 2 && /[A-Za-z]/.test(term) && !map.has(key)) map.set(key, term)
      }
      add(phrase)
      for (const tok of phrase.split(/\s+/)) if (tok !== '&') add(tok)
    }
  }
  return [...map.entries()]
    .sort((a, b) => b[0].length - a[0].length)
    .map(([, original]) => ({ re: new RegExp('(?<![A-Za-z0-9])' + escapeRegExp(original) + '(?![A-Za-z0-9])', 'gi'), replacement: original }))
}

/** Restore brand casing + remove the artifact hyphenated definite article "ה-". */
function polishText(s: string, terms: CasingTerm[]): string {
  if (!s) return s
  let out = s
  for (const t of terms) out = out.replace(t.re, t.replacement)
  // "ה-Kingsmith" → "Kingsmith", "ה-הליכון" → "הליכון" (only the hyphenated form;
  // a normal attached definite article like "המכשיר" is never touched).
  out = out.replace(/ה-(?=[A-Za-zא-ת])/g, '')
  return out
}

function polishTable(t: ArticleTable, terms: CasingTerm[]): ArticleTable {
  return { caption: polishText(t.caption, terms), columns: t.columns.map((c) => polishText(c, terms)), rows: t.rows.map((r) => r.map((c) => polishText(c, terms))) }
}
/** Apply brand-casing + "ה-" cleanup to every text field of the article. */
function polishStructured(a: StructuredArticle, terms: CasingTerm[]): void {
  const f = (s: string) => polishText(s, terms)
  a.title = f(a.title); a.metaTitle = f(a.metaTitle); a.metaDescription = f(a.metaDescription)
  a.excerpt = f(a.excerpt); a.directAnswer = f(a.directAnswer); a.imagePrompt = f(a.imagePrompt)
  a.intro = a.intro.map(f)
  a.sections = a.sections.map((s) => ({
    ...s, heading: f(s.heading), answerFirst: f(s.answerFirst), paragraphs: s.paragraphs.map(f), bullets: s.bullets.map(f),
    table: s.table ? polishTable(s.table, terms) : null,
    subsections: s.subsections.map((ss) => ({ heading: f(ss.heading), paragraphs: ss.paragraphs.map(f) })),
  }))
  a.comparisonTables = a.comparisonTables.map((t) => polishTable(t, terms))
  a.faq = a.faq.map((x) => ({ question: f(x.question), answer: f(x.answer) }))
}

/** Years the user explicitly asked for (topic/keyword/secondary/brief). */
function collectAllowedYears(brief: ArticleBrief): Set<string> {
  const hay = [brief.topic, brief.primaryKeyword || '', (brief.secondaryKeywords || []).join(' '), brief.briefNotes || ''].join(' ')
  return new Set(hay.match(/\b20\d{2}\b/g) || [])
}
/** Remove any 20xx year the user did NOT request, then tidy leftover artifacts. */
function stripUnrequestedYear(text: string, allowed: Set<string>): string {
  if (!text) return text
  let out = text.replace(/\b20\d{2}\b/g, (y) => (allowed.has(y) ? y : ''))
  out = out
    .replace(/\s{2,}/g, ' ')
    .replace(/\s+([,.:;!?])/g, '$1')
    .replace(/[([{]\s*[)\]}]/g, '')
    .replace(/^\s*[|·–—-]\s*/g, '')
    .replace(/\s*[|·–—-]\s*$/g, '')
    .trim()
  return out
}

export function toEnglishSlug(geminiSlug: string, primaryKeyword: string | null): string {
  const clean = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').replace(/-{2,}/g, '-').slice(0, 80)
  const a = clean(geminiSlug || ''); if (a.length >= 3 && /[a-z]/.test(a)) return a
  const b = clean(primaryKeyword || ''); if (b.length >= 3 && /[a-z]/.test(b)) return b
  return ''
}
function escAttr(s: string): string { return s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;') }
function escRe(s: string): string { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') }
function countWords(html: string): number { return html.replace(/<[^>]+>/g, ' ').replace(/&[a-z]+;/gi, ' ').split(/\s+/).filter(Boolean).length }

interface ParaBlock { start: number; end: number; full: string; inner: string; index: number; wordStart: number; hasLink: boolean }
/** Collect every <p> block with char offsets + running word offset + link flag. */
function collectParagraphs(html: string): ParaBlock[] {
  const out: ParaBlock[] = []
  const re = /<p[^>]*>([\s\S]*?)<\/p>/gi
  let m: RegExpExecArray | null
  let idx = 0
  while ((m = re.exec(html)) !== null) {
    out.push({
      start: m.index, end: m.index + m[0].length, full: m[0], inner: m[1], index: idx++,
      wordStart: countWords(html.slice(0, m.index)), hasLink: /<a[\s>]/i.test(m[1]),
    })
  }
  return out
}

/**
 * Deterministic anchor insertion that RESPECTS placement quality:
 * - never inserts in the direct answer or the first paragraphs (waits until the
 *   article has established context: >=2 paragraphs AND >=120 words AND after
 *   the first H2),
 * - keeps anchors spaced apart (>=200 words / different paragraphs),
 * - integrates the anchor into a real sentence — no "read more" / "אתר כמו".
 */
function insertAnchors(html: string, missing: { anchorText: string; targetUrl: string }[], language: SuggestionLanguage): string {
  let out = html
  // Seed "used" positions with existing anchors so we keep spacing from them.
  const used: number[] = scanAnchorHits(out).hits.map((h) => h.wordIndex)

  const eligibleParas = (): ParaBlock[] => {
    const paras = collectParagraphs(out)
    const firstH2 = out.search(/<h2[\s>]/i)
    const established = paras.filter((p) =>
      !p.hasLink &&
      p.index >= ANCHOR_MIN_PARAGRAPHS_BEFORE_FIRST &&
      p.wordStart >= ANCHOR_MIN_WORDS_BEFORE_FIRST &&
      (firstH2 < 0 || p.start > firstH2))
    if (established.length) return established
    // Relaxed fallbacks for very short articles (still never the first paragraph).
    const relaxed = paras.filter((p) => !p.hasLink && p.index >= 1)
    return relaxed.length ? relaxed : paras.filter((p) => !p.hasLink)
  }
  const farEnough = (wordStart: number) => used.every((u) => Math.abs(wordStart - u) >= ANCHOR_MIN_WORD_GAP)

  for (const a of missing) {
    const text = (a.anchorText || '').trim()
    const url = (a.targetUrl || '').trim()
    if (!text || !/^https?:\/\//i.test(url)) continue

    const paras = eligibleParas()
    // 1) Link an existing textual mention inside an eligible, well-spaced paragraph.
    let placed = false
    for (const p of paras) {
      if (!farEnough(p.wordStart)) continue
      const idx = p.inner.toLowerCase().indexOf(text.toLowerCase())
      if (idx < 0 || p.inner.slice(0, idx).includes('<')) continue // keep it out of any tag
      const newInner = `${p.inner.slice(0, idx)}<a href="${escAttr(url)}">${p.inner.slice(idx, idx + text.length)}</a>${p.inner.slice(idx + text.length)}`
      out = out.slice(0, p.start) + `<p>${newInner}</p>` + out.slice(p.end)
      used.push(p.wordStart)
      placed = true
      break
    }
    if (placed) continue

    // 2) Append the anchor as a natural sentence into an eligible paragraph.
    const link = `<a href="${escAttr(url)}">${escAttr(text)}</a>`
    const sentence = language === 'he'
      ? ` בהקשר זה, ${link} הוא אחד הגורמים המרכזיים שכדאי להכיר.`
      : ` In this context, ${link} is a key option worth knowing.`
    const target = paras.find((p) => farEnough(p.wordStart)) || paras[0]
    if (target) {
      out = out.slice(0, target.start) + `<p>${target.inner}${sentence}</p>` + out.slice(target.end)
      used.push(target.wordStart)
      continue
    }
    // 3) Last resort (tiny article): a standalone natural sentence, not a footer link.
    out = `${out}\n<p>${language === 'he' ? 'בהקשר זה, ' : 'In this context, '}${link}${language === 'he' ? ' הוא גורם מרכזי שכדאי להכיר.' : ' is a key option worth knowing.'}</p>`
    used.push(countWords(out))
  }
  return out
}

/** Unwrap any anchor that sits too early, then re-insert it with proper placement. */
function repositionEarlyAnchors(html: string, language: SuggestionLanguage): string {
  const { hits, firstH2Word } = scanAnchorHits(html)
  const firstH2Exists = firstH2Word >= 0
  const early = hits.filter((h) => h.href && isAnchorTooEarly(h, firstH2Exists))
  if (!early.length) return html
  let out = html
  const toReinsert: { anchorText: string; targetUrl: string }[] = []
  for (const h of early) {
    const re = new RegExp(`<a\\b[^>]*href\\s*=\\s*["']${escRe(h.href)}["'][^>]*>([\\s\\S]*?)<\\/a>`, 'i')
    const before = out
    out = out.replace(re, '$1') // strip the early link, keep its text
    if (out !== before) toReinsert.push({ anchorText: h.text || '', targetUrl: h.href })
  }
  return toReinsert.length ? insertAnchors(out, toReinsert, language) : out
}

/** Ensure required anchors exist AND are placed with good quality (not too early). */
function enforceAnchors(html: string, anchors: ArticleTopicAnchor[], language: SuggestionLanguage): string {
  let out = html
  const val = validateAnchorPlacement(anchors, out)
  if (val.hasBlockingIssues) {
    out = insertAnchors(out, val.missingRequired.map((a) => ({ anchorText: a.anchorText, targetUrl: a.targetUrl })), language)
  }
  out = repositionEarlyAnchors(out, language)
  return out
}

// -- parse + generate -------------------------------------------------------

function str(v: unknown): string { return typeof v === 'string' ? v : '' }
function strArr(v: unknown): string[] { return Array.isArray(v) ? v.map(str).map((s) => s.trim()).filter(Boolean) : [] }

/**
 * Strip Markdown from a Gemini text field so the SERVER-built content_html stays
 * clean HTML (WordPress-ready). Gemini is told to return plain text, but it
 * sometimes leaks **bold**, ## headings, [text](url), backticks, etc. We remove
 * the markers and keep the readable text (bold becomes plain text — buildHtml
 * decides real structure/emphasis). Does NOT touch real HTML (fields are plain
 * text here) and runs BEFORE buildHtml, so tables/lists/anchors are unaffected.
 */
export function cleanMarkdown(input: string): string {
  let t = str(input)
  if (!t) return ''
  // Images ![alt](url) → drop entirely (no images in Phase 3A).
  t = t.replace(/!\[[^\]]*\]\([^)]*\)/g, '')
  // Links [text](url) → text (real/required links are added later by the server).
  t = t.replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
  // Bold/italic: **text**, __text__, then leftover markers; *text*, _text_.
  t = t.replace(/\*\*([^*]+)\*\*/g, '$1').replace(/__([^_]+)__/g, '$1')
  t = t.replace(/\*\*/g, '').replace(/(?<!_)__(?!_)/g, '')
  t = t.replace(/(?<![\w*])\*([^*\n]+)\*(?![\w*])/g, '$1')
  t = t.replace(/(?<![\w_])_([^_\n]+)_(?![\w_])/g, '$1')
  // Inline code `text` → text (no code in marketing/SEO articles).
  t = t.replace(/`+([^`]*)`+/g, '$1').replace(/`/g, '')
  // Heading + blockquote line markers → drop the marker, keep the text.
  t = t.replace(/^\s{0,3}#{1,6}\s+/gm, '').replace(/^\s{0,3}>\s?/gm, '')
  return t.trim()
}
function cstr(v: unknown): string { return cleanMarkdown(str(v)) }
function cstrArr(v: unknown): string[] { return strArr(v).map(cleanMarkdown).filter(Boolean) }

function parseTable(v: unknown): ArticleTable | null {
  if (!v || typeof v !== 'object') return null
  const o = v as Record<string, unknown>
  const columns = cstrArr(o.columns)
  const rows = Array.isArray(o.rows) ? (o.rows as unknown[]).filter(Array.isArray).map((r) => (r as unknown[]).map((c) => cleanMarkdown(str(c)))) : []
  if (columns.length === 0 || rows.length === 0) return null
  return { caption: cstr(o.caption), columns, rows }
}
function parseStructured(parsed: Record<string, unknown>): StructuredArticle {
  const sections: Section[] = Array.isArray(parsed.sections) ? (parsed.sections as Record<string, unknown>[]).map((s) => ({
    heading: cstr(s?.heading), answerFirst: cstr(s?.answerFirst), paragraphs: cstrArr(s?.paragraphs), bullets: cstrArr(s?.bullets),
    table: parseTable(s?.table),
    subsections: Array.isArray(s?.subsections) ? (s.subsections as Record<string, unknown>[]).map((ss) => ({ heading: cstr(ss?.heading), paragraphs: cstrArr(ss?.paragraphs) })) : [],
  })) : []
  const faq: GeneratedArticleFaq[] = Array.isArray(parsed.faq) ? (parsed.faq as Record<string, unknown>[])
    .map((f) => ({ question: cstr(f?.question), answer: cstr(f?.answer) })).filter((f) => f.question && f.answer).slice(0, 12) : []
  const comparisonTables = Array.isArray(parsed.comparisonTables) ? (parsed.comparisonTables as unknown[]).map(parseTable).filter((t): t is ArticleTable => !!t) : []
  return {
    title: cstr(parsed.title), slug: cstr(parsed.slug), metaTitle: cstr(parsed.metaTitle),
    metaDescription: cstr(parsed.metaDescription), excerpt: cstr(parsed.excerpt),
    directAnswer: cstr(parsed.directAnswer), intro: cstrArr(parsed.intro), sections, comparisonTables, faq,
    imagePrompt: cstr(parsed.imagePrompt), warnings: Array.isArray(parsed.warnings) ? (parsed.warnings as unknown[]).filter((w): w is string => typeof w === 'string') : [],
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
    ctaPreference: brief.ctaPreference,
    ctaDetails: { text: brief.ctaText || '', phone: brief.ctaPhone || '', whatsapp: brief.ctaWhatsApp || '', url: brief.ctaUrl || '' },
    includeBrandName: brief.includeBrandName,
    brandName: brief.brandNameToInclude, businessName: brief.businessName,
    title: structured.title, metaTitle: structured.metaTitle, metaDescription: structured.metaDescription,
    slug, excerpt: structured.excerpt, contentHtml: safeHtml, faq: structured.faq, anchors: brief.anchors,
  })
}

export interface ValidatedArticleError { error: string; reason?: string; audit?: AuditSummary; attempts: number }

/** Generate → build → audit → repair (once) → audit. Never saves a bad draft. */
export async function generateValidatedArticle(brief: ArticleBrief): Promise<ValidatedArticle | ValidatedArticleError> {
  const language = brief.language
  const { model, fellBack } = articleModel()
  if (fellBack) console.warn('[content-article-generation] GEMINI_ARTICLE_MODEL missing, falling back to classifier model')

  let best: { structured: StructuredArticle; usage: GeminiUsage | null; safe: string; slug: string; audit: AuditResult } | null = null
  let attempts = 0
  const allowedYears = collectAllowedYears(brief)
  const casingTerms = buildCasingTerms(brief)

  for (let attempt = 0; attempt < 2; attempt++) {
    // Repair uses the EXACT unmet checks (blockers first, then warnings).
    const repairFailures = attempt === 0 ? [] : [...(best?.audit.blockers || []), ...(best?.audit.warnings || [])]
    if (attempt > 0) console.log(`[content-article-generation] repair attempt=${attempt + 1} reason=quality_blockers failing=[${repairFailures.join(',')}]`)
    const opts: GenOpts = attempt === 0 ? {} : { repairFailures }
    attempts = attempt + 1
    const g = await callGemini(brief, opts, model)
    if ('error' in g) { if (!best) continue; else break }

    // Safety net: strip an invented year from the highly-visible SEO fields
    // unless the user asked for it (the prompt already forbids adding one).
    g.structured.title = stripUnrequestedYear(g.structured.title, allowedYears)
    g.structured.metaTitle = stripUnrequestedYear(g.structured.metaTitle, allowedYears)
    g.structured.slug = stripUnrequestedYear(g.structured.slug, allowedYears)
    // Restore brand/product casing (e.g. "kingsmith walkingpad x21" →
    // "Kingsmith WalkingPad X21") and remove the artifact "ה-" before names.
    // Runs on plain-text fields only, before buildHtml — never touches hrefs/URLs.
    polishStructured(g.structured, casingTerms)

    let safe = sanitizeArticleHtml(buildHtml(g.structured, language, brief.includeManualToc))
    // Enforce required anchors AND good placement quality (not in the direct
    // answer / first paragraph, spaced apart, integrated into a real sentence).
    safe = sanitizeArticleHtml(enforceAnchors(safe, brief.anchors, language))
    const slug = toEnglishSlug(g.structured.slug, brief.primaryKeyword)
    const audit = auditFor(brief, g.structured, safe, slug)

    // Safe, structured logs — counts + codes only, never the article body.
    const cnt = audit.counts
    console.log(`[content-article-generation] attempt=${attempt + 1} model=${model}`)
    console.log(`[content-article-generation] attempt=${attempt + 1} counts words=${cnt.words} h2=${cnt.h2} h3=${cnt.h3} p=${cnt.p} lists=${cnt.lists} tables=${cnt.tables} faq=${cnt.faq}`)
    console.log(`[content-article-generation] attempt=${attempt + 1} score=${audit.score} blockers=[${audit.blockers.join(',')}] warnings=[${audit.warnings.join(',')}]`)

    best = { structured: g.structured, usage: g.usage, safe, slug, audit }
    if (audit.blockers.length === 0) break
  }

  if (!best) return { error: 'Article generation failed', reason: 'gemini_request_failed', attempts }
  if (!best.safe) return { error: 'Article generation failed', reason: 'empty_after_sanitize', attempts }
  if (best.audit.blockers.length > 0) {
    const reason = best.audit.requiredAnchorsMissing > 0 ? 'required_anchor_missing' : 'article_quality_gate_failed'
    console.log(`[content-article-generation] gate failed reason=${reason} attempts=${attempts} blockers=[${best.audit.blockers.join(',')}]`)
    return { error: 'Article generation failed', reason, audit: auditSummary(best.audit), attempts }
  }

  const a = best.structured
  const article: GeneratedArticleContent = {
    title: a.title, slug: a.slug, metaTitle: a.metaTitle, metaDescription: a.metaDescription, excerpt: a.excerpt,
    contentHtml: best.safe, contentMarkdown: buildMarkdown(a, language), faq: a.faq, imagePrompt: a.imagePrompt,
    warnings: [...a.warnings, ...best.audit.warnings],
  }
  return { article, safeHtml: best.safe, slug: best.slug || `article-${Date.now().toString(36)}`, usage: best.usage, audit: best.audit, model }
}
