/**
 * THE ONE cannibalization check: before a topic or a keyword is created, is the
 * subject already on the site, or already in the plan?
 *
 * Every creation path asks it (see lib/content/cannibalization/README in the
 * header of load.ts for the list), each in its own way:
 *   automatic paths (the strategy generation, the monthly top-up) SKIP a duplicate;
 *   manual paths (the brief form, "add a keyword", keyword research, "write an
 *   article" from the AI questions) WARN and offer to improve the existing page,
 *   and never block: the merchant may know better.
 *
 * What it compares against, in order of weight:
 *   article  our own generated articles (title, slug)
 *   page     the site's pages: the full-site mapping (site_page_map), the WordPress
 *            index or the crawl, the Shopify catalogue (title, slug)
 *   search   Search Console queries the site already ranks for with a page (top 20,
 *            with impressions)
 *   topic    topics already planned (article_topics, not rejected)
 *   idea     ideas waiting in the plan (content_topic_ideas, pending or approved)
 *
 * How: each side is reduced to its subject words (normalize.ts: niqqud, prefixes,
 * light plurals, stop and generic words), and two sides are the same subject when
 * their words match one for one, in any order ("קיוטו מול טוקיו" = "טוקיו מול
 * קיוטו"), or nearly (at least three words in four shared). A genuine long-tail
 * ("טיול ביפן" against "טיול מאורגן ביפן לזוגות") is NOT a duplicate. The site's
 * home page is never a match: its title is the brand, not a subject.
 *
 * PURE: building the index and checking a candidate touch no database.
 */
import { mainPhrase, similarity, slugPhrase, subjectWords } from './normalize'

export type OverlapKind = 'article' | 'page' | 'search' | 'topic' | 'idea'

export const OVERLAP_KINDS: readonly OverlapKind[] = ['article', 'page', 'search', 'topic', 'idea']
/** What a page on the site is: every kind but the plan's own rows. */
export const SITE_KINDS: readonly OverlapKind[] = ['article', 'page', 'search']
/** The site and the planned topics. A manual path warns about these; the strategy
 *  generation skips them (a similar idea still waiting in the plan is the engine's
 *  own dedupe, and no reason to stop the merchant). */
export const SITE_AND_PLAN_KINDS: readonly OverlapKind[] = ['article', 'page', 'search', 'topic']

/** Two subjects are the same at this similarity or above. */
export const NEAR_DUPLICATE = 0.75
/** A Search Console query counts when the site ranks for it within these positions… */
export const GSC_MAX_POSITION = 20
/** …and Google showed it at least this many times in the window. */
export const GSC_MIN_IMPRESSIONS = 10

export interface OverlapIndexData {
  pages: { title: string | null; url: string | null }[]
  articles: { id: string; title: string | null; slug?: string | null; url?: string | null; topicId?: string | null }[]
  gsc: { query: string; page: string; impressions?: number | null; position?: number | null }[]
  topics: { id: string; topic: string | null; primaryKeyword?: string | null; status?: string | null }[]
  ideas: { id: string; title: string | null; primaryKeyword?: string | null; status?: string | null }[]
  /** The site's home page (a bare domain or the target_domain), never a match. */
  homeHosts?: string[]
}

interface Entry {
  kind: OverlapKind
  /** What the merchant is shown: the page's title, the query, the topic. */
  label: string
  url: string | null
  articleId: string | null
  topicId: string | null
  ideaId: string | null
  words: string[]
}

export interface OverlapIndex {
  entries: Entry[]
  counts: Record<OverlapKind, number>
}

export interface OverlapMatch {
  kind: OverlapKind
  label: string
  url: string | null
  articleId: string | null
  topicId: string | null
  ideaId: string | null
  /** 1 = the same subject words; ≥ NEAR_DUPLICATE = nearly. */
  score: number
  /** Which side of the candidate matched. */
  via: 'keyword' | 'title'
}

const WEIGHT: Record<OverlapKind, number> = { article: 5, page: 4, search: 3, topic: 2, idea: 1 }

/** A URL reduced to host + path, for "is this page one of our articles". */
export function pageKey(url: string | null | undefined): string {
  const raw = String(url ?? '').trim()
  if (!raw) return ''
  let s = raw.replace(/[?#].*$/, '').replace(/^https?:\/\//i, '').replace(/^www\./i, '').replace(/\/+$/, '')
  try { s = decodeURIComponent(s) } catch { /* keep */ }
  return s.toLowerCase()
}

function isHome(url: string | null | undefined, homeHosts: readonly string[]): boolean {
  const k = pageKey(url)
  if (!k) return false
  if (!k.includes('/')) return true
  return homeHosts.some((h) => pageKey(h) === k)
}

const clean = (s: string | null | undefined) => String(s ?? '').replace(/\s+/g, ' ').trim()

export function buildOverlapIndex(data: OverlapIndexData): OverlapIndex {
  const entries: Entry[] = []
  const counts: Record<OverlapKind, number> = { article: 0, page: 0, search: 0, topic: 0, idea: 0 }
  const homeHosts = data.homeHosts ?? []
  const add = (e: Omit<Entry, 'words'>, phrase: string) => {
    const words = subjectWords(phrase)
    if (words.length === 0) return
    entries.push({ ...e, words })
  }

  // Our articles: by their published address too, so the page they became is "ours".
  const articleByUrl = new Map<string, { id: string; title: string }>()
  for (const a of data.articles) {
    const title = clean(a.title)
    if (!title) continue
    counts.article++
    const base = { kind: 'article' as const, label: title, url: a.url ?? null, articleId: a.id, topicId: a.topicId ?? null, ideaId: null }
    add(base, mainPhrase(title))
    if (a.slug) add(base, String(a.slug).replace(/[-_]+/g, ' '))
    const k = pageKey(a.url)
    if (k) articleByUrl.set(k, { id: a.id, title })
  }

  for (const p of data.pages) {
    if (!p.url || isHome(p.url, homeHosts)) continue
    const ours = articleByUrl.get(pageKey(p.url))
    if (ours) continue // already indexed as our article
    const title = clean(p.title)
    const slug = slugPhrase(p.url)
    const label = title || slug
    if (!label) continue
    counts.page++
    const base = { kind: 'page' as const, label, url: p.url, articleId: null, topicId: null, ideaId: null }
    if (title) add(base, mainPhrase(title))
    // A slug is a phrase when it is words (a Hebrew slug, or an English one with a
    // dash), never an id or a single code.
    if (slug && (/[א-ת]/.test(slug) || slug.includes(' '))) add(base, slug)
  }

  for (const r of data.gsc) {
    const q = clean(r.query)
    if (!q || !r.page || isHome(r.page, homeHosts)) continue
    if (typeof r.position === 'number' && r.position > GSC_MAX_POSITION) continue
    if (typeof r.impressions === 'number' && r.impressions < GSC_MIN_IMPRESSIONS) continue
    counts.search++
    const ours = articleByUrl.get(pageKey(r.page))
    add({ kind: 'search', label: q, url: String(r.page).replace(/#.*$/, ''), articleId: ours?.id ?? null, topicId: null, ideaId: null }, q)
  }

  for (const t of data.topics) {
    if (t.status === 'rejected') continue
    const title = clean(t.topic)
    if (!title) continue
    counts.topic++
    const base = { kind: 'topic' as const, label: title, url: null, articleId: null, topicId: t.id, ideaId: null }
    if (t.primaryKeyword) add(base, t.primaryKeyword)
    add(base, mainPhrase(title))
  }

  for (const i of data.ideas) {
    if (i.status && i.status !== 'pending' && i.status !== 'approved') continue
    const title = clean(i.title)
    if (!title) continue
    counts.idea++
    const base = { kind: 'idea' as const, label: title, url: null, articleId: null, topicId: null, ideaId: i.id }
    if (i.primaryKeyword) add(base, i.primaryKeyword)
    add(base, mainPhrase(title))
  }

  return { entries, counts }
}

export interface OverlapCandidate {
  title?: string | null
  keyword?: string | null
}

export interface OverlapOptions {
  /** Only these kinds count (default: all). */
  kinds?: readonly OverlapKind[]
  /** The candidate's own rows, never a match for it. */
  excludeTopicIds?: readonly string[]
  excludeIdeaIds?: readonly string[]
}

/**
 * The strongest existing match for a candidate, or null. The keyword and the title's
 * main phrase are both compared; the heaviest kind wins, then the closest.
 */
export function checkOverlap(index: OverlapIndex, candidate: OverlapCandidate, opts: OverlapOptions = {}): OverlapMatch | null {
  const sides: { via: 'keyword' | 'title'; words: string[] }[] = []
  const kw = subjectWords(candidate.keyword)
  if (kw.length > 0) sides.push({ via: 'keyword', words: kw })
  const tw = subjectWords(mainPhrase(candidate.title))
  if (tw.length > 0) sides.push({ via: 'title', words: tw })
  if (sides.length === 0) return null

  const kinds = new Set(opts.kinds ?? OVERLAP_KINDS)
  const skipTopics = new Set(opts.excludeTopicIds ?? [])
  const skipIdeas = new Set(opts.excludeIdeaIds ?? [])
  let best: OverlapMatch | null = null
  for (const e of index.entries) {
    if (!kinds.has(e.kind)) continue
    if (e.topicId && e.kind === 'topic' && skipTopics.has(e.topicId)) continue
    if (e.ideaId && skipIdeas.has(e.ideaId)) continue
    for (const side of sides) {
      const score = similarity(side.words, e.words)
      if (score < NEAR_DUPLICATE) continue
      // One subject word against one: only an exact subject (a city, a product) counts,
      // which similarity already requires (1 / 1). Nothing extra to do.
      const better = !best || WEIGHT[e.kind] > WEIGHT[best.kind] || (WEIGHT[e.kind] === WEIGHT[best.kind] && score > best.score)
      if (better) best = { kind: e.kind, label: e.label, url: e.url, articleId: e.articleId, topicId: e.topicId, ideaId: e.ideaId, score: Math.round(score * 100) / 100, via: side.via }
    }
  }
  return best
}

/** Is this match on the site (a page, one of our articles, a query it ranks for)? */
export function isSiteMatch(m: OverlapMatch | null): m is OverlapMatch {
  return !!m && SITE_KINDS.includes(m.kind)
}

/**
 * Where "improve the existing page" goes: our own article opens in the article
 * editor; a page of the site opens the existing-content screen filtered to it; a
 * planned topic opens the strategy list. Only in-app paths, never an external URL.
 */
export function improveHref(m: Pick<OverlapMatch, 'kind' | 'articleId' | 'label' | 'url'>): string {
  if (m.articleId) return `/content/articles/${encodeURIComponent(m.articleId)}`
  if (m.kind === 'topic' || m.kind === 'idea') return '/content/strategy?view=list'
  // The existing-content screen searches a page's title and its path key (decoded,
  // lower case), so the page's own path finds exactly it; without a url, its title.
  const q = (m.url ? pathOf(m.url) : '') || m.label
  return `/content/existing?q=${encodeURIComponent(q.slice(0, 80))}`
}

function pathOf(url: string | null): string {
  const k = pageKey(url)
  const i = k.indexOf('/')
  return i >= 0 ? k.slice(i + 1) : k
}

/** The response shape every route returns for a match (no ids the merchant does not own). */
export function overlapPayload(m: OverlapMatch | null): null | { kind: OverlapKind; label: string; url: string | null; improveHref: string; score: number; onSite: boolean } {
  if (!m) return null
  return { kind: m.kind, label: m.label.slice(0, 200), url: m.url, improveHref: improveHref(m), score: m.score, onSite: isSiteMatch(m) }
}

/**
 * An AUTOMATIC path's use of the check: keep only the candidates whose subject is not
 * already on the site or planned. Earlier candidates of the same set count too, so a
 * batch never keeps two ideas on one subject. Order kept.
 */
export function skipOverlapping<T extends { title: string; primaryKeyword?: string | null }>(
  index: OverlapIndex,
  candidates: readonly T[],
  kinds: readonly OverlapKind[] = SITE_AND_PLAN_KINDS,
): T[] {
  const kept: T[] = []
  const batch = { entries: [] as Entry[], counts: index.counts }
  for (const c of candidates) {
    const candidate = { title: c.title, keyword: c.primaryKeyword ?? null }
    if (checkOverlap(index, candidate, { kinds })) continue
    if (checkOverlap(batch, candidate)) continue
    kept.push(c)
    for (const phrase of [c.primaryKeyword ?? '', mainPhrase(c.title)]) {
      const words = subjectWords(phrase)
      if (words.length) batch.entries.push({ kind: 'idea', label: c.title, url: null, articleId: null, topicId: null, ideaId: null, words })
    }
  }
  return kept
}
