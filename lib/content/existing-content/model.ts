/**
 * The "existing content" screen's model: what is already on the merchant's site,
 * read from data the app already holds. PURE (no network, no database), so every
 * rule the screen states about a page is unit-testable
 * (lib/content/existing-content/__qa__/existing-content.qa.ts).
 *
 * Sources, one per project (lib/content/existing-content/load.ts picks which):
 *   shopify    shopify_entities, the store's own products, collections, pages,
 *              blogs and articles as the last sync saw them;
 *   wordpress  wordpress_content_index, the WordPress site scan;
 *   crawl      site_crawl_index, the seeding scan's crawl of at most 25 key pages.
 *              It is never the whole site, so the screen says the list is partial.
 *
 * Search Console adds, per page, the clicks, impressions and top query of the
 * latest 28-day sync, summed over that sync's query x page rows. Google leaves
 * anonymised queries out of those rows, so the sums can be lower than the page's
 * own total in Search Console; the screen names its figures as query rows.
 *
 * Pages are matched to Search Console rows by PATH. Every row of a sync belongs
 * to the project's one property, so the host adds nothing but the ways the same
 * page is spelled (www, a custom domain versus the myshopify one).
 */
import { urlMatchKeys } from '@/lib/content/internal-links'
import type { ScannedTarget } from '@/lib/content/wordpress-content-scan'

export type ExistingContentType = 'article' | 'page' | 'blog' | 'product' | 'collection'
export type ExistingContentGroup = 'content' | 'commerce'
export type ExistingContentSource = 'shopify' | 'wordpress' | 'crawl' | 'none'
export type ExistingContentFilter = 'all' | 'content' | 'commerce'

export interface ExistingContentMetrics { clicks: number; impressions: number; topQuery: string | null }

export interface ExistingContentItem {
  key: string
  title: string
  type: ExistingContentType
  group: ExistingContentGroup
  url: string
  /** When the source knows it (Shopify's own updated time); otherwise null. */
  updatedAt: string | null
  /** 'ours' = an article this app wrote and published; 'site' = it was on the site
   *  already; null = unknown (our own articles could not be read). */
  origin: 'ours' | 'site' | null
  /** Null when Search Console has no rows for this page (or is not connected). */
  metrics: ExistingContentMetrics | null
  /** Set when two or more of the site's pages get impressions for the same query. */
  cannibalization: { query: string; pages: number } | null
  /** A topic that links to this page as a required internal link already exists. */
  supportTopicPlanned: boolean
}

export type GscState = 'off' | 'not_connected' | 'not_synced' | 'ok' | 'unavailable'

export interface ExistingContentPayload {
  source: ExistingContentSource
  /** True when the list cannot be the whole site: the crawl, or a scan that was cut short. */
  partial: boolean
  partialReason: 'crawl' | 'index_partial' | null
  connections: { shopify: boolean; wordpress: boolean }
  /** Which existing refresh the screen may call, or null when there is none. */
  resync: 'shopify' | 'wordpress' | null
  indexedAt: string | null
  gsc: { state: GscState; startDate: string | null; endDate: string | null }
  counts: Record<ExistingContentFilter, number>
  items: ExistingContentItem[]
  /** More items exist than were read (a very large store). */
  truncated: boolean
}

export const GROUP_OF: Record<ExistingContentType, ExistingContentGroup> = {
  article: 'content', page: 'content', blog: 'content',
  product: 'commerce', collection: 'commerce',
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

// ── Sources → items ──────────────────────────────────────────────────────────

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

const SHOPIFY_TYPES = new Set<ExistingContentType>(['article', 'page', 'blog', 'product', 'collection'])

/** Active entities with a URL, one item per page. */
export function itemsFromShopify(rows: readonly ShopifyEntityLite[]): ExistingContentItem[] {
  const out: ExistingContentItem[] = []
  const seen = new Set<string>()
  for (const r of rows) {
    if (!r.is_active || !r.canonical_url || !SHOPIFY_TYPES.has(r.entity_type as ExistingContentType)) continue
    const key = pageKey(r.canonical_url)
    if (!key || seen.has(key)) continue
    seen.add(key)
    const type = r.entity_type as ExistingContentType
    out.push({
      key: r.shopify_gid,
      title: (r.title || '').trim() || (r.handle || '').replace(/[-_]+/g, ' ').trim() || r.canonical_url,
      type, group: GROUP_OF[type], url: r.canonical_url,
      updatedAt: r.shopify_updated_at ?? null,
      origin: null, metrics: null, cannibalization: null, supportTopicPlanned: false,
    })
  }
  return out
}

/** The index's own classification, mapped onto the screen's types. */
function typeOfTarget(t: Pick<ScannedTarget, 'targetType' | 'targetRole'>): ExistingContentType {
  switch (t.targetType) {
    case 'post': return 'article'
    case 'product': return 'product'
    // classifyTarget files /collections/, /product-category/ and WordPress categories
    // here, all as commercial hubs: the screen's "collection".
    case 'category': return 'collection'
    // A content hub from the index can be a blog listing or a portfolio; only the
    // store's own 'blog' entity is called a blog.
    default: return 'page'
  }
}

/** Index targets (WordPress scan or crawl) as items. Utility, system and malformed
 *  pages — the ones the scanner itself rules out — are not content. */
export function itemsFromIndex(targets: readonly Partial<ScannedTarget>[] | null | undefined): ExistingContentItem[] {
  const out: ExistingContentItem[] = []
  const seen = new Set<string>()
  for (const t of targets ?? []) {
    if (!t || typeof t.targetUrl !== 'string' || !t.targetUrl) continue
    if (t.eligibility === 'no') continue
    const key = pageKey(t.targetUrl)
    if (!key || seen.has(key)) continue
    seen.add(key)
    const type = typeOfTarget({ targetType: t.targetType ?? 'unknown', targetRole: t.targetRole ?? 'unknown' })
    out.push({
      key, title: (t.targetTitle || '').trim() || t.targetUrl,
      type, group: GROUP_OF[type], url: t.targetUrl, updatedAt: null,
      // The WordPress scan matches its targets to our generated articles itself.
      origin: t.matchedGeneratedArticleId ? 'ours' : null,
      metrics: null, cannibalization: null, supportTopicPlanned: false,
    })
  }
  return out
}

// ── Search Console ───────────────────────────────────────────────────────────

export interface GscRowLite { query: string; page: string; clicks: number; impressions: number }

/** Per page: summed clicks and impressions, and the query that brought the most
 *  clicks (impressions break a tie, then the query itself, so it is stable). */
export function pageMetrics(rows: readonly GscRowLite[]): Map<string, ExistingContentMetrics> {
  const acc = new Map<string, { clicks: number; impressions: number; top: GscRowLite | null }>()
  for (const r of rows) {
    const key = pageKey(r.page)
    if (!key) continue
    const a = acc.get(key) ?? { clicks: 0, impressions: 0, top: null }
    const clicks = Number(r.clicks) || 0
    const impressions = Number(r.impressions) || 0
    a.clicks += clicks
    a.impressions += impressions
    const t = a.top
    if (!t || clicks > t.clicks || (clicks === t.clicks && (impressions > t.impressions || (impressions === t.impressions && r.query < t.query)))) {
      a.top = { ...r, clicks, impressions }
    }
    acc.set(key, a)
  }
  const out = new Map<string, ExistingContentMetrics>()
  for (const [k, a] of acc) out.set(k, { clicks: a.clicks, impressions: a.impressions, topQuery: a.top?.query ?? null })
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
  wp_post_url?: string | null
  shopify_article_url?: string | null
  shopify_article_id?: string | null
  site_post_url?: string | null
}

export interface OwnershipEvidence { pageKeys: Set<string>; shopifyIds: Set<string> }

export function ownershipEvidence(articles: readonly OurArticleLite[]): OwnershipEvidence {
  const pageKeys = new Set<string>()
  const shopifyIds = new Set<string>()
  for (const a of articles) {
    for (const u of [a.wp_post_url, a.shopify_article_url, a.site_post_url]) {
      const k = typeof u === 'string' && u ? pageKey(u) : ''
      if (k) pageKeys.add(k)
    }
    if (a.shopify_article_id) shopifyIds.add(a.shopify_article_id)
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
    const ours = opts.ownership
      ? (it.origin === 'ours' || opts.ownership.pageKeys.has(key) || opts.ownership.shopifyIds.has(it.key))
      : it.origin === 'ours'
    return {
      ...it,
      // Products and collections are the store's own, never an article we wrote.
      origin: it.group === 'commerce' ? 'site' : ours ? 'ours' : opts.ownership ? 'site' : null,
      metrics: metrics?.get(key) ?? null,
      cannibalization: risks?.get(key) ?? null,
      supportTopicPlanned: !!opts.plannedKeys?.has(key),
    }
  })
}

/** Most impressions first; pages without Search Console rows after, by title. */
export function sortItems(items: readonly ExistingContentItem[]): ExistingContentItem[] {
  return [...items].sort((a, b) => {
    const ai = a.metrics?.impressions ?? -1
    const bi = b.metrics?.impressions ?? -1
    if (ai !== bi) return bi - ai
    return a.title.localeCompare(b.title)
  })
}

export function countItems(items: readonly ExistingContentItem[]): Record<ExistingContentFilter, number> {
  let content = 0, commerce = 0
  for (const it of items) { if (it.group === 'content') content++; else commerce++ }
  return { all: items.length, content, commerce }
}

export function filterItems(items: readonly ExistingContentItem[], filter: ExistingContentFilter, onlyRisk = false): ExistingContentItem[] {
  return items.filter((it) => (filter === 'all' || it.group === filter) && (!onlyRisk || !!it.cannibalization))
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
