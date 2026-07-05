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
import { getPosts, getPages, getCategories, getTags, WordPressClientError } from '@/lib/wordpress/client'
import {
  extractLinkAnchorsFromHtml,
  isInternalUrl,
  extractUrlHost,
  normalizeHref,
  normalizeUrlKey,
  internalTargetKey,
  slugFromUrl,
} from '@/lib/content/internal-links'

// ── MVP safety limits (capped, published-only, no parallel hammering) ──
const DEFAULT_PER_PAGE = 20
const DEFAULT_MAX_PAGES = 10 // per content type
const DEFAULT_MAX_ITEMS = 200 // combined posts + pages
const TOP_TARGETS = 100
const TOP_ANCHORS_PER_TARGET = 8
const MAX_EXAMPLE_SOURCES = 3
const MAX_SAMPLE_LINKS = 40

/**
 * Generic/boilerplate anchor phrases that are NOT useful for internal-link
 * planning (they carry no topical meaning). Normalized + lowercased for lookup.
 */
const BOILERPLATE_ANCHORS = new Set([
  // Hebrew
  'קרא עוד', 'קראו עוד', 'עמוד הבית', 'דף הבית', 'כאן', 'לחצו כאן', 'לחץ כאן', 'לחצו', 'לאתר',
  'האתר', 'לאתר שלנו', 'למידע נוסף', 'מידע נוסף', 'לפרטים', 'לפרטים נוספים', 'להמשך', 'להמשך קריאה',
  'עוד', 'ראו כאן', 'ראה כאן', 'המשך', 'המשך קריאה', 'צרו קשר', 'צור קשר', 'ראשי', 'לצפייה',
  // English
  'read more', 'here', 'click here', 'home', 'homepage', 'home page', 'learn more', 'more',
  'more info', 'for more information', 'contact', 'contact us', 'link', 'this page', 'website',
  'our website', 'visit', 'see more', 'continue reading',
])

/** Strip decorative arrows/ellipsis/separators so "קרא עוד »" → "קרא עוד". */
function normalizeAnchor(a: string): string {
  return (a || '')
    .replace(/[»«›‹→←▸►◄▶◀•·…]+/g, ' ')
    .replace(/[|/\\\-–—]+\s*$/g, '')
    .replace(/\s+/g, ' ')
    .trim()
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

/**
 * Classify whether an anchor is usable for internal-link PLANNING. Read-only —
 * the raw anchor is always preserved; this only labels quality so the report can
 * separate useful anchors from generic/boilerplate ones. Mirrors the planner's
 * strictness (natural 2–6 word phrases; no generic single words / URLs / domains).
 */
export function classifyAnchorForPlanning(anchor: string): { usable: boolean; reason?: string } {
  const norm = normalizeAnchor(anchor)
  if (!norm || norm.length < 2) return { usable: false, reason: 'too_short' }
  if (isDomainOrUrlLike(norm)) return { usable: false, reason: 'url_or_domain' }
  if (BOILERPLATE_ANCHORS.has(norm.toLowerCase())) return { usable: false, reason: 'generic_boilerplate' }
  const wc = anchorWordCount(norm)
  if (wc === 1) return { usable: false, reason: 'generic_single_word' } // incl. broad words like "יפן"
  if (wc > 8) return { usable: false, reason: 'too_long' }
  return { usable: true }
}

export interface RejectCounts {
  external: number
  mailto: number
  tel: number
  hash: number
  javascript: number
  empty: number
  other: number
}

export interface ScannedAnchor {
  text: string
  count: number
  usableForPlanning: boolean
  /** Present when usableForPlanning is false. */
  rejectedReason?: string
}

export interface ScannedTarget {
  targetUrl: string
  targetType: 'post' | 'page' | 'category' | 'tag' | 'product' | 'unknown'
  targetTitle: string
  inboundLinkCount: number
  usableAnchorsCount: number
  rejectedAnchorsCount: number
  /** True when the target has anchors but NONE are usable for planning. */
  onlyGenericAnchors: boolean
  /** Usable planning anchors (natural phrases), most-used first. */
  usableAnchors: ScannedAnchor[]
  /** Generic/boilerplate/URL anchors, kept for diagnostics, most-used first. */
  rejectedAnchors: ScannedAnchor[]
  exampleSources: { url: string; title: string }[]
  matchedGeneratedArticleId: string | null
  matchedGeneratedArticleTitle: string | null
}

export type SampleLinkClass = 'internal' | 'external' | 'mailto' | 'tel' | 'hash' | 'javascript' | 'empty' | 'other'

export interface SampleLink {
  sourceTitle: string
  sourceUrl: string
  targetUrl: string
  anchor: string
  /** How the link itself was classified (internal vs a rejection bucket). */
  linkClass: SampleLinkClass
  /** For internal links: whether the anchor is usable for planning. */
  anchorUsableForPlanning: boolean
  anchorRejectReason?: string
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
  internalLinksExtracted: number
  externalOrRejected: number
  rejectedReasons: RejectCounts
  uniqueTargets: number
  /** Targets that have at least one usable (non-generic) planning anchor. */
  targetsWithUsableAnchors: number
  /** Targets whose anchors are ALL generic/boilerplate/URL. */
  targetsGenericOnly: number
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
  generatedArticles?: { url: string; id: string; title: string }[]
}

const clean = (s: string) => s.trim()

/** Fetch published items of one type, paginating until short page / caps. */
async function fetchAll(
  fetcher: (opts: { page: number; perPage: number; modifiedAfter?: string }) => Promise<WordPressContentItem[]>,
  perPage: number,
  maxPages: number,
  remaining: number,
  modifiedAfter: string | undefined,
  onError: (msg: string) => void,
): Promise<{ items: WordPressContentItem[]; hitLimit: boolean }> {
  const items: WordPressContentItem[] = []
  let hitLimit = false
  for (let page = 1; page <= maxPages; page++) {
    if (items.length >= remaining) { hitLimit = true; break }
    let rows: WordPressContentItem[]
    try {
      rows = await fetcher({ page, perPage, modifiedAfter })
    } catch (e) {
      // A 400 on page>1 is WP's "no more pages" — treat as clean end. Anything
      // else is surfaced as an error note and stops this type's pagination.
      if (page > 1) break
      onError(e instanceof WordPressClientError ? e.message : 'content fetch failed')
      break
    }
    items.push(...rows)
    if (rows.length < perPage) break // short page → last page
    if (page === maxPages) hitLimit = true
  }
  return { items: items.slice(0, remaining), hitLimit: hitLimit || items.length > remaining }
}

/** Classify a raw href into internal or a rejection bucket. */
function classifyHref(href: string, hosts: string[]): 'internal' | keyof RejectCounts {
  const h = (href || '').trim().toLowerCase()
  if (!h) return 'empty'
  if (h.startsWith('mailto:')) return 'mailto'
  if (h.startsWith('tel:')) return 'tel'
  if (h.startsWith('javascript:')) return 'javascript'
  if (h.startsWith('#')) return 'hash'
  if (isInternalUrl(href, hosts)) return 'internal'
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

export async function scanWordPressSite(creds: WordPressCredentials, opts: ScanOptions = {}): Promise<SiteScanReport> {
  const startedAt = Date.now()
  const notes: string[] = []
  const errors: string[] = []
  const perPage = Math.min(Math.max(opts.perPage ?? DEFAULT_PER_PAGE, 1), 50)
  const maxPages = Math.min(Math.max(opts.maxPages ?? DEFAULT_MAX_PAGES, 1), 20)
  const maxItems = Math.min(Math.max(opts.maxItems ?? DEFAULT_MAX_ITEMS, 1), 500)
  const includePages = opts.includePages !== false

  // Standard REST never exposes Yoast/RankMath/AIOSEO focus keywords — say so.
  notes.push('SEO plugin focus keywords (Yoast/RankMath/AIOSEO) are NOT available via the standard WordPress REST API and were not used.')
  notes.push('Only PUBLISHED posts/pages were scanned; drafts/private/trash are excluded.')

  // 1) Fetch published posts, then pages (sequential — no parallel hammering).
  const posts = await fetchAll((o) => getPosts(creds, o), perPage, maxPages, maxItems, opts.modifiedAfter, (m) => errors.push(`posts: ${m}`))
  const remainingForPages = Math.max(0, maxItems - posts.items.length)
  const pagesRes = includePages && remainingForPages > 0
    ? await fetchAll((o) => getPages(creds, o), perPage, maxPages, remainingForPages, opts.modifiedAfter, (m) => errors.push(`pages: ${m}`))
    : { items: [] as WordPressContentItem[], hitLimit: false }

  const items = [...posts.items, ...pagesRes.items]
  const truncated = posts.hitLimit || pagesRes.hitLimit

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

  // Our own item URLs → type/title (for target classification).
  const ownByKey = new Map<string, { type: string; title: string }>()
  for (const it of items) {
    if (!it.link) continue
    ownByKey.set(internalTargetKey(it.link), { type: it.type, title: it.title })
  }
  // Generated-article URLs → {id,title} for matching.
  const genByKey = new Map<string, { id: string; title: string }>()
  for (const g of opts.generatedArticles ?? []) {
    if (g.url) genByKey.set(internalTargetKey(g.url), { id: g.id, title: g.title })
  }

  // 4) Extract + classify links; aggregate targets.
  const rejectedReasons: RejectCounts = { external: 0, mailto: 0, tel: 0, hash: 0, javascript: 0, empty: 0, other: 0 }
  let internalLinksExtracted = 0
  let externalOrRejected = 0
  const sampleLinks: SampleLink[] = []

  interface Agg { url: string; type: ScannedTarget['targetType']; title: string; anchors: Map<string, { text: string; count: number }>; sources: Map<string, string>; inbound: number }
  const targets = new Map<string, Agg>()

  for (const it of items) {
    for (const link of extractLinkAnchorsFromHtml(it.contentHtml)) {
      const kind = classifyHref(link.href, hosts)
      const anchor = clean(link.text)

      // Sample the first N links across ALL classes (internal + rejected) so QA
      // can see external/protocol-relative rejects too.
      if (sampleLinks.length < MAX_SAMPLE_LINKS) {
        const ac = kind === 'internal' ? classifyAnchorForPlanning(anchor) : { usable: false, reason: undefined as string | undefined }
        sampleLinks.push({
          sourceTitle: it.title,
          sourceUrl: it.link,
          targetUrl: normalizeHref(link.href),
          anchor,
          linkClass: kind,
          anchorUsableForPlanning: kind === 'internal' ? ac.usable : false,
          anchorRejectReason: kind === 'internal' ? ac.reason : undefined,
          context: kind === 'internal' ? contextAround(it.contentHtml, anchor) : '',
        })
      }

      if (kind !== 'internal') {
        externalOrRejected++
        rejectedReasons[kind]++
        continue
      }
      internalLinksExtracted++
      const key = internalTargetKey(link.href)
      if (!key) { rejectedReasons.other++; continue }
      const own = ownByKey.get(key)
      const agg = targets.get(key) ?? {
        url: normalizeHref(link.href),
        type: guessType(key, link.href, own?.type),
        title: own?.title || slugFromUrl(link.href),
        anchors: new Map<string, { text: string; count: number }>(),
        sources: new Map<string, string>(),
        inbound: 0,
      }
      agg.inbound++
      if (anchor) {
        const ak = anchor.toLowerCase()
        const prev = agg.anchors.get(ak)
        if (prev) prev.count++
        else agg.anchors.set(ak, { text: anchor, count: 1 })
      }
      if (it.link && !agg.sources.has(it.link)) agg.sources.set(it.link, it.title)
      targets.set(key, agg)
    }
  }

  // 5) Shape the target list: classify every anchor, split usable vs rejected.
  const targetList: ScannedTarget[] = Array.from(targets.entries())
    .map(([key, agg]) => {
      const gen = genByKey.get(key)
      const classified: ScannedAnchor[] = Array.from(agg.anchors.values())
        .map(({ text, count }) => {
          const c = classifyAnchorForPlanning(text)
          return { text, count, usableForPlanning: c.usable, rejectedReason: c.reason }
        })
        .sort((a, b) => b.count - a.count)
      const usableAnchors = classified.filter((a) => a.usableForPlanning).slice(0, TOP_ANCHORS_PER_TARGET)
      const rejectedAnchors = classified.filter((a) => !a.usableForPlanning).slice(0, TOP_ANCHORS_PER_TARGET)
      const usableAnchorsCount = classified.filter((a) => a.usableForPlanning).length
      const rejectedAnchorsCount = classified.length - usableAnchorsCount
      const exampleSources = Array.from(agg.sources.entries()).slice(0, MAX_EXAMPLE_SOURCES).map(([url, title]) => ({ url, title }))
      return {
        targetUrl: agg.url,
        targetType: agg.type,
        targetTitle: agg.title,
        inboundLinkCount: agg.inbound,
        usableAnchorsCount,
        rejectedAnchorsCount,
        onlyGenericAnchors: classified.length > 0 && usableAnchorsCount === 0,
        usableAnchors,
        rejectedAnchors,
        exampleSources,
        matchedGeneratedArticleId: gen?.id ?? null,
        matchedGeneratedArticleTitle: gen?.title ?? null,
      }
    })
    .sort((a, b) => b.inboundLinkCount - a.inboundLinkCount)

  return {
    siteUrl: creds.siteUrl,
    hosts,
    postsFetched: posts.items.length,
    pagesFetched: pagesRes.items.length,
    itemsScanned: items.length,
    postsPagesRequested: maxItems,
    truncated,
    internalLinksExtracted,
    externalOrRejected,
    rejectedReasons,
    uniqueTargets: targetList.length,
    targetsWithUsableAnchors: targetList.filter((t) => t.usableAnchorsCount > 0).length,
    targetsGenericOnly: targetList.filter((t) => t.onlyGenericAnchors).length,
    targets: targetList.slice(0, TOP_TARGETS),
    sampleLinks,
    notes,
    errors,
    timingMs: Date.now() - startedAt,
  }
}
