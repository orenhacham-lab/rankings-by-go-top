/**
 * What kind of page a URL is: one of the four tabs of the existing-content
 * screen (pages, products, articles, categories), or not content at all.
 * PURE, so every rule below is unit-tested with a mutation control
 * (lib/content/existing-content/__qa__/site-map.qa.ts).
 *
 * The evidence, strongest first:
 *   1. the PLATFORM's own type: a Shopify entity (product, collection, page,
 *      blog, article) or a WordPress REST object (post, page, product,
 *      product_cat, category). The site said what it is.
 *   2. the site INDEX's type: the WordPress scan's (its own WordPress type), or
 *      the crawl's when it read structured data or a telling URL (never its
 *      plain 'page', which is only the crawl's default).
 *   3. the SITEMAP the URL was listed in: product-sitemap.xml,
 *      sitemap_products_1.xml, wp-sitemap-posts-post-1.xml and the like. A site
 *      files its URLs by type there, and that is what makes a 900-product store
 *      countable without reading 900 pages.
 *   4. the URL itself: /products/…, /collections/…, /blog/…, a dated permalink.
 *
 * NOT CONTENT: the cart, the account, search, feeds, tag and author archives,
 * pagination, files, and anything with a query string (filters, sorts,
 * tracking). They are left out of every count, because a merchant counting
 * "my pages" does not count them.
 */

export type SiteKind = 'page' | 'product' | 'article' | 'category'
export const SITE_KINDS: readonly SiteKind[] = ['product', 'article', 'page', 'category']

const decodeSeg = (s: string): string => {
  try { return decodeURIComponent(s) } catch { return s }
}

/** Lowercased, decoded path segments; null for something that is not an http(s) URL. */
export function pathSegments(raw: string): string[] | null {
  let url: URL
  try { url = new URL(String(raw).trim()) } catch { return null }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return null
  return url.pathname.toLowerCase().split('/').filter(Boolean).map(decodeSeg)
}

const NOT_CONTENT_SEGMENTS = new Set([
  'cart', 'checkout', 'checkouts', 'account', 'my-account', 'login', 'signin', 'sign-in', 'register', 'signup', 'sign-up',
  'logout', 'wishlist', 'search', 'feed', 'rss', 'wp-admin', 'wp-json', 'wp-login.php', 'xmlrpc.php', 'wp-content',
  'wp-includes', 'tag', 'tags', 'tagged', 'author', 'page', 'password', 'orders', 'admin', 'cdn', 'עגלה', 'חשבון',
  'החשבון-שלי', 'תשלום', 'קופה', 'חיפוש',
])
const ASSET = /\.(?:jpe?g|png|gif|webp|avif|svg|ico|bmp|tiff?|pdf|zip|rar|gz|xml|json|css|js|mjs|map|mp4|webm|mov|mp3|wav|woff2?|ttf|otf|eot|txt|csv|docx?|xlsx?|pptx?)$/i

/** A page a merchant would call content: same rules for every source. */
export function isContentUrl(raw: string): boolean {
  let url: URL
  try { url = new URL(String(raw).trim()) } catch { return false }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return false
  if (url.search) return false
  if (ASSET.test(url.pathname)) return false
  const segs = pathSegments(raw) ?? []
  return !segs.some((s) => NOT_CONTENT_SEGMENTS.has(s))
}

const PRODUCT_SEGS = new Set(['product', 'products', 'item', 'items', 'מוצר', 'מוצרים'])
const CATEGORY_SEGS = new Set([
  'collection', 'collections', 'product-category', 'product_cat', 'category', 'categories', 'shop', 'store', 'catalog',
  'catalogue', 'departments', 'brand', 'brands', 'קטגוריה', 'קטגוריות', 'חנות', 'מחלקות', 'מותגים',
])
const ARTICLE_SEGS = new Set([
  'blog', 'blogs', 'news', 'articles', 'article', 'post', 'posts', 'guides', 'guide', 'magazine', 'tips', 'insights',
  'בלוג', 'מאמרים', 'מאמר', 'כתבות', 'מדריכים', 'מדריך', 'טיפים', 'חדשות', 'מגזין',
])

/**
 * A blog's own listing page (/blog, /blogs/news on Shopify): a page that lists
 * articles, not an article. Shopify nests articles one level deeper than other
 * platforms (/blogs/<blog>/<article>), so its listing has two segments.
 */
export function isBlogListing(raw: string): boolean {
  const segs = pathSegments(raw)
  if (!segs || segs.length === 0) return false
  if (segs[0] === 'blogs') return segs.length <= 2
  return segs.length === 1 && ARTICLE_SEGS.has(segs[0])
}

/** The URL alone. The home page and anything unrecognised is a page. */
export function kindFromUrl(raw: string): SiteKind {
  const segs = pathSegments(raw)
  if (!segs || segs.length === 0) return 'page'
  // A product inside a collection (/collections/x/products/y) is a product: a
  // product segment with a handle after it wins wherever it stands.
  for (let i = 0; i < segs.length - 1; i++) if (PRODUCT_SEGS.has(segs[i])) return 'product'
  if (isBlogListing(raw)) return 'page'
  for (let i = 0; i < segs.length - 1; i++) if (ARTICLE_SEGS.has(segs[i])) return 'article'
  // A dated permalink (/2024/05/a-post) is an article.
  if (segs.length >= 2 && /^(19|20)\d{2}$/.test(segs[0])) return 'article'
  // /collections, /collections/shoes, /product-category/shoes, /shop/shoes.
  if (segs.some((s) => CATEGORY_SEGS.has(s))) return 'category'
  // A bare /products listing is a catalogue page.
  if (segs.length === 1 && PRODUCT_SEGS.has(segs[0])) return 'category'
  return 'page'
}

/**
 * What a sitemap document's own name says about the URLs it lists, or
 * 'exclude' for a sitemap of things that are not content (authors, tags), or
 * null when the name says nothing (sitemap.xml, sitemap-1.xml). Checked in an
 * order that keeps look-alikes apart: "product_cat" before "product",
 * "wp-sitemap-posts-page" before "posts".
 */
export function sitemapKindHint(sitemapUrl: string): SiteKind | 'exclude' | null {
  let name: string
  try {
    const u = new URL(sitemapUrl)
    name = decodeSeg((u.pathname.split('/').filter(Boolean).pop() ?? '')).toLowerCase()
  } catch {
    return null
  }
  const has = (re: RegExp) => re.test(name)
  if (has(/(^|[^a-z])(authors?|users?|post_tag|product_tag|tags?|video|image|attachment)([^a-z]|$)/)) return 'exclude'
  if (has(/(^|[^a-z])(product[_-]?cat(egory|egories)?|categor(y|ies)|collections?|product[_-]?brand|brands?|taxonom(y|ies))([^a-z]|$)/)) return 'category'
  if (has(/(^|[^a-z])products?([^a-z]|$)/)) return 'product'
  if (has(/(^|[^a-z])pages?([^a-z]|$)/)) return 'page'
  if (has(/(^|[^a-z])(posts?|blogs?|articles?|news)([^a-z]|$)/)) return 'article'
  return null
}

/** A Shopify entity type or a WordPress REST type, as a tab. Null when it is none of ours. */
export function kindFromPlatform(type: string | null | undefined): SiteKind | null {
  switch ((type ?? '').toLowerCase()) {
    case 'product': return 'product'
    case 'collection': case 'product_cat': case 'category': return 'category'
    case 'article': case 'post': return 'article'
    // A Shopify "blog" is the blog's listing page.
    case 'page': case 'blog': return 'page'
    default: return null
  }
}

export interface KindEvidence {
  url: string
  /** A Shopify entity type or WordPress REST type. */
  platform?: string | null
  /** The site index's own type (WordPress scan: authoritative; crawl: only when not its default 'page'). */
  index?: { type: string | null | undefined; authoritative: boolean } | null
  /** The kind the sitemap document's name gave. */
  sitemap?: SiteKind | null
}

/** The strongest evidence decides (see the file header). */
export function resolveKind(e: KindEvidence): SiteKind {
  const segs = pathSegments(e.url)
  if (segs && segs.length === 0) return 'page'
  const fromPlatform = kindFromPlatform(e.platform)
  if (fromPlatform) return fromPlatform
  if (e.index) {
    const k = kindFromPlatform(e.index.type)
    if (k && (e.index.authoritative || k !== 'page')) return k
  }
  if (e.sitemap) {
    // A blog's sitemap lists the blog's own page too (Shopify's sitemap_blogs).
    if (e.sitemap === 'article' && isBlogListing(e.url)) return 'page'
    return e.sitemap
  }
  return kindFromUrl(e.url)
}

/** A readable name for a URL nothing else named: its last segment, decoded, dashes as spaces. */
export function titleFromUrl(raw: string): string {
  const segs = pathSegments(raw)
  if (!segs || segs.length === 0) return ''
  const last = segs[segs.length - 1].replace(/\.(?:html?|php|aspx?)$/i, '')
  const words = last.replace(/[-_+]+/g, ' ').replace(/\s+/g, ' ').trim()
  return words ? words.charAt(0).toUpperCase() + words.slice(1) : ''
}
