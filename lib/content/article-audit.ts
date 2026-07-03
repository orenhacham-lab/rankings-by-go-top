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
import { validateAnchorPlacement } from '@/lib/content/anchors-check'

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
}

export interface AuditInput {
  language: SuggestionLanguage
  desiredWordCount: number
  primaryKeyword: string | null
  secondaryKeywords: string[]
  ctaPreference: string | null
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

export interface Thresholds { minH2: number; minP: number; minH3: number; minFaq: number; minLists: number; tocRequired: boolean }
export function thresholdsFor(desired: number): Thresholds {
  if (desired <= 500) return { minH2: 3, minP: 6, minH3: 0, minFaq: 2, minLists: 1, tocRequired: false }
  if (desired <= 1000) return { minH2: 5, minP: 10, minH3: 0, minFaq: 3, minLists: 1, tocRequired: false }
  if (desired <= 1500) return { minH2: 6, minP: 14, minH3: 2, minFaq: 4, minLists: 1, tocRequired: false }
  if (desired <= 2000) return { minH2: 8, minP: 18, minH3: 3, minFaq: 5, minLists: 2, tocRequired: false }
  return { minH2: 9, minP: 22, minH3: 4, minFaq: 6, minLists: 2, tocRequired: true }
}

// -- text helpers -----------------------------------------------------------

const TRANSITIONS_HE = ['בנוסף', 'לכן', 'עם זאת', 'מצד שני', 'למשל', 'בפועל', 'לסיכום', 'חשוב לדעת', 'מעבר לכך', 'כלומר', 'לעומת זאת', 'בסופו של דבר', 'ראשית', 'שנית', 'לבסוף']
const TRANSITIONS_EN = ['additionally', 'therefore', 'however', 'on the other hand', 'for example', 'in practice', 'in summary', 'importantly', 'moreover', 'in other words', 'finally', 'first', 'second', 'meanwhile', 'in short']
const CTA_HE = ['צרו קשר', 'צור קשר', 'חייגו', 'התקשרו', 'לחצו כאן', 'הזמינו', 'וואטסאפ', 'דברו איתנו', 'השאירו פרטים']
const CTA_EN = ['contact us', 'call now', 'click here', 'order now', 'get in touch', 'buy now', 'sign up', 'book now', 'reach out']

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

// -- the audit --------------------------------------------------------------

export function runArticleAudit(input: AuditInput): AuditResult {
  const th = thresholdsFor(input.desiredWordCount)
  const html = input.contentHtml || ''
  const bodyText = textOf(html)
  const allWords = words(bodyText)
  const paras = paragraphs(html)
  const lang = input.language
  const kw = (input.primaryKeyword || '').trim()

  const tables = countTag(html, 'table')
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
  add('no_h1', 'technical', 'blocker', countTag(html, 'h1') === 0)
  add('enough_h2', 'technical', 'blocker', h2 >= th.minH2)
  add('enough_h3', 'technical', 'warning', th.minH3 === 0 || h3 >= th.minH3)
  add('enough_paragraphs', 'technical', 'blocker', pCount >= th.minP)
  add('has_list', 'technical', 'warning', lists >= th.minLists)
  add('has_table', 'technical', 'info', tables >= 1)
  add('no_unsafe_html', 'technical', 'blocker', !/<script|<iframe|on\w+\s*=/i.test(html))
  add('toc_present', 'technical', th.tocRequired ? 'blocker' : 'info', !th.tocRequired || /toc|<nav/i.test(html))
  // word count band
  const ratio = input.desiredWordCount > 0 ? wordCount / input.desiredWordCount : 1
  add('word_count', 'technical', 'blocker', ratio >= 0.7)
  if (ratio >= 0.7 && ratio < 0.85) add('word_count_band', 'technical', 'warning', false)

  // --- Readability ---
  add('paragraphs_not_too_long', 'readability', 'warning', longParagraphs <= Math.max(1, Math.round(pCount * 0.2)))
  add('sentence_length_ok', 'readability', 'warning', avgSentenceWords === 0 || avgSentenceWords <= 26)
  add('has_transition_words', 'readability', 'warning', transitionParagraphs >= Math.max(2, Math.round(pCount * 0.25)))
  add('varied_sentence_starts', 'readability', 'warning', maxRepeatedStart <= 3)

  // --- GEO / AI search ---
  add('has_faq', 'geo', 'warning', faqCount >= th.minFaq)
  add('faq_present', 'geo', 'info', faqCount > 0)
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
    add('no_brand_when_disabled', 'seo', 'blocker', !bodyText.toLowerCase().includes(brandForCheck.toLowerCase()))
  }
  if (input.ctaPreference === 'none' || !input.ctaPreference) {
    const ctaList = lang === 'he' ? CTA_HE : CTA_EN
    add('no_cta_when_disabled', 'seo', 'blocker', !ctaList.some((c) => bodyText.toLowerCase().includes(c)))
  }

  // --- required anchors ---
  add('required_anchors_present', 'seo', 'blocker', !anchorVal.hasBlockingIssues)

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
  }
}
