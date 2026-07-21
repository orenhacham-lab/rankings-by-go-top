/**
 * Stage E1 — pure diagnostics math over stored GSC query+page rows.
 * Display/observability only: NEVER creates recommendations, scores, or opportunities.
 */

export interface GscMetricRow { query: string; page: string; clicks: number; impressions: number; ctr: number; position: number }

export interface GscWindowSummary {
  clicks: number
  impressions: number
  /** total clicks / total impressions — NOT a mean of per-row CTR. */
  ctr: number
  /** impression-weighted average position — NOT a simple mean of per-row position. */
  avgPosition: number
  rowCount: number
}

export function summarizeWindow(rows: GscMetricRow[]): GscWindowSummary {
  let clicks = 0, impressions = 0, weightedPos = 0
  for (const r of rows) {
    clicks += r.clicks
    impressions += r.impressions
    weightedPos += r.position * r.impressions
  }
  return {
    clicks,
    impressions,
    ctr: impressions > 0 ? clicks / impressions : 0,
    avgPosition: impressions > 0 ? weightedPos / impressions : 0,
    rowCount: rows.length,
  }
}

/** Position opportunities: pure display filter — rows at position 4..20, impressions desc. */
export function positionOpportunities(rows: GscMetricRow[]): GscMetricRow[] {
  return rows
    .filter((r) => r.position >= 4 && r.position <= 20)
    .sort((a, b) => b.impressions - a.impressions || (a.query < b.query ? -1 : a.query > b.query ? 1 : 0))
}

export interface MultiPageQuery { query: string; distinctPageCount: number; totalClicks: number; totalImpressions: number; pages: string[] }

/** Queries appearing for MORE THAN ONE distinct page in the snapshot (diagnostic signal
 *  only — NOT confirmed cannibalization). Sorted by distinct-page count then impressions. */
export function multiPageQueries(rows: GscMetricRow[]): MultiPageQuery[] {
  const byQuery = new Map<string, { pages: Set<string>; clicks: number; impressions: number }>()
  for (const r of rows) {
    const g = byQuery.get(r.query) ?? { pages: new Set<string>(), clicks: 0, impressions: 0 }
    g.pages.add(r.page)
    g.clicks += r.clicks
    g.impressions += r.impressions
    byQuery.set(r.query, g)
  }
  const out: MultiPageQuery[] = []
  for (const [query, g] of byQuery) {
    if (g.pages.size > 1) out.push({ query, distinctPageCount: g.pages.size, totalClicks: g.clicks, totalImpressions: g.impressions, pages: Array.from(g.pages) })
  }
  return out.sort((a, b) => b.distinctPageCount - a.distinctPageCount || b.totalImpressions - a.totalImpressions || (a.query < b.query ? -1 : 1))
}
