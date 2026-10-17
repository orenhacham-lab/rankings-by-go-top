/**
 * Search Console figures for the screens that show them: the dashboard's top pages,
 * each keyword's clicks and impressions, and the trend of the 28-day totals across
 * syncs. Pure aggregation over what the metrics route already reads; no I/O here.
 *
 * Two rules carried over from the rest of the GSC code:
 *  - Totals come ONLY from the authoritative property summary of a run, never from
 *    summing its query+page rows (anonymised queries are not in those rows).
 *  - A keyword is matched to Search Console queries with the same normalization the
 *    opportunity engine uses (normalizeQuery), so "Running-Shoes" and "running shoes"
 *    are one search, and nothing looser than that.
 */
import { normalizeQuery } from './opportunities/normalize'

// ── Top pages ───────────────────────────────────────────────────────────────

export interface PageClicksRow { page: string; clicks: number }
export interface TopPage { page: string; clicks: number }

/** Pages ranked by the clicks Google sent them. Pages with no clicks are not "top". */
export function topPagesByClicks(rows: PageClicksRow[], limit = 5): TopPage[] {
  const byPage = new Map<string, number>()
  for (const r of rows) {
    const clicks = Number(r.clicks) || 0
    if (!r.page || clicks <= 0) continue
    byPage.set(r.page, (byPage.get(r.page) ?? 0) + clicks)
  }
  return [...byPage.entries()]
    .map(([page, clicks]) => ({ page, clicks }))
    .sort((a, b) => b.clicks - a.clicks || (a.page < b.page ? -1 : a.page > b.page ? 1 : 0))
    .slice(0, Math.max(0, limit))
}

// ── Clicks and impressions per keyword ──────────────────────────────────────

export interface QueryFiguresRow { query: string; clicks: number; impressions: number }
export interface KeywordTarget { id: string; keyword: string }
export interface KeywordFigures { clicks: number; impressions: number }

/**
 * Each tracked keyword's clicks and impressions: the sum over every Search Console
 * row (every page) whose query normalizes to the keyword. A keyword with no such row
 * is absent from the result, which is not the same as zero: Google reports nothing
 * for it, so the screen says that instead of printing a 0.
 */
export function keywordFigures(targets: KeywordTarget[], rows: QueryFiguresRow[]): Record<string, KeywordFigures> {
  const idsByKey = new Map<string, string[]>()
  for (const t of targets) {
    const key = normalizeQuery(t.keyword)
    if (!key) continue
    const ids = idsByKey.get(key)
    if (ids) ids.push(t.id)
    else idsByKey.set(key, [t.id])
  }
  const sums = new Map<string, KeywordFigures>()
  for (const r of rows) {
    const key = normalizeQuery(r.query)
    if (!idsByKey.has(key)) continue
    const sum = sums.get(key) ?? { clicks: 0, impressions: 0 }
    sum.clicks += Number(r.clicks) || 0
    sum.impressions += Number(r.impressions) || 0
    sums.set(key, sum)
  }
  const out: Record<string, KeywordFigures> = {}
  for (const [key, ids] of idsByKey) {
    const sum = sums.get(key)
    if (sum) for (const id of ids) out[id] = { clicks: sum.clicks, impressions: sum.impressions }
  }
  return out
}

// ── Trend of the 28-day totals across syncs ─────────────────────────────────

export interface RunSummaryRow {
  start_date: string | null
  end_date: string | null
  started_at: string
  summary_total_clicks: number | null
  summary_total_impressions: number | null
  summary_average_position: number | null
  summary_aggregation_type: string | null
}

export interface TrendPoint {
  startDate: string
  endDate: string
  clicks: number
  impressions: number
  position: number | null
}

/** How many syncs the trend shows (weekly syncs: about half a year). */
export const TREND_MAX_POINTS = 26

/**
 * One point per 28-day window, oldest first. Runs without the authoritative summary
 * are left out rather than estimated. Two syncs of the same window (a manual sync on
 * the day of the automatic one) are one point: the later sync wins.
 */
export function trendPoints(runs: RunSummaryRow[], max = TREND_MAX_POINTS): TrendPoint[] {
  const byEnd = new Map<string, { run: RunSummaryRow }>()
  for (const run of runs) {
    if (!run.end_date || !run.start_date) continue
    if (run.summary_total_clicks === null || run.summary_aggregation_type !== 'byProperty') continue
    const seen = byEnd.get(run.end_date)
    if (!seen || run.started_at > seen.run.started_at) byEnd.set(run.end_date, { run })
  }
  return [...byEnd.values()]
    .map(({ run }) => ({
      startDate: run.start_date as string,
      endDate: run.end_date as string,
      clicks: Number(run.summary_total_clicks),
      impressions: Number(run.summary_total_impressions ?? 0),
      position: run.summary_average_position === null ? null : Number(run.summary_average_position),
    }))
    .sort((a, b) => (a.endDate < b.endDate ? -1 : a.endDate > b.endDate ? 1 : 0))
    .slice(-Math.max(1, max))
}

/**
 * The window to compare the latest one with: the newest window that ENDS BEFORE the
 * latest one STARTS, i.e. the previous 28 days. Consecutive weekly syncs overlap by
 * three weeks, and a change against an overlapping window would mostly compare a
 * period with itself. Null until such a window has been synced.
 */
export function previousPeriod(points: TrendPoint[]): TrendPoint | null {
  const latest = points[points.length - 1]
  if (!latest) return null
  for (let i = points.length - 2; i >= 0; i--) {
    if (points[i].endDate < latest.startDate) return points[i]
  }
  return null
}

// ── The change against the previous period ──────────────────────────────────

export type PerformanceMetric = 'clicks' | 'impressions' | 'position'

/** 'up' is always better, whichever way the number moved. */
export interface PeriodDelta { size: number; direction: 'up' | 'down' | 'flat'; percent: boolean }

/**
 * The change of one figure against the previous period, as a direction (better or
 * worse) and a size. Clicks and impressions change in percent; a change from nothing
 * has no percent, so it is not shown. The average position changes in places, and a
 * LOWER position is better: 12.4 → 9.1 is an improvement of 3.3.
 */
export function performanceDelta(metric: PerformanceMetric, current: number | null, previous: number | null): PeriodDelta | null {
  if (current === null || previous === null) return null
  if (metric === 'position') {
    const change = previous - current
    return { size: Math.abs(change), direction: change > 0.05 ? 'up' : change < -0.05 ? 'down' : 'flat', percent: false }
  }
  if (previous <= 0) return null
  const pct = ((current - previous) / previous) * 100
  return { size: Math.abs(pct), direction: pct > 0.5 ? 'up' : pct < -0.5 ? 'down' : 'flat', percent: true }
}

// ── Google's 28-day average per keyword, and the queries not tracked yet ────

export interface QueryPositionRow { query: string; clicks: number; impressions: number; position: number }

/**
 * Google's own figures for a query over the latest 28-day sync: clicks and
 * impressions summed over every page, and the average position weighted by
 * impressions (Search Console reports one average per query+page row; a page
 * seen 900 times weighs more than one seen twice). One decimal, like Google.
 * A secondary layer beside our own scan, which stays the position of record.
 */
export interface GoogleAverage { clicks: number; impressions: number; position: number | null }

interface QuerySum { raw: Map<string, number>; clicks: number; impressions: number; posSum: number }

/** Every row, grouped by the engine's normalization of its query. */
function sumByQuery(rows: readonly QueryPositionRow[]): Map<string, QuerySum> {
  const by = new Map<string, QuerySum>()
  for (const r of rows) {
    const key = normalizeQuery(r.query)
    if (!key) continue
    const impressions = Math.max(0, Number(r.impressions) || 0)
    let g = by.get(key)
    if (!g) { g = { raw: new Map(), clicks: 0, impressions: 0, posSum: 0 }; by.set(key, g) }
    g.raw.set(r.query, (g.raw.get(r.query) ?? 0) + impressions)
    g.clicks += Math.max(0, Number(r.clicks) || 0)
    g.impressions += impressions
    g.posSum += (Number(r.position) || 0) * impressions
  }
  return by
}

function averageOf(g: QuerySum): GoogleAverage {
  return {
    clicks: g.clicks,
    impressions: g.impressions,
    position: g.impressions > 0 && g.posSum > 0 ? Math.round((g.posSum / g.impressions) * 10) / 10 : null,
  }
}

/**
 * Each tracked keyword's 28-day Google average, matched exactly like keywordFigures
 * (the engine's normalization, nothing looser). A keyword Google reports nothing for
 * is absent, which the screen says in words, never as a 0.
 */
export function keywordAverages(targets: KeywordTarget[], rows: readonly QueryPositionRow[]): Record<string, GoogleAverage> {
  const sums = sumByQuery(rows)
  const out: Record<string, GoogleAverage> = {}
  for (const t of targets) {
    const g = sums.get(normalizeQuery(t.keyword))
    if (g) out[t.id] = averageOf(g)
  }
  return out
}

export interface UntrackedQuery extends GoogleAverage { query: string }

/** How many untracked queries the Keywords tab is handed (most impressions first). */
export const UNTRACKED_LIMIT = 25

/**
 * The queries Google already shows the site for that no tracked keyword matches, most
 * impressions first (then clicks, then the query). Each is named by its most seen
 * spelling. `total` counts all of them; `queries` counts every distinct query.
 */
export function untrackedQueries(
  targets: KeywordTarget[],
  rows: readonly QueryPositionRow[],
  limit = UNTRACKED_LIMIT,
): { rows: UntrackedQuery[]; total: number; queries: number } {
  const tracked = new Set(targets.map((t) => normalizeQuery(t.keyword)).filter(Boolean))
  const sums = sumByQuery(rows)
  const all: UntrackedQuery[] = []
  for (const [key, g] of sums) {
    if (tracked.has(key) || g.impressions <= 0) continue
    const query = [...g.raw.entries()].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))[0][0].trim()
    all.push({ query, ...averageOf(g) })
  }
  all.sort((a, b) => b.impressions - a.impressions || b.clicks - a.clicks || (a.query < b.query ? -1 : a.query > b.query ? 1 : 0))
  return { rows: all.slice(0, Math.max(0, limit)), total: all.length, queries: sums.size }
}
