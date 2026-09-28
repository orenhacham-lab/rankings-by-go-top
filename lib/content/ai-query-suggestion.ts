/**
 * The AI-visibility question suggested for a published article.
 *
 * Built from a template and the article's primary keyword: no model call, no
 * provider call, no quota. It is only a SUGGESTION — nothing is written until
 * the owner clicks "track", which goes through the existing prompt-creation
 * route (/api/ai-visibility/prompts). Running a check on it later is the
 * existing, quota-checked flow; this file never runs one.
 *
 * The question is conversational and never names the brand: a question that
 * names the business measures whether engines repeat the name back, not whether
 * they cite the article to someone who does not know it yet.
 */

export type SuggestionLanguage = 'he' | 'en'

export interface AiQuerySuggestionInput {
  /** The topic's primary keyword. The title is used only when there is none. */
  keyword: string | null | undefined
  title?: string | null
  language: string | null | undefined
  /** Business name, project name, domain: any of these in the question drops it. */
  brandTerms?: (string | null | undefined)[]
}

const QUESTION_START: Record<SuggestionLanguage, RegExp> = {
  he: /^(?:מה|מהו|מהי|מהם|מהן|איך|כיצד|למה|מדוע|כמה|איפה|היכן|מתי|האם|איזה|איזו|אילו|מי)(?:\s|$)/,
  en: /^(?:what|how|why|which|where|when|who|is|are|can|should|do|does)\b/i,
}

/** "best / recommended" words: the question asks for a recommendation. */
const RECOMMEND: Record<SuggestionLanguage, RegExp> = {
  he: /(?:^|\s)(?:הכי\s+טוב\S*|מומלצ\S*|הטוב\S*\s+ביותר|טופ)(?:\s|$)/,
  en: /\b(?:best|top|recommended)\b/i,
}

/** A keyword that already names the act of buying ("buying X", "buy X"). */
const BUY: Record<SuggestionLanguage, RegExp> = {
  he: /^(?:קניית|קנייה של|רכישת|הזמנת)\s/,
  en: /^(?:buy|buying|order|ordering)\s/i,
}

const TEMPLATES: Record<SuggestionLanguage, { recommend: (k: string) => string; buy: (k: string) => string; general: (k: string) => string }> = {
  he: {
    recommend: (k) => `אשמח להמלצה: ${k}. מה כדאי לבחור?`,
    buy: (k) => `מה חשוב לבדוק לפני ${k}?`,
    general: (k) => `מה חשוב לדעת על ${k}?`,
  },
  en: {
    recommend: (k) => `I'm looking for the ${k.replace(/^the\s+/i, '')}. What would you recommend?`,
    buy: (k) => `What should I check before ${k.replace(/^buy\s/i, 'buying ').replace(/^order\s/i, 'ordering ')}?`,
    general: (k) => `What should I know about ${k}?`,
  },
}

const MIN_LEN = 3
const MAX_LEN = 160

const collapse = (s: unknown) => String(s ?? '').replace(/\s+/g, ' ').trim()

export function suggestionLanguage(l: string | null | undefined): SuggestionLanguage {
  return String(l ?? '').toLowerCase().startsWith('en') ? 'en' : 'he'
}

/** Second-level suffixes and platform hosts that are never the brand part of a domain. */
const NOT_BRAND_LABELS = new Set(['co', 'com', 'org', 'net', 'ac', 'gov', 'edu', 'myshopify', 'wixsite', 'wordpress', 'blogspot', 'www'])

/** Words of a brand term worth checking: the term itself, and for a domain its brand label ("runshop.co.il" → "runshop"). */
function brandTokens(term: string): string[] {
  const lower = collapse(term).toLowerCase()
  const pieces = new Set<string>([lower])
  const host = lower.replace(/^https?:\/\//, '').split('/')[0]
  if (/^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(host)) {
    const labels = host.split('.').slice(0, -1).filter((l) => !NOT_BRAND_LABELS.has(l))
    const brand = labels[labels.length - 1]
    if (brand) pieces.add(brand.replace(/-+/g, ' '))
  }
  return [...pieces].filter((p) => p.length >= 3)
}

/** True when the text names the business (whole brand term, case-insensitive). */
export function mentionsBrand(text: string, brandTerms: (string | null | undefined)[] = []): boolean {
  const hay = ` ${collapse(text).toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ')} `
  for (const raw of brandTerms) {
    const term = collapse(raw)
    if (!term) continue
    for (const tok of brandTokens(term)) {
      const needle = ` ${tok.replace(/[^\p{L}\p{N}]+/gu, ' ').trim()} `
      if (needle.trim().length >= 3 && hay.includes(needle)) return true
    }
  }
  return false
}

/**
 * The suggested question, or null when there is nothing sound to suggest
 * (no keyword, a keyword that names the brand, or a result out of bounds).
 */
export function suggestAiQuery(input: AiQuerySuggestionInput): string | null {
  const lang = suggestionLanguage(input.language)
  const keyword = collapse(input.keyword).replace(/[?？!.]+$/, '')
  if (keyword.length < MIN_LEN) return null
  if (mentionsBrand(keyword, input.brandTerms)) return null

  let question: string
  if (QUESTION_START[lang].test(keyword)) question = `${keyword}?`
  else if (RECOMMEND[lang].test(keyword)) question = TEMPLATES[lang].recommend(keyword)
  else if (BUY[lang].test(keyword)) question = TEMPLATES[lang].buy(keyword)
  else question = TEMPLATES[lang].general(keyword)

  question = collapse(question)
  if (lang === 'en') question = question.charAt(0).toUpperCase() + question.slice(1)
  if (question.length > MAX_LEN) return null
  if (mentionsBrand(question, input.brandTerms)) return null
  return question
}
