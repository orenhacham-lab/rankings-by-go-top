/**
 * The "existing content" screen's model: every page already on the merchant's
 * site, sorted into the screen's four tabs (pages, products, articles,
 * categories), with Search Console's figures. PURE (no network, no database),
 * so every rule the screen states about a page is unit-testable
 * (lib/content/existing-content/__qa__/existing-content.qa.ts and
 * site-map.qa.ts).
 *
 * SOURCES. Everything the app already holds about the site is MERGED into one
 * index, one item per page (matched by path, so www, a trailing slash or the
 * store's myshopify host do not make a second page):
 *   map        site_page_map: the full-site mapping (the sitemaps, then the
 *              WordPress REST lists), lib/content/existing-content/site-map-run.ts;
 *   shopify    shopify_entities: the store's own products, collections, pages,
 *              blogs and articles as the last sync saw them;
 *   wordpress  wordpress_content_index: the WordPress site scan;
 *   crawl      site_crawl_index: the seeding scan's crawl of at most 25 key pages;
 *   gsc        the pages Search Console reported in its latest 28-day sync.
 * The kind of each page is decided once, from the strongest evidence any source
 * gave (lib/content/existing-content/classify.ts).
 *
 * Search Console adds, per page, the clicks, impressions, average position and
 * top query of the latest 28-day sync, summed over that sync's query x page
 * rows. Google leaves anonymised queries out of those rows, so the sums can be
 * lower than the page's own total in Search Console; the screen names its
 * figures as query rows.
 */
import { urlMatchKeys } from '@/lib/content/internal-links'
import type { ScannedTarget } from '@/lib/content/wordpress-content-scan'
import { isContentUrl, resolveKind, titleFromUrl, type KindEvidence, type SiteKind } from './classify'

export type { SiteKind } from './classify'
export type ExistingContentGroup = 'content' | 'commerce'
export type ExistingContentSource = 'map' | 'shopify' | 'wordpress' | 'crawl' | 'gsc'
/** A tab of the screen: every kind, or all of them. */
export type ExistingContentTab = 'all' | SiteKind
export const TABS: readonly ExistingContentTab[] = ['all', 'product', 'article', 'page', 'category']
export type ExistingContentSort = 'impressions' | 'clicks' | 'position' | 'updated' | 'title'
export const SORTS: readonly ExistingContentSort[] = ['impressions', 'clicks', 'position', 'updated', 'title']

export interface ExistingContentMetrics {
  clicks: number
  impressions: number
  /** Impression-weighted average position of the page's query rows; null without impressions. */
  position: number | null
  topQuery: string | null
  /** The top query's own average position. */
  topQueryPosition: number | null
}

/** The one thing worth doing about a page, and the fact that makes it worth it. */
export type RowAction =
  /** Our own article sits just off Google's first page: open it and improve it. */
  | { kind: 'improve'; query: string; position: number; articleId: string }
  /** Google shows the page for a search but not on its first page: an article that links to it helps. */
  | { kind: 'support'; query: string; position: number }

export interface ExistingContentItem {
  /** The page's path key: one item per page. */
  key: string
  title: string
  /** True when no source named the page and the title was read off its address. */
  titleFromUrl: boolean
  kind: SiteKind
  group: ExistingContentGroup
  url: string
  isHome: boolean
  /** When a source knows it: Shopify's updated time, WordPress's modified, the sitemap's lastmod. */
  updatedAt: string | null
  sources: ExistingContentSource[]
  /** The store's own id, for matching an article we published to Shopify. */
  shopifyGid: string | null
  /** 'ours' = an article this app wrote and published; 'site' = it was on the site
   *  already; null = unknown (our own articles could not be read). */
  origin: 'ours' | 'site' | null
  /** Our generated article's id, when the page is one of ours and the id is known. */
  articleId: string | null
  /** Null when Search Console has no rows for this page (or is not connected). */
  metrics: ExistingContentMetrics | null
  /** Set when two or more of the site's pages get impressions for the same query. */
  cannibalization: { query: string; pages: number } | null
  /** A topic that links to this page as a required internal link already exists. */
  supportTopicPlanned: boolean
  action: RowAction | null
}

export type GscState = 'off' | 'not_connected' | 'not_synced' | 'ok' | 'unavailable'

/** The full-site mapping as the screen sees it. */
export type SiteMapState = 'unavailable' | 'no_site' | 'never' | 'running' | 'completed' | 'partial' | 'failed'
export interface SiteMapStatus {
  state: SiteMapState
  phase: string | null
  /** URLs found so far (while running) or kept (when done). */
  found: number
  docsRead: number
  docsSeen: number
  startedAt: string | null
  finishedAt: string | null
  /** The mapping stopped at its cap: the site has at least `found` pages. */
  capped: boolean
  stopReason: string | null
}

export type PartialReason = 'crawl' | 'index_partial' | 'map_capped' | 'gsc_only'

export type TabCounts = Record<ExistingContentTab, number>

export interface ExistingContentIndex {
  /** The first source present, in the order: shopify, wordpress, map, crawl, gsc. */
  source: ExistingContentSource | 'none'
  /** How many pages each source contributed (before merging). */
  sources: Record<ExistingContentSource, number>
  /** True when the list cannot be the whole site. */
  partial: boolean
  partialReason: PartialReason | null
  connections: { shopify: boolean; wordpress: boolean }
  /** Which existing refresh the screen may call, or null when there is none. */
  resync: 'shopify' | 'wordpress' | null
  indexedAt: string | null
  map: SiteMapStatus
  gsc: { state: GscState; startDate: string | null; endDate: string | null }
  /** The TRUE totals per tab: every page in the index, not only the ones shown. */
  counts: TabCounts
  riskCount: number
  /** What Search Console says about the whole list (zeros without it). */
  insights: SiteInsights
  items: ExistingContentItem[]
  /** More store entities exist than were read (a very large store). */
  truncated: boolean
}

export interface ExistingContentView {
  tab: ExistingContentTab
  q: string
  sort: ExistingContentSort
  risk: boolean
  offset: number
  limit: number
}

/** What the route answers: the index's summary and one page of one tab. */
export interface ExistingContentPayload extends Omit<ExistingContentIndex, 'items'> {
  view: ExistingContentView
  /** Items of this tab that match the search and the risk filter (before paging). */
  matching: number
  items: ExistingContentItem[]
}

export const GROUP_OF: Record<SiteKind, ExistingContentGroup> = {
  article: 'content', page: 'content', product: 'commerce', category: 'commerce',
}

/**
 * The path key of a URL: lowercased, decoded, without protocol, host, query,
 * fragment or trailing slash. A bare host (the home page) is '/'. Empty for
 * something that is not a URL at all.
 */
export function pageKey(url: string): string {
  const keys = urlMatchKeys(url)
  const path = keys.find((k) => k.startsWith('/'))
  if (path) return path
  return keys.length > 0 && /^https?:\/\//i.test(String(url).trim()) ? '/' : ''
}

// ── Sources → source items ───────────────────────────────────────────────────

/** One page as one source saw it, before merging. */
export interface SourceItem {
  source: ExistingContentSource
  url: string
  title: string | null
  updatedAt: string | null
  evidence: Omit<KindEvidence, 'url'>
  shopifyGid?: string | null
  /** The WordPress scan matched this page to one of our generated articles. */
  oursArticleId?: string | null
}

export interface ShopifyEntityLite {
  id?: string
  shopify_gid: string
  entity_type: string
  title: string | null
  handle: string | null
  canonical_url: string | null
  is_active: boolean
  shopify_updated_at?: string | null
}

const SHOPIFY_TYPES = new Set(['article', 'page', 'blog', 'product', 'collection'])

/** Active entities with a URL. */
export function sourceFromShopify(rows: readonly ShopifyEntityLite[]): SourceItem[] {
  const out: SourceItem[] = []
  for (const r of rows) {
    if (!r.is_active || !r.canonical_url || !SHOPIFY_TYPES.has(r.entity_type)) continue
    out.push({
      source: 'shopify', url: r.canonical_url,
      title: (r.title || '').trim() || (r.handle || '').replace(/[-_]+/g, ' ').trim() || null,
      updatedAt: r.shopify_updated_at ?? null,
      evidence: { platform: r.entity_type },
      shopifyGid: r.shopify_gid,
    })
  }
  return out
}

/**
 * Index targets (the WordPress scan, or the crawl) as source items. Utility,
 * system and malformed pages — the ones the scanner itself rules out — are not
 * content. The WordPress scan's type is WordPress's own; the crawl's is only
 * taken when it is more than its default.
 */
export function sourceFromIndex(
  targets: readonly Partial<ScannedTarget>[] | null | undefined,
  source: 'wordpress' | 'crawl',
): SourceItem[] {
  const out: SourceItem[] = []
  for (const t of targets ?? []) {
    if (!t || typeof t.targetUrl !== 'string' || !t.targetUrl) continue
    if (t.eligibility === 'no') continue
    const type = t.targetType === 'post' ? 'post' : t.targetType === 'product' ? 'product' : t.targetType === 'category' ? 'category' : 'page'
    out.push({
      source, url: t.targetUrl,
      title: (t.targetTitle || '').trim() || null,
      updatedAt: null,
      evidence: { index: { type, authoritative: source === 'wordpress' } },
      oursArticleId: t.matchedGeneratedArticleId ?? null,
    })
  }
  return out
}

/** One stored entry of the full-site mapping (compact keys: it is stored by the thousand). */
export interface SiteMapEntry {
  /** URL */
  u: string
  /** the kind the sitemap's name gave, or null */
  k?: SiteKind | null
  /** the platform type (WordPress REST: post, page, product, product_cat) */
  p?: string | null
  /** title (WordPress REST only; a sitemap has none) */
  t?: string | null
  /** lastmod / modified */
  m?: string | null
}

export function sourceFromMap(entries: readonly SiteMapEntry[] | null | undefined): SourceItem[] {
  const out: SourceItem[] = []
  for (const e of entries ?? []) {
    if (!e || typeof e.u !== 'string' || !e.u) continue
    out.push({
      source: 'map', url: e.u, title: (e.t || '').trim() || null, updatedAt: e.m ?? null,
      evidence: { platform: e.p ?? null, sitemap: e.k ?? null },
    })
  }
  return out
}

export interface GscRowLite { query: string; page: string; clicks: number; impressions: number; position?: number | null }

/** The pages Search Console reported: pages Google knows, whether or not a sitemap lists them. */
export function sourceFromGsc(rows: readonly GscRowLite[] | null | undefined): SourceItem[] {
  const seen = new Set<string>()
  const out: SourceItem[] = []
  for (const r of rows ?? []) {
    const k = pageKey(r.page)
    if (!k || seen.has(k)) continue
    seen.add(k)
    out.push({ source: 'gsc', url: String(r.page).replace(/[?#].*$/, ''), title: null, updatedAt: null, evidence: {} })
  }
  return out
}

// ── Merging ──────────────────────────────────────────────────────────────────

const SOURCE_ORDER: readonly ExistingContentSource[] = ['shopify', 'wordpress', 'map', 'crawl', 'gsc']
const newer = (a: string | null, b: string | null) => (!a ? b : !b ? a : (Date.parse(b) > Date.parse(a) ? b : a))

/**
 * One item per page. The address and the title come from the strongest source
 * that gave one (the store, WordPress, the mapping, the crawl, Search Console;
 * a page nobody named is titled from its address); the kind comes from all the
 * evidence at once; the date is the newest any source gave. Pages that are not
 * content (lib/content/existing-content/classify.ts) are dropped from every source.
 */
export function mergeSources(lists: readonly (readonly SourceItem[])[]): ExistingContentItem[] {
  type Acc = {
    url: string; urlRank: number; title: string | null; titleRank: number; updatedAt: string | null
    sources: Set<ExistingContentSource>; evidence: Omit<KindEvidence, 'url'>; shopifyGid: string | null; oursArticleId: string | null
  }
  const byKey = new Map<string, Acc>()
  const rank = (s: ExistingContentSource) => SOURCE_ORDER.indexOf(s)
  for (const list of lists) {
    for (const s of list) {
      if (!isContentUrl(s.url)) continue
      const key = pageKey(s.url)
      if (!key) continue
      let a = byKey.get(key)
      if (!a) {
        a = { url: s.url, urlRank: rank(s.source), title: null, titleRank: 99, updatedAt: null, sources: new Set(), evidence: {}, shopifyGid: null, oursArticleId: null }
        byKey.set(key, a)
      }
      a.sources.add(s.source)
      if (rank(s.source) < a.urlRank) { a.url = s.url; a.urlRank = rank(s.source) }
      if (s.title && rank(s.source) < a.titleRank) { a.title = s.title; a.titleRank = rank(s.source) }
      a.updatedAt = newer(a.updatedAt, s.updatedAt)
      const ev = s.evidence
      if (ev.platform && !a.evidence.platform) a.evidence.platform = ev.platform
      if (ev.index && (!a.evidence.index || (ev.index.authoritative && !a.evidence.index.authoritative))) a.evidence.index = ev.index
      if (ev.sitemap && !a.evidence.sitemap) a.evidence.sitemap = ev.sitemap
      if (s.shopifyGid && !a.shopifyGid) a.shopifyGid = s.shopifyGid
      if (s.oursArticleId && !a.oursArticleId) a.oursArticleId = s.oursArticleId
    }
  }
  const out: ExistingContentItem[] = []
  for (const [key, a] of byKey) {
    const kind = resolveKind({ url: a.url, ...a.evidence })
    const fallback = titleFromUrl(a.url)
    out.push({
      key,
      title: a.title ?? (fallback || a.url),
      titleFromUrl: !a.title,
      kind, group: GROUP_OF[kind],
      url: a.url,
      isHome: key === '/',
      updatedAt: a.updatedAt,
      sources: SOURCE_ORDER.filter((s) => a.sources.has(s)),
      shopifyGid: a.shopifyGid,
      origin: a.oursArticleId ? 'ours' : null,
      articleId: a.oursArticleId,
      metrics: null, cannibalization: null, supportTopicPlanned: false, action: null,
    })
  }
  return out
}

// ── Search Console ───────────────────────────────────────────────────────────

/** Per page: summed clicks and impressions, the impression-weighted position,
 *  and the query that brought the most clicks (impressions break a tie, then
 *  the query itself, so it is stable). */
export function pageMetrics(rows: readonly GscRowLite[]): Map<string, ExistingContentMetrics> {
  type Acc = { clicks: number; impressions: number; posSum: number; posW: number; top: { query: string; clicks: number; impressions: number; position: number | null } | null }
  const acc = new Map<string, Acc>()
  for (const r of rows) {
    const key = pageKey(r.page)
    if (!key) continue
    const a = acc.get(key) ?? { clicks: 0, impressions: 0, posSum: 0, posW: 0, top: null }
    const clicks = Number(r.clicks) || 0
    const impressions = Number(r.impressions) || 0
    const position = Number(r.position)
    const hasPos = Number.isFinite(position) && position > 0
    a.clicks += clicks
    a.impressions += impressions
    if (hasPos && impressions > 0) { a.posSum += position * impressions; a.posW += impressions }
    const t = a.top
    if (!t || clicks > t.clicks || (clicks === t.clicks && (impressions > t.impressions || (impressions === t.impressions && r.query < t.query)))) {
      a.top = { query: r.query, clicks, impressions, position: hasPos ? position : null }
    }
    acc.set(key, a)
  }
  const round1 = (n: number) => Math.round(n * 10) / 10
  const out = new Map<string, ExistingContentMetrics>()
  for (const [k, a] of acc) {
    out.set(k, {
      clicks: a.clicks, impressions: a.impressions,
      position: a.posW > 0 ? round1(a.posSum / a.posW) : null,
      topQuery: a.top?.query ?? null,
      topQueryPosition: a.top?.position != null ? round1(a.top.position) : null,
    })
  }
  return out
}

/**
 * Cannibalization RISK: a query for which TWO OR MORE of the site's own pages get
 * impressions. Every row of a sync is the site's own (one property), so every page
 * in it counts. Returned per page: the riskiest of its shared queries (the one with
 * the most impressions across the competing pages) and how many pages share it.
 *
 * It is a risk, not a verdict: two pages can rightly answer one query. That is why
 * the screen names the query and the count, and leaves the judgement to the merchant.
 */
export function cannibalizationByPage(rows: readonly GscRowLite[]): Map<string, { query: string; pages: number }> {
  const byQuery = new Map<string, { pages: Set<string>; impressions: number }>()
  for (const r of rows) {
    const impressions = Number(r.impressions) || 0
    if (impressions <= 0) continue
    const q = String(r.query || '').trim().toLowerCase()
    const key = pageKey(r.page)
    if (!q || !key) continue
    const e = byQuery.get(q) ?? { pages: new Set<string>(), impressions: 0 }
    e.pages.add(key)
    e.impressions += impressions
    byQuery.set(q, e)
  }
  const out = new Map<string, { query: string; pages: number; impressions: number }>()
  for (const [query, e] of byQuery) {
    if (e.pages.size < 2) continue
    for (const page of e.pages) {
      const cur = out.get(page)
      if (!cur || e.impressions > cur.impressions || (e.impressions === cur.impressions && query < cur.query)) {
        out.set(page, { query, pages: e.pages.size, impressions: e.impressions })
      }
    }
  }
  return new Map([...out].map(([k, v]) => [k, { query: v.query, pages: v.pages }]))
}

// ── Our own articles and topics ──────────────────────────────────────────────

export interface OurArticleLite {
  id?: string | null
  wp_post_url?: string | null
  shopify_article_url?: string | null
  shopify_article_id?: string | null
  site_post_url?: string | null
}

/** Our published articles by page key and by Shopify id, each to the article's id when known. */
export interface OwnershipEvidence { pageKeys: Map<string, string | null>; shopifyIds: Map<string, string | null> }

export function ownershipEvidence(articles: readonly OurArticleLite[]): OwnershipEvidence {
  const pageKeys = new Map<string, string | null>()
  const shopifyIds = new Map<string, string | null>()
  for (const a of articles) {
    const id = a.id ?? null
    for (const u of [a.wp_post_url, a.shopify_article_url, a.site_post_url]) {
      const k = typeof u === 'string' && u ? pageKey(u) : ''
      if (k && !pageKeys.get(k)) pageKeys.set(k, id)
    }
    if (a.shopify_article_id && !shopifyIds.get(a.shopify_article_id)) shopifyIds.set(a.shopify_article_id, id)
  }
  return { pageKeys, shopifyIds }
}

/** Required internal-link targets of the project's live topics, as page keys. */
export function plannedSupportKeys(topics: readonly { status?: string | null; anchors_json?: unknown }[]): Set<string> {
  const out = new Set<string>()
  for (const t of topics) {
    if (t.status === 'rejected' || !Array.isArray(t.anchors_json)) continue
    for (const a of t.anchors_json as { target_url?: unknown; type?: unknown }[]) {
      if (a && a.type !== 'external' && typeof a.target_url === 'string') {
        const k = pageKey(a.target_url)
        if (k) out.add(k)
      }
    }
  }
  return out
}

// ── The action a row earns ───────────────────────────────────────────────────

/**
 * When a row gets an action, and only then. Each rule needs Search Console's own
 * evidence that the page is IN the running (Google shows it for a search, with
 * at least MIN_IMPRESSIONS impressions) but NOT on the first page yet:
 *   improve  our own article whose average position is in
 *            [IMPROVE_MIN, IMPROVE_MAX]: it is close, and the text is ours to
 *            rework (it opens the article);
 *   support  any other page whose top query sits in (SUPPORT_MIN, SUPPORT_MAX],
 *            pages two and three of Google: an article that links to it adds the
 *            internal link and the topical support it lacks. Deeper than that one
 *            link is rarely the lever. Not offered when a topic for it is planned.
 * A page on the first page, or with no Search Console rows at all, gets no
 * action: there is no fact to act on.
 */
export const ACTION_RULES = { IMPROVE_MIN: 4, IMPROVE_MAX: 20, SUPPORT_MIN: 10, SUPPORT_MAX: 30, MIN_IMPRESSIONS: 50 } as const

export function rowAction(item: Pick<ExistingContentItem, 'origin' | 'articleId' | 'metrics' | 'supportTopicPlanned'>): RowAction | null {
  const m = item.metrics
  if (!m || !m.topQuery || m.impressions < ACTION_RULES.MIN_IMPRESSIONS) return null
  const pos = m.position
  if (item.origin === 'ours') {
    if (item.articleId && pos != null && pos >= ACTION_RULES.IMPROVE_MIN && pos <= ACTION_RULES.IMPROVE_MAX) {
      return { kind: 'improve', query: m.topQuery, position: pos, articleId: item.articleId }
    }
    return null
  }
  const qpos = m.topQueryPosition ?? pos
  if (!item.supportTopicPlanned && qpos != null && qpos > ACTION_RULES.SUPPORT_MIN && qpos <= ACTION_RULES.SUPPORT_MAX) {
    return { kind: 'support', query: m.topQuery, position: qpos }
  }
  return null
}

// ── Putting it together ──────────────────────────────────────────────────────

export function annotate(
  items: readonly ExistingContentItem[],
  opts: {
    gscRows?: readonly GscRowLite[] | null
    ownership?: OwnershipEvidence | null
    plannedKeys?: Set<string> | null
  },
): ExistingContentItem[] {
  const metrics = opts.gscRows ? pageMetrics(opts.gscRows) : null
  const risks = opts.gscRows ? cannibalizationByPage(opts.gscRows) : null
  return items.map((it) => {
    const key = pageKey(it.url)
    const own = opts.ownership
    const byGid = own && it.shopifyGid ? own.shopifyIds.get(it.shopifyGid) : undefined
    const ours = it.origin === 'ours' || (!!own && (own.pageKeys.has(key) || (!!it.shopifyGid && own.shopifyIds.has(it.shopifyGid))))
    const commerce = it.group === 'commerce'
    const next: ExistingContentItem = {
      ...it,
      // Products and categories are the store's own, never an article we wrote.
      origin: commerce ? 'site' : ours ? 'ours' : own ? 'site' : null,
      articleId: commerce || !ours ? null : (it.articleId ?? own?.pageKeys.get(key) ?? byGid ?? null),
      metrics: metrics?.get(key) ?? null,
      cannibalization: risks?.get(key) ?? null,
      supportTopicPlanned: !!opts.plannedKeys?.has(key),
      action: null,
    }
    next.action = rowAction(next)
    return next
  })
}

export interface SiteInsights {
  /** Pages Google sent at least one click to. */
  withClicks: number
  /** Pages Google shows in results that got no click. */
  seenNoClicks: number
  /** Rows with an action (a reason to act). */
  actionable: number
}

export function siteInsights(items: readonly ExistingContentItem[]): SiteInsights {
  let withClicks = 0, seenNoClicks = 0, actionable = 0
  for (const it of items) {
    if (it.metrics && it.metrics.clicks > 0) withClicks++
    else if (it.metrics && it.metrics.impressions > 0) seenNoClicks++
    if (it.action) actionable++
  }
  return { withClicks, seenNoClicks, actionable }
}

export function countTabs(items: readonly ExistingContentItem[]): TabCounts {
  const c: TabCounts = { all: 0, product: 0, article: 0, page: 0, category: 0 }
  for (const it of items) { c.all++; c[it.kind]++ }
  return c
}

const collator = new Intl.Collator(['he', 'en'], { sensitivity: 'base', numeric: true })

/** Compare two items for a sort; pages without the figure go last, then by title (the home page first). */
export function compareItems(sort: ExistingContentSort): (a: ExistingContentItem, b: ExistingContentItem) => number {
  const byTitle = (a: ExistingContentItem, b: ExistingContentItem) => (a.isHome === b.isHome ? collator.compare(a.title, b.title) : a.isHome ? -1 : 1)
  const desc = (f: (i: ExistingContentItem) => number | null) => (a: ExistingContentItem, b: ExistingContentItem) => {
    const av = f(a), bv = f(b)
    if (av === bv) return byTitle(a, b)
    if (av == null) return 1
    if (bv == null) return -1
    return bv - av
  }
  switch (sort) {
    case 'clicks': return desc((i) => i.metrics?.clicks ?? null)
    case 'impressions': return desc((i) => i.metrics?.impressions ?? null)
    // Best (lowest) position first.
    case 'position': return desc((i) => (i.metrics?.position != null ? -i.metrics.position : null))
    case 'updated': return desc((i) => (i.updatedAt ? Date.parse(i.updatedAt) || null : null))
    default: return byTitle
  }
}

/** The search: the title, the address or the top query, case-insensitive. */
export function matchesSearch(it: ExistingContentItem, q: string): boolean {
  const needle = q.trim().toLowerCase()
  if (!needle) return true
  return it.title.toLowerCase().includes(needle) || it.key.includes(needle) || (it.metrics?.topQuery ?? '').toLowerCase().includes(needle)
}

export const PAGE_LIMIT_MAX = 300
export const PAGE_LIMIT_DEFAULT = 50

/** One tab, searched, sorted, and one page of it. `matching` is before paging. */
export function viewItems(items: readonly ExistingContentItem[], view: ExistingContentView): { matching: number; items: ExistingContentItem[] } {
  const hits = items.filter((it) => (view.tab === 'all' || it.kind === view.tab) && (!view.risk || !!it.cannibalization) && matchesSearch(it, view.q))
  hits.sort(compareItems(view.sort))
  const offset = Math.max(0, view.offset)
  const limit = Math.min(Math.max(1, view.limit), PAGE_LIMIT_MAX)
  return { matching: hits.length, items: hits.slice(offset, offset + limit) }
}

/** The route's query string as a view, clamped to what exists. A figure sort without Search Console sorts by date. */
export function parseView(params: URLSearchParams, gscOk: boolean): ExistingContentView {
  const rawTab = params.get('tab') ?? ''
  const tab: ExistingContentTab = (TABS as readonly string[]).includes(rawTab) ? rawTab as ExistingContentTab : 'all'
  const rawSort = params.get('sort') ?? ''
  const figure = rawSort === 'impressions' || rawSort === 'clicks' || rawSort === 'position'
  const sort: ExistingContentSort = (SORTS as readonly string[]).includes(rawSort)
    ? (!gscOk && figure ? 'updated' : rawSort as ExistingContentSort)
    : gscOk ? 'impressions' : 'updated'
  const int = (v: string | null, d: number) => { const n = Number.parseInt(v ?? '', 10); return Number.isFinite(n) ? n : d }
  return {
    tab, sort,
    q: (params.get('q') ?? '').slice(0, 120),
    risk: params.get('risk') === '1',
    offset: Math.max(0, int(params.get('offset'), 0)),
    limit: Math.min(Math.max(1, int(params.get('limit'), PAGE_LIMIT_DEFAULT)), PAGE_LIMIT_MAX),
  }
}

/** The index's summary and one page of it: what the route answers. */
export function toPayload(index: ExistingContentIndex, view: ExistingContentView): ExistingContentPayload {
  const { items, ...summary } = index
  const page = viewItems(items, view)
  return { ...summary, view, matching: page.matching, items: page.items }
}

/** The language a new topic is written in: the project's, never the dashboard's. */
export function topicLanguage(projectLanguage: string | null | undefined): 'he' | 'en' {
  return (projectLanguage || '').toLowerCase().startsWith('en') ? 'en' : 'he'
}

/**
 * The body POSTed to the existing topic route (/api/content/topics) for "write a
 * supporting article". No model call: the topic is a template in the project's
 * language, its keyword the page's top query when Search Console has one, and the
 * page itself a REQUIRED internal link, which is what makes it the commercial target.
 */
export function supportTopicBody(
  item: Pick<ExistingContentItem, 'title' | 'url' | 'metrics'>,
  projectId: string,
  lang: 'he' | 'en',
  copy: { topic: string; notes: string },
): Record<string, unknown> {
  const fill = (s: string) => s.replace('{title}', item.title).replace('{url}', item.url)
  return {
    projectId,
    topic: fill(copy.topic),
    primary_keyword: item.metrics?.topQuery || item.title,
    search_intent: 'commercial',
    language: lang,
    brief_notes: fill(copy.notes),
    anchors: [{ anchor_text: item.title, target_url: item.url, required: true, type: 'internal', note: '' }],
  }
}
