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

const TRANSITIONS_HE = ['בנוסף', 'לכן', 'עם זאת', 'מצד שני', 'למשל', 'בפועל', 'לסיכום', 'חשוב לדעת', 'מעבר לכך', 'כלומר', 'לעומת זאת', 'בסופו של דבר', 'ראשית', 'שנית', 'לבסוף']
const TRANSITIONS_EN = ['additionally', 'therefore', 'however', 'on the other hand', 'for example', 'in practice', 'in summary', 'importantly', 'moreover', 'in other words', 'finally', 'first', 'second', 'meanwhile', 'in short']
const CTA_HE = ['צרו קשר', 'צור קשר', 'חייגו', 'התקשרו', 'לחצו כאן', 'הזמינו', 'וואטסאפ', 'דברו איתנו', 'השאירו פרטים']
const CTA_EN = ['contact us', 'call now', 'click here', 'order now', 'get in touch', 'buy now', 'sign up', 'book now', 'reach out']

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
function includesKw(haystack: string, kw: string): boolean {
  const h = (haystack || '').toLowerCase(); const k = (kw || '').trim().toLowerCase()
  if (!k) return true
  if (h.includes(k)) return true
  // token-level fallback for inflected languages: all keyword tokens present.
  const toks = k.split(/\s+/).filter((t) => t.length > 2)
  return toks.length > 0 && toks.every((t) => h.includes(t))
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
const TABLE_WORDS_EN = ['compar', 'price', 'cost', 'best', ' vs', 'versus', 'types', 'choose', 'choosing', 'buying guide', 'pros and cons', 'pros/cons', 'cheapest']
function isTableWorthy(text: string, lang: SuggestionLanguage): boolean {
  const t = (text || '').toLowerCase()
  const words = lang === 'he' ? TABLE_WORDS_HE : TABLE_WORDS_EN
  return words.some((w) => t.includes(w))
}

// Question-style heading detection (so important questions live in the body too).
const QUESTION_WORDS_HE = ['מה ', 'מהו', 'מהי', 'איך', 'כיצד', 'כמה', 'למה', 'מדוע', 'האם', 'מתי', 'איפה', 'היכן', 'מי ']
const QUESTION_WORDS_EN = ['how ', 'what ', 'why ', 'when ', 'which ', 'where ', 'who ', 'is ', 'are ', 'should ', 'can ', 'do ']
function looksLikeQuestion(text: string, lang: SuggestionLanguage): boolean {
  const t = (text || '').trim().toLowerCase()
  if (!t) return false
  if (t.includes('?')) return true
  const words = lang === 'he' ? QUESTION_WORDS_HE : QUESTION_WORDS_EN
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
  const faqCount = input.faq.length

  // Readability metrics.
  const transitions = lang === 'he' ? TRANSITIONS_HE : TRANSITIONS_EN
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
      if (first) startCounts[first] = (startCounts[first] || 0) + 1
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
  add('primary_keyword_in_title', 'seo', 'warning', !kw || includesKw(input.title, kw))
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
  add('has_transition_words', 'readability', 'warning', transitionParagraphs >= Math.max(2, Math.round(pCount * 0.25)))
  add('varied_sentence_starts', 'readability', 'warning', maxRepeatedStart <= 3)

  // --- GEO / AI search ---
  add('has_faq', 'geo', 'warning', faqCount >= th.minFaq)
  add('faq_present', 'geo', 'info', faqCount > 0)
  // FAQ answers should carry real value (not thin). faq_json stays ready for a
  // future FAQ schema at PUBLISH time — no JSON-LD/Yoast/Rank-Math block here.
  add('faq_answers_have_value', 'geo', 'warning', faqCount === 0 || input.faq.every((f) => words(f.answer).length >= 12))
  // Questions shouldn't be generic filler ("what is X?").
  add('faq_not_generic', 'geo', 'info', faqCount === 0 || input.faq.every((f) => words(f.question).length >= 3))
  // Important questions should also appear in the body as H2/H3, not only in FAQ.
  const bodyHeadings = [...headingTexts(html, 'h2'), ...headingTexts(html, 'h3')]
  add('questions_in_body', 'geo', 'info', bodyHeadings.some((h) => looksLikeQuestion(h, lang)))
  // direct answer early + entities/practicality are approximated by structure.
  add('has_early_answer', 'geo', 'warning', pCount > 0 && words(paras[0]).length >= 20)
  add('not_generic', 'geo', 'info', tables >= 1 || lists >= 1 || faqCount >= 2 || h3 >= 1)

  // --- language ---
  if (lang === 'he') {
    const hebrew = (bodyText.match(/[֐-׿]/g) || []).length
    const latin = (bodyText.match(/[A-Za-z]/g) || []).length
    add('language_matches', 'technical', 'blocker', hebrew >= latin)
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
  const ctaList = lang === 'he' ? CTA_HE : CTA_EN
  const ctaLower = bodyText.toLowerCase()
  let ctaFirstWord = -1
  for (const c of ctaList) {
    const idx = ctaLower.indexOf(c)
    if (idx >= 0) { const wi = words(bodyText.slice(0, idx)).length; if (ctaFirstWord < 0 || wi < ctaFirstWord) ctaFirstWord = wi }
  }
  const ctaPresent = ctaFirstWord >= 0
  if (!ctaEnabled) {
    // "none" chosen → there must be no CTA in the article.
    add('cta_present_when_disabled', 'seo', 'blocker', !ctaPresent)
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

  // Score: from warnings/blockers.
  let score = 100 - blockers.length * 15 - warnings.length * 4
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
