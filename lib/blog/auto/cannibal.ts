/**
 * WHERE OUR OWN PAGES COMPETE WITH EACH OTHER FOR THE SAME QUERY.
 *
 * `lib/blog/auto/outcomes.ts` judges one article at a time, and that view
 * cannot see this: a query where EIGHT of our pages show up and none of them
 * wins. Measured on the 21 Nov 2026 reading of our own property (the 90-day
 * window synced 15 Nov, 2,604 rows):
 *
 *   "בדיקת מיקומים בגוגל"      1,377 impressions over 8 of our pages
 *   "בדיקת דירוג בגוגל"          557 over 5
 *   "בדיקת מיקומים"              508 over 7
 *   "כלי לבדיקת מיקומים בגוגל"   398 over 7
 *   "בדיקת מיקום בגוגל"          346 over 5
 *   "תוכנה לבדיקת מיקומים"       179 over 6
 *
 * And it is not only articles against articles. On "בדיקת מיקום בגוגל" the
 * page closest to earning a click is `/features/google-maps-rank-tracking` at
 * 19.6 — a page that sells the product — and four other pages of ours sit on
 * the same query behind it. On the Italian "monitoraggio della posizione di
 * google" our two feature pages are at 9.4 and 12.4 against each other, both
 * nearly on page one.
 *
 * THE OUTPUT IS A VERDICT PER PAGE, NOT A SCORE. One page should own the
 * query; the rest are told what to do, and what to do depends on what kind of
 * page it is:
 *
 *   keep         the owner. Everything else points at it.
 *   merge        another ARTICLE on the owner's subject. An article can be
 *                merged into the owner or de-optimised for the query; that is
 *                a content decision with no revenue attached.
 *   distinguish  another COMMERCIAL page. Two pages that sell must not be
 *                merged or redirected on the strength of a query report, so
 *                this verdict asks for them to be told apart, never folded.
 *   noise        a page that cannot own a commercial query and cannot be
 *                rewritten into one: the article index, /login, a dashboard
 *                route. Worth seeing, never worth an edit.
 *
 * WHO OWNS IT. Not simply the best position. A blog article at 31 and a
 * feature page at 35 are not equal: only one of them has a signup button, and
 * handing the query to the article means ranking a page that cannot convert.
 * So a commercial page takes the query when it is within
 * `OWNER_PREFERENCE_MARGIN` of the best position, and otherwise the best
 * position takes it. On "תוכנה לבדיקת מיקומים" that leaves the article at 8.3
 * as the owner over the feature page at 17.0, which is right — a page already
 * on page one is not given away.
 *
 * Pure, and read-only by construction: rows in, verdicts out. Nothing here
 * writes, redirects or deletes anything.
 */
import type { OutcomeRow } from '@/lib/blog/auto/outcomes'
import { BLOG_AUTO_LOCALES, type BlogAutoLocale } from '@/lib/blog/auto/rotation'

/** Below this, a row's position is one or two impressions of noise. */
export const CANNIBAL_MIN_IMPRESSIONS = 10
/** A query carrying less than this is not worth anybody's afternoon. */
export const CANNIBAL_MIN_QUERY_IMPRESSIONS = 25
/** How far behind the best position a commercial page may be and still own the query. */
export const OWNER_PREFERENCE_MARGIN = 5

export type PageKind = 'home' | 'commercial' | 'article' | 'index' | 'other'
export type CannibalVerdict = 'keep' | 'merge' | 'distinguish' | 'noise'

export interface CannibalPage {
  page: string
  /** The path with the language prefix removed, which is what the kind is read from. */
  path: string
  locale: BlogAutoLocale
  kind: PageKind
  /** The article's slug, when it is an article. */
  slug: string | null
  impressions: number
  clicks: number
  position: number
  verdict: CannibalVerdict
}

export interface CannibalCluster {
  query: string
  impressions: number
  clicks: number
  /** The page that should own the query, or null when only noise ranks for it. */
  owner: CannibalPage | null
  /** Every one of our pages on the query, the owner first, then by impressions. */
  pages: CannibalPage[]
  /** The impressions sitting on pages that are not the owner. */
  split: number
  /** Why, in the words a report would print. */
  reason: string
}

const LOCALE_PREFIX = new RegExp(`^/(${BLOG_AUTO_LOCALES.join('|')})(?=/|$)`)

/** The path of a URL, with the language prefix taken off, and its locale. */
export function pagePath(page: string): { path: string; locale: BlogAutoLocale } {
  let path = page || ''
  try {
    path = new URL(page).pathname
  } catch {
    path = path.replace(/^https?:\/\/[^/]+/, '')
  }
  path = path.split(/[?#]/)[0] || '/'
  const match = LOCALE_PREFIX.exec(path)
  const locale = (match?.[1] as BlogAutoLocale | undefined) ?? 'he'
  if (match) path = path.slice(match[0].length) || '/'
  if (path.length > 1) path = path.replace(/\/+$/, '') || '/'
  return { path, locale }
}

/**
 * What kind of page this is. `/articles` is the index and `/articles/x` is an
 * article, so the article test needs the slug to be there — otherwise the
 * index would be read as an article and offered up as an owner.
 */
export function pageKind(path: string): { kind: PageKind; slug: string | null } {
  if (path === '/') return { kind: 'home', slug: null }
  const article = /^\/articles\/([^/]+)$/.exec(path)
  if (article) return { kind: 'article', slug: decodeURIComponent(article[1]!) }
  if (path === '/articles' || path.startsWith('/articles/page')) return { kind: 'index', slug: null }
  if (/^\/(features|compare|pricing|solutions)(\/|$)/.test(path)) return { kind: 'commercial', slug: null }
  return { kind: 'other', slug: null }
}

/** The kinds that can hold a query on purpose. An index or a login cannot. */
const CLAIMABLE: PageKind[] = ['home', 'commercial', 'article']
/** The kinds with a signup button on them. */
const SELLS: PageKind[] = ['home', 'commercial']

const describe = (p: CannibalPage): string => `${p.path} @${p.position.toFixed(1)} (${p.impressions})`

/**
 * One query's cluster, or null when there is nothing to act on: fewer than two
 * of our pages carry real impressions on it, or the query as a whole is too
 * small to matter.
 */
export function cannibalCluster(query: string, rows: OutcomeRow[]): CannibalCluster | null {
  const solid = rows.filter((r) => r && Number.isFinite(r.position) && (r.impressions || 0) >= CANNIBAL_MIN_IMPRESSIONS)
  if (solid.length < 2) return null
  const impressions = solid.reduce((n, r) => n + (r.impressions || 0), 0)
  if (impressions < CANNIBAL_MIN_QUERY_IMPRESSIONS) return null

  const pages: CannibalPage[] = solid.map((r) => {
    const { path, locale } = pagePath(r.page)
    const { kind, slug } = pageKind(path)
    return {
      page: r.page, path, locale, kind, slug,
      impressions: r.impressions || 0, clicks: r.clicks || 0, position: r.position,
      verdict: 'noise' as CannibalVerdict,
    }
  })

  const claimable = pages.filter((p) => CLAIMABLE.includes(p.kind))
  const best = claimable.length ? Math.min(...claimable.map((p) => p.position)) : null
  const bestSelling = claimable.filter((p) => SELLS.includes(p.kind)).sort((a, b) => a.position - b.position)[0]
  // A page that sells takes the query when it is close enough to the front.
  const owner = best === null
    ? null
    : bestSelling && bestSelling.position <= best + OWNER_PREFERENCE_MARGIN
      ? bestSelling
      : claimable.filter((p) => p.position === best).sort((a, b) => b.impressions - a.impressions)[0] ?? null

  for (const p of pages) {
    p.verdict = p === owner ? 'keep'
      : !CLAIMABLE.includes(p.kind) ? 'noise'
        : SELLS.includes(p.kind) ? 'distinguish' : 'merge'
  }

  const ordered = [
    ...(owner ? [owner] : []),
    ...pages.filter((p) => p !== owner).sort((a, b) => b.impressions - a.impressions),
  ]
  const split = ordered.filter((p) => p !== owner).reduce((n, p) => n + p.impressions, 0)

  const reason = owner
    ? `${ordered.length} of our pages on "${query}" (${impressions} impressions). ${describe(owner)} keeps it; ${split} impressions sit on ${ordered.length - 1} other page(s): ${ordered.filter((p) => p !== owner).map(describe).join(', ')}`
    : `${ordered.length} of our pages on "${query}" and not one of them is a page that can own it: ${ordered.map(describe).join(', ')}`

  return {
    query,
    impressions,
    clicks: solid.reduce((n, r) => n + (r.clicks || 0), 0),
    owner: owner ?? null,
    pages: ordered,
    split,
    reason,
  }
}

export function rowsByQuery(rows: OutcomeRow[]): Map<string, OutcomeRow[]> {
  const byQuery = new Map<string, OutcomeRow[]>()
  for (const row of rows) {
    const query = (row?.query ?? '').trim()
    if (!query) continue
    const list = byQuery.get(query)
    if (list) list.push(row)
    else byQuery.set(query, [row])
  }
  return byQuery
}

/**
 * Every query where our own pages compete, worst split first — the table the
 * weekly report prints. Sorted by the impressions NOT on the owner, because
 * that is the demand the split is actually costing.
 */
export function cannibalTable(rows: OutcomeRow[]): CannibalCluster[] {
  const out: CannibalCluster[] = []
  for (const [query, group] of rowsByQuery(rows)) {
    const cluster = cannibalCluster(query, group)
    if (cluster) out.push(cluster)
  }
  return out.sort((a, b) => b.split - a.split)
}

export interface CannibalSummary {
  queries: number
  /** Impressions on every page that is not its query's owner. */
  split: number
  /** How many pages carry each verdict, counted once per page per query. */
  verdicts: Record<CannibalVerdict, number>
  /** Queries whose only ranking pages are an index or a route nobody writes. */
  withoutOwner: number
}

export function cannibalSummary(clusters: CannibalCluster[]): CannibalSummary {
  const verdicts: Record<CannibalVerdict, number> = { keep: 0, merge: 0, distinguish: 0, noise: 0 }
  let split = 0
  let withoutOwner = 0
  for (const c of clusters) {
    split += c.split
    if (!c.owner) withoutOwner += 1
    for (const p of c.pages) verdicts[p.verdict] += 1
  }
  return { queries: clusters.length, split, verdicts, withoutOwner }
}

/**
 * The queries an existing page of ours already holds well enough that writing
 * a NEW article for them would only split the demand further.
 *
 * This is the list the keyword queue is meant to read. It is deliberately a
 * list of queries and nothing else — no decision, no filter — because the
 * blog publishes every day in every language and a check that can empty the
 * queue is not allowed to exist. What a caller does with it is ordering.
 */
export function ownedQueries(clusters: CannibalCluster[], maxPosition = 25): string[] {
  return clusters
    .filter((c) => c.owner && c.owner.position <= maxPosition)
    .map((c) => c.query)
}
