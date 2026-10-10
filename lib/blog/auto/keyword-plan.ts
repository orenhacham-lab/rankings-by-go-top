/**
 * FILLING THE BLOG'S QUEUE WITH KEYWORDS PEOPLE ACTUALLY SEARCH.
 *
 * Every row of blog_plan is a keyword that Google's own Keyword Planner reports
 * monthly searches for (lib/google-ads/keyword-ideas.ts, the same call the
 * research screen makes). Nothing is planned from a hunch.
 *
 * The selection below is the part that decides whether a daily cadence is worth
 * anything. Three things are thrown away:
 *   * a keyword with no real volume — an article for it has no reader;
 *   * a keyword too close to one we have already published or planned — that is
 *     two of our own pages competing for one query;
 *   * a navigational or agency keyword — somebody searching our brand, or the
 *     agency's services, is not looking for a blog article on this site.
 *
 * `selectKeywords` is pure, so the whole policy is exercisable without Google.
 */

import type { KeywordIdeaResult } from '@/lib/google-ads/keyword-ideas'
import { generateKeywordIdeas } from '@/lib/google-ads/keyword-ideas'
import { hebrewWordMatches } from '@/lib/content/article-audit'
import type { BlogAutoLocale } from '@/lib/blog/auto/rotation'

/** Keyword Planner's country + language for each blog language. */
export const RESEARCH_MARKET: Record<BlogAutoLocale, { country: string; language: string }> = {
  he: { country: 'IL', language: 'he' },
  en: { country: 'US', language: 'en' },
  es: { country: 'ES', language: 'es' },
}

/**
 * The floor for "somebody searches this". Hebrew is a 9-million-speaker market,
 * so the same floor as English would reject nearly every real Hebrew query.
 */
export const MIN_MONTHLY_SEARCHES: Record<BlogAutoLocale, number> = { he: 20, en: 80, es: 50 }

/** Seeds the research starts from — the subjects this product is actually about. */
export const RESEARCH_SEEDS: Record<BlogAutoLocale, string[]> = {
  he: [
    'קידום אתרים', 'בדיקת מיקום בגוגל', 'מחקר מילות מפתח', 'קידום אורגני',
    'seo', 'קידום בai', 'דירוג בגוגל', 'מהירות אתר', 'תוכן לאתר', 'גוגל סרץ קונסול',
  ],
  en: [
    'seo', 'keyword research', 'rank tracking', 'ai search visibility',
    'technical seo', 'google search console', 'seo for small business', 'content seo',
  ],
  es: [
    'seo', 'posicionamiento en google', 'investigación de palabras clave',
    'seo técnico', 'visibilidad en ia', 'google search console', 'seo para pymes',
  ],
}

/**
 * Keywords that are never an article on this blog: our own and the agency's
 * names (navigational), and the agency's done-for-you services, which belong to
 * gotop.co.il and not to the product's blog.
 */
export const EXCLUDED_PATTERNS: RegExp[] = [
  /\bgo\s*top\b/i,
  /\bגו\s*טופ\b/,
  /rankings by/i,
  /(סוכנות|משרד)\s*(קידום|פרסום|דיגיטל)/,
  /(seo|marketing)\s+(agency|agencia)/i,
  /\b(מחיר|מחירון|עלות)\s+(קידום|פרסום)\b/,
]

/** Lower-cased, punctuation out, one-letter words dropped. */
export function keywordTokens(keyword: string): string[] {
  return keyword
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]+/gu, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 1)
}

/**
 * How much two keywords overlap, 0..1, by shared words over the shorter one.
 * "מחקר מילות מפתח" vs "כלי למחקר מילות מפתח" = 1 — the same article.
 */
export function keywordOverlap(a: string, b: string): number {
  const ta = [...new Set(keywordTokens(a))]
  const tb = [...new Set(keywordTokens(b))]
  if (!ta.length || !tb.length) return 0
  let shared = 0
  // A Hebrew word carries its prepositions as letters — "למחקר" is "מחקר". Plain
  // string equality would therefore read "כלי למחקר מילות מפתח" as a different
  // subject from "מחקר מילות מפתח", which is the duplicate this is here to
  // catch. hebrewWordMatches is the audit layer's existing answer to that, and
  // falls back to equality for every other language.
  for (const w of ta) if (tb.some((v) => hebrewWordMatches(w, v))) shared++
  return shared / Math.min(ta.length, tb.length)
}

/** At or above this, two keywords are the same article. */
export const CANNIBAL_OVERLAP = 0.8

export interface SelectKeywordsInput {
  locale: BlogAutoLocale
  ideas: KeywordIdeaResult[]
  /** Keywords already planned or published in this language. */
  taken: string[]
  limit: number
}

export interface SelectedKeyword {
  keyword: string
  monthlySearches: number | null
  competition: string | null
}

export function selectKeywords(input: SelectKeywordsInput): SelectedKeyword[] {
  const floor = MIN_MONTHLY_SEARCHES[input.locale]
  const chosen: SelectedKeyword[] = []
  // Taken keywords AND the ones chosen in this same run: two ideas in one
  // response can be near-duplicates of each other.
  const blocking = [...input.taken]

  const ranked = [...input.ideas].sort((a, b) => (b.avgMonthlySearches ?? 0) - (a.avgMonthlySearches ?? 0))

  for (const idea of ranked) {
    if (chosen.length >= input.limit) break
    const keyword = (idea.keyword ?? '').trim()
    if (!keyword) continue
    if ((idea.avgMonthlySearches ?? 0) < floor) continue
    if (EXCLUDED_PATTERNS.some((re) => re.test(keyword))) continue
    if (blocking.some((t) => keywordOverlap(keyword, t) >= CANNIBAL_OVERLAP)) continue
    chosen.push({
      keyword,
      monthlySearches: idea.avgMonthlySearches ?? null,
      competition: idea.competition ?? null,
    })
    blocking.push(keyword)
  }
  return chosen
}

/**
 * Ask Keyword Planner for ideas in one language. Returns [] on any
 * configuration or API failure — a queue that did not grow today is not an
 * outage worth failing the whole cron for, and the caller logs the reason.
 */
export async function researchKeywords(locale: BlogAutoLocale): Promise<{ ideas: KeywordIdeaResult[]; error: string | null }> {
  const market = RESEARCH_MARKET[locale]
  try {
    const res = await generateKeywordIdeas({
      researchType: 'keyword',
      keywords: RESEARCH_SEEDS[locale],
      country: market.country,
      language: market.language,
      minMonthlySearches: MIN_MONTHLY_SEARCHES[locale],
      resultsLimit: 250,
      pageLimit: 2,
    })
    return { ideas: res.results, error: null }
  } catch (err) {
    const code = err instanceof Error ? err.message : 'keyword_research_failed'
    return { ideas: [], error: code }
  }
}
