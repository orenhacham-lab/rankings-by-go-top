/**
 * Stage E2A — deterministic URL → page-type classification (pure).
 *
 * Read-only. Generic patterns only (WordPress + Shopify + common CMS conventions), no
 * project/customer/industry vocabulary. Utility/admin/account/search/archive URLs are
 * flagged so they can be excluded from ACTIONABLE opportunities — the exclusion is kept
 * deliberately narrow and testable. A commercial/product query is NEVER excluded here;
 * exclusion is a property of the URL, not the query.
 */

export type PageType = 'homepage' | 'category' | 'product' | 'article' | 'service' | 'utility' | 'unknown'

/** Parse a page URL into a lowercased path (+ query). Tolerant of scheme-less values. */
function pathOf(url: string): { path: string; search: string } {
  const raw = (url || '').trim()
  const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(raw) ? raw : `https://${raw}`
  try {
    const u = new URL(withScheme)
    // Percent-decode so non-ASCII (e.g. Hebrew) path segments classify correctly.
    let p = u.pathname
    try { p = decodeURIComponent(p) } catch { /* keep raw */ }
    return { path: p.toLowerCase().replace(/\/+$/, '') || '/', search: u.search.toLowerCase() }
  } catch {
    return { path: '/', search: '' }
  }
}

/** Narrow, testable utility/admin/account/search/archive segments. */
const UTILITY_SEGMENTS = [
  'cart', 'checkout', 'account', 'my-account', 'login', 'log-in', 'signin', 'sign-in',
  'register', 'signup', 'sign-up', 'privacy', 'privacy-policy', 'terms', 'terms-of-service',
  'shipping', 'returns', 'return', 'refund', 'refunds', 'thank-you', 'thankyou',
  'order-received', 'order-confirmation', 'wp-admin', 'wp-content', 'wp-login', 'wp-json',
  'author', 'tag', 'tags', 'wishlist', 'password-reset', 'lost-password', 'logout',
]

/** True for utility/admin/account/search/archive URLs (excluded from actionable output). */
export function isUtilityUrl(url: string): boolean {
  const { path, search } = pathOf(url)
  const segments = path.split('/').filter(Boolean)
  // Internal search result URLs (?s=… WordPress, ?q=…, /search).
  if (/[?&](s|q|search)=/.test(search)) return true
  if (segments.includes('search')) return true
  return segments.some((seg) => UTILITY_SEGMENTS.includes(seg))
}

const has = (segs: string[], names: string[]) => segs.some((s) => names.includes(s))

/**
 * Classify a page URL. Homepage first; utility next; then product / category / article /
 * service by generic path conventions; else unknown.
 */
export function classifyPage(url: string): PageType {
  const { path } = pathOf(url)
  if (path === '/' || path === '') return 'homepage'
  if (isUtilityUrl(url)) return 'utility'
  const segs = path.split('/').filter(Boolean)

  // Product: WooCommerce /product/, Shopify /products/, generic /item/.
  if (has(segs, ['product', 'products', 'item', 'items', 'p'])) return 'product'
  // Category: WooCommerce product-category, Shopify collections, generic category/cat.
  if (has(segs, ['category', 'categories', 'cat', 'product-category', 'collection', 'collections', 'shop'])) return 'category'
  // Article/blog: generic blog/news/post + Hebrew equivalents.
  if (has(segs, ['blog', 'article', 'articles', 'news', 'post', 'posts', 'guide', 'guides', 'מאמר', 'מאמרים', 'בלוג', 'חדשות'])) return 'article'
  // Service pages.
  if (has(segs, ['service', 'services', 'שירות', 'שירותים'])) return 'service'

  return 'unknown'
}

/** Page types eligible for ACTIONABLE opportunities (utility is observed but not actionable). */
export function isActionablePageType(pageType: PageType): boolean {
  return pageType !== 'utility'
}
