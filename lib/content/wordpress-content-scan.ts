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
import { getPosts, getPages, getItemContentHtml, getCategories, getTags, getTaxonomyTerms, discoverStoreEntities, WordPressClientError, type WpContentEndpoint } from '@/lib/wordpress/client'
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
// Phase 3H.2 — raised 100 → 200: the cap is POST-PROCESSING only (no extra HTTP
// fetching), and 100 crowded ecommerce products/categories out of the index,
// starving site-scan idea generation on stores. Still bounded (storage-safe).
const TOP_TARGETS = 200
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
 * Pure navigational/boilerplate anchors (no topical meaning). Generic,
 * multilingual, not site-specific.
 */
const BOILERPLATE_ANCHORS = new Set([
  'עמוד הבית', 'דף הבית', 'ראשי', 'בית', 'לאתר', 'האתר', 'לאתר שלנו', 'this page', 'website',
  'our website', 'home', 'homepage', 'home page',
])

/**
 * COMMERCE CTA/action anchors (cart/product/buy/shop). Generic, multilingual —
 * UI actions, never useful SEO planning anchors. Reason: ecommerce_or_boilerplate_action.
 */
const CTA_COMMERCE_ANCHORS = new Set([
  // Hebrew
  'הוספה לסל', 'הוסף לסל', 'הוסיפו לסל', 'הוסף לעגלה', 'הוספה לעגלה', 'בחר/י אפשרויות', 'בחר אפשרויות',
  'בחרו אפשרויות', 'בחירת אפשרויות', 'קנה עכשיו', 'קנו עכשיו', 'הזמן עכשיו', 'הזמינו עכשיו', 'למוצר',
  'למוצרים', 'לכל המוצרים', 'כל המוצרים', 'צפייה במוצר', 'צפה במוצר', 'צפייה במוצרים', 'לצפייה במוצר',
  'לצפייה במוצרים', 'לחנות', 'למעבר לחנות', 'לרכישה', 'לרכישת המוצר', 'אפשרויות רכישה', 'אפשרויות קנייה',
  'הוסף לרשימה',
  // English
  'add to cart', 'add to basket', 'select options', 'choose options', 'buy now', 'order now', 'shop now',
  'view product', 'view products', 'all products', 'go to shop', 'go to store', 'purchase options',
  'buying options', 'add to wishlist',
])

/**
 * GENERIC CTA anchors (read-more / click-here / open / link). Generic,
 * multilingual — no topical meaning. Reason: generic_cta_anchor.
 */
const CTA_GENERIC_ANCHORS = new Set([
  // Hebrew
  'קרא עוד', 'קראו עוד', 'המשך קריאה', 'המשך לקרוא', 'המשך', 'להמשך', 'להמשך קריאה', 'למידע נוסף',
  'מידע נוסף', 'לפרטים', 'לפרטים נוספים', 'לקריאה', 'לקריאה נוספת', 'עוד', 'פתח', 'פתחו', 'לצפייה',
  'להצגה', 'ראו עוד', 'ראה עוד', 'ראו כאן', 'ראה כאן', 'למעבר', 'עבור', 'כניסה', 'כאן', 'לחצו כאן',
  'לחץ כאן', 'לחצו', 'קישור', 'צרו קשר', 'צור קשר',
  // English
  'read more', 'continue reading', 'learn more', 'more details', 'more detail', 'more info',
  'more information', 'for more information', 'see more', 'see all', 'view all', 'open', 'click here',
  'here', 'link', 'details', 'go', 'read on', 'more', 'visit',
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

/** Strip decorative arrows/ellipsis/separators so "לקריאה >>" → "לקריאה". */
function normalizeAnchor(a: string): string {
  return (a || '')
    .replace(/[»«›‹→←▸►◄▶◀•·…<>]+/g, ' ')
    .replace(/[|/\\\-–—]+\s*$/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Generic CTA / navigation / action vocabulary (STEMS, multilingual). A hit is a
 * word that carries no topic — used to detect "pure CTA" anchors where EVERY
 * token is such a word (e.g. "להמשך קריאה", "לכל המוצרים"). Real topical anchors
 * keep at least one non-vocabulary word (a product/place/topic) and survive.
 */
const CTA_GENERIC_STEMS = new Set([
  // Hebrew (reading / navigation / generic action + fillers)
  'קריאה', 'לקרוא', 'קרא', 'קראו', 'המשך', 'המשיכו', 'עוד', 'נוסף', 'נוספת', 'נוספים', 'נוספות',
  'פרטים', 'מידע', 'כאן', 'לחצו', 'לחץ', 'לחיצה', 'צפייה', 'צפו', 'צפה', 'הצגה', 'מעבר', 'עבור',
  'כניסה', 'קישור', 'פתח', 'פתחו', 'ראו', 'ראה', 'כתבות', 'כתבה', 'מאמרים', 'מאמר', 'פוסטים',
  'פוסט', 'עמוד', 'דף', 'בלוג', 'כל',
  // Phase 3G — generic STRUCTURAL nouns (category/collection): a CTA like
  // "לצפייה בקטגוריה" / "צפייה בקולקציה" has no topical token and must be blocked.
  // A real anchor keeps a product/topic word (e.g. "קטגוריית קטלבלס" survives).
  'קטגוריה', 'קטגוריות', 'קטגורית', 'קטגוריית', 'קולקציה', 'קולקציות', 'מחלקה', 'מחלקות',
  // English
  'read', 'reading', 'more', 'continue', 'learn', 'details', 'detail', 'info', 'information', 'see',
  'view', 'all', 'open', 'click', 'here', 'link', 'go', 'page', 'pages', 'posts', 'post', 'articles',
  'article', 'blog', 'next', 'previous', 'back',
  'category', 'categories', 'collection', 'collections', 'department', 'section',
])
const CTA_COMMERCE_STEMS = new Set([
  // Hebrew (buy / cart / shop / product / options)
  'רכישה', 'לרכוש', 'קנייה', 'קניות', 'קנה', 'קנו', 'הזמן', 'הזמינו', 'הזמנה', 'סל', 'עגלה', 'חנות',
  'מוצר', 'מוצרים', 'אפשרויות', 'אופציות', 'מבצע', 'הוספה', 'הוסף', 'הוסיפו', 'בחר', 'בחרו', 'בחירת',
  'בחירה', 'רשימת', 'משאלות',
  // Phase 3G.3 — all "add" verb forms so admin/CTA texts like "הוספת קטגוריות" /
  // "להוסיף קטגוריות" (with the structural noun קטגוריות) classify as pure CTA.
  'הוסיף', 'להוסיף', 'הוספת', 'להוספת', 'מוסיף', 'מוסיפים', 'הוספות',
  // English
  'buy', 'purchase', 'order', 'cart', 'basket', 'shop', 'store', 'product', 'products', 'options',
  'option', 'select', 'choose', 'wishlist', 'add', 'checkout', 'sale',
])

/** Classify one token as a generic/commerce CTA word (handling ל/ה/ב/… prefix), or null. */
function ctaWordKind(token: string): 'generic' | 'commerce' | null {
  const t = token.toLowerCase()
  const stem = t.replace(/^[להבומכש]־?/, '') // strip a single Hebrew prefix (incl. maqaf)
  if (CTA_COMMERCE_STEMS.has(t) || CTA_COMMERCE_STEMS.has(stem)) return 'commerce'
  if (CTA_GENERIC_STEMS.has(t) || CTA_GENERIC_STEMS.has(stem)) return 'generic'
  return null
}

/**
 * True when the anchor is composed ENTIRELY of CTA/navigation/commerce/filler
 * words (no real topic/product/category token) → a pure CTA, not a planning
 * anchor. `commerce` marks whether any commerce word appeared.
 */
function isPureCtaAnchor(norm: string): { cta: boolean; commerce: boolean } {
  const toks = norm.split(/\s+/).filter(Boolean)
  if (toks.length === 0) return { cta: false, commerce: false }
  let commerce = false
  for (const tk of toks) {
    const kind = ctaWordKind(tk)
    if (!kind) return { cta: false, commerce: false } // a real topical token survives
    if (kind === 'commerce') commerce = true
  }
  return { cta: true, commerce }
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
  const lower = norm.toLowerCase()
  if (CTA_COMMERCE_ANCHORS.has(lower)) return { usability: 'no', reason: 'ecommerce_or_boilerplate_action' }
  if (CTA_GENERIC_ANCHORS.has(lower)) return { usability: 'no', reason: 'generic_cta_anchor' }
  if (BOILERPLATE_ANCHORS.has(lower)) return { usability: 'no', reason: 'generic_boilerplate' }
  // WooCommerce product-card noise: price/rating/review-laden anchor text.
  if (hasPriceOrRatingNoise(norm)) return { usability: 'no', reason: anchorWordCount(norm) > 8 ? 'too_long_product_card' : 'product_card_noise' }
  // Pure CTA/navigation phrase (every token is a CTA/nav/commerce/filler word),
  // e.g. "להמשך קריאה", "לכל המוצרים", "לצפייה במוצר". Handles ל/ה/… prefixes and
  // arrow/space variants (normalized above). Real topical anchors survive.
  const pureCta = isPureCtaAnchor(norm)
  if (pureCta.cta) return { usability: 'no', reason: pureCta.commerce ? 'ecommerce_or_boilerplate_action' : 'generic_cta_anchor' }
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

// ── Phase 3G.6 — SAFE derived-anchor fallback from the target's own metadata ──
// Many perfectly good targets have NO inbound anchors on the site (nobody linked
// to them yet) and no clean keyword — the planner then hard-blocks them as
// no_usable_anchor even though their TITLE contains an obvious topical phrase
// ("תאורה לבית בזול – איך מאירים נכון…" → "תאורה לבית בזול"). This derives a
// short anchor from the title's first segment (before – — - : |), else the whole
// short title, else Hebrew slug words — each candidate validated by the SAME
// CTA/generic/boilerplate classifier real anchors go through, so CTA/admin/
// generic phrases can never come back. Homepages are never derived (brand-only
// titles), and single words are refused (brand/generic risk). Deliberately
// conservative: a target that truly has no topical phrase stays blocked.

/** Title/slug segment separators: " – ", " — ", " - ", "|", ": " (colon+space). */
const TITLE_SEGMENT_SPLIT = /\s+[–—-]\s+|\s*\|\s*|:\s+/

export interface DerivedTargetAnchor { text: string; source: 'derived_title' | 'derived_slug' }

/** Derive a safe topical anchor from a target's own title/slug, or null. */
export function deriveTargetAnchorFromMeta(meta: { targetTitle: string; targetUrl: string }): DerivedTargetAnchor | null {
  const url = (meta.targetUrl || '').trim()
  const title = (meta.targetTitle || '').replace(/\s+/g, ' ').trim()
  if (!url || isHomepageUrl(url)) return null // homepage titles are brand/site names
  const ctx: AnchorContext = { targetTitle: title, targetUrl: url, isHomepage: false }

  // Validate a candidate phrase with the SAME rules real anchors go through,
  // plus derived-only bounds: 2–6 words (1 word = brand/generic risk; more = a
  // full headline, not an anchor) and a sane character length.
  const tryPhrase = (raw: string): string | null => {
    const s = (raw || '').replace(/["“”'’«»…]+/g, ' ').replace(/\s+/g, ' ').trim().replace(/^[,.;:!?־-]+|[,.;:!?־-]+$/g, '').trim()
    if (!s || s.length > 60) return null
    const wc = s.split(/\s+/).length
    if (wc < 2 || wc > 6) return null
    if (classifyAnchorForPlanning(s, ctx).usability !== 'yes') return null
    return s
  }

  if (title) {
    // 1) First topical segment of the title ("X – how to…" / "X | brand" → "X").
    const seg = (title.split(TITLE_SEGMENT_SPLIT)[0] ?? '').trim()
    if (seg && seg !== title) {
      const fromSeg = tryPhrase(seg)
      if (fromSeg) return { text: fromSeg, source: 'derived_title' }
    }
    // 2) The whole title, when it is already a short keyword-like phrase.
    const whole = tryPhrase(title)
    if (whole) return { text: whole, source: 'derived_title' }
  }

  // 3) Slug words — ONLY when the slug decodes to real site-language (Hebrew)
  // words; transliterated slugs ("nikayon-misradim") are not usable anchor text.
  const slugPhrase = slugFromUrl(url).replace(/[-_]+/g, ' ').replace(/\s+/g, ' ').trim()
  if (slugPhrase && /[֐-׿]/.test(slugPhrase)) {
    const fromSlug = tryPhrase(slugPhrase)
    if (fromSlug) return { text: fromSlug, source: 'derived_slug' }
  }
  return null
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
  | 'content_hub'
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
// Utility/system/legal page slugs (exact path-segment match, decoded). English +
// common Hebrew hyphenated forms so localized WordPress slugs are caught too.
const UTILITY_SLUGS = [
  // English
  'cart', 'checkout', 'my-account', 'account', 'login', 'signin', 'sign-in', 'register', 'signup', 'sign-up',
  'lost-password', 'wishlist', 'privacy', 'privacy-policy', 'terms', 'terms-and-conditions', 'tos', 'legal',
  'accessibility', 'refund', 'refund-policy', 'returns', 'return-policy', 'cancellation', 'shipping',
  'shipping-policy', 'contact', 'contact-us', 'get-in-touch', 'faq', 'sitemap', 'disclaimer', 'cookie',
  'cookies', 'thank-you', 'order-received',
  // Hebrew (decoded, hyphenated) — contact + common utility/legal pages
  'צור-קשר', 'צרו-קשר', 'יצירת-קשר', 'סל-הקניות', 'עגלת-קניות', 'עמוד-לתשלום', 'החשבון-שלי', 'רשימת-משאלות',
  'מדיניות-פרטיות', 'תקנון', 'תנאי-שימוש', 'הצהרת-נגישות', 'מדיניות-החזרות', 'ביטול-עסקה', 'דרכי-ביטול',
  'מדיניות-ביטול', 'מדיניות-משלוח', 'מפת-אתר', 'שאלות-נפוצות',
]
// SPECIFIC statement/policy titles only — NOT bare topic words. A content
// article that merely mentions "accessibility"/"privacy" as a topic must stay
// eligible; only a real statement/policy/utility PAGE is rejected.
const UTILITY_TITLE = [
  // Hebrew (contact + specific statement/policy titles)
  'צור קשר', 'צרו קשר', 'יצירת קשר', 'סל הקניות', 'עגלת הקניות', 'עגלת קניות', 'עמוד לתשלום', 'החשבון שלי',
  'רשימת משאלות', 'מדיניות פרטיות', 'תקנון', 'תנאי שימוש', 'הצהרת נגישות', 'ביטול עסקה', 'דרכי ביטול',
  'מדיניות החזרות', 'מדיניות ביטול', 'מדיניות משלוח', 'מפת אתר',
  // English
  'contact us', 'get in touch', 'shopping cart', 'checkout', 'my account', 'wishlist', 'privacy policy',
  'terms of service', 'terms and conditions', 'terms of use', 'accessibility statement', 'refund policy',
  'return policy', 'cancellation policy', 'shipping policy', 'cookie policy',
]
const CATEGORY_PATH = ['/category/', '/product-category/', '/product_cat/', '/collection/', '/collections/', '/shop/', '/store/', '/catalog/', '/services/', '/service/']
const PRODUCT_PATH = ['/product/', '/products/', '/item/']
// Blog/article/resource HUB path segments + title words (generic, multilingual).
const HUB_SEGS = ['blog', 'articles', 'article', 'resources', 'resource', 'guides', 'guide', 'news', 'insights', 'magazine', 'knowledge', 'tips', 'stories', 'posts', 'topics', 'topic']
const HUB_TITLE = ['בלוג', 'מאמרים', 'מדריכים', 'חדשות', 'טיפים', 'מגזין', 'כתבות', 'ידע', 'משאבים', 'blog', 'articles', 'resources', 'guides', 'news', 'insights', 'magazine', 'knowledge base']
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
  // Decoded segments so percent-encoded non-ASCII slugs (e.g. Hebrew
  // "%d7%99%a6…" == "יצירת-קשר") match the utility slug list uniformly.
  const decodedSegs = segs.map((s) => { try { return decodeURIComponent(s) } catch { return s } })
  const query = u.search.toLowerCase()
  const titleL = (title || '').toLowerCase()

  // System / archive / search / feed / pagination / tracking → ineligible.
  if (/\/wp-login|\/wp-admin/.test(path)) return ineligible('utility_system', 'system_page')
  if (segs.includes('feed') || /\/feed\/?$/.test(path)) return ineligible('utility_system', 'feed_url')
  if (segs[0] === 'author') return ineligible('utility_system', 'author_archive')
  if (segs[0] === 'search' || /[?&]s=/.test(query)) return ineligible('utility_system', 'search_page')
  if (segs[0] === 'tag' || segs[0] === 'tags' || wpType === 'tag' || wpType === 'post_tag') return ineligible('utility_system', 'tag_archive', 'tag')
  // Date ARCHIVE only when the WHOLE path is numeric (/2024/ or /2024/05/) — a
  // dated POST permalink (/2024/05/my-post/) has a non-numeric slug and survives.
  if (/^(19|20)\d{2}$/.test(segs[0] ?? '') && segs.every((s) => /^\d+$/.test(s))) return ineligible('utility_system', 'date_archive')
  // Pagination (top-level /page/N or nested /…/page/N).
  if (segs.some((s, i) => s === 'page' && /^\d+$/.test(segs[i + 1] ?? ''))) return ineligible('utility_system', 'pagination_url')
  if (NOISE_QUERY.some((p) => query.includes(p))) return ineligible('utility_system', 'filtered_or_tracking_url')
  if (query && segs.length === 0) return ineligible('utility_system', 'query_only_url')

  // Utility/legal/commerce-system pages. Slug match applies to any type; TITLE
  // match is skipped for POSTS (an article that merely discusses accessibility/
  // privacy/etc. is content, not a utility page).
  const utilBySlug = decodedSegs.some((s) => UTILITY_SLUGS.includes(s))
  const utilByTitle = wpType !== 'post' && UTILITY_TITLE.some((w) => titleL.includes(w))
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

  // Blog/article/resource HUB (unknown type). A clean 1-segment hub listing
  // (/blog, /articles, /guides…) → strong content hub; deeper/ambiguous content
  // under a hub path or hub-suggesting title → strategic content, caution.
  const hubBySeg = segs.length >= 1 && HUB_SEGS.includes(segs[0]!)
  const hubByTitle = HUB_TITLE.some((w) => titleL.includes(w))
  if (hubBySeg && segs.length === 1) {
    return { targetType: 'page', targetRole: 'content_hub', targetPriority: 'strategic_content_page', eligibility: 'yes', reason: 'content_hub' }
  }
  if (hubBySeg || hubByTitle) {
    return { targetType: 'unknown', targetRole: 'strategic_content_page', targetPriority: 'strategic_content_page', eligibility: 'caution', reason: 'content_page_inferred' }
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
  /** Phase 3I.1 — direct store entity discovery outcome (diagnostics). */
  storeEntityDiscovery?: StoreEntityDiscoverySummary
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

const MAX_TAXONOMY_TARGETS = 60
const taxKey = (u: string) => u.replace(/[?#].*$/, '').replace(/\/+$/, '').toLowerCase()

/**
 * Phase 3F.3.4 — build internal-link TARGETS directly from the WooCommerce
 * product-category and blog-category taxonomies, so category/hub pages are
 * available to the planner even when they are not linked from editorial content
 * (the most important targets on ecommerce sites). Read-only; best-effort;
 * excludes anything the existing classifier marks ineligible (cart/checkout/
 * search/filters/noise). The category NAME is the (usable) anchor + keyword.
 */
async function buildTaxonomyTargets(creds: WordPressCredentials, existing: Set<string>, note: (m: string) => void): Promise<ScannedTarget[]> {
  const out: ScannedTarget[] = []
  const seen = new Set(existing)
  const bases: { base: string; wpType: string }[] = [
    { base: 'product_cat', wpType: 'product_cat' },
    { base: 'categories', wpType: 'category' },
  ]
  for (const { base, wpType } of bases) {
    let terms: { name: string; link: string; count: number }[] = []
    try { terms = await getTaxonomyTerms(creds, base) } catch { terms = [] }
    for (const term of terms) {
      if (out.length >= MAX_TAXONOMY_TARGETS) break
      const key = taxKey(term.link)
      if (!key || seen.has(key)) continue
      const cls = classifyTarget(term.link, term.name, wpType)
      if (cls.eligibility === 'no') continue
      seen.add(key)
      const anchor: ScannedAnchor = { text: term.name, count: term.count || 0, usability: 'yes', reason: 'taxonomy_term_name' }
      out.push({
        targetUrl: term.link,
        targetType: cls.targetType,
        targetTitle: term.name,
        inboundLinkCount: 0,
        eligibility: cls.eligibility,
        eligibilityReason: cls.reason,
        targetRole: cls.targetRole,
        targetPriority: cls.targetPriority,
        keywordSource: 'title',
        primaryKeywordCandidate: term.name,
        // Not a reliable focus keyword (a taxonomy name), so it does NOT feed the
        // exact-keyword guard — but it IS a usable ANCHOR (below).
        keywordAvailable: false,
        usableAnchorsCount: 1,
        cautionAnchorsCount: 0,
        rejectedAnchorsCount: 0,
        onlyGenericAnchors: false,
        usableAnchors: [anchor],
        cautionAnchors: [],
        rejectedAnchors: [],
        exampleSources: [],
        matchedGeneratedArticleId: null,
        matchedGeneratedArticleTitle: null,
        contentSkipped: false,
      })
    }
  }
  if (out.length > 0) note(`Added ${out.length} category/product-category target(s) from the site taxonomy.`)
  return out
}

/**
 * Phase 3I — DIRECT ecommerce entity discovery via the public WooCommerce Store
 * API. Products were previously discoverable ONLY through in-body links of
 * fetched posts/pages — on slow hosts the per-item content budget starves that
 * path and the index ends up with no products at all (the "97 targets, 74
 * skipped, 3 site-scan ideas" class of project). Metadata-only (name +
 * permalink; NO body fetch, ≤3 requests), so it works regardless of the content
 * budget. Product/category identity is enough to seed ideas and money targets;
 * anchors/body remain a content-fetch concern.
 */
const MAX_STORE_PRODUCT_TARGETS = 80
const MAX_STORE_CATEGORY_TARGETS = 40

export interface StoreEntityDiscoverySummary {
  source: 'store_api' | 'store_api_legacy' | 'rest_product' | 'none'
  lastHttpStatus: number | null
  productsFound: number
  categoriesFound: number
  productTargetsAdded: number
  categoryTargetsAdded: number
}

async function buildStoreEntityTargets(
  creds: WordPressCredentials,
  existing: Set<string>,
  note: (m: string) => void,
): Promise<{ targets: ScannedTarget[]; summary: StoreEntityDiscoverySummary }> {
  const out: ScannedTarget[] = []
  const seen = new Set(existing)
  const push = (name: string, link: string, wpType: string, cap: number, count: { n: number }) => {
    if (count.n >= cap) return
    const key = taxKey(link)
    if (!key || seen.has(key)) return
    const cls = classifyTarget(link, name, wpType)
    if (cls.eligibility === 'no') return
    seen.add(key)
    count.n++
    const anchor: ScannedAnchor = { text: name, count: 0, usability: 'yes', reason: 'store_entity_name' }
    out.push({
      targetUrl: link, targetType: cls.targetType, targetTitle: name, inboundLinkCount: 0,
      eligibility: cls.eligibility, eligibilityReason: cls.reason, targetRole: cls.targetRole, targetPriority: cls.targetPriority,
      keywordSource: 'title', primaryKeywordCandidate: name, keywordAvailable: false,
      usableAnchorsCount: 1, cautionAnchorsCount: 0, rejectedAnchorsCount: 0, onlyGenericAnchors: false,
      usableAnchors: [anchor], cautionAnchors: [], rejectedAnchors: [],
      exampleSources: [], matchedGeneratedArticleId: null, matchedGeneratedArticleTitle: null, contentSkipped: false,
    })
  }

  const d = await discoverStoreEntities(creds)
  const pc = { n: 0 }
  for (const e of d.categories) push(e.name, e.link, 'product_cat', MAX_STORE_CATEGORY_TARGETS, pc)
  const pp = { n: 0 }
  for (const e of d.products) push(e.name, e.link, 'product', MAX_STORE_PRODUCT_TARGETS, pp)
  // Phase 3I.1 — the outcome is ALWAYS visible: which source worked (or the
  // last HTTP status when none did), how many entities were found vs added.
  if (d.source === 'none') {
    note(`Store entity discovery unavailable (no Store API / product REST${d.lastHttpStatus ? `; last HTTP ${d.lastHttpStatus}` : ''}) — products are discoverable only via in-body links.`)
  } else {
    note(`Store entity discovery via ${d.source}: found ${d.products.length} product(s) + ${d.categories.length} categorie(s); added ${pp.n} + ${pc.n} new metadata targets.`)
  }
  return {
    targets: out,
    summary: {
      source: d.source, lastHttpStatus: d.lastHttpStatus,
      productsFound: d.products.length, categoriesFound: d.categories.length,
      productTargetsAdded: pp.n, categoryTargetsAdded: pc.n,
    },
  }
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

  // Phase 3F.3.4 — augment with taxonomy (category / product-category) targets,
  // reserving cap slots so these high-value hubs are never dropped by TOP_TARGETS.
  const taxTargets = await buildTaxonomyTargets(creds, new Set(targetList.map((t) => taxKey(t.targetUrl))), (m) => notes.push(m))
  const contentCap = Math.max(0, TOP_TARGETS - taxTargets.length)
  // Phase 3H.2 — ECOMMERCE REPRESENTATION under the cap: products typically have
  // few inbound links, so a pure inbound sort crowded them all out. Reserve up
  // to a third of the content slots for the top product targets, fill the rest
  // by inbound order, then backfill any unused slots. Bounded and deterministic.
  const productSlots = Math.min(
    targetList.filter((t) => t.targetType === 'product').length,
    Math.min(50, Math.floor(contentCap / 3)),
  )
  const topProducts = targetList.filter((t) => t.targetType === 'product').slice(0, productSlots)
  const productUrls = new Set(topProducts.map((t) => t.targetUrl))
  const nonReserved = targetList.filter((t) => !productUrls.has(t.targetUrl))
  const contentSlice = [...topProducts, ...nonReserved.slice(0, contentCap - topProducts.length)]
    .sort((a, b) => b.inboundLinkCount - a.inboundLinkCount || Number(a.contentSkipped) - Number(b.contentSkipped))
  const targetCapHit = targetList.length > contentSlice.length
  // Phase 3I — direct Store-API entities (metadata-only; ≤3 requests), deduped
  // against everything already discovered. Appended like taxonomy targets so
  // ecommerce entities are never crowded out by the content cap.
  const storeSeen = new Set<string>([...contentSlice.map((t) => taxKey(t.targetUrl)), ...taxTargets.map((t) => taxKey(t.targetUrl))])
  const store = await buildStoreEntityTargets(creds, storeSeen, (m) => notes.push(m))
  const finalTargets = [...contentSlice, ...taxTargets, ...store.targets]

  return {
    siteUrl: creds.siteUrl,
    hosts,
    postsFetched: postsMeta.items.length,
    pagesFetched: pagesMeta.items.length,
    itemsScanned: items.length,
    postsPagesRequested: maxItems,
    // Phase 3H.2 — 'truncated' now also reflects the TARGET cap (partial
    // coverage), not only the post/page fetch limit, so the index card can say
    // the coverage is partial.
    truncated: truncated || targetCapHit,
    // Phase 3I.1 — persisted into the index summary so the status card / API can
    // show WHY products are (or are not) in the index.
    storeEntityDiscovery: store.summary,
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
    uniqueTargets: finalTargets.length,
    targetsWithUsableAnchors: finalTargets.filter((t) => t.usableAnchorsCount > 0).length,
    targetsGenericOnly: finalTargets.filter((t) => t.onlyGenericAnchors).length,
    targetsEligible: finalTargets.filter((t) => t.eligibility === 'yes').length,
    targetsEligibilityCaution: finalTargets.filter((t) => t.eligibility === 'caution').length,
    targetsIneligible: finalTargets.filter((t) => t.eligibility === 'no').length,
    ecommerceActionLinksRejected: rejectedReasons.ecommerce_action,
    wordpressApiUrlsRejected: rejectedReasons.wordpress_api,
    utilityTargetsIneligible: finalTargets.filter((t) => t.targetRole === 'utility_system').length,
    productCardNoiseAnchorsRejected: targetList.reduce((n, t) => n + t.rejectedAnchors.filter((a) => a.reason === 'product_card_noise' || a.reason === 'too_long_product_card').length, 0),
    seoFocusKeywordsFound,
    targets: finalTargets,
    sampleLinks,
    notes,
    errors,
    timingMs: Date.now() - startedAt,
  }
}
