/**
 * SEO/GEO/readability audit for generated articles (content module, Phase 3A
 * Article Quality Upgrade).
 *
 * A lightweight, Yoast/Rank-Math-inspired audit that runs on the BUILT+sanitized
 * HTML plus the brief context. Used both to gate generation (blockers) and to
 * power the editor's read-only quality panel (computed live — no persistence,
 * no migration). Not a full clone; it checks the things that matter.
 */

import type { SuggestionLanguage } from '@/lib/content/topic-suggestions'
import { contentScript } from '@/lib/content/language'
import type { ArticleTopicAnchor } from '@/lib/supabase/types'
import { validateAnchorPlacement, analyzeAnchorQuality, brandMentionedOutsideAnchors, type AnchorQuality } from '@/lib/content/anchors-check'
import type { CtaDetails } from '@/lib/content/brief-notes'

export type CheckSeverity = 'blocker' | 'warning' | 'info'
export type CheckCategory = 'seo' | 'readability' | 'geo' | 'technical'

export interface AuditCheck {
  code: string
  category: CheckCategory
  severity: CheckSeverity
  ok: boolean
}

export interface AuditCounts {
  h2: number; h3: number; p: number; li: number; words: number
  faq: number; tables: number; lists: number
  transitionParagraphs: number; longParagraphs: number; maxRepeatedStart: number
  avgSentenceWords: number
}

export interface AuditResult {
  score: number
  blockers: string[]
  warnings: string[]
  counts: AuditCounts
  checks: AuditCheck[]
  anchorsOk: boolean
  requiredAnchorsMissing: number
  // "TOC-ready" = enough H2, valid heading hierarchy, no H1. Does NOT require a
  // manual TOC to be present in the HTML (a WP plugin/theme can build one).
  tocReady: boolean
  // Placement quality of the links in the article body.
  anchorQuality: AnchorQuality
}

export interface AuditInput {
  language: SuggestionLanguage
  desiredWordCount: number
  primaryKeyword: string | null
  secondaryKeywords: string[]
  ctaPreference: string | null
  ctaDetails: CtaDetails
  includeBrandName: boolean
  brandName: string | null
  businessName: string | null
  title: string
  metaTitle: string | null
  metaDescription: string | null
  slug: string
  excerpt: string | null
  contentHtml: string
  faq: { question: string; answer: string }[]
  anchors: ArticleTopicAnchor[]
}

// -- length thresholds ------------------------------------------------------

export interface Thresholds { minH2: number; minP: number; minH3: number; minFaq: number; minLists: number }
export function thresholdsFor(desired: number): Thresholds {
  if (desired <= 500) return { minH2: 3, minP: 6, minH3: 0, minFaq: 2, minLists: 1 }
  if (desired <= 1000) return { minH2: 5, minP: 10, minH3: 0, minFaq: 3, minLists: 1 }
  if (desired <= 1500) return { minH2: 6, minP: 14, minH3: 2, minFaq: 4, minLists: 1 }
  if (desired <= 2000) return { minH2: 8, minP: 18, minH3: 3, minFaq: 5, minLists: 2 }
  return { minH2: 9, minP: 22, minH3: 4, minFaq: 6, minLists: 2 }
}

// -- text helpers -----------------------------------------------------------

const TRANSITIONS_HE = ['בנוסף', 'לכן', 'עם זאת', 'יחד עם זאת', 'מצד שני', 'מנגד', 'למשל', 'לדוגמה', 'בפועל', 'לסיכום', 'חשוב לדעת', 'חשוב לזכור', 'מעבר לכך', 'מעבר לזה', 'כלומר', 'במילים אחרות', 'לעומת זאת', 'בסופו של דבר', 'ראשית', 'שנית', 'לבסוף', 'לאחר מכן', 'במקרים רבים', 'במקרים אלה', 'בשורה התחתונה', 'לצד זאת', 'מבחינה פרקטית', 'כתוצאה מכך', 'בשלב הבא', 'בהשוואה', 'בהשוואה לכך', 'באופן דומה']
// Common, natural Hebrew sentence-openers we should NOT penalize for repetition.
const START_STOPWORDS_HE = new Set(['כדי', 'אם', 'כאשר', 'בנוסף', 'עם', 'מעבר', 'לאחר', 'במקרים', 'חשוב', 'לכן', 'אחד', 'עבור', 'זה', 'זו', 'יש', 'כך'])
const TRANSITIONS_ES = ['además', 'por lo tanto', 'sin embargo', 'por otro lado', 'en cambio', 'por ejemplo', 'en la práctica', 'en resumen', 'es importante', 'conviene recordar', 'en otras palabras', 'finalmente', 'en primer lugar', 'en segundo lugar', 'por eso', 'como resultado', 'en muchos casos', 'a la hora de decidir', 'en conclusión', 'de forma similar', 'en comparación']
/** Spanish function words that start a sentence without carrying meaning — the
 *  repetitive-opening check ignores them, as START_STOPWORDS_HE does in Hebrew. */
const START_STOPWORDS_ES = new Set(['el', 'la', 'los', 'las', 'un', 'una', 'si', 'cuando', 'para', 'por', 'con', 'esto', 'esta', 'este', 'hay', 'es', 'son', 'además'])
const TRANSITIONS_EN = ['additionally', 'therefore', 'however', 'on the other hand', 'for example', 'in practice', 'in summary', 'importantly', 'moreover', 'in other words', 'finally', 'first', 'second', 'meanwhile', 'in short']
// Unambiguous, standalone CTA phrases (imperative action + intent). Natural
// service words like "הזמנה"/"משלוח"/"שירות" are deliberately NOT here.
const CTA_STRONG_HE = ['צרו קשר', 'צור קשר', 'צרו איתנו קשר', 'דברו איתנו', 'השאירו פרטים', 'לחצו כאן', 'להזמנה עכשיו', 'הזמינו עכשיו', 'לקבלת הצעת מחיר', 'שלחו הודעת וואטסאפ', 'שלחו לנו הודעה', 'חייגו עכשיו', 'התקשרו עכשיו', 'הזמינו כעת']
const CTA_STRONG_ES = ['contáctanos', 'contacta con nosotros', 'llama ahora', 'haz clic aquí', 'pide ahora', 'solicita ahora', 'reserva ahora', 'escríbenos', 'déjanos tus datos', 'pide presupuesto', 'solicita presupuesto', 'escríbenos por whatsapp', 'llámanos ahora', 'compra ahora']
const CTA_STRONG_EN = ['contact us', 'call now', 'click here', 'order now', 'get in touch', 'sign up now', 'book now', 'reach out to us', 'send us a message', 'leave your details', 'get a quote', 'whatsapp us', 'call us now', 'buy now']
// Action imperatives that only count as a CTA when a contact CHANNEL is nearby.
const CTA_ACTION_HE = ['התקשרו', 'חייגו', 'שלחו', 'פנו אלינו', 'לחצו', 'דברו', 'השאירו', 'כתבו לנו']
const CTA_ACTION_ES = ['llama', 'llámanos', 'escribe', 'escríbenos', 'contacta', 'haz clic', 'pide', 'solicita', 'reserva', 'déjanos']
const CTA_ACTION_EN = ['call', 'text', 'message', 'click', 'contact', 'reach out', 'book']
// A phone/WhatsApp number, WhatsApp/phone words, or a URL — the "target" of a CTA.
const CTA_CHANNEL_RE = /(\d[\d\-\s]{5,}\d|וואטסאפ|whatsapp|טלפון|נייד|https?:\/\/|www\.)/i

/**
 * Find the first REAL call-to-action in the text (word index), or -1. A CTA is
 * either an unambiguous standalone phrase, or an action imperative sitting right
 * next to a contact channel (number/WhatsApp/phone/URL). This avoids treating
 * everyday words like "הזמנה"/"משלוח"/"שירות" as CTAs.
 */
/** The word lists, keyed by content language: adding a language stops compiling here. */
const CTA_STRONG: Record<SuggestionLanguage, string[]> = { he: CTA_STRONG_HE, en: CTA_STRONG_EN, es: CTA_STRONG_ES }
const CTA_ACTION: Record<SuggestionLanguage, string[]> = { he: CTA_ACTION_HE, en: CTA_ACTION_EN, es: CTA_ACTION_ES }
const TRANSITIONS: Record<SuggestionLanguage, string[]> = { he: TRANSITIONS_HE, en: TRANSITIONS_EN, es: TRANSITIONS_ES }
const START_STOPWORDS: Record<SuggestionLanguage, Set<string>> = { he: START_STOPWORDS_HE, en: new Set<string>(), es: START_STOPWORDS_ES }

function detectCtaFirstWord(bodyText: string, lang: SuggestionLanguage): number {
  const low = bodyText.toLowerCase()
  const strong = CTA_STRONG[lang]
  const actions = CTA_ACTION[lang]
  let earliest = -1
  const mark = (idx: number) => {
    if (idx < 0) return
    const wi = words(bodyText.slice(0, idx)).length
    if (earliest < 0 || wi < earliest) earliest = wi
  }
  for (const p of strong) mark(low.indexOf(p.toLowerCase()))
  for (const a of actions) {
    let from = 0
    for (;;) {
      const i = low.indexOf(a.toLowerCase(), from)
      if (i < 0) break
      from = i + 1
      // Require a contact channel within a short window after the action verb.
      if (CTA_CHANNEL_RE.test(bodyText.slice(i, i + 60))) { mark(i); break }
    }
  }
  return earliest
}

/** Whether the CTA channel the user chose has the contact details it needs. */
function ctaDetailsSufficient(pref: string, d: CtaDetails): boolean {
  const text = d.text.trim(), phone = d.phone.trim(), wa = d.whatsapp.trim(), url = d.url.trim()
  switch (pref) {
    case 'whatsapp': return !!(wa || url)
    case 'phone': return !!(phone || url)
    case 'contact': return !!(text || url)
    default: return true // gentle / marketing: no hard requirement
  }
}

/** Detect leftover Markdown in the article's VISIBLE text (ignores attributes/
 * hrefs so real links don't false-positive). The server cleans Markdown before
 * saving; this is a safety net (e.g. for hand edits in the editor). */
function hasMarkdownArtifacts(html: string): boolean {
  const vis = textOf(html)
  return (
    /\*\*/.test(vis) ||               // **bold**
    /(^|\s)__(?=\S)/.test(vis) ||     // __bold__ (start)
    /`/.test(vis) ||                  // `code`
    /\[[^\]\n]+\]\([^)\s]+\)/.test(vis) || // [text](url)
    /(^|\s)#{2,6}\s/.test(vis)        // ## / ### headings
  )
}

function countTag(html: string, tag: string): number { const m = html.match(new RegExp(`<${tag}[\\s>]`, 'gi')); return m ? m.length : 0 }
function paragraphs(html: string): string[] {
  const out: string[] = []
  const re = /<p[^>]*>([\s\S]*?)<\/p>/gi
  let m: RegExpExecArray | null
  while ((m = re.exec(html)) !== null) out.push(m[1].replace(/<[^>]+>/g, ' ').replace(/&[a-z]+;/gi, ' ').replace(/\s+/g, ' ').trim())
  return out.filter(Boolean)
}
function textOf(html: string): string { return html.replace(/<[^>]+>/g, ' ').replace(/&[a-z]+;/gi, ' ').replace(/\s+/g, ' ').trim() }
function words(text: string): string[] { return text ? text.split(/\s+/).filter(Boolean) : [] }
function sentences(text: string): string[] { return text.split(/(?<=[.!?])\s+|(?<=[\.।])\s+/).map((s) => s.trim()).filter((s) => s.length > 0) }
export function includesKw(haystack: string, kw: string): boolean {
  const h = (haystack || '').toLowerCase(); const k = (kw || '').trim().toLowerCase()
  if (!k) return true
  if (h.includes(k)) return true
  // token-level fallback for inflected languages: all keyword tokens present.
  const toks = k.split(/\s+/).filter((t) => t.length > 2)
  if (toks.length === 0) return false
  if (toks.every((t) => h.includes(t))) return true
  // Hebrew glues ו/ה/ב/ל/מ/ש/כ onto the next word and bends a noun before
  // another ("פתיחה" → "פתיחת"). Exact substrings miss the keyword whenever the
  // KEYWORD carries the prefix ("בכיור" vs "הכיור") or the other form, so
  // compare whole words through their prefix-less cores.
  if (!HEBREW_LETTER.test(k)) return false
  const hayWords = h.split(/[^\p{L}\p{N}]+/u).filter(Boolean)
  return toks.every((t) => {
    const tw = t.replace(/[^\p{L}\p{N}]+/gu, '')
    if (!tw) return true
    if (!HEBREW_LETTER.test(tw)) return h.includes(t)
    return hayWords.some((w) => hebrewWordMatches(w, tw))
  })
}

const HEBREW_LETTER = /[\u05d0-\u05ea]/
const HE_PREFIX_LETTERS = new Set(['ו', 'ה', 'ב', 'ל', 'מ', 'ש', 'כ'])

/** A word and its forms with up to three leading prefix letters removed, never below three letters. */
function hebrewCores(word: string): { core: string; stripped: number }[] {
  const out = [{ core: word, stripped: 0 }]
  let t = word
  for (let i = 1; i <= 3 && t.length > 3 && HE_PREFIX_LETTERS.has(t[0]); i++) {
    t = t.slice(1)
    out.push({ core: t, stripped: i })
  }
  return out
}
/** The construct state ends in ת where the free noun ends in ה ("תחזוקת" / "תחזוקה"). */
const freeForm = (w: string) => (w.length >= 4 && w.endsWith('ת') ? `${w.slice(0, -1)}ה` : w)

/**
 * Whether one Hebrew word is the keyword word under a prefix or construct form:
 * "בכיור" ~ "הכיור" ~ "כיור", "פתיחת" ~ "פתיחה". When BOTH sides lose letters the
 * shared core must keep four, so "שלום" and "בלום" (core "לום") stay different.
 */
export function hebrewWordMatches(word: string, kwWord: string): boolean {
  if (word === kwWord) return true
  for (const a of hebrewCores(word)) {
    for (const b of hebrewCores(kwWord)) {
      const x = freeForm(a.core)
      if (x !== freeForm(b.core)) continue
      if (x.length >= (a.stripped && b.stripped ? 4 : 3)) return true
    }
  }
  return false
}

const FAQ_HEADING = /(שאלות\s+נפוצות|שאלות\s+ותשובות|frequently\s+asked|\bfaq\b|\bq\s*&\s*a\b)/i

/**
 * FAQ written into the article body ("<h2>שאלות נפוצות</h2><h3>…?</h3><p>…</p>")
 * rather than into the separate FAQ list. Each sub-heading under the FAQ heading
 * is a question; without sub-headings, each paragraph ending in "?" is one. The
 * answer is the text up to the next question.
 */
export function faqFromHtml(html: string): { question: string; answer: string }[] {
  const src = html || ''
  const headRe = /<h([2-4])[^>]*>([\s\S]*?)<\/h\1>/gi
  let m: RegExpExecArray | null
  while ((m = headRe.exec(src)) !== null) {
    if (!FAQ_HEADING.test(textOf(m[2]))) continue
    const level = Number(m[1])
    const rest = src.slice(m.index + m[0].length)
    const end = rest.search(new RegExp(`<h[1-${level}][\\s>]`, 'i'))
    const section = end < 0 ? rest : rest.slice(0, end)
    const out: { question: string; answer: string }[] = []
    const subRe = new RegExp(`<h([${level + 1}-6])[^>]*>([\\s\\S]*?)<\\/h\\1>`, 'gi')
    const subs = [...section.matchAll(subRe)]
    if (subs.length > 0) {
      subs.forEach((s, i) => {
        const from = (s.index ?? 0) + s[0].length
        const to = i + 1 < subs.length ? (subs[i + 1].index ?? section.length) : section.length
        const question = textOf(s[2])
        if (question) out.push({ question, answer: textOf(section.slice(from, to)) })
      })
      return out
    }
    const paras = paragraphs(section)
    paras.forEach((p, i) => {
      if (/[?؟]\s*$/.test(p)) out.push({ question: p, answer: paras[i + 1] && !/[?؟]\s*$/.test(paras[i + 1]) ? paras[i + 1] : '' })
    })
    return out
  }
  return []
}

// -- table helpers ----------------------------------------------------------

interface TableShape { cols: number; rows: number }
/** Parse each <table> into its column/row counts (robust to thead or th-in-tbody). */
function parseTables(html: string): TableShape[] {
  const out: TableShape[] = []
  const tableRe = /<table[\s\S]*?<\/table>/gi
  let tm: RegExpExecArray | null
  while ((tm = tableRe.exec(html)) !== null) {
    const rows = tm[0].match(/<tr[\s\S]*?<\/tr>/gi) || []
    let cols = 0
    for (const r of rows) { const cells = (r.match(/<t[hd][\s>]/gi) || []).length; if (cells > cols) cols = cells }
    out.push({ cols, rows: rows.length })
  }
  return out
}
/** A "real" table has >=2 columns AND >=2 rows (header + at least one data row). */
function isRealTable(t: TableShape): boolean { return t.cols >= 2 && t.rows >= 2 }

// Topics that genuinely call for a comparison/data table.
const TABLE_WORDS_HE = ['השווא', 'להשוו', 'מחיר', 'עלות', 'עלויות', 'כמה עולה', 'הכי טוב', 'סוגי', 'לבחור', 'בחירת', 'יתרונות', 'חסרונות', 'מדריך קנייה', 'טבלה']
const TABLE_WORDS_ES = ['compar', 'precio', 'coste', 'costo', 'cuánto cuesta', 'cuanto cuesta', 'mejor', 'mejores', 'tipos de', 'elegir', 'cómo elegir', 'ventajas', 'desventajas', 'guía de compra', 'tabla', ' vs ', 'más barato']
const TABLE_WORDS_EN = ['compar', 'price', 'cost', 'best', ' vs', 'versus', 'types', 'choose', 'choosing', 'buying guide', 'pros and cons', 'pros/cons', 'cheapest']
const TABLE_WORDS: Record<SuggestionLanguage, string[]> = { he: TABLE_WORDS_HE, en: TABLE_WORDS_EN, es: TABLE_WORDS_ES }
function isTableWorthy(text: string, lang: SuggestionLanguage): boolean {
  const t = (text || '').toLowerCase()
  const words = TABLE_WORDS[lang]
  return words.some((w) => t.includes(w))
}

// Question-style heading detection (so important questions live in the body too).
const QUESTION_WORDS_HE = ['מה ', 'מהו', 'מהי', 'איך', 'כיצד', 'כמה', 'למה', 'מדוע', 'האם', 'מתי', 'איפה', 'היכן', 'מי ']
const QUESTION_WORDS_ES = ['qué ', 'que ', 'cómo ', 'como ', 'cuánto', 'cuanto', 'por qué', 'por que', 'cuál', 'cual', 'cuándo', 'cuando', 'dónde', 'donde', 'quién', 'quien', 'es ', 'son ', 'conviene', 'debo ', 'hay que', '¿']
const QUESTION_WORDS_EN = ['how ', 'what ', 'why ', 'when ', 'which ', 'where ', 'who ', 'is ', 'are ', 'should ', 'can ', 'do ']
const QUESTION_WORDS: Record<SuggestionLanguage, string[]> = { he: QUESTION_WORDS_HE, en: QUESTION_WORDS_EN, es: QUESTION_WORDS_ES }
function looksLikeQuestion(text: string, lang: SuggestionLanguage): boolean {
  const t = (text || '').trim().toLowerCase()
  if (!t) return false
  if (t.includes('?')) return true
  const words = QUESTION_WORDS[lang]
  return words.some((w) => t.startsWith(w))
}
function headingTexts(html: string, tag: 'h2' | 'h3'): string[] {
  return (html.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'gi')) || []).map((s) => s.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim())
}

// -- the audit --------------------------------------------------------------

export function runArticleAudit(input: AuditInput): AuditResult {
  const th = thresholdsFor(input.desiredWordCount)
  const html = input.contentHtml || ''
  const bodyText = textOf(html)
  const allWords = words(bodyText)
  const paras = paragraphs(html)
  const lang = input.language
  const kw = (input.primaryKeyword || '').trim()

  // counts.tables reflects REAL tables only (>=2 cols, >=2 rows). A present-but-
  // malformed/collapsed table is flagged separately, not counted as a table.
  const tableShapes = parseTables(html)
  const tables = tableShapes.filter(isRealTable).length
  const malformedTable = tableShapes.length > tables
  const lists = countTag(html, 'ul') + countTag(html, 'ol')
  const h2 = countTag(html, 'h2')
  const h3 = countTag(html, 'h3')
  const pCount = paras.length
  const wordCount = allWords.length
  // The FAQ list wins; an article whose FAQ lives only in the body (published
  // articles, pasted content) is still credited for it instead of reading 0.
  const faqItems = input.faq.length > 0 ? input.faq : faqFromHtml(html)
  const faqCount = faqItems.length

  // Readability metrics.
  const transitions = TRANSITIONS[lang]
  const startStop = START_STOPWORDS[lang]
  // Count TOTAL transition phrases across the whole body (anywhere in a sentence/
  // paragraph), including multi-word phrases — not just per-paragraph.
  const bodyLower = bodyText.toLowerCase()
  let transitionCount = 0
  for (const w of transitions) {
    let from = 0
    for (;;) {
      const i = bodyLower.indexOf(w, from)
      if (i < 0) break
      transitionCount++
      from = i + w.length
    }
  }
  let transitionParagraphs = 0
  let longParagraphs = 0
  let totalSentences = 0
  const startCounts: Record<string, number> = {}
  for (const p of paras) {
    const low = p.toLowerCase()
    if (transitions.some((w) => low.includes(w))) transitionParagraphs++
    const sents = sentences(p)
    totalSentences += sents.length
    if (words(p).length > 90 || sents.length > 6) longParagraphs++
    for (const s of sents) {
      const first = (s.split(/\s+/)[0] || '').toLowerCase().replace(/[^a-zא-ת]/g, '')
      // Don't penalize repetition of natural/common openers.
      if (first && !startStop.has(first)) startCounts[first] = (startCounts[first] || 0) + 1
    }
  }
  const maxRepeatedStart = Object.values(startCounts).reduce((a, b) => Math.max(a, b), 0)
  const avgSentenceWords = totalSentences > 0 ? Math.round(wordCount / totalSentences) : 0

  // Keyword density.
  const kwLower = kw.toLowerCase()
  const kwOccurrences = kwLower ? (bodyText.toLowerCase().split(kwLower).length - 1) : 0
  const density = wordCount > 0 && kwLower ? (kwOccurrences * (kwLower.split(/\s+/).length)) / wordCount : 0

  // Anchors.
  const anchorVal = validateAnchorPlacement(input.anchors, html)

  const checks: AuditCheck[] = []
  const add = (code: string, category: CheckCategory, severity: CheckSeverity, ok: boolean) => checks.push({ code, category, severity, ok })

  // --- SEO ---
  add('title_exists', 'seo', 'blocker', !!input.title.trim())
  // Phase 3J — the keyword satisfies this check in the H1/title OR the meta
  // title (the SEO-visible titles): a natural H1 like "האיים הקנריים לחובבי
  // אקסטרים" with the keyword in metaTitle is valid — only BOTH missing warns.
  add('primary_keyword_in_title', 'seo', 'warning', !kw || includesKw(input.title, kw) || includesKw(input.metaTitle || '', kw))
  add('meta_title_exists', 'seo', 'warning', !!(input.metaTitle || '').trim())
  add('meta_title_length', 'seo', 'warning', (input.metaTitle || '').length <= 60)
  add('meta_description_exists', 'seo', 'warning', !!(input.metaDescription || '').trim())
  add('meta_description_length', 'seo', 'warning', (() => { const l = (input.metaDescription || '').length; return l === 0 ? false : l >= 110 && l <= 160 })())
  add('primary_keyword_in_meta', 'seo', 'warning', !kw || includesKw(`${input.metaTitle || ''} ${input.metaDescription || ''}`, kw))
  add('slug_english', 'seo', 'warning', /^[a-z0-9-]+$/.test(input.slug || ''))
  add('excerpt_exists', 'seo', 'warning', !!(input.excerpt || '').trim())
  // keyword in first 10% of the article
  const firstChunk = allWords.slice(0, Math.max(30, Math.round(wordCount * 0.1))).join(' ')
  add('primary_keyword_in_intro', 'seo', 'warning', !kw || includesKw(firstChunk, kw))
  // keyword in at least one H2
  const h2Texts = (html.match(/<h2[^>]*>([\s\S]*?)<\/h2>/gi) || []).map((s) => s.replace(/<[^>]+>/g, ' '))
  add('primary_keyword_in_h2', 'seo', 'warning', !kw || h2Texts.some((h) => includesKw(h, kw)))
  add('no_keyword_stuffing', 'seo', 'warning', density <= 0.035)
  const providedSecondary = input.secondaryKeywords.filter(Boolean)
  add('secondary_keywords_used', 'seo', 'info', providedSecondary.length === 0 || providedSecondary.some((s) => includesKw(bodyText, s)))

  // --- Technical HTML ---
  // Two-tier structure gating: a BLOCKER only when significantly below the
  // minimum (a genuinely unusable article); "below ideal but usable" is a
  // WARNING so decent articles aren't rejected for one strict count.
  const hardMinH2 = Math.max(2, th.minH2 - 2)
  const hardMinP = Math.max(4, th.minP - 3)
  add('no_h1', 'technical', 'blocker', countTag(html, 'h1') === 0)
  add('too_few_h2', 'technical', 'blocker', h2 >= hardMinH2)
  add('h2_below_ideal', 'technical', 'warning', h2 >= th.minH2)
  add('enough_h3', 'technical', 'warning', th.minH3 === 0 || h3 >= th.minH3)
  add('too_few_paragraphs', 'technical', 'blocker', pCount >= hardMinP)
  add('paragraphs_below_ideal', 'technical', 'warning', pCount >= th.minP)
  add('has_list', 'technical', 'warning', lists >= th.minLists)
  add('has_table', 'technical', 'info', tables >= 1)
  // A table that exists but isn't a real 2x2+ table (collapsed/single row) warns.
  add('table_structure_valid', 'technical', 'warning', !malformedTable)
  // Comparison/price/choice topics genuinely need a real table — warn (→ repair) if absent.
  const tableWorthy = isTableWorthy(`${input.title} ${input.primaryKeyword || ''} ${input.secondaryKeywords.join(' ')} ${input.slug}`, lang)
  add('table_recommended', 'technical', 'warning', !tableWorthy || tables >= 1)
  add('no_unsafe_html', 'technical', 'blocker', !/<script|<iframe|on\w+\s*=/i.test(html))
  // Leftover Markdown in the body (server cleans it pre-save; warn if any slips
  // through or the user pasted Markdown while editing).
  add('markdown_artifacts_absent', 'technical', 'warning', !hasMarkdownArtifacts(html))
  // TOC-ready (structure), NOT "manual TOC present" — never a blocker.
  const h1Count = countTag(html, 'h1')
  const firstH2 = html.search(/<h2[\s>]/i)
  const firstH3 = html.search(/<h3[\s>]/i)
  const hierarchyOk = firstH3 < 0 || (firstH2 >= 0 && firstH2 < firstH3)
  const tocReady = h1Count === 0 && h2 >= 2 && hierarchyOk
  add('toc_ready', 'technical', 'info', tocReady)
  // word count: blocker only below 70% of target; 70-85% is a warning.
  const ratio = input.desiredWordCount > 0 ? wordCount / input.desiredWordCount : 1
  add('too_short', 'technical', 'blocker', ratio >= 0.7)
  if (ratio >= 0.7 && ratio < 0.85) add('word_count_band', 'technical', 'warning', false)

  // --- Readability ---
  add('paragraphs_not_too_long', 'readability', 'warning', longParagraphs <= Math.max(1, Math.round(pCount * 0.2)))
  add('sentence_length_ok', 'readability', 'warning', avgSentenceWords === 0 || avgSentenceWords <= 26)
  // Enough transition phrases anywhere in the article → no warning. Soft, count-
  // based threshold: >=5 for long articles (>1500w), >=4 for ~1000-1500, >=3 short.
  const minTransitions = input.desiredWordCount > 1500 ? 5 : input.desiredWordCount >= 1000 ? 4 : 3
  add('has_transition_words', 'readability', 'warning', transitionCount >= minTransitions || transitionParagraphs >= Math.max(2, Math.round(pCount * 0.25)))
  // Only flag repeated openings when it's genuinely heavy: same opener >=5 times
  // AND making up >25% of sentences (natural openers are already excluded above).
  add('varied_sentence_starts', 'readability', 'warning', !(maxRepeatedStart >= 5 && maxRepeatedStart > totalSentences * 0.25))

  // --- GEO / AI search ---
  add('has_faq', 'geo', 'warning', faqCount >= th.minFaq)
  add('faq_present', 'geo', 'info', faqCount > 0)
  // FAQ answers should carry real value (not thin). faq_json stays ready for a
  // future FAQ schema at PUBLISH time — no JSON-LD/Yoast/Rank-Math block here.
  add('faq_answers_have_value', 'geo', 'warning', faqCount === 0 || faqItems.every((f) => words(f.answer).length >= 12))
  // Questions shouldn't be generic filler ("what is X?").
  add('faq_not_generic', 'geo', 'info', faqCount === 0 || faqItems.every((f) => words(f.question).length >= 3))
  // Important questions should also appear in the body as H2/H3, not only in FAQ.
  const bodyHeadings = [...headingTexts(html, 'h2'), ...headingTexts(html, 'h3')]
  add('questions_in_body', 'geo', 'info', bodyHeadings.some((h) => looksLikeQuestion(h, lang)))
  // direct answer early + entities/practicality are approximated by structure.
  add('has_early_answer', 'geo', 'warning', pCount > 0 && words(paras[0]).length >= 20)
  add('not_generic', 'geo', 'info', tables >= 1 || lists >= 1 || faqCount >= 2 || h3 >= 1)

  // --- language ---
  // The article must actually be written in its own script. Hebrew content is
  // mostly Hebrew letters; a latin-script language (English, Spanish) is mostly
  // latin letters — an article returned in the wrong language fails here instead
  // of saving, which is what used to happen to any language that was not Hebrew.
  {
    const hebrew = (bodyText.match(/[֐-׿]/g) || []).length
    const latin = (bodyText.match(/[A-Za-z]/g) || []).length
    add('language_matches', 'technical', 'blocker',
      contentScript(lang) === 'hebrew' ? hebrew >= latin : latin >= hebrew)
  }

  // --- brand / CTA rules ---
  const brandForCheck = (input.brandName || input.businessName || '').trim()
  if (!input.includeBrandName && brandForCheck) {
    // Brand inside a user-provided anchor (required/optional) is allowed. A FREE
    // mention is only a WARNING — never a blocker: it must not fail generation
    // or block "mark as ready" (the user can edit it out if unwanted).
    add('brand_mention_when_disabled', 'seo', 'warning', !brandMentionedOutsideAnchors(html, input.anchors, brandForCheck))
  }
  const ctaEnabled = !(input.ctaPreference === 'none' || !input.ctaPreference)
  const ctaFirstWord = detectCtaFirstWord(bodyText, lang)
  const ctaPresent = ctaFirstWord >= 0
  if (!ctaEnabled) {
    // "none" chosen: a stray CTA is only a WARNING — natural service wording
    // must never fail generation or block "mark as ready" (user can edit it out).
    add('cta_present_when_disabled', 'seo', 'warning', !ctaPresent)
  } else {
    // A WhatsApp/phone/contact CTA needs real contact details to point at.
    add('cta_details_missing', 'seo', 'blocker', ctaDetailsSufficient(input.ctaPreference!, input.ctaDetails))
    // CTA should sit toward the END, not in the opening.
    add('cta_too_early', 'seo', 'warning', !ctaPresent || ctaFirstWord >= wordCount * 0.5)
  }

  // --- required anchors ---
  add('required_anchors_present', 'seo', 'blocker', !anchorVal.hasBlockingIssues)

  // --- anchor PLACEMENT quality (Google link best-practices) ---
  // Placement quality is a WARNING, not a blocker: the deterministic enforcer
  // already repositions too-early links, and we don't want to reject an
  // otherwise-good article over link placement. Missing REQUIRED anchors above
  // is still a blocker.
  const anchorQuality = analyzeAnchorQuality(html, lang)
  add('anchor_too_early', 'seo', 'warning', !anchorQuality.anchorTooEarly)
  add('anchor_inserted_mechanically', 'seo', 'warning', !anchorQuality.mechanicalAnchorPhrase)
  add('anchor_spacing_too_close', 'seo', 'warning', !(anchorQuality.anchorsTooClose || anchorQuality.anchorsInSameParagraph))

  // --- content exists ---
  add('content_exists', 'technical', 'blocker', wordCount >= 50)

  const blockers = checks.filter((c) => c.severity === 'blocker' && !c.ok).map((c) => c.code)
  const warnings = checks.filter((c) => c.severity === 'warning' && !c.ok).map((c) => c.code)

  // Score: blockers weigh most; soft style/flow warnings barely move the score
  // so a clean, well-structured article doesn't feel "problematic" over polish.
  const SOFT_WARNINGS = new Set(['has_transition_words', 'varied_sentence_starts', 'sentence_length_ok', 'paragraphs_not_too_long'])
  const softWarnings = warnings.filter((w) => SOFT_WARNINGS.has(w)).length
  const hardWarnings = warnings.length - softWarnings
  let score = 100 - blockers.length * 15 - hardWarnings * 4 - softWarnings * 1
  if (score < 0) score = 0
  if (score > 100) score = 100

  const counts: AuditCounts = {
    h2, h3, p: pCount, li: countTag(html, 'li'), words: wordCount, faq: faqCount, tables, lists,
    transitionParagraphs, longParagraphs, maxRepeatedStart, avgSentenceWords,
  }

  return {
    score, blockers, warnings, counts, checks,
    anchorsOk: !anchorVal.hasBlockingIssues, requiredAnchorsMissing: anchorVal.missingRequired.length,
    tocReady, anchorQuality,
  }
}

// -- safe debug summary (returned to the client on failure) -----------------

export interface AuditSummary {
  score: number
  counts: { words: number; h2: number; h3: number; paragraphs: number; lists: number; tables: number; faq: number }
  blockers: string[]
  warnings: string[]
}

/** Reduce a full audit to safe, non-sensitive counts/codes (no content). */
export function auditSummary(a: AuditResult): AuditSummary {
  return {
    score: a.score,
    counts: {
      words: a.counts.words, h2: a.counts.h2, h3: a.counts.h3,
      paragraphs: a.counts.p, lists: a.counts.lists, tables: a.counts.tables, faq: a.counts.faq,
    },
    blockers: a.blockers,
    warnings: a.warnings,
  }
}
