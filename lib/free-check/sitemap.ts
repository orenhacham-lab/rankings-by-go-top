/**
 * Sitemap discovery for a site we have just admitted.
 *
 * A seeding scan needs a starting set of real URLs, and the sitemap is the one
 * place a site publishes that list itself. Discovery follows the same order a
 * crawler does — the `Sitemap:` lines in robots.txt first, then /sitemap.xml —
 * and understands a sitemap INDEX, because on WordPress and Shopify the root
 * sitemap is almost always an index and stopping there yields nothing usable.
 *
 * Every fetch goes through site-fetch.ts, so the admission, redirect, size and
 * timeout rules of the free check apply here unchanged: this module adds
 * parsing, never a new way to reach the network. Depth is fixed at one level of
 * index expansion, and `limit` caps the result, so a site with a million URLs
 * costs the same as a small one.
 */
import { fetchSiteText } from './site-fetch'
import { normalizeCheckUrl } from './url-guard'

export type SitemapEntry = {
  url: string
  /** `<lastmod>` as published, when the sitemap states one. */
  lastmod: string | null
}

export type SitemapDiscovery = {
  /** The sitemap documents that were read, in the order they were found. */
  sitemaps: string[]
  entries: SitemapEntry[]
  /** True when `limit` cut the list short. */
  truncated: boolean
}

/** How many child sitemaps of an index are expanded. Wide enough, bounded. */
const MAX_INDEX_CHILDREN = 5
const DEFAULT_LIMIT = 200

type Deps = { fetchText?: typeof fetchSiteText }

/** `<loc>` values, with the `<lastmod>` that follows in the same element. */
function parseLocs(xml: string): SitemapEntry[] {
  const out: SitemapEntry[] = []
  const blocks = xml.match(/<(?:url|sitemap)\b[\s\S]*?<\/(?:url|sitemap)>/gi)
  const scan = blocks && blocks.length ? blocks : [xml]
  for (const block of scan) {
    const loc = block.match(/<loc>\s*([\s\S]*?)\s*<\/loc>/i)
    if (!loc) continue
    const lastmod = block.match(/<lastmod>\s*([\s\S]*?)\s*<\/lastmod>/i)
    out.push({
      url: loc[1].replace(/<!\[CDATA\[|\]\]>/g, '').trim(),
      lastmod: lastmod ? lastmod[1].trim().slice(0, 40) : null,
    })
    if (out.length >= 5_000) break
  }
  return out
}

function isIndex(xml: string): boolean {
  return /<sitemapindex\b/i.test(xml)
}

/** `Sitemap:` lines in robots.txt, in file order. */
export function sitemapsFromRobots(robotsTxt: string | null): string[] {
  if (!robotsTxt) return []
  const out: string[] = []
  for (const line of robotsTxt.split(/\r?\n/)) {
    const m = line.replace(/#.*$/, '').match(/^\s*sitemap\s*:\s*(\S+)\s*$/i)
    if (m) out.push(m[1])
    if (out.length >= 10) break
  }
  return out
}

/**
 * Find a site's sitemap URLs. Returns an empty discovery rather than throwing
 * when a site publishes none — most small sites do not, and that is not an
 * error condition for the caller.
 */
export async function discoverSitemapUrls(
  origin: URL,
  options: { limit?: number; robotsTxt?: string | null } = {},
  deps: Deps = {},
): Promise<SitemapDiscovery> {
  const fetchText = deps.fetchText ?? fetchSiteText
  const limit = Math.max(1, options.limit ?? DEFAULT_LIMIT)

  let robotsTxt = options.robotsTxt ?? null
  if (robotsTxt === null && options.robotsTxt === undefined) {
    const robots = await fetchText(new URL('/robots.txt', origin))
    robotsTxt = robots.ok && robots.status === 200 ? robots.text : null
  }

  // robots.txt first: a site that declares its sitemap there means that one.
  const candidates: string[] = []
  for (const raw of sitemapsFromRobots(robotsTxt)) {
    const admitted = normalizeCheckUrl(raw)
    // Only same-host sitemaps: a robots.txt pointing at another domain is
    // either a mistake or an attempt to have us fetch something else.
    if (admitted.ok && admitted.url.hostname === origin.hostname) candidates.push(admitted.url.toString())
  }
  const fallback = new URL('/sitemap.xml', origin).toString()
  if (!candidates.includes(fallback)) candidates.push(fallback)

  const sitemaps: string[] = []
  const entries: SitemapEntry[] = []
  const seen = new Set<string>()
  let truncated = false

  const readSitemap = async (url: string): Promise<{ xml: string } | null> => {
    if (seen.has(url)) return null
    seen.add(url)
    let target: URL
    try {
      target = new URL(url)
    } catch {
      return null
    }
    const res = await fetchText(target)
    if (!res.ok || res.status !== 200 || !/<(?:urlset|sitemapindex)\b/i.test(res.text)) return null
    sitemaps.push(url)
    return { xml: res.text }
  }

  const add = (list: SitemapEntry[]) => {
    for (const e of list) {
      if (entries.length >= limit) { truncated = true; return }
      if (!e.url) continue
      const admitted = normalizeCheckUrl(e.url)
      if (!admitted.ok || admitted.url.hostname !== origin.hostname) continue
      if (entries.some((x) => x.url === admitted.url.toString())) continue
      entries.push({ url: admitted.url.toString(), lastmod: e.lastmod })
    }
  }

  for (const candidate of candidates) {
    if (entries.length >= limit) break
    const doc = await readSitemap(candidate)
    if (!doc) continue
    const locs = parseLocs(doc.xml)
    if (!isIndex(doc.xml)) {
      add(locs)
      continue
    }
    // An index: expand its first children, newest lastmod first when stated,
    // because that is where a site's live pages are.
    const children = [...locs]
      .sort((a, b) => (b.lastmod ?? '').localeCompare(a.lastmod ?? ''))
      .slice(0, MAX_INDEX_CHILDREN)
    if (locs.length > MAX_INDEX_CHILDREN) truncated = true
    for (const child of children) {
      if (entries.length >= limit) { truncated = true; break }
      const childDoc = await readSitemap(child.url)
      if (childDoc) add(parseLocs(childDoc.xml))
    }
  }

  return { sitemaps, entries, truncated }
}
