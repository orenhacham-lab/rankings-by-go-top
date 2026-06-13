/**
 * GEO Insight Layer — Phase 1A (rule-based signal extraction).
 *
 * Pure deterministic utilities for classifying AI Visibility results.
 * No AI calls, no DB access, no network. Safe to import on server or client.
 *
 * Phase 1A covers:
 *   - classifyCitationType(url, domain, targetDomain)
 *   - classifyQueryIntent(prompt)
 *   - extractContentSignals(responseText)
 *   - computeGeoInsights({ prompt, responseText, citations, targetDomain })
 *
 * All classifiers return safe defaults (unknown / empty / false) when input
 * is missing or unrecognized. We do not guess.
 */
import { isTargetCitation, cleanDisplayDomain } from './display-classification'

export type CitationType =
  | 'homepage'
  | 'category'
  | 'product'
  | 'comparison'
  | 'review'
  | 'blog'
  | 'marketplace'
  | 'forum'
  | 'directory'
  | 'brand_site'
  | 'unknown'

export type QueryIntent =
  | 'transactional'
  | 'informational'
  | 'comparison'
  | 'review'
  | 'local'
  | 'navigational'

export interface ContentSignals {
  hasList: boolean
  hasComparisonLanguage: boolean
  hasPricingLanguage: boolean
  hasReviewLanguage: boolean
  hasLocalLanguage: boolean
  hasRecommendationLanguage: boolean
}

export interface GeoInsights {
  queryIntents: QueryIntent[]
  citationTypes: CitationType[]
  contentSignals: ContentSignals
}

const EMPTY_CONTENT_SIGNALS: ContentSignals = {
  hasList: false,
  hasComparisonLanguage: false,
  hasPricingLanguage: false,
  hasReviewLanguage: false,
  hasLocalLanguage: false,
  hasRecommendationLanguage: false,
}

const MARKETPLACE_DOMAINS = new Set([
  'amazon.com',
  'amazon.co.uk',
  'amazon.de',
  'amazon.fr',
  'amazon.it',
  'amazon.es',
  'amazon.ca',
  'amazon.com.au',
  'amazon.co.jp',
  'amazon.in',
  'ebay.com',
  'ebay.co.uk',
  'ebay.de',
  'walmart.com',
  'target.com',
  'bestbuy.com',
  'costco.com',
  'aliexpress.com',
  'alibaba.com',
  'etsy.com',
  'wayfair.com',
  'homedepot.com',
  'lowes.com',
  'newegg.com',
  'macys.com',
  'nordstrom.com',
  'shopify.com',
  'temu.com',
  'shein.com',
])

const FORUM_DOMAINS = new Set([
  'reddit.com',
  'quora.com',
  'stackoverflow.com',
  'stackexchange.com',
  'superuser.com',
  'serverfault.com',
  'askubuntu.com',
  'mathoverflow.net',
  'ycombinator.com',
  'news.ycombinator.com',
])

const FORUM_SUBDOMAIN_PREFIXES = ['forum.', 'forums.', 'community.', 'discuss.', 'discussion.']

const DIRECTORY_DOMAINS = new Set([
  'yelp.com',
  'yellowpages.com',
  'foursquare.com',
  'tripadvisor.com',
  'bbb.org',
  'angi.com',
  'angieslist.com',
  'thumbtack.com',
  'manta.com',
  'google.com/maps',
  'maps.google.com',
  'mapquest.com',
])

function normalizeDomainKey(domain: string | null | undefined): string {
  if (!domain) return ''
  return domain.toLowerCase().replace(/^www\./, '').trim()
}

function pathOf(url: string | null | undefined): string {
  if (!url) return ''
  try {
    const u = new URL(url.startsWith('http') ? url : `https://${url}`)
    return u.pathname.toLowerCase()
  } catch {
    return ''
  }
}

/**
 * Rule-based citation type classification from URL + domain.
 *
 * Decision order (first matching tier wins):
 *   1. brand_site   — domain matches the project's target domain
 *   2. marketplace  — domain is in our marketplace allowlist
 *   3. forum        — domain is in forum allowlist OR has forum-style subdomain
 *   4. directory    — domain is in directory allowlist
 *   5. path-based   — /compare, /review, /blog, /product, /category, ...
 *   6. homepage     — empty path or "/"
 *   7. unknown      — nothing matched
 *
 * Returns 'unknown' when input is missing — never guesses.
 */
export function classifyCitationType(
  url: string | null | undefined,
  domain: string | null | undefined,
  targetDomain: string | null | undefined
): CitationType {
  const domainKey = normalizeDomainKey(domain)
  if (!domainKey && !url) return 'unknown'

  if (targetDomain && isTargetCitation(domain, targetDomain)) {
    return 'brand_site'
  }

  if (MARKETPLACE_DOMAINS.has(domainKey)) return 'marketplace'

  if (FORUM_DOMAINS.has(domainKey)) return 'forum'
  for (const prefix of FORUM_SUBDOMAIN_PREFIXES) {
    if (domainKey.startsWith(prefix)) return 'forum'
  }

  if (DIRECTORY_DOMAINS.has(domainKey)) return 'directory'

  const path = pathOf(url)

  if (/\/(compare|comparison|vs)(\/|$)/.test(path)) return 'comparison'
  if (/(^|\/)compare-/.test(path) || /-vs-/.test(path)) return 'comparison'

  if (/\/(reviews?|ratings?)(\/|$)/.test(path)) return 'review'

  if (/\/(blog|article|articles|post|posts|news|guide|guides|magazine)(\/|$)/.test(path)) {
    return 'blog'
  }
  if (/\/\d{4}\/\d{1,2}\//.test(path)) return 'blog'

  if (/\/(product|products|p|item|items|sku|dp)(\/|$)/.test(path)) return 'product'

  if (/\/(category|categories|c|collection|collections|shop|catalog|cat)(\/|$)/.test(path)) {
    return 'category'
  }

  if (path === '' || path === '/') return 'homepage'

  return 'unknown'
}

const TRANSACTIONAL_PATTERNS = [
  'buy',
  'purchase',
  'order',
  'price',
  'pricing',
  'cost',
  'cheap',
  'cheapest',
  'discount',
  'deal',
  'sale',
  'coupon',
  'promo',
  'shipping',
  'free shipping',
  'where to buy',
  'how much',
  'how much does',
  // Hebrew
  'לקנות',
  'קניית',
  'מחיר',
  'מחירים',
  'עלות',
  'עלויות',
  'הזמנה',
  'להזמין',
  'מבצע',
  'מבצעים',
  'הנחה',
  'הנחות',
  'משלוח',
  'איפה לקנות',
  'כמה עולה',
]

const INFORMATIONAL_PATTERNS = [
  'what is',
  'what are',
  'what does',
  'how to',
  'how do',
  'how does',
  'how can',
  'why',
  'when to',
  'when should',
  'where to find',
  'who is',
  'guide',
  'tutorial',
  'explain',
  'definition',
  'meaning',
  'learn',
  // Hebrew
  'מה זה',
  'מהו',
  'מהי',
  'איך',
  'כיצד',
  'מדריך',
  'הסבר',
  'הסברים',
  'משמעות',
  'הגדרה',
  'למה',
  'מתי',
]

const COMPARISON_PATTERNS = [
  ' vs ',
  ' vs.',
  'versus',
  'compare',
  'comparison',
  'compared to',
  'better than',
  'alternative',
  'alternatives',
  'difference between',
  'differences between',
  'or ', // weaker; offset by other checks below
  // Hebrew
  'השוואה',
  'מול',
  'נגד',
  'חלופה',
  'חלופות',
  'הבדל בין',
  'הבדלים בין',
  'או ', // weaker
]

const REVIEW_PATTERNS = [
  'best',
  'top',
  'top-rated',
  'highest rated',
  'review',
  'reviews',
  'rating',
  'ratings',
  'recommended',
  'recommendation',
  'recommendations',
  'worst',
  // Hebrew
  'הטוב ביותר',
  'הטובים ביותר',
  'מומלץ',
  'מומלצים',
  'המלצה',
  'המלצות',
  'ביקורת',
  'ביקורות',
  'דירוג',
  'דירוגים',
]

const LOCAL_PATTERNS = [
  'near me',
  'near you',
  'nearby',
  'in my area',
  'local',
  'locally',
  'around me',
  'closest',
  ' in ', // weak — used with strict caller context
  // Hebrew
  'לידי',
  'ליד',
  'באזור',
  'באזורי',
  'קרוב אליי',
  'קרוב אלי',
  'בעיר',
  'בסביבה',
]

const NAVIGATIONAL_PATTERNS = [
  'official site',
  'official website',
  'official page',
  'homepage',
  'website of',
  'site of',
  'login',
  'log in',
  'sign in',
  // Hebrew
  'אתר רשמי',
  'האתר הרשמי',
  'דף הבית',
  'כניסה לאתר',
  'התחברות',
]

function containsAny(haystack: string, needles: readonly string[]): boolean {
  for (const n of needles) {
    if (n && haystack.includes(n)) return true
  }
  return false
}

/**
 * Rule-based query intent classification from prompt text.
 *
 * Multi-label: a prompt can carry several intents (e.g. "best laptops vs
 * MacBook" → review + comparison). Returns empty array for null / blank
 * input. Never guesses; only flags intents whose keywords are explicitly
 * present.
 */
export function classifyQueryIntent(prompt: string | null | undefined): QueryIntent[] {
  if (!prompt || !prompt.trim()) return []
  const text = ` ${prompt.toLowerCase().trim()} `
  const intents: QueryIntent[] = []

  if (containsAny(text, TRANSACTIONAL_PATTERNS)) intents.push('transactional')
  if (containsAny(text, INFORMATIONAL_PATTERNS)) intents.push('informational')
  if (containsAny(text, COMPARISON_PATTERNS)) intents.push('comparison')
  if (containsAny(text, REVIEW_PATTERNS)) intents.push('review')
  if (containsAny(text, LOCAL_PATTERNS)) intents.push('local')
  if (containsAny(text, NAVIGATIONAL_PATTERNS)) intents.push('navigational')

  return Array.from(new Set(intents))
}

const PRICING_REGEX = /(\$|€|£|₪|¥)\s?\d|\b\d+\s?(usd|eur|gbp|nis|ils)\b/i
const LIST_LINE_REGEX = /^\s*([-*•]|\d+[.)])\s+/m

const COMPARISON_TEXT_PATTERNS = [
  'compared to',
  'in comparison',
  'differs from',
  'unlike',
  'while ',
  ' vs ',
  ' versus ',
  'alternative to',
  'better than',
  'worse than',
  // Hebrew
  'בהשוואה ל',
  'בניגוד ל',
  'לעומת',
  'חלופה ל',
  'טוב יותר מ',
]

const PRICING_TEXT_PATTERNS = [
  'price',
  'pricing',
  'cost',
  'fee',
  'starts at',
  'starting at',
  'from $',
  // Hebrew
  'מחיר',
  'עלות',
  'דמי',
  'החל מ',
]

const REVIEW_TEXT_PATTERNS = [
  'rating',
  'ratings',
  'review',
  'reviews',
  'stars',
  'star rating',
  'top-rated',
  'highly rated',
  'recommended',
  // Hebrew
  'ביקורת',
  'ביקורות',
  'דירוג',
  'כוכבים',
  'מומלץ',
]

const LOCAL_TEXT_PATTERNS = [
  'near you',
  'near me',
  'nearby',
  'local',
  'in your area',
  // Hebrew
  'באזור',
  'באזורך',
  'ליד',
  'קרוב אליך',
  'בעיר',
]

const RECOMMENDATION_TEXT_PATTERNS = [
  'we recommend',
  'i recommend',
  'recommended',
  'recommendation',
  'best choice',
  'top choice',
  'best option',
  'good option',
  'consider ',
  'try ',
  'suggested',
  // Hebrew
  'מומלץ',
  'אנחנו ממליצים',
  'אני ממליץ',
  'הבחירה הטובה ביותר',
  'מומלצת',
  'מומלצים',
  'כדאי לשקול',
]

/**
 * Rule-based content signal extraction from AI response text.
 *
 * Each flag is independent (a response can have multiple signals). Returns
 * an all-false object for null / blank text. Pure string/regex matching —
 * no parsing, no AI, no guesses.
 */
export function extractContentSignals(
  responseText: string | null | undefined
): ContentSignals {
  if (!responseText || !responseText.trim()) return { ...EMPTY_CONTENT_SIGNALS }

  const text = responseText
  const lower = text.toLowerCase()

  return {
    hasList: LIST_LINE_REGEX.test(text),
    hasComparisonLanguage: containsAny(lower, COMPARISON_TEXT_PATTERNS),
    hasPricingLanguage: PRICING_REGEX.test(text) || containsAny(lower, PRICING_TEXT_PATTERNS),
    hasReviewLanguage: containsAny(lower, REVIEW_TEXT_PATTERNS),
    hasLocalLanguage: containsAny(lower, LOCAL_TEXT_PATTERNS),
    hasRecommendationLanguage: containsAny(lower, RECOMMENDATION_TEXT_PATTERNS),
  }
}

/**
 * Orchestrator: combine query intent, citation types, and content signals
 * for a single AI Visibility result. Read-only; never mutates inputs.
 *
 * Missing inputs degrade safely:
 *   - no prompt        → queryIntents: []
 *   - no citations     → citationTypes: []
 *   - no responseText  → contentSignals: all false
 */
export function computeGeoInsights(args: {
  prompt: string | null | undefined
  responseText: string | null | undefined
  citations:
    | ReadonlyArray<{ url?: string | null; domain?: string | null }>
    | null
    | undefined
  targetDomain: string | null | undefined
}): GeoInsights {
  const { prompt, responseText, citations, targetDomain } = args

  const queryIntents = classifyQueryIntent(prompt)

  const citationTypes: CitationType[] = []
  if (citations && citations.length > 0) {
    const seen = new Set<CitationType>()
    for (const c of citations) {
      const type = classifyCitationType(
        c.url ?? null,
        c.domain ?? cleanDisplayDomain(c.url ?? null),
        targetDomain ?? null
      )
      if (!seen.has(type)) {
        seen.add(type)
        citationTypes.push(type)
      }
    }
  }

  const contentSignals = extractContentSignals(responseText)

  return { queryIntents, citationTypes, contentSignals }
}
