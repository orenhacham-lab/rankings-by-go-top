/**
 * Site health's read of the merchant's own site: a BOUNDED fetch through the
 * seeding scan's safe path, never anything wider.
 *
 *   - every request goes through the free check's fetchers (public addresses
 *     only, MAX_BYTES and MAX_REDIRECTS per request, their own timeout), wrapped
 *     in the seeding scan's hostPinnedFetch: only the project's own host, a
 *     deadline across hops and body, and robots.txt asked about every hop;
 *   - robots.txt is read first. Rules we cannot read forbid everything
 *     (RFC 9309), exactly as step b1 treats them: nothing else is read;
 *   - at most MAX_PAGES pages (the home page included), MAX_LINK_CHECKS links
 *     checked for a 404, and MAX_SITEMAP_TRIES sitemap addresses, CONCURRENCY at
 *     a time, each inside PAGE_MS and the whole scan inside SCAN_MS.
 *
 * No provider is called and nothing is stored: the result goes back to the
 * screen. Framework-free, with every network dependency injectable, so the
 * whole contract runs under test without a network.
 */
import {
  assertPublicHost, domainKey, extractSiteSignals, fetchSiteHtml, fetchSiteText, normalizeCheckUrl, readRobots,
  sitemapsFromRobots, type SiteSignals,
} from '@/lib/free-check'
import { crawlCandidate, pageBucket, pageKey, parseRobots, robotsAllows, robotsAnswer } from '@/lib/seed-scan/crawl'
import { hostPinnedFetch } from '@/lib/seed-scan/site-access'
import type { PageFacts, PageKind, SiteFacts } from './types'

export const MAX_PAGES = 25
export const MAX_LINK_CHECKS = 20
export const MAX_SITEMAP_TRIES = 3
export const CONCURRENCY = 4
export const PAGE_MS = 8_000
export const SCAN_MS = 40_000

export interface CandidatePage { url: string; kind: PageKind; adminUrl: string | null }

export interface ScanDeps {
  fetchHtml: typeof fetchSiteHtml
  fetchText: typeof fetchSiteText
  assertHost: (hostname: string) => Promise<{ ok: boolean; reason?: string }>
  fetchImpl: typeof fetch
  now: () => number
}

export const defaultScanDeps = (): ScanDeps => ({
  fetchHtml: fetchSiteHtml,
  fetchText: fetchSiteText,
  assertHost: assertPublicHost,
  fetchImpl: fetch,
  now: () => Date.now(),
})

export type ScanOutcome =
  | { ok: true; site: SiteFacts; pages: PageFacts[]; planned: number }
  | { ok: false; code: 'site_unreachable' | 'site_blocked' }

export type ScanProgress = (p: { stage: 'pages' | 'links' | 'site'; done: number; total: number }) => void

/** `<meta name="robots|googlebot" content="…noindex…">` in the page's head. */
export function hasNoindex(html: string): boolean {
  const head = html.slice(0, 200_000)
  const tags = head.match(/<meta\b[^>]*>/gi) ?? []
  return tags.some((t) => /\bname\s*=\s*["']?(?:robots|googlebot)["']?/i.test(t) && /\bcontent\s*=\s*["'][^"']*\bnoindex\b/i.test(t))
}

function kindFromUrl(url: URL): PageKind {
  if ((url.pathname.replace(/\/+$/, '') || '/') === '/') return 'home'
  const b = pageBucket(url)
  return b === 'product' ? 'product' : b === 'category' ? 'collection' : b === 'article' ? 'article' : 'page'
}

/** Run `work` over `items`, `limit` at a time, stopping new work once `stop()` says so. */
async function pool<T>(items: readonly T[], limit: number, stop: () => boolean, work: (item: T) => Promise<void>): Promise<void> {
  let next = 0
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length && !stop()) {
      const item = items[next++]
      await work(item)
    }
  })
  await Promise.all(runners)
}

export async function scanSite(
  input: { siteUrl: string; candidates: readonly CandidatePage[]; orphanPages?: SiteFacts['orphanPages'] },
  deps: ScanDeps = defaultScanDeps(),
  onProgress: ScanProgress = () => {},
): Promise<ScanOutcome> {
  const admitted = normalizeCheckUrl(input.siteUrl)
  if (!admitted.ok) return { ok: false, code: 'site_blocked' }
  const home = admitted.url
  const siteKey = domainKey(home)
  const host = await deps.assertHost(home.hostname)
  if (!host.ok) return { ok: false, code: host.reason === 'dns' ? 'site_unreachable' : 'site_blocked' }

  const startedAt = deps.now()
  const outOfTime = () => deps.now() - startedAt > SCAN_MS
  const scanClock = new AbortController()
  const scanTimer = setTimeout(() => scanClock.abort(), SCAN_MS)

  const pinned = (allow?: (u: URL) => boolean, body?: { complete: boolean }) => {
    const page = new AbortController()
    const timer = setTimeout(() => page.abort(), PAGE_MS)
    const fetchImpl = hostPinnedFetch({
      siteKey, base: deps.fetchImpl, deadline: AbortSignal.any([page.signal, scanClock.signal]),
      trace: [], offHost: { hit: false }, allow, body,
    })
    return { fetchImpl, done: () => clearTimeout(timer) }
  }

  try {
    // 1. robots.txt — nothing else is read before its rules are known.
    const robotsBody = { complete: false }
    const r = pinned(undefined, robotsBody)
    const robotsRead = await deps.fetchText(new URL('/robots.txt', home), { fetchImpl: r.fetchImpl }).catch(() => null)
    r.done()
    const answer = robotsAnswer(robotsRead && robotsRead.ok ? robotsRead : null, robotsBody.complete)
    const robotsTxt = answer.state === 'rules' ? answer.text : null
    const verdict = readRobots(robotsTxt)
    const rules = parseRobots(robotsTxt)
    const allow = (u: URL) => answer.state !== 'unreadable' && robotsAllows(rules, u)
    const site: SiteFacts = {
      siteUrl: home.toString(),
      homeReachable: false,
      robots: { blocksAll: verdict.blocksEveryone, blocksAi: verdict.blocksAiBots, blockedBots: verdict.blockedBots, readable: answer.state !== 'unreadable' },
      sitemapFound: null,
      brokenLinks: [],
      orphanPages: (input.orphanPages ?? []).slice(0, 10),
    }
    if (answer.state === 'unreadable' || !allow(home)) {
      // We may not read the site: say what robots.txt says, nothing more.
      site.homeReachable = true
      return { ok: true, site, pages: [], planned: 0 }
    }

    // 2. The pages: the home page first, then the site's own list, else its links.
    const pages: PageFacts[] = []
    const signalsOf = new Map<string, SiteSignals>()
    const readOne = async (c: CandidatePage): Promise<PageFacts> => {
      const p = pinned(allow)
      const got = await deps.fetchHtml(new URL(c.url), { fetchImpl: p.fetchImpl }).catch(() => null)
      p.done()
      if (!got || !got.ok) {
        return { url: c.url, kind: c.kind, ok: false, status: got && !got.ok ? got.status ?? null : null, title: null, description: null, h1: [], images: { total: 0, missingAlt: 0 }, noindex: false, viewport: true, links: [], adminUrl: c.adminUrl }
      }
      const s = extractSiteSignals(got.html, got.url, { robotsTxt: null, llmsTxt: false })
      signalsOf.set(pageKey(c.url), s)
      return {
        url: c.url, kind: c.kind, ok: true, status: got.status, title: s.title, description: s.metaDescription,
        h1: s.h1, images: s.images, noindex: hasNoindex(got.html), viewport: s.viewportMeta,
        links: s.internalLinkUrls, adminUrl: c.adminUrl,
      }
    }

    onProgress({ stage: 'pages', done: 0, total: 1 })
    const homePage = await readOne({ url: home.toString(), kind: 'home', adminUrl: null })
    pages.push(homePage)
    site.homeReachable = homePage.ok
    if (!homePage.ok) return { ok: true, site, pages, planned: 1 }

    const seen = new Set<string>([pageKey(home.toString()), pageKey(homePage.url)])
    const planned: CandidatePage[] = []
    const take = (c: CandidatePage) => {
      if (planned.length >= MAX_PAGES - 1) return
      const u = crawlCandidate(c.url, siteKey)
      if (!u || !allow(u)) return
      const key = pageKey(u.toString())
      if (seen.has(key)) return
      seen.add(key)
      planned.push({ ...c, url: u.toString() })
    }
    for (const c of input.candidates) take(c)
    if (planned.length === 0) {
      for (const link of homePage.links) {
        const u = crawlCandidate(link, siteKey)
        if (u) take({ url: u.toString(), kind: kindFromUrl(u), adminUrl: null })
      }
    }
    let done = 1
    const total = planned.length + 1
    onProgress({ stage: 'pages', done, total })
    await pool(planned, CONCURRENCY, outOfTime, async (c) => {
      pages.push(await readOne(c))
      done++
      onProgress({ stage: 'pages', done, total })
    })

    // 3. Links that lead nowhere: same-site links of the pages read, the most
    // linked first, that are not pages we already read.
    const linkedFrom = new Map<string, { url: string; from: string; count: number }>()
    for (const p of pages) {
      if (!p.ok) continue
      for (const raw of p.links) {
        const u = crawlCandidate(raw, siteKey)
        if (!u || !allow(u)) continue
        const key = pageKey(u.toString())
        if (seen.has(key)) continue
        const cur = linkedFrom.get(key)
        if (cur) cur.count++
        else linkedFrom.set(key, { url: u.toString(), from: p.url, count: 1 })
      }
    }
    const toCheck = [...linkedFrom.values()].sort((a, b) => b.count - a.count).slice(0, MAX_LINK_CHECKS)
    let checked = 0
    onProgress({ stage: 'links', done: 0, total: toCheck.length })
    await pool(toCheck, CONCURRENCY, outOfTime, async (l) => {
      const p = pinned(allow)
      const got = await deps.fetchHtml(new URL(l.url), { fetchImpl: p.fetchImpl }).catch(() => null)
      p.done()
      if (got && !got.ok && (got.status === 404 || got.status === 410)) site.brokenLinks.push({ url: l.url, from: l.from })
      checked++
      onProgress({ stage: 'links', done: checked, total: toCheck.length })
    })

    // 4. A sitemap: one robots.txt names counts (Google reads it from there);
    // otherwise the usual addresses, a few at most.
    onProgress({ stage: 'site', done: 0, total: 1 })
    if (sitemapsFromRobots(robotsTxt).length > 0) site.sitemapFound = true
    else if (!outOfTime()) {
      site.sitemapFound = false
      for (const path of ['/sitemap.xml', '/sitemap_index.xml', '/wp-sitemap.xml'].slice(0, MAX_SITEMAP_TRIES)) {
        const u = new URL(path, homePage.url)
        if (!allow(u)) continue
        const p = pinned(allow)
        const got = await deps.fetchText(u, { fetchImpl: p.fetchImpl }).catch(() => null)
        p.done()
        if (got && got.ok && got.status >= 200 && got.status < 300 && /<(?:urlset|sitemapindex)\b/i.test(got.text)) {
          site.sitemapFound = true
          break
        }
        if (outOfTime()) { site.sitemapFound = null; break }
      }
    }
    onProgress({ stage: 'site', done: 1, total: 1 })
    return { ok: true, site, pages, planned: total }
  } finally {
    clearTimeout(scanTimer)
  }
}
