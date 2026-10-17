/**
 * Widget 14's rows: for each competitor, where it ranks on the project's own
 * keywords, from the positions the rank scan recorded (W10). Pure; it only
 * re-reads the comparison the keywords tab builds, so the two screens cannot
 * disagree about a competitor.
 *
 * `top10` counts the keywords whose latest check recorded the competitor on
 * page one; `best` is its best position among them. A competitor outside the
 * top 20 of a check has no position there, and is never counted as ranking.
 */
import type { CompetitorComparison, TrackedCompetitor } from '@/lib/competitors/comparison'

export interface CompetitorRow {
  domain: string
  name: string
  /** Keywords on which it ranks above the project. */
  ahead: number
  /** Keywords whose latest check recorded it. */
  compared: number
  /** Of those, how many had it in positions 1-10. */
  top10: number
  best: number | null
}

export function competitorRows(competitors: readonly TrackedCompetitor[], comparison: CompetitorComparison | null): CompetitorRow[] {
  const rows = new Map<string, CompetitorRow>(
    competitors.map((c) => [c.domain, { domain: c.domain, name: c.name, ahead: 0, compared: 0, top10: 0, best: null }]),
  )
  if (comparison) {
    for (const s of comparison.standings) {
      const row = rows.get(s.domain)
      if (row) { row.ahead = s.ahead; row.compared = s.compared }
    }
    for (const cell of Object.values(comparison.cells)) {
      if (cell.kind !== 'best' && cell.kind !== 'none_in_top20') continue
      for (const e of cell.entries) {
        const row = rows.get(e.domain)
        if (!row || e.position == null) continue
        if (e.position <= 10) row.top10++
        row.best = row.best == null ? e.position : Math.min(row.best, e.position)
      }
    }
  }
  // Most keywords ahead of you first, as the keywords tab orders them.
  return [...rows.values()].sort((a, b) => b.ahead - a.ahead || b.compared - a.compared)
}
