/**
 * The pure half of step b1: which pages of a site are worth reading, whether
 * robots.txt lets us read them, and the site index they become. No network
 * here; steps-b.ts does the reading, through hostPinnedFetch.
 *
 * ROBOTS. A minimal RFC 9309 matcher: groups of `User-agent` lines with their
 * `Allow`/`Disallow` rules, `*` and a trailing `$` in patterns, the longest
 * matching rule wins and Allow wins a tie. Deliberately stricter than the RFC
 * in one way: a path is read only when BOTH the `*` group and a group naming
 * our own product token allow it (the RFC would apply only the most specific
 * group). Every b1 read sends the free check's User-Agent,
 * "GoTopFreeCheck/1.0", whose product token is SEED_CRAWLER_TOKEN.
 *
 * The file is someone else's, so reading it costs linear time whatever it
 * holds: lines are cut with indexOf, never with a pattern that can backtrack,
 * and a rule is matched part by part with indexOf (never compiled into a
 * RegExp, where a handful of `*` against a long path took seconds). What one
 * read of the file comes to — rules, none, or unreadable — is robotsAnswer's.
 *
 * KEY PAGES. At most MAX_KEY_PAGES reads per run, the home page included when
 * b1 has to read it. Candidates are the home page's own links first (what the
 * site itself features), then its sitemaps; each is put in a bucket by its URL
 * (about, contact, service, category, product, article) and taken up to that
 * bucket's quota, then the remaining slots are filled in candidate order.
 *
 * THE INDEX. One ScannedTarget per page read, shaped exactly like the
 * WordPress scanner's (lib/content/wordpress-content-scan.ts) and classified
 * by its own classifyTarget, so every reader of wordpress_content_index reads
 * site_crawl_index unchanged (lib/content/content-index.ts).
 */
import { domainKey } from '@/lib/free-check'
import {
  classifyTarget,
  type RejectCounts,
  type ScannedAnchor,
  type ScannedTarget,
  type SiteScanReport,
} from '@/lib/content/wordpress-content-scan'

/** Reads per run: key pages plus the home page when b1 reads it itself. Sitemaps are extra. */
export const MAX_KEY_PAGES = 25
/** How many URLs of the sitemaps are considered (one index level, as the engine reads it). */
export const CRAWL_SITEMAP_LIMIT = 500
/** The robots.txt product token of the User-Agent every b1 read sends (GoTopFreeCheck/1.0). */
export const SEED_CRAWLER_TOKEN = 'gotopfreecheck'
/** The version stamped on a crawl index; the WordPress scanner stamps its own. */
export const CRAWL_INDEX_VERSION = 'seed-crawl-1'

// ── robots.txt ──────────────────────────────────────────────────────────────

/**
 * What one read of robots.txt comes to (RFC 9309, 2.3.1):
 *   rules       a 2xx answer read whole: its rules govern (a file with none
 *               allows everything);
 *   absent      a 4xx answer other than 429: the site has no rules for anyone,
 *               and everything is allowed;
 *   unreadable  a 5xx or a 429, no answer (a timeout, a network error, a
 *               redirect we will not follow), or a 2xx we did not get whole:
 *               cut by a deadline or a broken stream, or as long as the part
 *               the engine keeps. The rules are unknown: complete disallow.
 */
export type RobotsAnswer = { state: 'rules'; text: string } | { state: 'absent' } | { state: 'unreadable' }

/** fetchSiteText keeps the first 100 000 characters of a file; a text this long may be the start of a longer one. */
export const ROBOTS_TEXT_LIMIT = 100_000

/**
 * Classify one read. `read` is the engine's answer, null when it gave none;
 * `complete` says whether its body was read to the end (hostPinnedFetch's
 * `body` watch). A `rules` text has LF line ends only: RFC 9309 also ends a
 * line with CR or CRLF, and the engine's own readers of this text split on LF
 * and match each line with patterns that backtrack quadratically over a CR or
 * a Unicode line separator left inside it.
 */
export function robotsAnswer(read: { status: number; text: string } | null, complete: boolean): RobotsAnswer {
  if (!read) return { state: 'unreadable' }
  if (read.status >= 200 && read.status < 300) {
    if (!complete || read.text.length >= ROBOTS_TEXT_LIMIT) return { state: 'unreadable' }
    return { state: 'rules', text: read.text.replace(/\r\n?|[\u2028\u2029]/g, '\n') }
  }
  if (read.status >= 400 && read.status < 500 && read.status !== 429) return { state: 'absent' }
  return { state: 'unreadable' }
}

/**
 * A rule longer than MAX_RULE_CHARS, or with more `*` than MAX_RULE_WILDCARDS
 * (after `**` is read as `*`), is not matched as written: an Allow is dropped,
 * and a Disallow is matched by its beginning — cut at both caps, no longer
 * anchored — which keeps out every path the whole rule would, and more; it
 * keeps its length as written for precedence. The matcher is linear either
 * way; the caps bound what one line of the file can cost per URL.
 */
export const MAX_RULE_CHARS = 512
export const MAX_RULE_WILDCARDS = 16

type RobotsRule = {
  allow: boolean
  /** The rule as written; its length decides between two rules that match. */
  pattern: string
  /** What is matched: the decoded pattern cut at every `*`, and whether it ended in `$`. */
  parts: string[]
  anchored: boolean
}
export type RobotsGroup = { agents: string[]; rules: RobotsRule[] }

const safeDecode = (s: string): string => {
  try {
    return decodeURI(s)
  } catch {
    return s
  }
}

function compileRule(allow: boolean, pattern: string): RobotsRule | null {
  const anchored = pattern.endsWith('$')
  const body = safeDecode(anchored ? pattern.slice(0, -1) : pattern).replace(/\*{2,}/g, '*')
  const parts = body.split('*')
  if (pattern.length <= MAX_RULE_CHARS && parts.length - 1 <= MAX_RULE_WILDCARDS) return { allow, pattern, parts, anchored }
  if (allow) return null
  return { allow, pattern, parts: body.slice(0, MAX_RULE_CHARS).split('*').slice(0, MAX_RULE_WILDCARDS + 1), anchored: false }
}

export function parseRobots(txt: string | null | undefined): RobotsGroup[] {
  if (!txt) return []
  const groups: RobotsGroup[] = []
  let current: RobotsGroup | null = null
  let collectingAgents = false
  for (const raw of txt.split(/\r\n|\r|\n/)) {
    const hash = raw.indexOf('#')
    const line = hash >= 0 ? raw.slice(0, hash) : raw
    const colon = line.indexOf(':')
    if (colon < 0) continue
    const key = line.slice(0, colon).trim().toLowerCase()
    if (!/^[a-z-]+$/.test(key)) continue
    const value = line.slice(colon + 1).trim()
    if (key === 'user-agent') {
      if (!current || !collectingAgents) {
        current = { agents: [], rules: [] }
        groups.push(current)
      }
      // The product token is the name before any version or comment.
      current.agents.push(value.split(/[\s/]/)[0].toLowerCase())
      collectingAgents = true
      continue
    }
    if (key === 'sitemap') continue
    collectingAgents = false
    if (!current || (key !== 'allow' && key !== 'disallow')) continue
    // An empty Disallow allows everything: it is not a rule.
    if (value === '') continue
    const rule = compileRule(key === 'allow', value)
    if (rule) current.rules.push(rule)
  }
  return groups
}

/**
 * Does the rule match the path? Its first part must begin the path, every
 * later part must follow in order (each taken as early as it occurs, which
 * leaves the most room for the rest), and with `$` the last part must end the
 * path. Linear in the path for each part.
 */
function patternMatches(rule: RobotsRule, path: string): boolean {
  const { parts, anchored } = rule
  const first = parts[0]
  if (!path.startsWith(first)) return false
  if (parts.length === 1) return !anchored || path.length === first.length
  let at = first.length
  for (let i = 1; i < parts.length - 1; i++) {
    if (parts[i] === '') continue
    const found = path.indexOf(parts[i], at)
    if (found < 0) return false
    at = found + parts[i].length
  }
  const last = parts[parts.length - 1]
  if (anchored) return path.length - last.length >= at && path.endsWith(last)
  return path.indexOf(last, at) >= 0
}

/** The longest matching rule decides; Allow wins a tie; no match means allowed. */
function allowedByRules(rules: RobotsRule[], path: string): boolean {
  let best: RobotsRule | null = null
  for (const rule of rules) {
    if (!patternMatches(rule, path)) continue
    if (!best || rule.pattern.length > best.pattern.length || (rule.pattern.length === best.pattern.length && rule.allow && !best.allow)) {
      best = rule
    }
  }
  return best ? best.allow : true
}

/** May a crawler with this product token read this URL? Both `*` and its own group must allow it. */
export function robotsAllows(groups: RobotsGroup[], url: URL, token: string = SEED_CRAWLER_TOKEN): boolean {
  const path = safeDecode(url.pathname + url.search)
  if (path === '/robots.txt') return true
  const star = groups.filter((g) => g.agents.includes('*')).flatMap((g) => g.rules)
  const ours = groups.filter((g) => g.agents.includes(token.toLowerCase())).flatMap((g) => g.rules)
  return allowedByRules(star, path) && allowedByRules(ours, path)
}

// ── Which pages ─────────────────────────────────────────────────────────────

export type PageBucket = 'about' | 'contact' | 'service' | 'category' | 'product' | 'article' | 'other'

/** Taken in this order, up to these counts, before the rest is filled in candidate order. */
export const BUCKET_QUOTAS: readonly (readonly [PageBucket, number])[] = [
  ['about', 2],
  ['contact', 1],
  ['service', 6],
  ['category', 6],
  ['product', 5],
  ['article', 5],
]

const SEGMENTS: Record<Exclude<PageBucket, 'other'>, string[]> = {
  contact: ['contact', 'contact-us', 'contactus', 'get-in-touch', 'צור-קשר', 'צרו-קשר', 'יצירת-קשר', 'קשר'],
  about: ['about', 'about-us', 'aboutus', 'who-we-are', 'our-story', 'company', 'team', 'our-team', 'אודות', 'אודותינו', 'עלינו', 'מי-אנחנו', 'הצוות'],
  product: ['product', 'products', 'item', 'items', 'מוצר', 'מוצרים'],
  category: ['category', 'categories', 'product-category', 'collections', 'collection', 'shop', 'store', 'catalog', 'catalogue', 'departments', 'קטגוריה', 'קטגוריות', 'חנות', 'מחלקות'],
  service: ['services', 'service', 'what-we-do', 'solutions', 'treatments', 'שירותים', 'שירות', 'טיפולים', 'פתרונות'],
  article: ['blog', 'blogs', 'articles', 'article', 'post', 'posts', 'news', 'guides', 'guide', 'magazine', 'tips', 'insights', 'בלוג', 'מאמרים', 'מאמר', 'כתבות', 'מדריכים', 'מדריך', 'טיפים', 'חדשות'],
}
/** Checked in this order: a product inside a collection is a product. */
const BUCKET_ORDER: Exclude<PageBucket, 'other'>[] = ['contact', 'about', 'product', 'category', 'service', 'article']

const decodedSegments = (url: URL): string[] =>
  url.pathname
    .toLowerCase()
    .split('/')
    .filter(Boolean)
    .map((s) => {
      try {
        return decodeURIComponent(s)
      } catch {
        return s
      }
    })

export function pageBucket(url: URL): PageBucket {
  const segs = decodedSegments(url)
  for (const bucket of BUCKET_ORDER) {
    if (segs.some((s) => SEGMENTS[bucket].includes(s))) return bucket
  }
  // A dated permalink (/2024/05/a-post/) is an article.
  if (segs.length >= 2 && /^(19|20)\d{2}$/.test(segs[0]) && /[a-z֐-׿]/i.test(segs[segs.length - 1])) return 'article'
  return 'other'
}

const NEVER_SEGMENTS = new Set([
  'cart', 'checkout', 'account', 'my-account', 'login', 'signin', 'sign-in', 'register', 'signup', 'sign-up', 'logout',
  'wishlist', 'search', 'feed', 'wp-admin', 'wp-json', 'wp-login.php', 'xmlrpc.php', 'tag', 'tags', 'author', 'page',
  'password', 'orders', 'admin',
])
const ASSET = /\.(?:jpe?g|png|gif|webp|avif|svg|ico|bmp|tiff?|pdf|zip|rar|gz|xml|json|css|js|mjs|map|mp4|webm|mov|mp3|wav|woff2?|ttf|otf|eot|txt|csv|docx?|xlsx?|pptx?)$/i

/** A same-site, readable content URL, normalized (no hash, no trailing index.html); null otherwise. */
export function crawlCandidate(raw: string, siteKey: string): URL | null {
  let url: URL
  try {
    url = new URL(raw)
  } catch {
    return null
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return null
  if (url.username || url.password || url.port) return null
  if (domainKey(url) !== siteKey) return null
  // Query strings are filters, sorts, tracking and searches: never a key page.
  if (url.search) return null
  url.hash = ''
  if (ASSET.test(url.pathname)) return null
  const segs = decodedSegments(url)
  if (segs.some((s) => NEVER_SEGMENTS.has(s))) return null
  return url
}

const urlKey = (url: URL): string => `${url.hostname.replace(/^www\./, '')}${url.pathname.replace(/\/+$/, '') || '/'}`

/** One key per page: `www.` and a trailing slash do not make another page. An unparsable URL is its own key. */
export function pageKey(raw: string): string {
  try {
    return urlKey(new URL(raw))
  } catch {
    return raw
  }
}

export type CrawlSelection = {
  pages: { url: URL; bucket: PageBucket }[]
  /** Distinct readable candidates seen (before the robots check). */
  candidates: number
  /** Candidates robots.txt keeps us from reading. */
  disallowed: number
}

/**
 * Pick the key pages: home links first, then sitemap URLs, deduplicated,
 * robots-allowed, never the home page itself; each bucket up to its quota,
 * then the remaining slots in candidate order.
 */
export function selectKeyPages(input: {
  homeLinks: string[]
  sitemapUrls: string[]
  siteKey: string
  homeUrl: URL
  robots: RobotsGroup[]
  limit: number
}): CrawlSelection {
  const seen = new Set<string>([urlKey(input.homeUrl)])
  const allowed: { url: URL; bucket: PageBucket }[] = []
  let candidates = 0
  let disallowed = 0
  for (const raw of [...input.homeLinks, ...input.sitemapUrls]) {
    const url = crawlCandidate(raw, input.siteKey)
    if (!url) continue
    const key = urlKey(url)
    if (seen.has(key)) continue
    seen.add(key)
    candidates++
    if (!robotsAllows(input.robots, url)) {
      disallowed++
      continue
    }
    allowed.push({ url, bucket: pageBucket(url) })
  }
  const limit = Math.max(0, input.limit)
  const picked = new Set<number>()
  for (const [bucket, quota] of BUCKET_QUOTAS) {
    let taken = 0
    for (let i = 0; i < allowed.length && taken < quota && picked.size < limit; i++) {
      if (allowed[i].bucket === bucket && !picked.has(i)) {
        picked.add(i)
        taken++
      }
    }
  }
  for (let i = 0; i < allowed.length && picked.size < limit; i++) picked.add(i)
  const pages = [...picked].sort((a, b) => a - b).map((i) => allowed[i])
  return { pages, candidates, disallowed }
}

// ── The index ───────────────────────────────────────────────────────────────

export type CrawledPage = {
  /** The page's own URL after redirects. */
  url: string
  bucket: PageBucket
  title: string
  h1: string[]
  schemaTypes: string[]
  internalLinkUrls: string[]
  /** True for the home page. */
  home: boolean
}

const SCHEMA_WP_TYPE: [RegExp, string][] = [
  [/^product$/i, 'product'],
  [/^(article|blogposting|newsarticle)$/i, 'post'],
  [/^(collectionpage|itemlist|offercatalog)$/i, 'category'],
]
const BUCKET_WP_TYPE: Record<PageBucket, string> = {
  article: 'post',
  product: 'product',
  category: 'category',
  service: 'category',
  about: 'page',
  contact: 'page',
  other: 'page',
}

/** The WordPress type a page would have had, from its structured data, else its URL bucket. */
export function wpTypeHint(schemaTypes: string[], bucket: PageBucket): string {
  for (const [re, type] of SCHEMA_WP_TYPE) if (schemaTypes.some((t) => re.test(t))) return type
  return BUCKET_WP_TYPE[bucket]
}

/** The page's name: its H1 when it has a usable one, else the <title> without the site suffix. */
export function pageTitle(page: Pick<CrawledPage, 'title' | 'h1'>): string {
  const h1 = (page.h1[0] ?? '').replace(/\s+/g, ' ').trim()
  if (h1.length >= 3 && h1.length <= 120) return h1
  const title = (page.title ?? '').replace(/\s+/g, ' ').trim()
  const head = title.split(/\s+[|\-–—·•]\s+/)[0]?.trim() ?? ''
  return (head.length >= 3 ? head : title).slice(0, 120)
}

export function crawlTarget(page: CrawledPage, inboundLinkCount: number): ScannedTarget {
  const title = pageTitle(page)
  const cls = classifyTarget(page.url, title, wpTypeHint(page.schemaTypes, page.bucket))
  const anchor: ScannedAnchor | null = title
    ? { text: title, count: inboundLinkCount, usability: cls.eligibility === 'yes' ? 'yes' : cls.eligibility === 'caution' ? 'caution' : 'no', reason: 'page_title' }
    : null
  const usable = anchor && anchor.usability === 'yes' ? [anchor] : []
  const caution = anchor && anchor.usability === 'caution' ? [anchor] : []
  const rejected = anchor && anchor.usability === 'no' ? [anchor] : []
  return {
    targetUrl: page.url,
    targetType: cls.targetType,
    targetTitle: title,
    inboundLinkCount,
    eligibility: cls.eligibility,
    eligibilityReason: cls.reason,
    targetRole: cls.targetRole,
    targetPriority: cls.targetPriority,
    // A page title, not an SEO plugin's focus keyword: an anchor, never a guard keyword.
    keywordSource: 'title',
    primaryKeywordCandidate: title,
    keywordAvailable: false,
    usableAnchorsCount: usable.length,
    cautionAnchorsCount: caution.length,
    rejectedAnchorsCount: rejected.length,
    onlyGenericAnchors: false,
    usableAnchors: usable,
    cautionAnchors: caution,
    rejectedAnchors: rejected,
    exampleSources: [],
    matchedGeneratedArticleId: null,
    matchedGeneratedArticleTitle: null,
    contentSkipped: false,
  }
}

const ZERO_REJECTS: RejectCounts = { external: 0, mailto: 0, tel: 0, hash: 0, javascript: 0, empty: 0, ecommerce_action: 0, wordpress_api: 0, other: 0 }

/**
 * The crawl as a SiteScanReport: the pages read become targets (the home page
 * first), each with how many of the other read pages link to it. `errors` and
 * `notes` hold stable codes only.
 */
export function crawlReport(input: {
  siteUrl: string
  host: string
  pages: CrawledPage[]
  attempted: number
  failed: number
  truncated: boolean
  notes: string[]
  errors: string[]
  timingMs: number
}): SiteScanReport {
  const keyOf = (raw: string): string | null => {
    try {
      return urlKey(new URL(raw))
    } catch {
      return null
    }
  }
  const inbound = new Map<string, number>()
  for (const page of input.pages) {
    const own = keyOf(page.url)
    const linked = new Set(page.internalLinkUrls.map(keyOf).filter((k): k is string => !!k && k !== own))
    for (const k of linked) inbound.set(k, (inbound.get(k) ?? 0) + 1)
  }
  const targets = input.pages.map((p) => crawlTarget(p, inbound.get(keyOf(p.url) ?? '') ?? 0))
  const byType: Record<string, number> = {}
  for (const t of targets) byType[t.targetType] = (byType[t.targetType] ?? 0) + 1
  const read = input.pages.filter((p) => !p.home).length
  return {
    siteUrl: input.siteUrl,
    hosts: [input.host],
    postsFetched: targets.filter((t) => t.targetType === 'post').length,
    pagesFetched: read,
    itemsScanned: targets.length,
    postsPagesRequested: input.attempted,
    truncated: input.truncated,
    targetsByType: byType,
    metadataItemsFetched: 0,
    postsMetadataFetched: 0,
    pagesMetadataFetched: 0,
    contentItemsFetched: read,
    postsContentFetched: 0,
    pagesContentFetched: read,
    contentItemsSkipped: input.failed,
    contentTooLargeCount: 0,
    internalLinksExtracted: input.pages.reduce((n, p) => n + p.internalLinkUrls.length, 0),
    externalOrRejected: 0,
    rejectedReasons: { ...ZERO_REJECTS },
    uniqueTargets: targets.length,
    targetsWithUsableAnchors: targets.filter((t) => t.usableAnchorsCount > 0).length,
    targetsGenericOnly: 0,
    targetsEligible: targets.filter((t) => t.eligibility === 'yes').length,
    targetsEligibilityCaution: targets.filter((t) => t.eligibility === 'caution').length,
    targetsIneligible: targets.filter((t) => t.eligibility === 'no').length,
    ecommerceActionLinksRejected: 0,
    wordpressApiUrlsRejected: 0,
    utilityTargetsIneligible: targets.filter((t) => t.targetRole === 'utility_system').length,
    productCardNoiseAnchorsRejected: 0,
    seoFocusKeywordsFound: 0,
    targets,
    sampleLinks: [],
    notes: input.notes,
    errors: input.errors,
    timingMs: input.timingMs,
  }
}
