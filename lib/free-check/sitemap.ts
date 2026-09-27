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

/** How many entries one document may yield. */
const MAX_ENTRIES = 5_000
/** Longest `<loc>` we will even look at. Real URLs are far shorter. */
const MAX_LOC_LENGTH = 2_048
/**
 * How far past a `<loc>` we look for the rest of its element. A `<lastmod>` sits
 * within a few dozen characters of its `<loc>` in every generator's output, and
 * the window is what keeps the pass linear: searching for a marker the document
 * never contains would otherwise scan to the end of the input once per entry.
 */
const MAX_ELEMENT_TAIL = 512

/**
 * `<loc>` values, with the `<lastmod>` that follows in the same element.
 *
 * This is a single linear pass on purpose. Matching whole `<url>…</url>`
 * elements with a lazy regex is quadratic on a document of UNCLOSED tags: each
 * start scans to the end of the input before failing, and a public visitor
 * chooses the document. Measured on the old expression: 400 KB took 1.4 s and a
 * 1.5 MB body — our fetch cap — blocked the event loop for 19.2 s, while a
 * well-formed 1.5 MB sitemap took 5 ms. indexOf cannot backtrack, so the cost
 * is now the same either way.
 *
 * A `<lastmod>` is read only between its `<loc>` and the end of that element,
 * so a value belonging to the next entry is never borrowed. The rarer document
 * that states `<lastmod>` BEFORE its `<loc>` loses it; lastmod only orders the
 * children of a sitemap index, so such a document falls back to file order.
 */
function parseLocs(xml: string): SitemapEntry[] {
  const out: SitemapEntry[] = []
  // Lowercased copy for the positions, original for the values.
  const hay = xml.toLowerCase()
  let i = 0
  while (out.length < MAX_ENTRIES) {
    const open = hay.indexOf('<loc>', i)
    if (open < 0) break
    const start = open + '<loc>'.length
    const close = hay.indexOf('</loc>', start)
    if (close < 0) break
    i = close + '</loc>'.length

    if (close - start > MAX_LOC_LENGTH) continue
    const url = xml.slice(start, close).replace(/<!\[CDATA\[|\]\]>/g, '').trim()
    if (!url) continue

    // Where this element ends: its own closing tag, or the next entry. Read
    // inside a fixed window, so a document missing one of these markers costs
    // the window rather than the rest of the input.
    const tail = hay.slice(i, Math.min(hay.length, i + MAX_ELEMENT_TAIL))
    let bound = tail.length
    for (const marker of ['</url>', '</sitemap>', '<loc>']) {
      const at = tail.indexOf(marker)
      if (at >= 0 && at < bound) bound = at
    }
    let lastmod: string | null = null
    const lmOpen = tail.indexOf('<lastmod>')
    if (lmOpen >= 0 && lmOpen < bound) {
      const lmStart = lmOpen + '<lastmod>'.length
      const lmClose = tail.indexOf('</lastmod>', lmStart)
      if (lmClose >= 0 && lmClose < bound) lastmod = xml.slice(i + lmStart, i + lmClose).trim().slice(0, 40)
    }
    out.push({ url, lastmod })
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

  /**
   * Read one sitemap document, but only from THIS site.
   *
   * The host check lives here rather than at the call sites because a sitemap
   * index names the documents we fetch next, and a site's own sitemap is
   * attacker-controllable content the moment the site is: without this, an
   * index could point every child at another host and we would fetch it. The
   * entries a document yields are pinned separately in `add`; this pins the
   * documents themselves.
   */
  const readSitemap = async (url: string): Promise<{ xml: string } | null> => {
    if (seen.has(url)) return null
    seen.add(url)
    const admitted = normalizeCheckUrl(url)
    if (!admitted.ok || admitted.url.hostname !== origin.hostname) return null
    const target = admitted.url
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
