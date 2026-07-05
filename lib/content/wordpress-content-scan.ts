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
import { tokens } from '@/lib/content/recommendations/dedupe'

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

export type PlanningUsability = 'yes' | 'no' | 'caution'

/** True when the URL is the site homepage (no path after the host). */
function isHomepageUrl(url: string): boolean {
  const key = normalizeUrlKey(url)
  return !!key && !key.includes('/')
}

/** A single word is an "entity" for a target if it appears in the title/slug. */
function entityMatchesTarget(word: string, targetTitle: string, targetUrl: string): boolean {
  const w = word.trim().toLowerCase()
  if (!w) return false
  const bag = new Set<string>([...tokens(targetTitle), ...tokens(slugFromUrl(targetUrl))])
  return bag.has(w)
}

export interface AnchorContext {
  targetTitle: string
  targetUrl: string
  isHomepage: boolean
}

/**
 * Classify anchor usability for PLANNING (read-only; raw anchor always kept).
 * Three states so single-word ENTITY anchors ("טוקיו" → /tokyo/) are usable,
 * broad homepage entities ("יפן" → /) are caution, and boilerplate/URLs are no.
 */
export function classifyAnchorForPlanning(anchor: string, ctx: AnchorContext): { usability: PlanningUsability; reason: string } {
  const norm = normalizeAnchor(anchor)
  if (!norm || norm.length < 2) return { usability: 'no', reason: 'too_short' }
  if (isDomainOrUrlLike(norm)) return { usability: 'no', reason: 'url_or_domain' }
  if (BOILERPLATE_ANCHORS.has(norm.toLowerCase())) return { usability: 'no', reason: 'generic_boilerplate' }
  const wc = anchorWordCount(norm)
  if (wc === 1) {
    // Broad homepage entity (e.g. "יפן" → homepage): preserve but flag caution.
    if (ctx.isHomepage) return { usability: 'caution', reason: 'broad_homepage_entity_anchor' }
    // Named entity/location matching the target (e.g. "טוקיו" → /tokyo/): usable.
    if (entityMatchesTarget(norm, ctx.targetTitle, ctx.targetUrl)) return { usability: 'yes', reason: 'entity_single_word_matches_target' }
    return { usability: 'no', reason: 'generic_single_word' }
  }
  if (wc > 8) return { usability: 'no', reason: 'too_long' }
  return { usability: 'yes', reason: 'natural_phrase' }
}

export type TargetEligibility = 'yes' | 'no' | 'caution'

// Utility/legal/contact pages that should NOT be internal-link planning targets.
const UTILITY_EN = [/privacy/i, /\bcontact\b/i, /accessibility/i, /\bterms\b/i, /\blegal\b/i, /cookie/i, /sitemap/i, /disclaimer/i, /\brefund\b/i, /\breturns?\b/i, /shipping/i]
const UTILITY_HE = ['מדיניות פרטיות', 'פרטיות', 'יצירת קשר', 'צור קשר', 'צרו קשר', 'נגישות', 'הצהרת נגישות', 'תקנון', 'תנאי שימוש', 'מפת אתר', 'החזרות', 'מדיניות משלוח', 'מדיניות ביטול']

/**
 * Classify whether a TARGET is eligible for internal-link planning. Homepage is
 * caution (main topic page — valid but not a normal content page); privacy/
 * contact/legal/utility are ineligible even if their anchor phrase is valid.
 */
export function classifyTargetEligibility(url: string, title: string, type: ScannedTarget['targetType']): { eligibility: TargetEligibility; reason: string } {
  if (isHomepageUrl(url)) return { eligibility: 'caution', reason: 'homepage_main_topic_page' }
  const hay = `${slugFromUrl(url)} ${title} ${url}`.toLowerCase()
  if (UTILITY_EN.some((re) => re.test(hay)) || UTILITY_HE.some((w) => hay.includes(w))) {
    return { eligibility: 'no', reason: 'utility_or_legal_page' }
  }
  if (type === 'post' || type === 'page' || type === 'category' || type === 'tag' || type === 'product') {
    return { eligibility: 'yes', reason: `content_${type}` }
  }
  return { eligibility: 'caution', reason: 'unknown_target_type' }
}

/** First H2/H3 text of a post body (a heading-derived keyword candidate). */
function firstHeadingText(html: string): string {
  const m = (html || '').match(/<h[23][^>]*>([\s\S]*?)<\/h[23]>/i)
  if (!m) return ''
  return (m[1] ?? '').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim()
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
  /** yes = usable · caution = broad/homepage entity · no = boilerplate/generic. */
  usability: PlanningUsability
  reason: string
}

export type TargetKeywordSource =
  | 'yoast_focus_keyword'
  | 'rankmath_focus_keyword'
  | 'aioseo_focus_keyword'
  | 'generated_article_primary_keyword'
  | 'title'
  | 'slug'
  | 'heading'
  | 'inferred'
  | 'unavailable'

export interface ScannedTarget {
  targetUrl: string
  targetType: 'post' | 'page' | 'category' | 'tag' | 'product' | 'unknown'
  targetTitle: string
  inboundLinkCount: number
  /** Whether this target is a good internal-link PLANNING destination. */
  eligibility: TargetEligibility
  eligibilityReason: string
  /** Best available keyword signal + where it came from + real-vs-inferred. */
  keywordSource: TargetKeywordSource
  primaryKeywordCandidate: string
  keywordAvailable: boolean
  usableAnchorsCount: number
  cautionAnchorsCount: number
  rejectedAnchorsCount: number
  /** True when the target has anchors but NONE are usable/caution. */
  onlyGenericAnchors: boolean
  usableAnchors: ScannedAnchor[]
  cautionAnchors: ScannedAnchor[]
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
  /** For internal links: anchor usability (yes/no/caution) + reason. */
  anchorUsability: PlanningUsability | 'n/a'
  anchorReason: string
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
  /** Targets eligible / caution / ineligible for planning. */
  targetsEligible: number
  targetsEligibilityCaution: number
  targetsIneligible: number
  /** How many scanned items exposed an SEO-plugin focus keyword via REST. */
  seoFocusKeywordsFound: number
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
  generatedArticles?: { url: string; id: string; title: string; primaryKeyword?: string | null }[]
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

  notes.push('Only PUBLISHED posts/pages were scanned; drafts/private/trash are excluded.')

  // 1) Fetch published posts, then pages (sequential — no parallel hammering).
  const posts = await fetchAll((o) => getPosts(creds, o), perPage, maxPages, maxItems, opts.modifiedAfter, (m) => errors.push(`posts: ${m}`))
  const remainingForPages = Math.max(0, maxItems - posts.items.length)
  const pagesRes = includePages && remainingForPages > 0
    ? await fetchAll((o) => getPages(creds, o), perPage, maxPages, remainingForPages, opts.modifiedAfter, (m) => errors.push(`pages: ${m}`))
    : { items: [] as WordPressContentItem[], hitLimit: false }

  const items = [...posts.items, ...pagesRes.items]
  const truncated = posts.hitLimit || pagesRes.hitLimit

  // SEO focus-keyword availability: we opportunistically checked the exposed
  // post `meta` for Yoast/RankMath/AIOSEO focus keywords. Report what we found.
  const seoFocusKeywordsFound = items.filter((it) => (it.seoFocusKeyword || '').trim()).length
  notes.push(
    seoFocusKeywordsFound > 0
      ? `SEO plugin focus keywords were found via REST for ${seoFocusKeywordsFound} item(s) and used as the highest-priority keyword signal where present.`
      : 'The scanner checked the exposed post meta for Yoast/RankMath/AIOSEO focus keywords and found none available via the standard WordPress REST API (this is normal — they are usually protected meta). No custom plugin was required or used.',
  )

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

  // Our own fetched item URLs → context used for target typing + keyword source.
  interface OwnItem { type: string; title: string; slug: string; headingKw: string; seoFocusKeyword: string; seoKeywordSource: string | null }
  const ownByKey = new Map<string, OwnItem>()
  for (const it of items) {
    if (!it.link) continue
    ownByKey.set(internalTargetKey(it.link), {
      type: it.type,
      title: it.title,
      slug: it.slug,
      headingKw: firstHeadingText(it.contentHtml),
      seoFocusKeyword: (it.seoFocusKeyword || '').trim(),
      seoKeywordSource: it.seoKeywordSource,
    })
  }
  // Generated-article URLs → {id,title,primaryKeyword} for matching.
  const genByKey = new Map<string, { id: string; title: string; primaryKeyword: string }>()
  for (const g of opts.generatedArticles ?? []) {
    if (g.url) genByKey.set(internalTargetKey(g.url), { id: g.id, title: g.title, primaryKeyword: (g.primaryKeyword || '').trim() })
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
        let anchorUsability: PlanningUsability | 'n/a' = 'n/a'
        let anchorReason = ''
        if (kind === 'internal') {
          const skey = internalTargetKey(link.href)
          const own = ownByKey.get(skey)
          const ctx: AnchorContext = { targetTitle: own?.title || slugFromUrl(link.href), targetUrl: normalizeHref(link.href), isHomepage: isHomepageUrl(link.href) }
          const ac = classifyAnchorForPlanning(anchor, ctx)
          anchorUsability = ac.usability
          anchorReason = ac.reason
        }
        sampleLinks.push({
          sourceTitle: it.title,
          sourceUrl: it.link,
          targetUrl: normalizeHref(link.href),
          anchor,
          linkClass: kind,
          anchorUsability,
          anchorReason,
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

  // 5) Shape the target list: eligibility, keyword source, anchor tri-state.
  const targetList: ScannedTarget[] = Array.from(targets.entries())
    .map(([key, agg]) => {
      const own = ownByKey.get(key)
      const gen = genByKey.get(key)
      const ctx: AnchorContext = { targetTitle: agg.title, targetUrl: agg.url, isHomepage: isHomepageUrl(agg.url) }

      // Anchor tri-state classification (context-aware entity handling).
      const classified: ScannedAnchor[] = Array.from(agg.anchors.values())
        .map(({ text, count }) => {
          const c = classifyAnchorForPlanning(text, ctx)
          return { text, count, usability: c.usability, reason: c.reason }
        })
        .sort((a, b) => b.count - a.count)
      const usableAnchors = classified.filter((a) => a.usability === 'yes').slice(0, TOP_ANCHORS_PER_TARGET)
      const cautionAnchors = classified.filter((a) => a.usability === 'caution').slice(0, TOP_ANCHORS_PER_TARGET)
      const rejectedAnchors = classified.filter((a) => a.usability === 'no').slice(0, TOP_ANCHORS_PER_TARGET)
      const usableAnchorsCount = classified.filter((a) => a.usability === 'yes').length
      const cautionAnchorsCount = classified.filter((a) => a.usability === 'caution').length
      const rejectedAnchorsCount = classified.filter((a) => a.usability === 'no').length

      // Target eligibility (homepage = caution; privacy/contact/legal = no).
      const elig = classifyTargetEligibility(agg.url, agg.title, agg.type)

      // Keyword source priority: SEO focus kw → our primary_keyword → title →
      // slug → heading → inferred → unavailable. Only the first two are "available".
      let keywordSource: TargetKeywordSource = 'unavailable'
      let primaryKeywordCandidate = ''
      let keywordAvailable = false
      const slugKw = slugFromUrl(agg.url)
      if (own?.seoFocusKeyword) {
        keywordSource = (own.seoKeywordSource as TargetKeywordSource) || 'yoast_focus_keyword'
        primaryKeywordCandidate = own.seoFocusKeyword
        keywordAvailable = true
      } else if (gen?.primaryKeyword) {
        keywordSource = 'generated_article_primary_keyword'
        primaryKeywordCandidate = gen.primaryKeyword
        keywordAvailable = true
      } else if (own?.title) {
        keywordSource = 'title'; primaryKeywordCandidate = own.title
      } else if (slugKw) {
        keywordSource = 'slug'; primaryKeywordCandidate = slugKw
      } else if (own?.headingKw) {
        keywordSource = 'heading'; primaryKeywordCandidate = own.headingKw
      }

      const exampleSources = Array.from(agg.sources.entries()).slice(0, MAX_EXAMPLE_SOURCES).map(([url, title]) => ({ url, title }))
      return {
        targetUrl: agg.url,
        targetType: agg.type,
        targetTitle: agg.title,
        inboundLinkCount: agg.inbound,
        eligibility: elig.eligibility,
        eligibilityReason: elig.reason,
        keywordSource,
        primaryKeywordCandidate,
        keywordAvailable,
        usableAnchorsCount,
        cautionAnchorsCount,
        rejectedAnchorsCount,
        onlyGenericAnchors: classified.length > 0 && usableAnchorsCount === 0 && cautionAnchorsCount === 0,
        usableAnchors,
        cautionAnchors,
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
    targetsEligible: targetList.filter((t) => t.eligibility === 'yes').length,
    targetsEligibilityCaution: targetList.filter((t) => t.eligibility === 'caution').length,
    targetsIneligible: targetList.filter((t) => t.eligibility === 'no').length,
    seoFocusKeywordsFound,
    targets: targetList.slice(0, TOP_TARGETS),
    sampleLinks,
    notes,
    errors,
    timingMs: Date.now() - startedAt,
  }
}
