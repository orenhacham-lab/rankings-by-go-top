/**
 * The one specific finding every cold message is built around, measured from
 * the recipient's own public pages at the moment of sending.
 *
 * WHY THIS IS THE RISKIEST PART OF THE CHANNEL. The message makes a factual
 * claim about a stranger's website and offers to fix it. A claim that is wrong,
 * or that was true last month and is not true today, is a deceptive statement
 * under FTC Act s.5 — separately from anything CAN-SPAM says — and it is also
 * the fastest way to be dismissed by the one person we wanted to reach. The
 * channel's rules therefore require the finding to be verified on the day of
 * sending, and this module is what makes that true rather than aspirational.
 *
 * WHY THE SPLIT. `gatherEvidence` talks to the network and counts things;
 * `pickFinding` turns counts into a sentence and nothing else. The second half
 * is where the claims live, so it is pure and fully covered by the QA suite: a
 * change in wording is a change a guard sees. The first half is the part no
 * test can own, because it depends on a stranger's server.
 *
 * WHY EVERY BLOG CLAIM TALKS ABOUT THE SITEMAP AND NOT ABOUT THE SITE. What we
 * measure is what a site declares in its sitemaps, and on 16 Oct 2026 the gap
 * between the two put a false statement in a message: a site with 141 articles
 * under a custom post type was told it publishes none, because the sitemap we
 * happened to ask for was empty. `readArticles` was fixed to read the site's own
 * index, but the wording is the durable half of the fix — "your sitemap lists no
 * articles" is true whenever the measurement is, whatever a crawler might find
 * elsewhere on the site, and it is still a real finding a reader can check in a
 * minute. A claim may never be broader than the thing it was read from.
 *
 * WHY IT MAY RETURN NOTHING, AND WHY THAT IS THE POINT. A site with a current
 * blog, alt text on its images and one H1 gets no message. There is no fallback
 * finding and no generic sentence to fall back on, because the only thing a
 * fallback could be is a claim we have not verified. `pickFinding` returning
 * null is how a well-kept site stays unmailed.
 *
 * WHY THE PLATFORM CHECK LIVES HERE TOO. It is read from the same fetch of the
 * same page, and the message's promise ("directly on Shopify and WordPress
 * sites") is false for anything else — the same s.5 problem as a stale finding.
 * A site we cannot classify is not sent to.
 */

/** The platforms the message's promise is true for. Anything else is refused. */
export type ProspectPlatform = 'shopify' | 'wordpress'

export type PlatformVerdict =
  | { platform: ProspectPlatform }
  /** Classified as something the message would be untrue for, or not classified at all. */
  | { platform: null; reason: 'other_platform' | 'unrecognized' }

/** What a page fetch gives this module. One shape for the home page and for a sitemap. */
export interface FetchedPage {
  /** The URL actually served, after redirects. */
  url: string
  status: number
  body: string
}

/** Fetches a URL, or throws. Injected so the QA suite never touches the network. */
export type PageFetcher = (url: string) => Promise<FetchedPage>

/**
 * Everything the finding is allowed to be based on: counts and dates, never
 * prose lifted from the site. Each field is `null` when it could not be
 * measured, which is different from a measurement of zero and is treated so.
 */
export interface SiteEvidence {
  host: string
  /** The platform markers found in the home page's own HTML. */
  platform: PlatformVerdict
  /** `<img>` elements on the home page. */
  images: number | null
  /** Of those, the ones with no non-empty alt attribute. */
  imagesWithoutAlt: number | null
  /** `<h1>` elements on the home page. */
  h1Count: number | null
  /** Length of the meta description's content, 0 when the tag is absent, null when unknown. */
  metaDescriptionLength: number | null
  /** Articles found in the site's article sitemaps. */
  articleCount: number | null
  /** The newest article's lastmod, as an ISO date, when any was published. */
  newestArticleAt: string | null
}

/** A finding, ready to drop into the message. */
export interface Finding {
  /** Why this one fired. Logged, never sent. */
  kind: 'no_articles' | 'stale_blog' | 'thin_blog' | 'missing_alt' | 'h1_count' | 'meta_description'
  /**
   * The claim, as a clause that completes "I noticed that ...". Present tense,
   * no adjectives, nothing a reader could not check themselves in a minute.
   */
  clause: string
}

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

/** "April 2021", the form the stale-blog claim uses. */
export function monthAndYear(iso: string): string | null {
  const ms = Date.parse(iso)
  if (Number.isNaN(ms)) return null
  const d = new Date(ms)
  return `${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`
}

/** Days after which "your newest article is from X" is a fair thing to point out. */
export const STALE_BLOG_DAYS = 180
/** At or below this, a blog is thin enough to name the count. */
export const THIN_BLOG_MAX = 4
/** Minimum images without alt before the count is worth a sentence. */
export const MISSING_ALT_MIN = 5
/** And the share of the page's images it must reach. */
export const MISSING_ALT_SHARE = 0.2
/** Above this many characters Google truncates a description in the result. */
export const META_DESCRIPTION_MAX = 160

/**
 * The strongest claim the evidence supports, or null when it supports none.
 *
 * Ordered by how much the finding actually costs the recipient, not by how
 * easy it is to measure: a site with no articles has nothing competing for
 * search traffic at all, while two H1s is a detail. The first one that fires
 * wins, so every message carries exactly one claim and it is the biggest one.
 *
 * Every branch requires its measurement to be present. A field we could not
 * measure never produces a sentence, because "0 images" and "we could not
 * count the images" are the same value in a careless reading and only one of
 * them is a fact about the recipient's site.
 */
export function pickFinding(evidence: SiteEvidence, now: Date): Finding | null {
  const {
    articleCount, newestArticleAt, images, imagesWithoutAlt, h1Count, metaDescriptionLength,
  } = evidence

  if (articleCount === 0) {
    return {
      kind: 'no_articles',
      clause: 'your sitemap lists no articles at all, so search engines are pointed at no content pages',
    }
  }

  if (articleCount !== null && newestArticleAt !== null) {
    const ms = Date.parse(newestArticleAt)
    const label = monthAndYear(newestArticleAt)
    if (!Number.isNaN(ms) && label !== null
      && ms <= now.getTime() - STALE_BLOG_DAYS * 24 * 60 * 60 * 1000) {
      return {
        kind: 'stale_blog',
        clause: `the newest article in your sitemap is from ${label}`,
      }
    }
  }

  if (articleCount !== null && articleCount > 0 && articleCount <= THIN_BLOG_MAX) {
    return {
      kind: 'thin_blog',
      clause: articleCount === 1
        ? 'your sitemap lists a single article'
        : `your sitemap lists only ${articleCount} articles`,
    }
  }

  if (images !== null && imagesWithoutAlt !== null && images > 0
    && imagesWithoutAlt >= MISSING_ALT_MIN
    && imagesWithoutAlt >= images * MISSING_ALT_SHARE) {
    return {
      kind: 'missing_alt',
      clause: `${imagesWithoutAlt} of the ${images} images on your home page have no alt text`,
    }
  }

  if (h1Count !== null && h1Count !== 1) {
    return {
      kind: 'h1_count',
      clause: h1Count === 0
        ? 'your home page carries no H1 heading'
        : `your home page carries ${h1Count} H1 headings instead of one`,
    }
  }

  if (metaDescriptionLength === 0) {
    return { kind: 'meta_description', clause: 'your home page has no meta description' }
  }
  if (metaDescriptionLength !== null && metaDescriptionLength > META_DESCRIPTION_MAX) {
    return {
      kind: 'meta_description',
      clause: `your home page's meta description runs to ${metaDescriptionLength} characters, past the length Google shows`,
    }
  }

  return null
}

/* ------------------------------------------------------------------ parsing */

/** Markers that mean the message's promise is true, and markers that mean it is not. */
const SHOPIFY_MARKERS = ['cdn.shopify.com', 'myshopify.com', 'powered by shopify', 'shopify.theme']
const WORDPRESS_MARKERS = ['/wp-content/', '/wp-json/', '/wp-includes/', 'wp-emoji-release']
/** Hosted builders the plugin and the app cannot write to. */
const REFUSED_MARKERS = [
  'static.parastorage.com', 'wix.com', 'squarespace.com', 'static1.squarespace.com',
  'bigcommerce.com', 'webflow.com', 'cdn.websitebuilder', 'drupal-settings-json',
]

export function readPlatform(html: string): PlatformVerdict {
  const low = html.toLowerCase()
  // Refusals are checked first on purpose: a Wix site that embeds a Shopify
  // buy-button carries a Shopify marker, and the promise is still false for it.
  if (REFUSED_MARKERS.some((m) => low.includes(m))) return { platform: null, reason: 'other_platform' }
  const shopify = SHOPIFY_MARKERS.some((m) => low.includes(m))
  const wordpress = WORDPRESS_MARKERS.some((m) => low.includes(m))
  // Both at once is a site we have not understood, not a site that is somehow
  // each. Guessing between them puts a wrong promise in the message.
  if (shopify && wordpress) return { platform: null, reason: 'unrecognized' }
  if (shopify) return { platform: 'shopify' }
  if (wordpress) return { platform: 'wordpress' }
  return { platform: null, reason: 'unrecognized' }
}

/** Strip the parts of a page whose contents are not page content. */
function withoutScripts(html: string): string {
  return html.replace(/<(script|style|noscript|template)\b[\s\S]*?<\/\1>/gi, ' ')
}

export function countImagesWithoutAlt(html: string): { images: number; withoutAlt: number } {
  const body = withoutScripts(html)
  const tags = body.match(/<img\b[^>]*>/gi) ?? []
  let withoutAlt = 0
  for (const tag of tags) {
    // An empty alt is a deliberate "this image is decorative" and is correct,
    // so it does not count against the page. Only a missing or blank one does.
    if (!/\balt\s*=\s*(['"])\s*\S[\s\S]*?\1/i.test(tag)) withoutAlt += 1
  }
  return { images: tags.length, withoutAlt }
}

export function countH1(html: string): number {
  return (withoutScripts(html).match(/<h1[\s>]/gi) ?? []).length
}

/** The description's length, or 0 when the page has no description tag. */
export function metaDescriptionLength(html: string): number {
  const tag = html.match(/<meta\b[^>]*\bname\s*=\s*(['"])description\1[^>]*>/i)?.[0]
  if (!tag) return 0
  const content = tag.match(/\bcontent\s*=\s*(['"])([\s\S]*?)\1/i)?.[2]
  return (content ?? '').trim().length
}

const LOC = /<loc>\s*([^<\s]+)\s*<\/loc>/gi
const LASTMOD = /<lastmod>\s*([^<\s]+)\s*<\/lastmod>/gi

export function readLocs(xml: string): string[] {
  return [...xml.matchAll(LOC)].map((m) => m[1])
}

export function newestLastmod(xml: string): string | null {
  const stamps = [...xml.matchAll(LASTMOD)]
    .map((m) => Date.parse(m[1]))
    .filter((ms) => !Number.isNaN(ms))
  if (stamps.length === 0) return null
  return new Date(Math.max(...stamps)).toISOString()
}

/**
 * The default article sitemaps of the two platforms, tried after the site's own
 * index. Shopify's nested article sitemap, WordPress core's post sitemap since
 * 5.5, and Yoast's, which is what most WordPress sites with an SEO plugin serve.
 *
 * THESE ARE NOT ENOUGH ON THEIR OWN, and assuming they were produced a false
 * claim in production on 16 Oct 2026. A WordPress site publishing 141 articles
 * under a custom post type served `/wp-sitemap-posts-post-1.xml` and
 * `/post-sitemap.xml` with zero entries each, because it has no posts of type
 * `post` — its articles live in `news-sitemap.xml`, which only its own index
 * names. Two successful measurements of the wrong thing read exactly like a
 * site with no articles, and the message said so. Hence `SITEMAP_INDEXES`: the
 * site's declaration of what it publishes is read first, and these paths are
 * only a fallback.
 */
export const ARTICLE_SITEMAPS: Record<ProspectPlatform, readonly string[]> = {
  shopify: ['/sitemap_articles_1.xml', '/sitemap_blogs_1.xml'],
  wordpress: ['/wp-sitemap-posts-post-1.xml', '/post-sitemap.xml', '/sitemap-posts-post.xml'],
}

/** Where a site declares the sitemaps it has. Tried in order; the first that answers wins. */
export const SITEMAP_INDEXES: readonly string[] = ['/sitemap.xml', '/wp-sitemap.xml', '/sitemap_index.xml']

/** Words in a sitemap's own path that mean it holds articles. */
const ARTICLE_HINTS = ['article', 'news', 'blog', 'post', 'stories', 'insight', 'press']
/**
 * And words that mean it does not, checked FIRST. `wp-sitemap-posts-page-1.xml`
 * contains "post" and holds pages; `page-sitemap.xml` and a product, collection,
 * category, tag or author sitemap are not articles either. Counting any of them
 * as articles would hide an empty blog, which is the opposite error but the same
 * kind: a claim about something we did not measure.
 */
const NOT_ARTICLE_HINTS = [
  'page', 'product', 'collection', 'categor', 'taxonom', 'tag', 'author', 'user',
  'metaobject', 'agentic', 'image', 'video', 'attachment',
]

/**
 * The children of a sitemap index that plausibly hold articles, as absolute URLs.
 * Order is preserved, so a site's own ordering decides which is read first.
 */
export function articleSitemapsIn(xml: string): string[] {
  return readLocs(xml).filter((loc) => {
    // Only the path decides, never the host: a domain called "news.example"
    // would otherwise make every one of its sitemaps an article sitemap.
    let path = loc
    try { path = new URL(loc).pathname } catch { /* a relative loc is already a path */ }
    const low = path.toLowerCase()
    if (NOT_ARTICLE_HINTS.some((h) => low.includes(h))) return false
    return ARTICLE_HINTS.some((h) => low.includes(h))
  })
}

/**
 * Count the articles a site publishes, and date the newest.
 *
 * THE ORDER IS THE FIX. The site's own sitemap index is read first, and the
 * article sitemaps it names are what gets counted. Only when no index answers
 * do the platform defaults get tried. Before 16 Oct 2026 it was defaults only,
 * and a site whose articles live under a custom post type was told it publishes
 * none (see ARTICLE_SITEMAPS).
 *
 * `{ count: null }` — we learned nothing, and no claim about articles may be
 * made — is returned whenever nothing we asked for answered. A count of 0 is
 * reserved for the case where the site's own declaration was read and held no
 * article sitemap, or held ones that were empty. That distinction is the only
 * thing standing between "your sitemap lists no articles" and a false statement
 * about a stranger's business, so it is never widened for convenience.
 */
export async function readArticles(
  origin: string,
  platform: ProspectPlatform,
  fetchPage: PageFetcher,
): Promise<{ count: number | null; newestAt: string | null }> {
  const get = async (url: string): Promise<FetchedPage | null> => {
    try {
      const page = await fetchPage(url)
      return page.status === 200 ? page : (page.status === 404 ? { ...page, body: '' } : null)
    } catch {
      return null
    }
  }

  /** Count the first of these that holds entries. */
  const countIn = async (urls: readonly string[]): Promise<{ count: number; newestAt: string | null } | null> => {
    let answered = false
    for (const url of urls.slice(0, 6)) {
      const page = await get(url)
      if (page === null) continue
      answered = true
      if (page.status !== 200) continue
      const locs = readLocs(page.body)
      if (locs.length > 0) return { count: locs.length, newestAt: newestLastmod(page.body) }
    }
    return answered ? { count: 0, newestAt: null } : null
  }

  // 1. What does the site say it publishes?
  for (const indexPath of SITEMAP_INDEXES) {
    const index = await get(origin + indexPath)
    if (index === null || index.status !== 200) continue
    const children = readLocs(index.body)
    // An index with no children is not an index; it is probably a flat sitemap,
    // in which case it is not a declaration of anything and we keep looking.
    if (children.length === 0) continue
    const candidates = articleSitemapsIn(index.body)
    // The index was read. Its article sitemaps, or the absence of any, is the
    // answer — this is the one place a 0 may be concluded from.
    if (candidates.length === 0) return { count: 0, newestAt: null }
    const counted = await countIn(candidates)
    // Named sitemaps that would not answer leave us without a measurement; the
    // index said they exist, so their silence is not evidence of emptiness.
    return counted ?? { count: null, newestAt: null }
  }

  // 2. No index answered. Fall back to the platform's defaults, which can still
  // prove articles EXIST — but an empty answer from them proves nothing, for
  // exactly the reason this function was rewritten.
  const fallback = await countIn(ARTICLE_SITEMAPS[platform].map((path) => origin + path))
  if (fallback !== null && fallback.count > 0) return fallback
  return { count: null, newestAt: null }
}

/**
 * Measure a site. Never throws: a host that will not answer produces evidence
 * with a null platform, which `pickFinding` cannot build a claim from and the
 * sender treats as "skip this prospect".
 */
export async function gatherEvidence(host: string, fetchPage: PageFetcher): Promise<SiteEvidence> {
  const empty: SiteEvidence = {
    host,
    platform: { platform: null, reason: 'unrecognized' },
    images: null, imagesWithoutAlt: null, h1Count: null,
    metaDescriptionLength: null, articleCount: null, newestArticleAt: null,
  }
  let home: FetchedPage
  try {
    home = await fetchPage(`https://${host}/`)
  } catch {
    return empty
  }
  if (home.status !== 200) return empty

  const platform = readPlatform(home.body)
  const { images, withoutAlt } = countImagesWithoutAlt(home.body)
  const evidence: SiteEvidence = {
    host,
    platform,
    images,
    imagesWithoutAlt: withoutAlt,
    h1Count: countH1(home.body),
    metaDescriptionLength: metaDescriptionLength(home.body),
    articleCount: null,
    newestArticleAt: null,
  }
  if (platform.platform === null) return evidence

  // The origin the site actually served, so a bare-domain host that redirects
  // to www is probed at the address its own sitemaps live under.
  let origin = `https://${host}`
  try { origin = new URL(home.url).origin } catch { /* keep the host as given */ }
  const articles = await readArticles(origin, platform.platform, fetchPage)
  evidence.articleCount = articles.count
  evidence.newestArticleAt = articles.newestAt
  return evidence
}
