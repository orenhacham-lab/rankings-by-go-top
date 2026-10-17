/**
 * The Links tab's two halves, built from what the project already stored:
 *
 *   buildInternalLinks   our articles: which of the site's pages each one links
 *                        to, which articles link to it, the approved links not
 *                        in its text yet, and the site's pages nothing links to.
 *   buildOpportunities   the open-web sites that already appear for the
 *                        project's searches (Google results of the seeding scan,
 *                        pages AI answers cited for its questions), classified
 *                        by lib/site-links/classify.ts, one row per domain.
 *
 * Pure: no React, no I/O, no request. The route (lib/site-links/http.ts) reads
 * the rows; the screen only draws what comes back.
 */
import { internalTargetKey, isInternalUrl, urlMatchKeys } from '@/lib/content/internal-links'
import { decodeBriefNotes } from '@/lib/content/brief-notes'
import {
  bareDomain, CATEGORY_ORDER, cityNeedle, classifyPage, isCompetitorDomain, mentionsCity,
  type ClassifyReason, type OpportunityCategory,
} from '@/lib/site-links/classify'

// ── Safe external addresses ───────────────────────────────────────────────

/**
 * The ONE way an address from stored data reaches an href on this tab: an
 * absolute http(s) URL with a public-looking host, re-serialised by URL.
 * Anything else (javascript:, data:, relative, credentials, a bare word) is null
 * and is drawn as text, not a link.
 */
export function safeExternalUrl(input: unknown): string | null {
  if (typeof input !== 'string') return null
  const raw = input.trim()
  if (!raw || raw.length > 2048 || !/^https?:\/\//i.test(raw)) return null
  let u: URL
  try { u = new URL(raw) } catch { return null }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return null
  if (u.username || u.password) return null
  // A public host name: not an address literal, not a single label (localhost).
  if (!bareDomain(u.hostname) || /^[\d.]+$/.test(u.hostname)) return null
  return u.toString()
}

// ── Internal links ────────────────────────────────────────────────────────

export interface ArticleRow {
  id: string
  title: string | null
  status: string | null
  content_html: string | null
  wp_post_url: string | null
  shopify_article_url: string | null
  topic_id: string | null
}

export interface TopicRow { id: string; brief_notes: string | null }

export interface IndexTarget {
  targetUrl?: unknown
  targetTitle?: unknown
  inboundLinkCount?: unknown
  eligibility?: unknown
  contentSkipped?: unknown
}

export interface PendingLink { targetUrl: string | null; targetTitle: string; anchorText: string }

export interface ArticleLinks {
  id: string
  title: string
  status: string
  /** The article's live address, when it is published (http/https only). */
  liveUrl: string | null
  /** Distinct pages of the site this article links to. */
  linksOut: number
  /** Other articles that link to this one; null while it has no live address to link to. */
  linksIn: number | null
  /** Approved planned links not in the article's text yet (the editor adds them in one click). */
  pending: PendingLink[]
}

export interface OrphanPage { url: string; title: string }

export interface InternalLinksView {
  articles: ArticleLinks[]
  totals: {
    articles: number
    /** Links from our articles to the site's own pages, counted once per article and page. */
    linksBetween: number
    /** Published articles that no other article links to. */
    noIncoming: number
    /** Approved links still waiting to be added. */
    pending: number
    /** Site pages in the index that no page links to. */
    orphanPages: number
    /** Pages in the site index at all (0 when the site has not been read yet). */
    indexedPages: number
  }
  orphanPages: OrphanPage[]
}

export const MAX_ARTICLES_SHOWN = 60
export const MAX_ORPHANS_SHOWN = 12
export const MAX_PENDING_PER_ARTICLE = 5

const HREF = /<a\b[^>]*?\bhref\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/gi

function hrefsOf(html: string | null): string[] {
  if (!html) return []
  const out: string[] = []
  for (const m of html.matchAll(HREF)) {
    const href = (m[1] ?? m[2] ?? m[3] ?? '').trim()
    if (href) out.push(href)
  }
  return out
}

const oneLine = (v: unknown, max: number) => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, max) : '')

export function buildInternalLinks(input: {
  articles: ArticleRow[]
  topics: TopicRow[]
  /** The site's host names (the project's domain and aliases, bare). */
  hosts: string[]
  indexTargets: IndexTarget[]
}): InternalLinksView {
  const hosts = [...new Set(input.hosts.map(bareDomain).filter(Boolean).flatMap((h) => [h, `www.${h}`]))]
  const topics = new Map(input.topics.map((t) => [t.id, t]))

  // Every article's internal link keys (path-first, so absolute and relative collapse).
  const linked = input.articles.map((a) => {
    const keys = new Set<string>()
    const matchKeys = new Set<string>()
    for (const href of hrefsOf(a.content_html)) {
      if (!isInternalUrl(href, hosts)) continue
      const k = internalTargetKey(href)
      if (k && k !== '/') keys.add(k)
      for (const mk of urlMatchKeys(href)) matchKeys.add(mk)
    }
    return { article: a, keys, matchKeys, live: !!(safeExternalUrl(a.wp_post_url) ?? safeExternalUrl(a.shopify_article_url)) }
  })

  const articles: ArticleLinks[] = linked.map(({ article: a, keys }) => {
    const liveUrl = safeExternalUrl(a.wp_post_url) ?? safeExternalUrl(a.shopify_article_url)
    const ownKeys = liveUrl ? urlMatchKeys(liveUrl) : []
    // A link to itself is not a link between articles.
    const selfKey = liveUrl ? internalTargetKey(liveUrl) : null
    const linksOut = [...keys].filter((k) => k !== selfKey).length
    // Only a PUBLISHED article's links exist on the site: a draft linking here does not count yet.
    const linksIn = liveUrl
      ? linked.filter((o) => o.article.id !== a.id && o.live && ownKeys.some((k) => o.matchKeys.has(k))).length
      : null
    const planned = decodeBriefNotes(a.topic_id ? topics.get(a.topic_id)?.brief_notes ?? null : null).flags.internalLinks
    const here = linked.find((l) => l.article.id === a.id)!
    const pending = planned
      .filter((p) => !urlMatchKeys(p.targetUrl).some((k) => here.matchKeys.has(k)))
      .slice(0, MAX_PENDING_PER_ARTICLE)
      .map((p) => ({ targetUrl: safeExternalUrl(p.targetUrl), targetTitle: oneLine(p.targetTitle, 160), anchorText: oneLine(p.anchorText, 120) }))
    return {
      id: a.id,
      title: oneLine(a.title, 200),
      status: oneLine(a.status, 20) || 'draft',
      liveUrl,
      linksOut,
      linksIn,
      pending,
    }
  })

  const eligible = input.indexTargets.filter((t) => t && t.eligibility !== 'no' && t.contentSkipped !== true && typeof t.targetUrl === 'string')
  const orphans = eligible
    .filter((t) => Number(t.inboundLinkCount) === 0)
    .map((t) => ({ url: safeExternalUrl(t.targetUrl), title: oneLine(t.targetTitle, 160) }))
    .filter((t): t is OrphanPage => !!t.url)

  // Most actionable first: published and missing links, then the rest.
  const order = (a: ArticleLinks) => (a.liveUrl && a.linksIn === 0 ? 0 : a.pending.length > 0 ? 1 : 2)
  const sorted = [...articles].sort((x, y) => order(x) - order(y) || y.pending.length - x.pending.length)

  return {
    articles: sorted.slice(0, MAX_ARTICLES_SHOWN),
    totals: {
      articles: articles.length,
      linksBetween: articles.reduce((n, a) => n + a.linksOut, 0),
      noIncoming: articles.filter((a) => a.linksIn === 0).length,
      pending: articles.reduce((n, a) => n + a.pending.length, 0),
      orphanPages: orphans.length,
      indexedPages: eligible.length,
    },
    orphanPages: orphans.slice(0, MAX_ORPHANS_SHOWN),
  }
}

// ── Opportunities ─────────────────────────────────────────────────────────

/** One Google result list of the seeding scan: the query and the result domains in rank order. */
export interface SearchRecord { query: string; domains: string[] }

/** One stored AI citation, with the question it answered. */
export interface CitationRow { url: string | null; domain: string | null; title: string | null; question: string | null }

export interface OpportunityPage { url: string | null; title: string }

export interface Opportunity {
  domain: string
  category: OpportunityCategory
  reason: ClassifyReason
  isCompetitor: boolean
  isLocal: boolean
  /** Up to three pages of this site that appeared (only http/https addresses are kept as links). */
  pages: OpportunityPage[]
  /** The Google searches it showed up for, with its best place (1-based). */
  searches: { query: string; rank: number }[]
  /** The questions whose AI answers cited it. */
  questions: string[]
}

export const MAX_OPPORTUNITIES = 40

type Acc = Opportunity & { rank: number; score: number }

export function buildOpportunities(input: {
  searches: SearchRecord[]
  citations: CitationRow[]
  selfDomains: string[]
  competitors: string[]
  city: string | null
}): Opportunity[] {
  const self = input.selfDomains.map(bareDomain).filter(Boolean)
  const needle = cityNeedle(input.city)
  const byDomain = new Map<string, Acc>()

  function add(domainRaw: string | null, page: { url: string | null; title: string | null }, evidence: (o: Acc) => void) {
    const domain = bareDomain(domainRaw) || bareDomain(page.url)
    if (!domain) return
    const verdict = classifyPage({ domain, url: page.url, title: page.title }, self)
    if (verdict.kind !== 'opportunity') return
    let o = byDomain.get(domain)
    if (!o) {
      o = { domain, category: verdict.category, reason: verdict.reason, isCompetitor: isCompetitorDomain(domain, input.competitors),
        isLocal: false, pages: [], searches: [], questions: [], rank: 99, score: 0 }
      byDomain.set(domain, o)
    } else if (CATEGORY_ORDER.indexOf(verdict.category) < CATEGORY_ORDER.indexOf(o.category)) {
      o.category = verdict.category
      o.reason = verdict.reason
    }
    if (mentionsCity({ domain, url: page.url, title: page.title }, needle)) o.isLocal = true
    const url = safeExternalUrl(page.url)
    const title = oneLine(page.title, 200)
    if ((url || title) && o.pages.length < 3 && !o.pages.some((p) => (url && p.url === url) || (!url && p.title === title))) {
      o.pages.push({ url, title })
    }
    evidence(o)
  }

  for (const rec of input.searches) {
    const query = oneLine(rec.query, 160)
    if (!query) continue
    rec.domains.slice(0, 20).forEach((d, i) => add(d, { url: null, title: null }, (o) => {
      const prev = o.searches.find((s) => s.query === query)
      if (prev) prev.rank = Math.min(prev.rank, i + 1)
      else o.searches.push({ query, rank: i + 1 })
      o.rank = Math.min(o.rank, i + 1)
    }))
  }
  for (const c of input.citations) {
    add(c.domain, { url: c.url, title: c.title }, (o) => {
      const q = oneLine(c.question, 240)
      if (q && !o.questions.includes(q)) o.questions.push(q)
      o.score += 1
    })
  }

  const list = [...byDomain.values()].map((o) => {
    o.score += o.searches.length * 3 + o.questions.length * 2 + (o.rank <= 3 ? 3 : o.rank <= 10 ? 1 : 0) + (o.isLocal ? 1 : 0)
    return o
  })
  // Competitors last: they are shown, marked, never as the first thing to do.
  list.sort((a, b) => Number(a.isCompetitor) - Number(b.isCompetitor) || b.score - a.score || a.domain.localeCompare(b.domain))
  return list.slice(0, MAX_OPPORTUNITIES).map((o) => ({
    domain: o.domain, category: o.category, reason: o.reason, isCompetitor: o.isCompetitor, isLocal: o.isLocal,
    pages: o.pages, searches: o.searches.slice(0, 5), questions: o.questions.slice(0, 3),
  }))
}
