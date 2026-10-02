/**
 * "Where do I stand against my competitors": the research tab's competitive view,
 * built from two sources that are never mixed into one number, each figure keeping
 * the label of the source it came from:
 *
 *   OUR CHECK (source 'scan')        the rank scan's latest check of a tracked keyword:
 *                                    the exact position on that day, in the project's
 *                                    location and device, and where each tracked
 *                                    competitor stood on the SAME result page
 *                                    (keyword_competitor_positions, matched on the check).
 *   SEARCH CONSOLE (source 'gsc')    Google's own figures for every query the site
 *                                    already appears for: the impression-weighted
 *                                    average position over the latest 28-day sync, its
 *                                    clicks and impressions, and which page showed.
 *
 * What is computed here:
 *   share      each site's share of the estimated clicks on the compared keywords:
 *              monthly searches × the average click-through rate of the position it
 *              holds (CTR_BY_POSITION), divided by the total over the project and its
 *              competitors. Only keywords whose latest check recorded the competitors
 *              count, so every site is measured on the same keywords.
 *   battles    per keyword: who is ahead (the project, a competitor, nobody in the top 20).
 *   mapping    per keyword: the page that shows for it, and two flags: no page of the
 *              site shows for it, or two pages split its impressions (they compete).
 *   rankings   tracked keywords and Search Console queries merged by normalized text,
 *              one row per keyword whatever the number of sources.
 *
 * Pure: no React, no I/O, so the route, the screen and the QA suite compute it alike.
 */
import {
  buildCompetitorComparison,
  type CompetitorPositionRow, type KeywordCompetitorCell, type OwnCheck, type TrackedCompetitor,
} from '@/lib/competitors/comparison'
import { COMPETITOR_TOP_N } from '@/lib/scanner/competitor-positions'
import { normalizeQuery } from '@/lib/gsc/opportunities/normalize'

// ── The click-through curve ─────────────────────────────────────────────────

/**
 * The share of searchers who click the organic result at each position, 1 to 20
 * (a rounded industry average of desktop and mobile studies; page 2 is flat and low).
 * An estimate, and said so on screen: only the ratio between sites matters here.
 */
export const CTR_BY_POSITION: readonly number[] = [
  0.28, 0.15, 0.11, 0.08, 0.065, 0.05, 0.04, 0.032, 0.027, 0.023,
  0.012, 0.011, 0.01, 0.009, 0.008, 0.007, 0.006, 0.006, 0.005, 0.005,
]

/** The click-through rate of a position; 0 outside the top 20 (or when not ranked). */
export function ctrAt(position: number | null | undefined): number {
  if (position == null || !Number.isInteger(position) || position < 1 || position > COMPETITOR_TOP_N) return 0
  return CTR_BY_POSITION[position - 1] ?? 0
}

/** The dedupe key of a keyword or a Search Console query: the opportunity engine's normalization. */
export const rankingKey = (keyword: string): string => normalizeQuery(keyword)

// ── Inputs ──────────────────────────────────────────────────────────────────

/** A tracked keyword on Google organic results, with its latest check. */
export interface CompetitiveTarget {
  id: string
  keyword: string
  /** Monthly searches (Google Ads), null when unknown. */
  volume: number | null
  check: { checkedAt: string; found: boolean; position: number | null; url: string | null } | null
}

/** One Search Console row of the latest 28-day sync. */
export interface GscQueryPageRow {
  query: string
  page: string
  clicks: number
  impressions: number
  position: number
}

export interface CompetitiveInput {
  ownDomain: string | null
  targets: readonly CompetitiveTarget[]
  competitors: readonly TrackedCompetitor[]
  rows: readonly CompetitorPositionRow[]
  /** null: Search Console has no data for the project (not connected, or never synced). */
  gsc: readonly GscQueryPageRow[] | null
}

// ── Outputs ─────────────────────────────────────────────────────────────────

export interface ShareSite {
  domain: string
  name: string
  own: boolean
  /** Estimated monthly clicks on the compared keywords. */
  clicks: number
  /** 0..1 of the total over the project and its competitors. */
  share: number
  /** Average position over the compared keywords it ranks on (top 20); null when on none. */
  avgPosition: number | null
  /** Compared keywords it ranks on (top 20). */
  ranked: number
}

export interface CompetitiveShare {
  /** Keywords every site is measured on: their latest check recorded the competitors. */
  keywords: number
  /** Of those, the ones with a monthly search volume (the others weigh nothing). */
  weighted: number
  /** The project first, then competitors by share. */
  sites: ShareSite[]
  /** The check the figures come from (the latest of the compared keywords). */
  checkedAt: string | null
}

export type BattleOutcome = 'win' | 'loss' | 'tie' | 'none'

export interface Battle {
  targetId: string
  keyword: string
  volume: number | null
  own: number | null
  /** Every tracked competitor recorded in that check, in the tracked order. */
  competitors: { domain: string; position: number | null }[]
  /** The best-placed competitor, when one is in the top 20. */
  best: { domain: string; position: number } | null
  outcome: BattleOutcome
  checkedAt: string
}

export interface CompetitorRecord {
  domain: string
  name: string
  /** Keywords where the project ranks above it. */
  wins: number
  /** Keywords where it ranks above the project. */
  losses: number
  compared: number
}

export type MappingFlag = 'ok' | 'no_page' | 'competing' | 'unknown'

export interface MappedPage {
  url: string
  impressions: number
  clicks: number
  /** 0..1 of the query's impressions. */
  share: number
}

export interface MappingRow {
  key: string
  keyword: string
  tracked: boolean
  /** Where the page comes from: Search Console's query → page, or our check's ranking URL. */
  source: 'gsc' | 'scan' | null
  /** The page that shows for the keyword (most impressions first). */
  pages: MappedPage[]
  flag: MappingFlag
  /** For 'no_page': Search Console's data backs it too (not only our top-20 check). */
  confirmedByGsc: boolean
}

export interface RankingRow {
  key: string
  keyword: string
  /** Our check: exact position on a day (null position: not in the top 20). */
  scan: { targetId: string; position: number | null; checkedAt: string | null } | null
  /** Search Console: impression-weighted average position over 28 days. */
  gsc: { position: number; clicks: number; impressions: number } | null
}

export type CompetitorsState = 'none' | 'not_recorded' | 'ready'

export interface CompetitiveModel {
  competitorsState: CompetitorsState
  share: CompetitiveShare | null
  battles: Battle[]
  records: CompetitorRecord[]
  counts: { wins: number; losses: number; ties: number; none: number }
  mapping: MappingRow[]
  mappingCounts: { all: number; noPage: number; competing: number }
  rankings: RankingRow[]
  rankingCounts: { all: number; tracked: number; gscOnly: number }
}

// ── Tunables ────────────────────────────────────────────────────────────────

/** Two pages "compete" for a query when each takes at least this share of its impressions. */
export const COMPETING_MIN_SHARE = 0.15
/** …and the query has at least this many impressions (below that, one stray view decides). */
export const COMPETING_MIN_IMPRESSIONS = 20
/** Search Console queries merged into the rankings / mapping (most impressions first). */
export const GSC_QUERIES_MAX = 500

// ── Helpers ─────────────────────────────────────────────────────────────────

const round1 = (n: number) => Math.round(n * 10) / 10

function validPosition(p: number | null | undefined): number | null {
  return p != null && Number.isInteger(p) && p >= 1 && p <= COMPETITOR_TOP_N ? p : null
}

const latest = (a: string | null, b: string | null) => (!a ? b : !b ? a : Date.parse(b) > Date.parse(a) ? b : a)

type GscQuery = { key: string; keyword: string; clicks: number; impressions: number; position: number; pages: MappedPage[] }

/** Search Console rows → one entry per normalized query: sums, weighted position, pages. */
export function gscQueries(rows: readonly GscQueryPageRow[]): GscQuery[] {
  const by = new Map<string, { raw: Map<string, number>; clicks: number; impressions: number; posSum: number; pages: Map<string, { impressions: number; clicks: number }> }>()
  for (const r of rows) {
    const key = rankingKey(r.query)
    if (!key) continue
    const impressions = Math.max(0, Number(r.impressions) || 0)
    const clicks = Math.max(0, Number(r.clicks) || 0)
    const position = Number(r.position) || 0
    let g = by.get(key)
    if (!g) { g = { raw: new Map(), clicks: 0, impressions: 0, posSum: 0, pages: new Map() }; by.set(key, g) }
    g.raw.set(r.query, (g.raw.get(r.query) ?? 0) + impressions)
    g.clicks += clicks
    g.impressions += impressions
    g.posSum += position * impressions
    const p = g.pages.get(r.page) ?? { impressions: 0, clicks: 0 }
    p.impressions += impressions
    p.clicks += clicks
    g.pages.set(r.page, p)
  }
  const out: GscQuery[] = []
  for (const [key, g] of by) {
    const keyword = [...g.raw.entries()].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1))[0][0]
    const pages = [...g.pages.entries()]
      .map(([url, p]) => ({ url, impressions: p.impressions, clicks: p.clicks, share: g.impressions > 0 ? p.impressions / g.impressions : 0 }))
      .sort((a, b) => b.impressions - a.impressions || b.clicks - a.clicks || (a.url < b.url ? -1 : 1))
    out.push({ key, keyword, clicks: g.clicks, impressions: g.impressions, position: g.impressions > 0 ? round1(g.posSum / g.impressions) : 0, pages })
  }
  return out.sort((a, b) => b.impressions - a.impressions || b.clicks - a.clicks || (a.key < b.key ? -1 : 1))
}

/** Two or more pages each take a real part of the query's impressions. */
export function isCompeting(q: Pick<GscQuery, 'impressions' | 'pages'>): boolean {
  if (q.impressions < COMPETING_MIN_IMPRESSIONS) return false
  return q.pages.filter((p) => p.share >= COMPETING_MIN_SHARE).length >= 2
}

// ── The model ───────────────────────────────────────────────────────────────

export function buildCompetitiveModel(input: CompetitiveInput): CompetitiveModel {
  // One tracked target per keyword: the most recently checked one.
  const byKey = new Map<string, CompetitiveTarget>()
  for (const t of input.targets) {
    const key = rankingKey(t.keyword)
    if (!key) continue
    const prev = byKey.get(key)
    if (!prev || (t.check && (!prev.check || Date.parse(t.check.checkedAt) > Date.parse(prev.check.checkedAt)))) byKey.set(key, t)
  }
  const targets = [...byKey.values()]

  // ── Competitors: the same check, never another day's page ────────────────
  const checks: OwnCheck[] = targets.map((t) => ({
    targetId: t.id, engine: 'google_search', checkedAt: t.check?.checkedAt ?? null,
    found: !!t.check?.found, position: t.check?.found ? validPosition(t.check.position) : null,
  }))
  const comparison = buildCompetitorComparison({ competitors: input.competitors, checks, rows: input.rows })
  const battles: Battle[] = []
  const records = new Map<string, CompetitorRecord>(input.competitors.map((c) => [c.domain, { domain: c.domain, name: c.name, wins: 0, losses: 0, compared: 0 }]))
  const counts = { wins: 0, losses: 0, ties: 0, none: 0 }
  for (const t of targets) {
    const cell: KeywordCompetitorCell | undefined = comparison.cells[t.id]
    if (!cell || (cell.kind !== 'best' && cell.kind !== 'none_in_top20') || !t.check) continue
    const own = t.check.found ? validPosition(t.check.position) : null
    const best = cell.kind === 'best' && cell.best.position != null ? { domain: cell.best.domain, position: cell.best.position } : null
    const outcome: BattleOutcome = own == null
      ? (best ? 'loss' : 'none')
      : !best || best.position > own ? 'win'
        : best.position < own ? 'loss' : 'tie'
    counts[outcome === 'win' ? 'wins' : outcome === 'loss' ? 'losses' : outcome === 'tie' ? 'ties' : 'none']++
    for (const e of cell.entries) {
      const r = records.get(e.domain)
      if (!r) continue
      r.compared++
      if (e.relation === 'above') r.losses++
      else if (own != null && (e.relation === 'below' || e.relation === 'unknown')) r.wins++
    }
    battles.push({
      targetId: t.id, keyword: t.keyword, volume: t.volume, own,
      competitors: cell.entries.map((e) => ({ domain: e.domain, position: e.position })),
      best, outcome, checkedAt: t.check.checkedAt,
    })
  }
  const order: Record<BattleOutcome, number> = { loss: 0, tie: 1, win: 2, none: 3 }
  battles.sort((a, b) => order[a.outcome] - order[b.outcome] || (b.volume ?? -1) - (a.volume ?? -1) || (a.keyword < b.keyword ? -1 : 1))

  const competitorsState: CompetitorsState = input.competitors.length === 0 ? 'none' : battles.length === 0 ? 'not_recorded' : 'ready'

  // ── Share of visibility ───────────────────────────────────────────────────
  let share: CompetitiveShare | null = null
  if (competitorsState === 'ready') {
    const sites = new Map<string, ShareSite & { posSum: number }>()
    const ownName = input.ownDomain ?? ''
    sites.set('', { domain: ownName, name: ownName, own: true, clicks: 0, share: 0, avgPosition: null, ranked: 0, posSum: 0 })
    for (const c of input.competitors) sites.set(c.domain, { domain: c.domain, name: c.name, own: false, clicks: 0, share: 0, avgPosition: null, ranked: 0, posSum: 0 })
    let weighted = 0
    let checkedAt: string | null = null
    for (const b of battles) {
      checkedAt = latest(checkedAt, b.checkedAt)
      const volume = b.volume != null && b.volume > 0 ? b.volume : 0
      if (volume > 0) weighted++
      const place = (s: ShareSite & { posSum: number } | undefined, position: number | null) => {
        if (!s || position == null) return
        s.ranked++
        s.posSum += position
        s.clicks += volume * ctrAt(position)
      }
      place(sites.get(''), b.own)
      for (const c of b.competitors) place(sites.get(c.domain), c.position)
    }
    const total = [...sites.values()].reduce((n, s) => n + s.clicks, 0)
    const list = [...sites.values()].map(({ posSum, ...s }) => ({
      ...s,
      clicks: Math.round(s.clicks),
      share: total > 0 ? s.clicks / total : 0,
      avgPosition: s.ranked > 0 ? round1(posSum / s.ranked) : null,
    }))
    const [ownSite, ...rest] = list
    rest.sort((a, b) => b.share - a.share || (a.avgPosition ?? 99) - (b.avgPosition ?? 99) || (a.domain < b.domain ? -1 : 1))
    share = { keywords: battles.length, weighted, sites: [ownSite, ...rest], checkedAt }
  }

  // ── Rankings: tracked ∪ Search Console, one row per keyword ──────────────
  const queries = input.gsc ? gscQueries(input.gsc) : []
  const queryByKey = new Map(queries.map((q) => [q.key, q]))
  const rankings: RankingRow[] = []
  const seen = new Set<string>()
  for (const t of targets) {
    const key = rankingKey(t.keyword)
    seen.add(key)
    const q = queryByKey.get(key)
    rankings.push({
      key, keyword: t.keyword,
      scan: { targetId: t.id, position: t.check?.found ? validPosition(t.check.position) : null, checkedAt: t.check?.checkedAt ?? null },
      gsc: q ? { position: q.position, clicks: q.clicks, impressions: q.impressions } : null,
    })
  }
  let gscOnly = 0
  for (const q of queries) {
    if (seen.has(q.key) || gscOnly >= GSC_QUERIES_MAX) continue
    seen.add(q.key)
    gscOnly++
    rankings.push({ key: q.key, keyword: q.keyword, scan: null, gsc: { position: q.position, clicks: q.clicks, impressions: q.impressions } })
  }
  rankings.sort((a, b) =>
    (b.gsc?.impressions ?? -1) - (a.gsc?.impressions ?? -1)
    || (a.scan?.position ?? 99) - (b.scan?.position ?? 99)
    || (a.keyword < b.keyword ? -1 : 1))

  // ── Mapping: the page behind each keyword ────────────────────────────────
  const mapping: MappingRow[] = rankings.map((r) => {
    const q = queryByKey.get(r.key)
    const tracked = r.scan !== null
    const target = tracked ? byKey.get(r.key) : undefined
    if (q && q.pages.length > 0) {
      return { key: r.key, keyword: r.keyword, tracked, source: 'gsc', pages: q.pages.slice(0, 3), flag: isCompeting(q) ? 'competing' : 'ok', confirmedByGsc: false }
    }
    const url = target?.check?.found ? target.check.url : null
    if (url) return { key: r.key, keyword: r.keyword, tracked, source: 'scan', pages: [{ url, impressions: 0, clicks: 0, share: 1 }], flag: 'ok', confirmedByGsc: false }
    // "No page" only on evidence: our check did not find the site in the top 20. When
    // Search Console has data and never showed one of its pages for the keyword either,
    // the screen can say that no page shows at all; otherwise only "not in the top 20".
    const checkedMissing = !!target?.check && !target.check.found
    return { key: r.key, keyword: r.keyword, tracked, source: null, pages: [], flag: checkedMissing ? 'no_page' : 'unknown', confirmedByGsc: checkedMissing && input.gsc !== null }
  })
  const order2: Record<MappingFlag, number> = { competing: 0, no_page: 1, ok: 2, unknown: 3 }
  mapping.sort((a, b) => order2[a.flag] - order2[b.flag])

  return {
    competitorsState,
    share,
    battles,
    records: [...records.values()].sort((a, b) => b.losses - a.losses || b.compared - a.compared || (a.domain < b.domain ? -1 : 1)),
    counts,
    mapping,
    mappingCounts: {
      all: mapping.length,
      noPage: mapping.filter((m) => m.flag === 'no_page').length,
      competing: mapping.filter((m) => m.flag === 'competing').length,
    },
    rankings,
    rankingCounts: { all: rankings.length, tracked: targets.length, gscOnly },
  }
}
