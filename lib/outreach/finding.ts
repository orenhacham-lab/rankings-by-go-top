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
      clause: 'your site publishes no articles at all, so there are no content pages working for search traffic',
    }
  }

  if (articleCount !== null && newestArticleAt !== null) {
    const ms = Date.parse(newestArticleAt)
    const label = monthAndYear(newestArticleAt)
    if (!Number.isNaN(ms) && label !== null
      && ms <= now.getTime() - STALE_BLOG_DAYS * 24 * 60 * 60 * 1000) {
      return {
        kind: 'stale_blog',
        clause: `your newest article is from ${label}`,
      }
    }
  }

  if (articleCount !== null && articleCount > 0 && articleCount <= THIN_BLOG_MAX) {
    return {
      kind: 'thin_blog',
      clause: articleCount === 1
        ? 'your blog holds a single article'
        : `your blog holds ${articleCount} articles`,
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
 * The sitemaps worth asking for, by platform. Both lists are ordered, and the
 * first one that answers with articles is the answer: a site that publishes
 * through one of them does not also need the others probed.
 *
 * These are the paths the two platforms actually serve by default — Shopify's
 * nested article sitemap, WordPress core's post sitemap since 5.5, and Yoast's,
 * which is what most WordPress sites with an SEO plugin serve instead.
 */
export const ARTICLE_SITEMAPS: Record<ProspectPlatform, readonly string[]> = {
  shopify: ['/sitemap_articles_1.xml', '/sitemap_blogs_1.xml'],
  wordpress: ['/wp-sitemap-posts-post-1.xml', '/post-sitemap.xml', '/sitemap-posts-post.xml'],
}

/**
 * Count the articles a site publishes, and date the newest.
 *
 * `{ count: null }` is returned when every candidate path failed, which is
 * different from a site that answered and had none: we did not learn anything,
 * so no blog claim may be made. A path that answers 404 is an answer about that
 * path only, not about the site, so the probing continues.
 */
export async function readArticles(
  origin: string,
  platform: ProspectPlatform,
  fetchPage: PageFetcher,
): Promise<{ count: number | null; newestAt: string | null }> {
  let anyAnswered = false
  for (const path of ARTICLE_SITEMAPS[platform]) {
    let page: FetchedPage
    try {
      page = await fetchPage(origin + path)
    } catch {
      continue
    }
    if (page.status === 404) { anyAnswered = true; continue }
    if (page.status !== 200) continue
    anyAnswered = true
    const locs = readLocs(page.body)
    if (locs.length > 0) return { count: locs.length, newestAt: newestLastmod(page.body) }
  }
  // Every path answered, and none of them held an article.
  return anyAnswered ? { count: 0, newestAt: null } : { count: null, newestAt: null }
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
