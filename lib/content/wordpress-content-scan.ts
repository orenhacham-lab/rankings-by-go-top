/**
 * Read-only WordPress site content/anchor scan (Phase 1 — REPORT ONLY).
 *
 * Fetches PUBLISHED posts/pages from the connected WordPress site (via the
 * existing SSRF-guarded client), extracts INTERNAL <a href> links from each
 * body, and builds an in-memory report of internal-link targets + anchors. It
 * writes NOTHING and changes nothing — it only reports what exists on the site,
 * so we can review anchor/target quality before deciding to persist or wire it
 * into the planner.
 *
 * No AI. No DB. No writes. Reuses the same deterministic link helpers the rest
 * of the content module uses (anchor extraction, URL keys, internal-vs-external).
 */

import type { WordPressCredentials, WordPressContentItem } from '@/lib/wordpress/types'
import { getPosts, getPages, getItemContentHtml, getCategories, getTags, WordPressClientError, type WpContentEndpoint } from '@/lib/wordpress/client'
import {
  extractLinkAnchorsFromHtml,
  isInternalUrl,
  extractUrlHost,
  normalizeHref,
  normalizeUrlKey,
  internalTargetKey,
  slugFromUrl,
} from '@/lib/content/internal-links'
import { tokens } from '@/lib/content/recommendations/dedupe'

// ── MVP safety limits (capped, published-only, no parallel hammering) ──
const DEFAULT_PER_PAGE = 25
const DEFAULT_MAX_PAGES = 12 // per content type (metadata is light, so allow more)
const DEFAULT_MAX_ITEMS = 200 // combined posts + pages
const TOP_TARGETS = 100
const TOP_ANCHORS_PER_TARGET = 8
const MAX_EXAMPLE_SOURCES = 3
const MAX_SAMPLE_LINKS = 40
// Adaptive per_page ladder for metadata list requests (shrinks on "too large").
const PER_PAGE_LADDER = [25, 10, 5, 1]
// Soft wall-clock budget for per-item content fetches; remaining items keep
// their metadata target but skip anchor extraction (partial-but-useful scan).
const CONTENT_TIME_BUDGET_MS = 220_000

/** True when a client error is specifically the response-size cap. */
function isTooLarge(e: unknown): boolean {
  return e instanceof WordPressClientError && /too large/i.test(e.message)
}

/**
 * Generic/boilerplate anchor phrases that are NOT useful for internal-link
 * planning (they carry no topical meaning). Normalized + lowercased for lookup.
 */
const BOILERPLATE_ANCHORS = new Set([
  // Hebrew
  'קרא עוד', 'קראו עוד', 'עמוד הבית', 'דף הבית', 'כאן', 'לחצו כאן', 'לחץ כאן', 'לחצו', 'לאתר',
  'האתר', 'לאתר שלנו', 'למידע נוסף', 'מידע נוסף', 'לפרטים', 'לפרטים נוספים', 'להמשך', 'להמשך קריאה',
  'עוד', 'ראו כאן', 'ראה כאן', 'המשך', 'המשך קריאה', 'צרו קשר', 'צור קשר', 'ראשי', 'לצפייה',
  // English
  'read more', 'here', 'click here', 'home', 'homepage', 'home page', 'learn more', 'more',
  'more info', 'for more information', 'contact', 'contact us', 'link', 'this page', 'website',
  'our website', 'visit', 'see more', 'continue reading',
])

/**
 * E-commerce / "read more" ACTION anchors — generic (multilingual), structural,
 * not site-specific. These are UI actions, never useful SEO planning anchors.
 */
const ECOMMERCE_ACTION_ANCHORS = new Set([
  // Hebrew
  'הוספה לסל', 'הוסף לסל', 'הוסיפו לסל', 'הוסף לעגלה', 'הוספה לעגלה', 'בחר/י אפשרויות', 'בחר אפשרויות',
  'בחרו אפשרויות', 'בחירת אפשרויות', 'למוצר', 'צפייה במוצר', 'צפה במוצר', 'לצפייה במוצר', 'קנה עכשיו',
  'הזמן עכשיו', 'קרא עוד', 'קראו עוד', 'למידע נוסף', 'מידע נוסף', 'לפרטים נוספים', 'לפרטים',
  // English
  'add to cart', 'add to basket', 'select options', 'choose options', 'buy now', 'view product',
  'read more', 'continue reading', 'shop now', 'more info', 'learn more',
])

/**
 * Generic price / rating / promo / review signals — currency symbols (literal
 * AND HTML entities), price phrases, sale/shipping badges, and rating text, in
 * Hebrew + English. Site-agnostic (no product/brand names). Any hit means the
 * anchor is product-card noise and must not be a usable planning anchor.
 */
function hasPriceOrRatingNoise(s: string): boolean {
  const t = (s || '').toLowerCase()
  // Currency symbols — literal and common HTML numeric/named entities.
  if (/[₪$€£¥]/.test(s)) return true
  if (/&#(8362|36|8364|163|165);/.test(s)) return true // ₪ $ € £ ¥
  if (/&(shekel|dollar|euro|pound|yen|curren);/i.test(s)) return true
  if (/\b(nis|ils|usd|eur|gbp)\b/i.test(t)) return true
  if (/ש"ח|שקל|שקלים/.test(s)) return true
  // Digits adjacent to a currency symbol/entity → a price.
  if (/\d[\d.,]*\s*(₪|\$|€|£|¥|&#8362;|ש"ח|שח)/.test(s) || /(₪|\$|€|£|¥|&#8362;)\s*\d/.test(s)) return true
  // Explicit price / promo / shipping phrases.
  if (/החל\s*מ-?|מחיר|המחיר|מבצע|במבצע|הנחה|משלוח\s*חינם|חינם/.test(s)) return true
  if (/\b(from|sale|save|discount|free shipping|price|priced|now\s+\d|was\s+\d)\b/i.test(t)) return true
  // Rating / reviews.
  if (/דורג|דירוג|ביקורת|ביקורות|מתוך\s*5|כוכב/.test(s)) return true
  if (/\b(rated|rating|reviews?|out of 5|stars?)\b/i.test(t)) return true
  // Stock/availability badges.
  if (/בסטוק|במלאי|אזל|אזל\s*המלאי/.test(s) || /\b(in stock|out of stock)\b/i.test(t)) return true
  return false
}

/** Strip decorative arrows/ellipsis/separators so "קרא עוד »" → "קרא עוד". */
function normalizeAnchor(a: string): string {
  return (a || '')
    .replace(/[»«›‹→←▸►◄▶◀•·…]+/g, ' ')
    .replace(/[|/\\\-–—]+\s*$/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

/** True for anchors that look like a URL or bare domain (booking.com, https://…). */
function isDomainOrUrlLike(a: string): boolean {
  const s = a.trim().toLowerCase()
  if (!s) return false
  if (/^(https?:)?\/\//.test(s) || s.startsWith('http') || s.includes('://') || s.startsWith('www.')) return true
  // Bare domain: no spaces, has a dot + TLD (e.g. booking.com, japan4u.co.il).
  if (!/\s/.test(s) && /^[a-z0-9][a-z0-9-]*(\.[a-z0-9-]+)+([/?#].*)?$/.test(s)) return true
  return false
}

const anchorWordCount = (s: string) => s.trim().split(/\s+/).filter(Boolean).length

export type PlanningUsability = 'yes' | 'no' | 'caution'

/** True when the URL is the site homepage (no path after the host). */
function isHomepageUrl(url: string): boolean {
  const key = normalizeUrlKey(url)
  return !!key && !key.includes('/')
}

/** A single word is an "entity" for a target if it appears in the title/slug. */
function entityMatchesTarget(word: string, targetTitle: string, targetUrl: string): boolean {
  const w = word.trim().toLowerCase()
  if (!w) return false
  const bag = new Set<string>([...tokens(targetTitle), ...tokens(slugFromUrl(targetUrl))])
  return bag.has(w)
}

export interface AnchorContext {
  targetTitle: string
  targetUrl: string
  isHomepage: boolean
}

/**
 * Classify anchor usability for PLANNING (read-only; raw anchor always kept).
 * Three states so single-word ENTITY anchors ("טוקיו" → /tokyo/) are usable,
 * broad homepage entities ("יפן" → /) are caution, and boilerplate/URLs are no.
 */
export function classifyAnchorForPlanning(anchor: string, ctx: AnchorContext): { usability: PlanningUsability; reason: string } {
  const norm = normalizeAnchor(anchor)
  if (!norm || norm.length < 2) return { usability: 'no', reason: 'too_short' }
  if (isDomainOrUrlLike(norm)) return { usability: 'no', reason: 'url_or_domain' }
  if (ECOMMERCE_ACTION_ANCHORS.has(norm.toLowerCase())) return { usability: 'no', reason: 'ecommerce_or_boilerplate_action' }
  if (BOILERPLATE_ANCHORS.has(norm.toLowerCase())) return { usability: 'no', reason: 'generic_boilerplate' }
  // WooCommerce product-card noise: price/rating/review-laden anchor text.
  if (hasPriceOrRatingNoise(norm)) return { usability: 'no', reason: anchorWordCount(norm) > 8 ? 'too_long_product_card' : 'product_card_noise' }
  const wc = anchorWordCount(norm)
  if (wc === 1) {
    // Broad homepage entity (e.g. "יפן" → homepage): preserve but flag caution.
    if (ctx.isHomepage) return { usability: 'caution', reason: 'broad_homepage_entity_anchor' }
    // Named entity/location matching the target (e.g. "טוקיו" → /tokyo/): usable.
    if (entityMatchesTarget(norm, ctx.targetTitle, ctx.targetUrl)) return { usability: 'yes', reason: 'entity_single_word_matches_target' }
    return { usability: 'no', reason: 'generic_single_word' }
  }
  if (wc > 8) return { usability: 'no', reason: 'too_long' }
  return { usability: 'yes', reason: 'natural_phrase' }
}

export type TargetEligibility = 'yes' | 'no' | 'caution'

export type TargetPriority =
  | 'homepage'
  | 'commercial_category_or_service_hub'
  | 'strategic_content_page'
  | 'post_or_article'
  | 'product_or_specific_offer'
  | 'other_caution'
  | 'ineligible'

export type TargetRole =
  | 'homepage'
  | 'commercial_category_or_service_hub'
  | 'strategic_content_page'
  | 'post_or_article'
  | 'product_or_specific_offer'
  | 'utility_system'
  | 'malformed_action_api'
  | 'unknown'

export interface TargetClassification {
  targetType: ScannedTarget['targetType']
  targetRole: TargetRole
  targetPriority: TargetPriority
  eligibility: TargetEligibility
  reason: string
}

// ── Generic, site-agnostic structural signals (NO niche/brand keywords) ──
// Utility/system/legal pages (path slugs + multilingual title terms).
const UTILITY_SLUGS = ['cart', 'checkout', 'my-account', 'account', 'login', 'signin', 'sign-in', 'register', 'signup', 'sign-up', 'lost-password', 'wishlist', 'privacy', 'privacy-policy', 'terms', 'terms-and-conditions', 'tos', 'legal', 'accessibility', 'refund', 'refund-policy', 'returns', 'return-policy', 'cancellation', 'shipping', 'shipping-policy', 'contact', 'contact-us', 'faq', 'sitemap', 'disclaimer', 'cookie', 'cookies', 'thank-you', 'order-received']
const UTILITY_TITLE = [
  // Hebrew (generic commerce/legal/utility concepts, not niche keywords)
  'סל הקניות', 'עגלת הקניות', 'עגלת קניות', 'עמוד לתשלום', 'לתשלום', 'קופה', 'החשבון שלי', 'התחברות', 'הרשמה',
  'רשימת משאלות', 'מדיניות פרטיות', 'פרטיות', 'תקנון', 'תנאי שימוש', 'הצהרת נגישות', 'נגישות', 'ביטול עסקה',
  'דרכי ביטול', 'מדיניות החזרות', 'מדיניות ביטול', 'מדיניות משלוח', 'משלוחים', 'יצירת קשר', 'צור קשר', 'צרו קשר',
  'שאלות נפוצות', 'מפת אתר',
  // English
  'shopping cart', 'checkout', 'my account', 'login', 'sign in', 'register', 'wishlist', 'privacy policy',
  'terms', 'terms of service', 'accessibility', 'refund policy', 'return policy', 'cancellation', 'shipping policy',
  'contact us', 'contact', 'faq', 'sitemap', 'cookie policy',
]
const CATEGORY_PATH = ['/category/', '/product-category/', '/product_cat/', '/collection/', '/collections/', '/shop/', '/store/', '/catalog/', '/services/', '/service/', '/topics/', '/topic/', '/guides/']
const PRODUCT_PATH = ['/product/', '/products/', '/item/']
// Filter/sort/tracking query params → filtered/tracking URL (never a clean target).
const NOISE_QUERY = ['orderby', 'filter_', 'min_price', 'max_price', 'query_type_', 'rating_filter', 'utm_', 'fbclid', 'gclid', 'mc_cid', 'mc_eid', 'replytocom', 'sort', 'per_page']

function seg(pathname: string): string[] { return pathname.toLowerCase().split('/').filter(Boolean) }

/**
 * Generic, site-agnostic target classification by STRUCTURAL/SEO role — never by
 * niche keywords from any one site. Produces a role, a planning priority, and an
 * eligibility (yes/caution/no) with a reason.
 */
export function classifyTarget(rawUrl: string, title: string, wpType: string | undefined): TargetClassification {
  const ineligible = (role: TargetRole, reason: string, targetType: ScannedTarget['targetType'] = 'unknown'): TargetClassification =>
    ({ targetType, targetRole: role, targetPriority: 'ineligible', eligibility: 'no', reason })

  // Non-content/action/API first (fully rejected — never caution).
  if (isWordPressApiUrl(rawUrl)) return ineligible('malformed_action_api', 'wordpress_api_url')
  if (isEcommerceActionUrl(rawUrl)) return ineligible('malformed_action_api', 'ecommerce_action_link')

  let u: URL | null = null
  try { u = new URL(rawUrl) } catch { u = null }
  const key = normalizeUrlKey(rawUrl)
  // Malformed: unparseable, or a numeric-only key (bad normalization artifact).
  if (!u || !key || /^[0-9]+$/.test(key.replace(/^[^/]*\//, '')) || /^[0-9]+$/.test(key)) {
    return ineligible('malformed_action_api', 'malformed_url')
  }

  const path = u.pathname.toLowerCase()
  const segs = seg(path)
  const query = u.search.toLowerCase()
  const titleL = (title || '').toLowerCase()

  // System / archive / search / feed / pagination / tracking → ineligible.
  if (/\/wp-login|\/wp-admin/.test(path)) return ineligible('utility_system', 'system_page')
  if (segs.includes('feed') || /\/feed\/?$/.test(path)) return ineligible('utility_system', 'feed_url')
  if (segs[0] === 'author') return ineligible('utility_system', 'author_archive')
  if (segs[0] === 'search' || /[?&]s=/.test(query)) return ineligible('utility_system', 'search_page')
  if (segs[0] === 'tag' || segs[0] === 'tags' || wpType === 'tag' || wpType === 'post_tag') return ineligible('utility_system', 'tag_archive', 'tag')
  if (/^(19|20)\d{2}$/.test(segs[0] ?? '')) return ineligible('utility_system', 'date_archive')
  if (segs.length && segs[0] === 'page' && /^\d+$/.test(segs[1] ?? '')) return ineligible('utility_system', 'pagination_url')
  if (NOISE_QUERY.some((p) => query.includes(p))) return ineligible('utility_system', 'filtered_or_tracking_url')
  if (query && segs.length === 0) return ineligible('utility_system', 'query_only_url')

  // Utility/legal/commerce-system pages (by slug OR multilingual title).
  const utilBySlug = segs.some((s) => UTILITY_SLUGS.includes(s))
  const utilByTitle = UTILITY_TITLE.some((w) => titleL.includes(w))
  if (utilBySlug || utilByTitle) return ineligible('utility_system', 'ecommerce_or_utility_page')

  // Homepage — valid broad target, but caution (not a normal content page).
  if (isHomepageUrl(rawUrl)) {
    return { targetType: 'page', targetRole: 'homepage', targetPriority: 'homepage', eligibility: 'caution', reason: 'homepage_main_topic_page' }
  }

  // Commercial category / service / topic hub — high priority.
  if (CATEGORY_PATH.some((p) => path.includes(p)) || wpType === 'category' || wpType === 'product_cat' || wpType === 'product_category') {
    return { targetType: 'category', targetRole: 'commercial_category_or_service_hub', targetPriority: 'commercial_category_or_service_hub', eligibility: 'yes', reason: 'category_or_hub' }
  }

  // Product / specific offer — eligible, lower priority than hubs.
  if (PRODUCT_PATH.some((p) => path.includes(p)) || wpType === 'product') {
    return { targetType: 'product', targetRole: 'product_or_specific_offer', targetPriority: 'product_or_specific_offer', eligibility: 'yes', reason: 'product_or_offer' }
  }

  // Known WordPress page → strategic content page.
  if (wpType === 'page') {
    return { targetType: 'page', targetRole: 'strategic_content_page', targetPriority: 'strategic_content_page', eligibility: 'yes', reason: 'content_page' }
  }
  // Known WordPress post → article.
  if (wpType === 'post') {
    return { targetType: 'post', targetRole: 'post_or_article', targetPriority: 'post_or_article', eligibility: 'yes', reason: 'post_or_article' }
  }

  // Unknown but clean, public-looking content URL → caution (diagnostics only).
  if (segs.length >= 1 && /[a-z֐-׿]/i.test(segs.join(''))) {
    return { targetType: 'unknown', targetRole: 'unknown', targetPriority: 'other_caution', eligibility: 'caution', reason: 'unknown_content_url' }
  }
  return ineligible('malformed_action_api', 'non_content_url')
}

/** First H2/H3 text of a post body (a heading-derived keyword candidate). */
function firstHeadingText(html: string): string {
  const m = (html || '').match(/<h[23][^>]*>([\s\S]*?)<\/h[23]>/i)
  if (!m) return ''
  return (m[1] ?? '').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim()
}

export interface RejectCounts {
  external: number
  mailto: number
  tel: number
  hash: number
  javascript: number
  empty: number
  ecommerce_action: number
  wordpress_api: number
  other: number
}

export interface ScannedAnchor {
  text: string
  count: number
  /** yes = usable · caution = broad/homepage entity · no = boilerplate/generic. */
  usability: PlanningUsability
  reason: string
}

export type TargetKeywordSource =
  | 'yoast_focus_keyword'
  | 'rankmath_focus_keyword'
  | 'aioseo_focus_keyword'
  | 'generated_article_primary_keyword'
  | 'title'
  | 'slug'
  | 'heading'
  | 'inferred'
  | 'unavailable'

export interface ScannedTarget {
  targetUrl: string
  targetType: 'post' | 'page' | 'category' | 'tag' | 'product' | 'unknown'
  targetTitle: string
  inboundLinkCount: number
  /** Whether this target is a good internal-link PLANNING destination. */
  eligibility: TargetEligibility
  eligibilityReason: string
  /** Generic structural/SEO role + planning priority (site-agnostic). */
  targetRole: TargetRole
  targetPriority: TargetPriority
  /** Best available keyword signal + where it came from + real-vs-inferred. */
  keywordSource: TargetKeywordSource
  primaryKeywordCandidate: string
  keywordAvailable: boolean
  usableAnchorsCount: number
  cautionAnchorsCount: number
  rejectedAnchorsCount: number
  /** True when the target has anchors but NONE are usable/caution. */
  onlyGenericAnchors: boolean
  usableAnchors: ScannedAnchor[]
  cautionAnchors: ScannedAnchor[]
  rejectedAnchors: ScannedAnchor[]
  exampleSources: { url: string; title: string }[]
  matchedGeneratedArticleId: string | null
  matchedGeneratedArticleTitle: string | null
  /** True when this is one of our fetched items whose content couldn't be read. */
  contentSkipped: boolean
  contentSkippedReason?: string
}

export type SampleLinkClass = 'internal' | 'external' | 'mailto' | 'tel' | 'hash' | 'javascript' | 'empty' | 'ecommerce_action' | 'wordpress_api' | 'other'

export interface SampleLink {
  sourceTitle: string
  sourceUrl: string
  targetUrl: string
  anchor: string
  /** How the link itself was classified (internal vs a rejection bucket). */
  linkClass: SampleLinkClass
  /** For internal links: anchor usability (yes/no/caution) + reason. */
  anchorUsability: PlanningUsability | 'n/a'
  anchorReason: string
  context: string
}

export interface SiteScanReport {
  siteUrl: string
  hosts: string[]
  postsFetched: number
  pagesFetched: number
  itemsScanned: number
  postsPagesRequested: number
  truncated: boolean
  // Metadata-first / adaptive fetch stats (large-site handling).
  metadataItemsFetched: number
  postsMetadataFetched: number
  pagesMetadataFetched: number
  contentItemsFetched: number
  postsContentFetched: number
  pagesContentFetched: number
  contentItemsSkipped: number
  contentTooLargeCount: number
  internalLinksExtracted: number
  externalOrRejected: number
  rejectedReasons: RejectCounts
  uniqueTargets: number
  /** Targets that have at least one usable (non-generic) planning anchor. */
  targetsWithUsableAnchors: number
  /** Targets whose anchors are ALL generic/boilerplate/URL. */
  targetsGenericOnly: number
  /** Targets eligible / caution / ineligible for planning. */
  targetsEligible: number
  targetsEligibilityCaution: number
  targetsIneligible: number
  /** Rejected-link + noise summary (large-site / e-commerce clarity). */
  ecommerceActionLinksRejected: number
  wordpressApiUrlsRejected: number
  utilityTargetsIneligible: number
  productCardNoiseAnchorsRejected: number
  /** How many scanned items exposed an SEO-plugin focus keyword via REST. */
  seoFocusKeywordsFound: number
  targets: ScannedTarget[]
  sampleLinks: SampleLink[]
  notes: string[]
  errors: string[]
  timingMs: number
}

export interface ScanOptions {
  perPage?: number
  maxPages?: number
  maxItems?: number
  includePages?: boolean
  modifiedAfter?: string
  /** Our own published articles, for target↔generated_article matching. */
  generatedArticles?: { url: string; id: string; title: string; primaryKeyword?: string | null }[]
}

const clean = (s: string) => s.trim()

/** Fetch published items of one type, paginating until short page / caps. */
/**
 * Fetch item METADATA (no content) with adaptive pagination. If a page is still
 * too large (rare for metadata), it retries the SAME page with progressively
 * smaller per_page (25→10→5→1); the working size is then reused for the rest.
 * Never throws — reports failures and returns whatever was gathered.
 */
async function fetchMetadataAll(
  fetcher: (opts: { page: number; perPage: number; modifiedAfter?: string }) => Promise<WordPressContentItem[]>,
  startPerPage: number,
  maxPages: number,
  remaining: number,
  modifiedAfter: string | undefined,
  onError: (msg: string) => void,
  onNote: (msg: string) => void,
): Promise<{ items: WordPressContentItem[]; hitLimit: boolean }> {
  const ladder = Array.from(new Set([startPerPage, ...PER_PAGE_LADDER])).filter((n) => n >= 1 && n <= 50).sort((a, b) => b - a)
  const items: WordPressContentItem[] = []
  let hitLimit = false
  let perPage = 0

  // Resolve a working per_page on page 1 (shrinking on "too large").
  for (const pp of ladder) {
    try {
      const rows = await fetcher({ page: 1, perPage: pp, modifiedAfter })
      perPage = pp
      items.push(...rows)
      if (rows.length < pp) return { items: items.slice(0, remaining), hitLimit: items.length > remaining }
      break
    } catch (e) {
      if (isTooLarge(e)) { onNote(`metadata list too large at per_page=${pp}; retrying smaller`); continue }
      onError(e instanceof WordPressClientError ? e.message : 'metadata fetch failed')
      return { items, hitLimit: false }
    }
  }
  if (perPage === 0) { onError('metadata list too large even at per_page=1'); return { items, hitLimit: false } }

  // Continue pagination at the resolved per_page.
  for (let page = 2; page <= maxPages; page++) {
    if (items.length >= remaining) { hitLimit = true; break }
    let rows: WordPressContentItem[]
    try {
      rows = await fetcher({ page, perPage, modifiedAfter })
    } catch (e) {
      // 400 on page>1 = "no more pages" → clean end. Too-large → stop (partial).
      if (isTooLarge(e)) onError(`metadata list page ${page} too large at per_page=${perPage}; stopping (partial)`)
      break
    }
    items.push(...rows)
    if (rows.length < perPage) break
    if (page === maxPages) hitLimit = true
  }
  return { items: items.slice(0, remaining), hitLimit: hitLimit || items.length > remaining }
}

/**
 * Resolve a link href against the PUBLIC source page URL (never the REST API
 * URL). WooCommerce/WordPress build some links (e.g. ?add-to-cart=…) against the
 * current request URI — which, when content is fetched via REST, becomes a
 * /wp-json/… path. Resolving against the public source (and rejecting wp-json /
 * add-to-cart below) prevents those from being treated as content targets.
 */
function resolveHref(href: string, sourceUrl: string): string {
  const h = (href || '').trim()
  if (!h) return ''
  if (/^(mailto:|tel:|javascript:)/i.test(h) || h.startsWith('#')) return h
  if (/^https?:\/\//i.test(h) || h.startsWith('//')) return h // absolute / protocol-relative
  try { return new URL(h, sourceUrl).toString() } catch { return h }
}

/** True when a URL is a WordPress REST/API URL (never a content target). */
function isWordPressApiUrl(url: string): boolean {
  return /\/wp-json\//i.test(url) || /\/xmlrpc\.php/i.test(url) || /\/wp-admin\//i.test(url)
}

/** True when a URL carries a WooCommerce/e-commerce ACTION query (add-to-cart…). */
function isEcommerceActionUrl(url: string): boolean {
  return /[?&](add-to-cart|remove_item|added-to-cart|wc-ajax)=/i.test(url)
}

/**
 * Classify a RESOLVED href into internal or a rejection bucket. Assumes the href
 * has already been resolved against the public source URL.
 */
function classifyHref(url: string, hosts: string[]): 'internal' | keyof RejectCounts {
  const h = (url || '').trim().toLowerCase()
  if (!h) return 'empty'
  if (h.startsWith('mailto:')) return 'mailto'
  if (h.startsWith('tel:')) return 'tel'
  if (h.startsWith('javascript:')) return 'javascript'
  if (h.startsWith('#')) return 'hash'
  if (isWordPressApiUrl(url)) return 'wordpress_api'
  if (isEcommerceActionUrl(url)) return 'ecommerce_action'
  if (isInternalUrl(url, hosts)) return 'internal'
  return 'external'
}

/** Small plain-text context window around the anchor phrase (best-effort). */
function contextAround(contentHtml: string, anchor: string): string {
  const text = contentHtml.replace(/<[^>]+>/g, ' ').replace(/&[a-z#0-9]+;/gi, ' ').replace(/\s+/g, ' ').trim()
  const idx = text.toLowerCase().indexOf(anchor.trim().toLowerCase())
  if (idx < 0) return ''
  const start = Math.max(0, idx - 50)
  const end = Math.min(text.length, idx + anchor.length + 50)
  return `${start > 0 ? '…' : ''}${text.slice(start, end)}${end < text.length ? '…' : ''}`
}

function guessType(
  key: string,
  url: string,
  ownItemType: string | undefined,
): ScannedTarget['targetType'] {
  if (ownItemType === 'post') return 'post'
  if (ownItemType === 'page') return 'page'
  const path = url.toLowerCase()
  if (/\/category\//.test(path)) return 'category'
  if (/\/tag\//.test(path)) return 'tag'
  if (/\/product\//.test(path)) return 'product'
  void key
  return 'unknown'
}

export async function scanWordPressSite(creds: WordPressCredentials, opts: ScanOptions = {}): Promise<SiteScanReport> {
  const startedAt = Date.now()
  const notes: string[] = []
  const errors: string[] = []
  const perPage = Math.min(Math.max(opts.perPage ?? DEFAULT_PER_PAGE, 1), 50)
  const maxPages = Math.min(Math.max(opts.maxPages ?? DEFAULT_MAX_PAGES, 1), 20)
  const maxItems = Math.min(Math.max(opts.maxItems ?? DEFAULT_MAX_ITEMS, 1), 500)
  const includePages = opts.includePages !== false

  notes.push('Only PUBLISHED posts/pages were scanned; drafts/private/trash are excluded.')

  // 1) METADATA-FIRST fetch (NO content.rendered) with adaptive pagination, so
  // even huge Elementor/WooCommerce sites still return the item list.
  const postsMeta = await fetchMetadataAll((o) => getPosts(creds, o), perPage, maxPages, maxItems, opts.modifiedAfter, (m) => errors.push(`posts: ${m}`), (m) => notes.push(`posts: ${m}`))
  const remainingForPages = Math.max(0, maxItems - postsMeta.items.length)
  const pagesMeta = includePages && remainingForPages > 0
    ? await fetchMetadataAll((o) => getPages(creds, o), perPage, maxPages, remainingForPages, opts.modifiedAfter, (m) => errors.push(`pages: ${m}`), (m) => notes.push(`pages: ${m}`))
    : { items: [] as WordPressContentItem[], hitLimit: false }

  // Tag each item with its content endpoint for per-item content fetching.
  const metaItems: { item: WordPressContentItem; endpoint: WpContentEndpoint }[] = [
    ...postsMeta.items.map((item) => ({ item, endpoint: '/posts' as WpContentEndpoint })),
    ...pagesMeta.items.map((item) => ({ item, endpoint: '/pages' as WpContentEndpoint })),
  ]
  const items = metaItems.map((m) => m.item)
  const truncated = postsMeta.hitLimit || pagesMeta.hitLimit

  // SEO focus-keyword availability: we opportunistically checked the exposed
  // post `meta` for Yoast/RankMath/AIOSEO focus keywords. Report what we found.
  const seoFocusKeywordsFound = items.filter((it) => (it.seoFocusKeyword || '').trim()).length
  notes.push(
    seoFocusKeywordsFound > 0
      ? `SEO plugin focus keywords were found via REST for ${seoFocusKeywordsFound} item(s) and used as the highest-priority keyword signal where present.`
      : 'The scanner checked the exposed post meta for Yoast/RankMath/AIOSEO focus keywords and found none available via the standard WordPress REST API (this is normal — they are usually protected meta). No custom plugin was required or used.',
  )

  // 2) Category/tag id→name (best-effort; failure is non-fatal).
  let catMap = new Map<number, string>()
  let tagMap = new Map<number, string>()
  try { catMap = new Map((await getCategories(creds)).map((c) => [c.id, c.name])) } catch { notes.push('Categories could not be read (non-fatal).') }
  try { tagMap = new Map((await getTags(creds)).map((t) => [t.id, t.name])) } catch { notes.push('Tags could not be read (non-fatal).') }
  void catMap; void tagMap // reserved for later relevance signals; not needed for the link report

  // 3) Known hosts = connected site host + every fetched item host.
  const hostSet = new Set<string>()
  const siteHost = extractUrlHost(creds.siteUrl)
  if (siteHost) hostSet.add(siteHost)
  for (const it of items) { const h = extractUrlHost(it.link); if (h) hostSet.add(h) }
  const hosts = Array.from(hostSet)

  // Our own fetched item URLs → context used for target typing + keyword source.
  interface OwnItem { type: string; title: string; slug: string; headingKw: string; seoFocusKeyword: string; seoKeywordSource: string | null }
  const ownByKey = new Map<string, OwnItem>()
  for (const it of items) {
    if (!it.link) continue
    ownByKey.set(internalTargetKey(it.link), {
      type: it.type,
      title: it.title,
      slug: it.slug,
      headingKw: firstHeadingText(it.contentHtml),
      seoFocusKeyword: (it.seoFocusKeyword || '').trim(),
      seoKeywordSource: it.seoKeywordSource,
    })
  }
  // Generated-article URLs → {id,title,primaryKeyword} for matching.
  const genByKey = new Map<string, { id: string; title: string; primaryKeyword: string }>()
  for (const g of opts.generatedArticles ?? []) {
    if (g.url) genByKey.set(internalTargetKey(g.url), { id: g.id, title: g.title, primaryKeyword: (g.primaryKeyword || '').trim() })
  }

  // 4) Seed the target index with EVERY fetched item so posts/pages appear as
  // known targets even when their content can't be read or nothing links to them.
  interface Agg { url: string; type: ScannedTarget['targetType']; title: string; anchors: Map<string, { text: string; count: number }>; sources: Map<string, string>; inbound: number; contentSkipped: boolean; contentSkippedReason?: string }
  const targets = new Map<string, Agg>()
  for (const { item } of metaItems) {
    if (!item.link) continue
    const key = internalTargetKey(item.link)
    if (!key || targets.has(key)) continue
    targets.set(key, {
      url: normalizeHref(item.link),
      type: item.type === 'page' ? 'page' : item.type === 'post' ? 'post' : guessType(key, item.link, item.type),
      title: item.title || slugFromUrl(item.link),
      anchors: new Map<string, { text: string; count: number }>(),
      sources: new Map<string, string>(),
      inbound: 0,
      contentSkipped: false,
    })
  }

  // 5) Fetch each item's content INDIVIDUALLY and extract links. A huge single
  // item is skipped (kept as a metadata target) instead of failing the scan.
  const rejectedReasons: RejectCounts = { external: 0, mailto: 0, tel: 0, hash: 0, javascript: 0, empty: 0, ecommerce_action: 0, wordpress_api: 0, other: 0 }
  let internalLinksExtracted = 0
  let externalOrRejected = 0
  const sampleLinks: SampleLink[] = []
  let contentItemsFetched = 0
  let contentItemsSkipped = 0
  let contentTooLargeCount = 0
  let postsContentFetched = 0
  let pagesContentFetched = 0
  let budgetNoted = false

  for (const { item, endpoint } of metaItems) {
    const itemKey = item.link ? internalTargetKey(item.link) : ''
    const ownTarget = itemKey ? targets.get(itemKey) : undefined

    // Soft time budget: keep remaining items as metadata targets, skip content.
    if (Date.now() - startedAt > CONTENT_TIME_BUDGET_MS) {
      contentItemsSkipped++
      if (ownTarget) { ownTarget.contentSkipped = true; ownTarget.contentSkippedReason = 'time_budget' }
      if (!budgetNoted) { notes.push('Content time budget reached — remaining items kept as metadata targets without anchor extraction.'); budgetNoted = true }
      continue
    }

    let html = ''
    try {
      html = await getItemContentHtml(creds, endpoint, item.id)
      contentItemsFetched++
      if (endpoint === '/posts') postsContentFetched++
      else pagesContentFetched++
    } catch (e) {
      contentItemsSkipped++
      const tooLarge = isTooLarge(e)
      if (tooLarge) contentTooLargeCount++
      if (ownTarget) { ownTarget.contentSkipped = true; ownTarget.contentSkippedReason = tooLarge ? 'response_too_large' : 'content_fetch_failed' }
      continue
    }

    // Heading-derived keyword candidate for this item-as-target.
    const ownMeta = itemKey ? ownByKey.get(itemKey) : undefined
    if (ownMeta && !ownMeta.headingKw) ownMeta.headingKw = firstHeadingText(html)

    for (const link of extractLinkAnchorsFromHtml(html)) {
      // Resolve against the PUBLIC source URL (item.link) — never the REST URL.
      const resolved = resolveHref(link.href, item.link)
      const kind = classifyHref(resolved, hosts)
      const anchor = clean(link.text)

      // Sample the first N links across ALL classes (internal + rejected).
      if (sampleLinks.length < MAX_SAMPLE_LINKS) {
        let anchorUsability: PlanningUsability | 'n/a' = 'n/a'
        let anchorReason = ''
        if (kind === 'internal') {
          const skey = internalTargetKey(resolved)
          const own = ownByKey.get(skey)
          const ctx: AnchorContext = { targetTitle: own?.title || slugFromUrl(resolved), targetUrl: normalizeHref(resolved), isHomepage: isHomepageUrl(resolved) }
          const ac = classifyAnchorForPlanning(anchor, ctx)
          anchorUsability = ac.usability
          anchorReason = ac.reason
        }
        sampleLinks.push({
          sourceTitle: item.title,
          sourceUrl: item.link,
          targetUrl: normalizeHref(resolved),
          anchor,
          linkClass: kind,
          anchorUsability,
          anchorReason,
          context: kind === 'internal' ? contextAround(html, anchor) : '',
        })
      }

      if (kind !== 'internal') {
        externalOrRejected++
        rejectedReasons[kind]++
        continue
      }
      internalLinksExtracted++
      const key = internalTargetKey(resolved)
      if (!key) { rejectedReasons.other++; continue }
      const own = ownByKey.get(key)
      const agg = targets.get(key) ?? {
        url: normalizeHref(resolved),
        type: guessType(key, resolved, own?.type),
        title: own?.title || slugFromUrl(resolved),
        anchors: new Map<string, { text: string; count: number }>(),
        sources: new Map<string, string>(),
        inbound: 0,
        contentSkipped: false,
      }
      agg.inbound++
      if (anchor) {
        const ak = anchor.toLowerCase()
        const prev = agg.anchors.get(ak)
        if (prev) prev.count++
        else agg.anchors.set(ak, { text: anchor, count: 1 })
      }
      if (item.link && !agg.sources.has(item.link)) agg.sources.set(item.link, item.title)
      targets.set(key, agg)
    }
  }

  // 5) Shape the target list: eligibility, keyword source, anchor tri-state.
  const targetList: ScannedTarget[] = Array.from(targets.entries())
    .map(([key, agg]) => {
      const own = ownByKey.get(key)
      const gen = genByKey.get(key)
      const ctx: AnchorContext = { targetTitle: agg.title, targetUrl: agg.url, isHomepage: isHomepageUrl(agg.url) }

      // Anchor tri-state classification (context-aware entity handling).
      const classified: ScannedAnchor[] = Array.from(agg.anchors.values())
        .map(({ text, count }) => {
          const c = classifyAnchorForPlanning(text, ctx)
          return { text, count, usability: c.usability, reason: c.reason }
        })
        .sort((a, b) => b.count - a.count)
      const usableAnchors = classified.filter((a) => a.usability === 'yes').slice(0, TOP_ANCHORS_PER_TARGET)
      const cautionAnchors = classified.filter((a) => a.usability === 'caution').slice(0, TOP_ANCHORS_PER_TARGET)
      const rejectedAnchors = classified.filter((a) => a.usability === 'no').slice(0, TOP_ANCHORS_PER_TARGET)
      const usableAnchorsCount = classified.filter((a) => a.usability === 'yes').length
      const cautionAnchorsCount = classified.filter((a) => a.usability === 'caution').length
      const rejectedAnchorsCount = classified.filter((a) => a.usability === 'no').length

      // Generic structural classification: role + priority + eligibility.
      const cls = classifyTarget(agg.url, agg.title, own?.type)

      // Keyword source priority: SEO focus kw → our primary_keyword → title →
      // slug → heading → inferred → unavailable. Only the first two are "available".
      let keywordSource: TargetKeywordSource = 'unavailable'
      let primaryKeywordCandidate = ''
      let keywordAvailable = false
      const slugKw = slugFromUrl(agg.url)
      if (own?.seoFocusKeyword) {
        keywordSource = (own.seoKeywordSource as TargetKeywordSource) || 'yoast_focus_keyword'
        primaryKeywordCandidate = own.seoFocusKeyword
        keywordAvailable = true
      } else if (gen?.primaryKeyword) {
        keywordSource = 'generated_article_primary_keyword'
        primaryKeywordCandidate = gen.primaryKeyword
        keywordAvailable = true
      } else if (own?.title) {
        keywordSource = 'title'; primaryKeywordCandidate = own.title
      } else if (slugKw) {
        keywordSource = 'slug'; primaryKeywordCandidate = slugKw
      } else if (own?.headingKw) {
        keywordSource = 'heading'; primaryKeywordCandidate = own.headingKw
      }

      const exampleSources = Array.from(agg.sources.entries()).slice(0, MAX_EXAMPLE_SOURCES).map(([url, title]) => ({ url, title }))
      return {
        targetUrl: agg.url,
        targetType: cls.targetType,
        targetTitle: agg.title,
        inboundLinkCount: agg.inbound,
        eligibility: cls.eligibility,
        eligibilityReason: cls.reason,
        targetRole: cls.targetRole,
        targetPriority: cls.targetPriority,
        keywordSource,
        primaryKeywordCandidate,
        keywordAvailable,
        usableAnchorsCount,
        cautionAnchorsCount,
        rejectedAnchorsCount,
        onlyGenericAnchors: classified.length > 0 && usableAnchorsCount === 0 && cautionAnchorsCount === 0,
        usableAnchors,
        cautionAnchors,
        rejectedAnchors,
        exampleSources,
        matchedGeneratedArticleId: gen?.id ?? null,
        matchedGeneratedArticleTitle: gen?.title ?? null,
        contentSkipped: agg.contentSkipped,
        contentSkippedReason: agg.contentSkippedReason,
      }
    })
    // Linked targets first; among equal inbound, content-readable before skipped.
    .sort((a, b) => b.inboundLinkCount - a.inboundLinkCount || Number(a.contentSkipped) - Number(b.contentSkipped))

  return {
    siteUrl: creds.siteUrl,
    hosts,
    postsFetched: postsMeta.items.length,
    pagesFetched: pagesMeta.items.length,
    itemsScanned: items.length,
    postsPagesRequested: maxItems,
    truncated,
    metadataItemsFetched: items.length,
    postsMetadataFetched: postsMeta.items.length,
    pagesMetadataFetched: pagesMeta.items.length,
    contentItemsFetched,
    postsContentFetched,
    pagesContentFetched,
    contentItemsSkipped,
    contentTooLargeCount,
    internalLinksExtracted,
    externalOrRejected,
    rejectedReasons,
    uniqueTargets: targetList.length,
    targetsWithUsableAnchors: targetList.filter((t) => t.usableAnchorsCount > 0).length,
    targetsGenericOnly: targetList.filter((t) => t.onlyGenericAnchors).length,
    targetsEligible: targetList.filter((t) => t.eligibility === 'yes').length,
    targetsEligibilityCaution: targetList.filter((t) => t.eligibility === 'caution').length,
    targetsIneligible: targetList.filter((t) => t.eligibility === 'no').length,
    ecommerceActionLinksRejected: rejectedReasons.ecommerce_action,
    wordpressApiUrlsRejected: rejectedReasons.wordpress_api,
    utilityTargetsIneligible: targetList.filter((t) => t.targetRole === 'utility_system').length,
    productCardNoiseAnchorsRejected: targetList.reduce((n, t) => n + t.rejectedAnchors.filter((a) => a.reason === 'product_card_noise' || a.reason === 'too_long_product_card').length, 0),
    seoFocusKeywordsFound,
    targets: targetList.slice(0, TOP_TARGETS),
    sampleLinks,
    notes,
    errors,
    timingMs: Date.now() - startedAt,
  }
}
