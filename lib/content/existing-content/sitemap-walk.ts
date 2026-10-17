/**
 * The full-site mapping's first and main source: the site's own sitemaps.
 *
 * A site publishes the list of its pages in its sitemaps, filed by type
 * (product-sitemap.xml, sitemap_products_1.xml, wp-sitemap-posts-post-1.xml…).
 * Reading them is how a 900-product store is counted without reading 900 pages:
 * this walker never requests a page, only robots.txt and sitemap documents.
 *
 * THE RULES IT KEEPS (each is a guard in __qa__/site-map.qa.ts):
 *   - robots.txt first. An unreadable robots.txt (5xx, 429, cut short) means
 *     the rules are unknown, and nothing else is read (RFC 9309 2.3.1, the
 *     same stand as the seeding crawl, lib/seed-scan/crawl.ts). A sitemap
 *     document robots.txt disallows is not requested, and a listed URL it
 *     disallows is not counted.
 *   - only this site. Every document and every listed URL must be on the
 *     project's own host (www and the bare domain are one site); an index that
 *     points elsewhere is not followed.
 *   - bounded: at most MAX_DOCS documents, MAX_DEPTH levels of index nesting,
 *     MAX_URLS pages, CONCURRENCY requests at a time, and a wall-clock budget.
 *     Hitting a cap is reported (capped / timedOut), never hidden: the screen
 *     then says "at least N".
 *   - sitemaps of things that are not content (authors, tags) are not read.
 *
 * The network is injected (deps), so the walk is tested without one; the live
 * dependencies (lib/content/existing-content/site-map-run.ts) go through the
 * free check's admitted, size- and time-capped fetchers, pinned to the host.
 */
import { domainKey, sitemapsFromRobots } from '@/lib/free-check'
import { parseRobots, robotsAllows, robotsAnswer, type RobotsGroup } from '@/lib/seed-scan/crawl'
import { isContentUrl, sitemapKindHint } from './classify'
import { pageKey, type SiteMapEntry } from './model'

export const MAP_LIMITS = {
  MAX_URLS: 10_000,
  MAX_DOCS: 60,
  MAX_DEPTH: 3,
  CONCURRENCY: 3,
  BUDGET_MS: 60_000,
} as const
export type MapLimits = { [K in keyof typeof MAP_LIMITS]: number }

/** Longest <loc> looked at, and how far past it a <lastmod> is looked for (keeps the pass linear). */
const MAX_LOC_LENGTH = 2_048
const MAX_ELEMENT_TAIL = 512
const MAX_LOCS_PER_DOC = 50_000
const FALLBACK_SITEMAPS = ['/sitemap.xml', '/sitemap_index.xml', '/wp-sitemap.xml']

export interface ParsedSitemap { index: boolean; locs: { url: string; lastmod: string | null }[] }

/**
 * <loc> values with the <lastmod> of the same element. One linear pass with
 * indexOf (never a lazy regex over the document, which is quadratic on unclosed
 * tags and the document is someone else's). A document cut at the fetch cap
 * yields its complete entries.
 */
export function parseSitemapXml(xml: string): ParsedSitemap {
  const hay = xml.toLowerCase()
  const index = hay.includes('<sitemapindex')
  const locs: ParsedSitemap['locs'] = []
  let i = 0
  while (locs.length < MAX_LOCS_PER_DOC) {
    const open = hay.indexOf('<loc>', i)
    if (open < 0) break
    const start = open + 5
    const close = hay.indexOf('</loc>', start)
    if (close < 0) break
    i = close + 6
    if (close - start > MAX_LOC_LENGTH) continue
    const url = xml.slice(start, close).replace(/<!\[CDATA\[|\]\]>/g, '').replace(/&amp;/g, '&').trim()
    if (!url) continue
    const tail = hay.slice(i, Math.min(hay.length, i + MAX_ELEMENT_TAIL))
    let bound = tail.length
    for (const marker of ['</url>', '</sitemap>', '<loc>']) {
      const at = tail.indexOf(marker)
      if (at >= 0 && at < bound) bound = at
    }
    let lastmod: string | null = null
    const lm = tail.indexOf('<lastmod>')
    if (lm >= 0 && lm < bound) {
      const lmEnd = tail.indexOf('</lastmod>', lm)
      if (lmEnd >= 0 && lmEnd < bound) {
        const raw = xml.slice(i + lm + 9, i + lmEnd).trim().slice(0, 40)
        lastmod = Number.isFinite(Date.parse(raw)) ? raw : null
      }
    }
    locs.push({ url, lastmod })
  }
  return { index, locs }
}

export type DocFetch = (url: URL, allow: (u: URL) => boolean) => Promise<{ ok: true; text: string } | { ok: false }>
export type RobotsFetch = (url: URL) => Promise<{ read: { status: number; text: string } | null; complete: boolean }>

export interface WalkDeps {
  fetchDoc: DocFetch
  fetchRobots: RobotsFetch
  now: () => number
  onProgress?: (p: { docsRead: number; docsSeen: number; found: number }) => void | Promise<void>
}

export interface WalkResult {
  robots: 'rules' | 'absent' | 'unreadable'
  entries: SiteMapEntry[]
  docsRead: number
  docsSeen: number
  docsFailed: number
  /** Stopped at MAX_URLS or MAX_DOCS: the site has more than was kept. */
  capped: boolean
  timedOut: boolean
  /** Listed URLs robots.txt disallows (not counted). */
  disallowed: number
}

const toUrl = (raw: string, base?: URL): URL | null => {
  try { return new URL(raw, base) } catch { return null }
}

export async function walkSitemaps(origin: URL, deps: WalkDeps, limits: MapLimits = MAP_LIMITS): Promise<WalkResult> {
  const startedAt = deps.now()
  const outOfTime = () => deps.now() - startedAt >= limits.BUDGET_MS
  const siteKey = domainKey(origin)
  const sameSite = (u: URL) => (u.protocol === 'https:' || u.protocol === 'http:') && domainKey(u) === siteKey && !u.username && !u.password

  const r = await deps.fetchRobots(new URL('/robots.txt', origin))
  const answer = robotsAnswer(r.read, r.complete)
  const result: WalkResult = { robots: answer.state, entries: [], docsRead: 0, docsSeen: 0, docsFailed: 0, capped: false, timedOut: false, disallowed: 0 }
  if (answer.state === 'unreadable') return result
  const robotsText = answer.state === 'rules' ? answer.text : null
  const rules: RobotsGroup[] = parseRobots(robotsText)
  const allow = (u: URL) => robotsAllows(rules, u)

  const seenDocs = new Set<string>()
  const seenPages = new Set<string>()
  const queue: { url: URL; depth: number }[] = []
  const enqueue = (url: URL | null, depth: number) => {
    if (!url || !sameSite(url) || depth > limits.MAX_DEPTH) return
    const key = url.toString()
    if (seenDocs.has(key)) return
    if (sitemapKindHint(key) === 'exclude') return
    if (result.docsSeen >= limits.MAX_DOCS) { result.capped = true; return }
    seenDocs.add(key)
    result.docsSeen++
    queue.push({ url, depth })
  }

  const readOne = async (job: { url: URL; depth: number }) => {
    if (!allow(job.url)) { result.docsFailed++; return }
    const got = await deps.fetchDoc(job.url, allow)
    if (!got.ok || !/<(?:urlset|sitemapindex)\b/i.test(got.text)) { result.docsFailed++; return }
    result.docsRead++
    const parsed = parseSitemapXml(got.text)
    if (parsed.index) {
      // Newest children first: that is where a site's live pages are.
      const children = [...parsed.locs].sort((a, b) => (b.lastmod ?? '').localeCompare(a.lastmod ?? ''))
      for (const c of children) enqueue(toUrl(c.url, job.url), job.depth + 1)
      return
    }
    const hint = sitemapKindHint(job.url.toString())
    for (const loc of parsed.locs) {
      if (result.entries.length >= limits.MAX_URLS) { result.capped = true; return }
      const u = toUrl(loc.url, job.url)
      if (!u || !sameSite(u) || !isContentUrl(u.toString())) continue
      const key = pageKey(u.toString())
      if (!key || seenPages.has(key)) continue
      seenPages.add(key)
      if (!allow(u)) { result.disallowed++; continue }
      result.entries.push({ u: u.toString(), k: hint === 'exclude' ? null : hint, m: loc.lastmod })
    }
  }

  const drain = async () => {
    const worker = async () => {
      for (;;) {
        if (result.entries.length >= limits.MAX_URLS) { result.capped = true; return }
        if (outOfTime()) { if (queue.length) result.timedOut = true; return }
        const job = queue.shift()
        if (!job) return
        await readOne(job)
        await deps.onProgress?.({ docsRead: result.docsRead, docsSeen: result.docsSeen, found: result.entries.length })
      }
    }
    // Workers stop when the queue is momentarily empty, so an index that adds
    // children later is drained by the next round.
    while (queue.length && !outOfTime() && result.entries.length < limits.MAX_URLS) {
      await Promise.all(Array.from({ length: Math.max(1, limits.CONCURRENCY) }, worker))
    }
    if (queue.length && outOfTime()) result.timedOut = true
  }

  for (const raw of sitemapsFromRobots(robotsText)) enqueue(toUrl(raw, origin), 0)
  await drain()
  // No sitemap declared, or none of the declared ones answered: the usual addresses, one at a time.
  for (const path of FALLBACK_SITEMAPS) {
    if (result.docsRead > 0 || outOfTime()) break
    enqueue(new URL(path, origin), 0)
    await drain()
  }
  return result
}
