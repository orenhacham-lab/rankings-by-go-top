/**
 * The seeding scan's keyword research, as the research tab shows it.
 *
 * Steps b2 and b3 of the scan keep what they found in keyword_research_cache, one
 * row per seed (the site's seed keywords, its home page, the whole domain, each
 * validated competitor), already filtered for relevance (lib/seed-scan/research.ts).
 * The tab reads those rows back, never Google Ads, and merges them here into one
 * list: one entry per keyword, the metrics of the newest row that has them, and
 * every seed that found it. The overview's figures are computed from that list.
 *
 * Pure: no React, no I/O. The route (lib/keyword-research/scan-route.ts) and the
 * screen both use it.
 */
import type { SeedResearchOrigin, SeedResearchRow } from '@/lib/seed-scan/research'
import { variantKey } from '@/lib/content/strategy/insights'

/**
 * Where a keyword of the research came from: one of the scan's seeds, or
 * `manual`, a research the project ran before (or besides) the scan — any row of
 * the project's keyword_research_cache that is not the scan's own. An older
 * project's research is data like any other: it is shown, never hidden.
 */
export type ScanOrigin = SeedResearchOrigin | 'manual'
/** The order origins are listed in, whatever order the rows came in. */
export const SCAN_ORIGINS: readonly ScanOrigin[] = ['seed_keywords', 'home_page', 'site', 'competitor', 'manual']
/** "From the research": what was found for the site itself (by the scan, or by a research the owner ran). */
export const RESEARCH_ORIGINS: readonly ScanOrigin[] = ['seed_keywords', 'home_page', 'site', 'manual']

export type Competition = 'LOW' | 'MEDIUM' | 'HIGH'

/** A keyword idea as Google Ads reported it (the shape of lib/google-ads/keyword-ideas.ts). */
export interface KeywordIdea {
  keyword: string
  avgMonthlySearches: number | null
  competition: Competition | null
  competitionIndex: number | null
  lowTopOfPageBid: number | null
  highTopOfPageBid: number | null
  currency: string
}

/** One keyword of the scan's research, merged across the seeds that found it. */
export interface ScanKeyword extends KeywordIdea {
  /** Every seed that found it, in SCAN_ORIGINS order. */
  origins: ScanOrigin[]
  /** The competitor domains whose research found it, sorted. */
  competitors: string[]
  /** It passes the engine's relevance filter today (researchKeywordIssue), decided on the server. */
  relevant: boolean
}

/** A keyword the project already tracks. `metrics` are what was stored when it was added. */
export interface TrackedKeyword {
  id: string
  keyword: string
  metrics: KeywordIdea | null
}

export interface ScanResearch {
  /** The market of the newest research row; rows of another market are left out. */
  market: { country: string; language: string } | null
  /** When the newest row of that market was fetched from Google Ads. */
  fetchedAt: string | null
  keywords: ScanKeyword[]
  /** More keywords were found than MAX_SCAN_KEYWORDS; the list keeps the most searched. */
  truncated: boolean
  tracked: TrackedKeyword[]
  /**
   * What the keywords come from, for the overview's source line: the scan's rows,
   * and the newest of the project's own research rows (null when there is none).
   * Absent from an older answer, which only ever carried the scan's rows.
   */
  sources?: { scan: boolean; manualAt: string | null }
}

export const SCAN_RESEARCH_ERROR_CODES = ['unauthorized', 'not_found', 'invalid_request', 'internal', 'unavailable'] as const
export type ScanResearchErrorCode = (typeof SCAN_RESEARCH_ERROR_CODES)[number]
export type ScanResearchResponse = ({ ok: true } & ScanResearch) | { ok: false; code: ScanResearchErrorCode }

/** The most keywords one answer carries (6 seeds keep at most 200 each). */
export const MAX_SCAN_KEYWORDS = 1_000

/** How keywords are compared: case, spacing and Unicode form do not make a different keyword. */
export function keywordKey(keyword: string): string {
  return keyword.normalize('NFC').trim().toLowerCase().replace(/\s+/g, ' ')
}

const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : null)
const competitionOf = (v: unknown): Competition | null => (v === 'LOW' || v === 'MEDIUM' || v === 'HIGH' ? v : null)

/** An idea with every field re-validated (the row came out of a jsonb column). */
export function readIdea(v: unknown): KeywordIdea | null {
  if (!v || typeof v !== 'object') return null
  const r = v as Record<string, unknown>
  const keyword = typeof r.keyword === 'string' ? r.keyword.trim().replace(/\s+/g, ' ').slice(0, 200) : ''
  if (!keyword) return null
  return {
    keyword,
    avgMonthlySearches: num(r.avgMonthlySearches),
    competition: competitionOf(r.competition),
    competitionIndex: num(r.competitionIndex),
    lowTopOfPageBid: num(r.lowTopOfPageBid),
    highTopOfPageBid: num(r.highTopOfPageBid),
    currency: typeof r.currency === 'string' ? r.currency.slice(0, 8) : '',
  }
}

/** Code-unit order: the same on every machine, whatever its locale data. */
export const byText = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0)

/** Most searched first; a keyword with no figure last; then by the keyword itself. */
export function compareByVolume(a: KeywordIdea, b: KeywordIdea): number {
  return (b.avgMonthlySearches ?? -1) - (a.avgMonthlySearches ?? -1) || byText(keywordKey(a.keyword), keywordKey(b.keyword))
}

const time = (iso: string) => {
  const t = Date.parse(iso)
  return Number.isFinite(t) ? t : -Infinity
}

type Entry = KeywordIdea & { origins: Set<ScanOrigin>; competitors: Set<string> }

/**
 * The rows of the scan's research → one list of keywords.
 *
 * Newest row first: its market is the research's market (a project that changed
 * country keeps its old rows for the cache's 30 days; they are not mixed in), and
 * its metrics win for a keyword several rows found, with a field it lacks taken
 * from an older row. Relevance is decided later, on the server.
 */
/** A research row: one of the scan's, or one of the project's own (origin `manual`). */
export type ResearchRow = Omit<SeedResearchRow, 'origin'> & { origin: ScanOrigin }

export function mergeSeedResearch(rows: readonly ResearchRow[], max = MAX_SCAN_KEYWORDS): Omit<ScanResearch, 'tracked' | 'keywords' | 'sources'> & { keywords: Omit<ScanKeyword, 'relevant'>[] } {
  const sorted = [...rows].sort((a, b) => time(b.fetchedAt) - time(a.fetchedAt))
  const newest = sorted[0]
  if (!newest) return { market: null, fetchedAt: null, keywords: [], truncated: false }
  const market = { country: newest.country, language: newest.language }
  const inMarket = sorted.filter((r) => r.country === market.country && r.language === market.language)

  const byKey = new Map<string, Entry>()
  for (const row of inMarket) {
    for (const raw of row.keywords) {
      const idea = readIdea(raw)
      if (!idea) continue
      const key = keywordKey(idea.keyword)
      let entry = byKey.get(key)
      if (!entry) {
        entry = { ...idea, origins: new Set(), competitors: new Set() }
        byKey.set(key, entry)
      } else {
        if (entry.avgMonthlySearches === null) entry.avgMonthlySearches = idea.avgMonthlySearches
        if (entry.competition === null) entry.competition = idea.competition
        if (entry.competitionIndex === null) entry.competitionIndex = idea.competitionIndex
        if (entry.lowTopOfPageBid === null) entry.lowTopOfPageBid = idea.lowTopOfPageBid
        if (entry.highTopOfPageBid === null) entry.highTopOfPageBid = idea.highTopOfPageBid
        if (!entry.currency) entry.currency = idea.currency
      }
      entry.origins.add(row.origin)
      if (row.origin === 'competitor' && row.value) entry.competitors.add(row.value)
    }
  }

  const merged = [...byKey.values()].sort(compareByVolume)
  return {
    market,
    fetchedAt: inMarket[0]?.fetchedAt ?? null,
    truncated: merged.length > max,
    keywords: merged.slice(0, max).map(({ origins, competitors, ...idea }) => ({
      ...idea,
      origins: SCAN_ORIGINS.filter((o) => origins.has(o)),
      competitors: [...competitors].sort(byText),
    })),
  }
}

/** What a click costs, as one figure: the middle of Google's range, or the one end it gave. */
export function clickPrice(k: Pick<KeywordIdea, 'lowTopOfPageBid' | 'highTopOfPageBid'>): number | null {
  const low = k.lowTopOfPageBid !== null && k.lowTopOfPageBid > 0 ? k.lowTopOfPageBid : null
  const high = k.highTopOfPageBid !== null && k.highTopOfPageBid > 0 ? k.highTopOfPageBid : null
  if (low !== null && high !== null) return (low + high) / 2
  return high ?? low
}

export interface AverageClickPrice {
  value: number
  currency: string
  /** How many keywords with a price in that currency it averages. */
  count: number
}

/**
 * The average click price of a list, in the currency most of its priced keywords
 * use (one market has one currency; anything else is left out rather than mixed).
 * Null when no keyword has a price.
 */
export function averageClickPrice(rows: readonly KeywordIdea[]): AverageClickPrice | null {
  const byCurrency = new Map<string, number[]>()
  for (const r of rows) {
    const price = clickPrice(r)
    if (price === null) continue
    const list = byCurrency.get(r.currency) ?? []
    list.push(price)
    byCurrency.set(r.currency, list)
  }
  let best: [string, number[]] | null = null
  for (const entry of [...byCurrency.entries()].sort(([a], [b]) => byText(a, b))) {
    if (!best || entry[1].length > best[1].length) best = entry
  }
  if (!best) return null
  const [currency, prices] = best
  const value = prices.reduce((s, p) => s + p, 0) / prices.length
  return { value: Math.round(value * 100) / 100, currency, count: prices.length }
}

export interface ResearchTotals {
  keywords: number
  /**
   * The monthly searches of the research, counting close variants once: Google Ads
   * reports the same demand for "נעלי ריצה נשים" and "נעלי ריצה לנשים", so adding both
   * inflated the figure. Keywords with the same words (any order, with or without a
   * Hebrew prefix letter) count once, at the largest figure among them.
   */
  monthlySearches: number
  /** The plain sum of every keyword's figure, before variants are counted once. */
  rawMonthlySearches: number
  averageCpc: AverageClickPrice | null
  /** Distinct competitor domains whose research found at least one keyword. */
  competitors: number
}

/** The overview's figures, from the list the table shows (already one row per keyword). */
export function researchTotals(rows: readonly (KeywordIdea & { competitors?: readonly string[] })[]): ResearchTotals {
  const competitors = new Set<string>()
  let rawMonthlySearches = 0
  const byVariant = new Map<string, number>()
  for (const r of rows) {
    const v = r.avgMonthlySearches ?? 0
    rawMonthlySearches += v
    const key = variantKey(r.keyword) || keywordKey(r.keyword)
    byVariant.set(key, Math.max(byVariant.get(key) ?? 0, v))
    for (const c of r.competitors ?? []) competitors.add(c)
  }
  const monthlySearches = [...byVariant.values()].reduce((s, v) => s + v, 0)
  return { keywords: rows.length, monthlySearches, rawMonthlySearches, averageCpc: averageClickPrice(rows), competitors: competitors.size }
}
