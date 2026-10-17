/**
 * The dashboard's ranking figures, from each keyword's latest check.
 *
 * Pure: the page reads the project's keywords and their checks (every read
 * filtered by the project) and hands the rows here, so the tiles, the
 * distribution, the lists of movers and the page-two opportunities all come
 * from ONE pass over the same rows and cannot disagree with each other.
 *
 * Only active keywords count, and only their newest check. A keyword that was
 * checked and not found (or found below 100) is "not found", never a position.
 */

export interface DashboardTarget {
  id: string
  keyword: string
  is_active: boolean
  engine_type: string
  avg_monthly_searches: number | null
}

export interface DashboardResult {
  tracking_target_id: string
  keyword: string
  engine_type: string
  position: number | null
  found: boolean | null
  change_value: number | null
  checked_at: string
}

export type BucketKey = 'top3' | 'top10' | 'top20' | 'top50' | 'top100' | 'notFound'
export const BUCKETS: readonly { key: BucketKey; min: number; max: number }[] = [
  { key: 'top3', min: 1, max: 3 },
  { key: 'top10', min: 4, max: 10 },
  { key: 'top20', min: 11, max: 20 },
  { key: 'top50', min: 21, max: 50 },
  { key: 'top100', min: 51, max: 100 },
  { key: 'notFound', min: Infinity, max: Infinity },
]

export interface RankingMove {
  targetId: string
  keyword: string
  engine: string
  position: number
  change: number
}

export interface PageTwoKeyword {
  targetId: string
  keyword: string
  position: number
  volume: number | null
}

export interface RankingsView {
  /** Active keywords. */
  tracked: number
  /** Active keywords with at least one check. */
  checked: number
  buckets: { key: BucketKey; count: number }[]
  /** Positions 1-10. */
  firstPage: number
  /** Mean position of the keywords found in the top 100; null when none is. */
  avgPosition: number | null
  /** How far that mean moved since each keyword's previous check; positive is better. */
  avgChange: number | null
  improvements: RankingMove[]
  drops: RankingMove[]
  /** The single largest move either way, for the opening card's news line. */
  biggestMove: RankingMove | null
  /** Keywords on pages two and three (11-30), most searched first. */
  pageTwo: PageTwoKeyword[]
}

export const MOVES_SHOWN = 5
export const PAGE_TWO_SHOWN = 5
export const PAGE_TWO_MIN = 11
export const PAGE_TWO_MAX = 30

const round1 = (n: number) => Math.round(n * 10) / 10

/** A position the scanner stands behind: found, and 1-100. */
function rankedPosition(r: DashboardResult): number | null {
  if (r.found === false || r.position === null || !Number.isFinite(r.position)) return null
  return r.position >= 1 && r.position <= 100 ? r.position : null
}

export function buildRankings(targets: readonly DashboardTarget[], results: readonly DashboardResult[]): RankingsView {
  const active = targets.filter((t) => t.is_active)
  const activeIds = new Set(active.map((t) => t.id))

  // Newest check per keyword: sort here rather than trust the read's order.
  const latest = new Map<string, DashboardResult>()
  const sorted = [...results].sort((a, b) => Date.parse(b.checked_at) - Date.parse(a.checked_at))
  for (const r of sorted) {
    if (activeIds.has(r.tracking_target_id) && !latest.has(r.tracking_target_id)) latest.set(r.tracking_target_id, r)
  }

  const counts = new Map<BucketKey, number>(BUCKETS.map((b) => [b.key, 0]))
  const positions: number[] = []
  const previous: { now: number; before: number }[] = []
  const moves: RankingMove[] = []
  const pageTwo: PageTwoKeyword[] = []
  const volumeOf = new Map(active.map((t) => [t.id, t.avg_monthly_searches]))

  for (const [targetId, r] of latest) {
    const pos = rankedPosition(r)
    const bucket = pos === null ? 'notFound' : BUCKETS.find((b) => pos >= b.min && pos <= b.max)!.key
    counts.set(bucket, (counts.get(bucket) ?? 0) + 1)
    if (pos === null) continue
    positions.push(pos)
    if (r.change_value !== null && Number.isFinite(r.change_value)) {
      const before = pos + r.change_value
      if (before >= 1 && before <= 100) previous.push({ now: pos, before })
      if (r.change_value !== 0) moves.push({ targetId, keyword: r.keyword, engine: r.engine_type, position: pos, change: r.change_value })
    }
    if (pos >= PAGE_TWO_MIN && pos <= PAGE_TWO_MAX) {
      const volume = volumeOf.get(targetId)
      pageTwo.push({ targetId, keyword: r.keyword, position: pos, volume: typeof volume === 'number' ? volume : null })
    }
  }

  const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null)
  const avgNow = mean(previous.map((p) => p.now))
  const avgBefore = mean(previous.map((p) => p.before))
  const improvements = moves.filter((m) => m.change > 0).sort((a, b) => b.change - a.change)
  const drops = moves.filter((m) => m.change < 0).sort((a, b) => a.change - b.change)
  const biggestMove = [...moves].sort((a, b) => Math.abs(b.change) - Math.abs(a.change) || b.change - a.change)[0] ?? null

  return {
    tracked: active.length,
    checked: latest.size,
    buckets: BUCKETS.map((b) => ({ key: b.key, count: counts.get(b.key) ?? 0 })),
    firstPage: positions.filter((p) => p <= 10).length,
    avgPosition: positions.length ? round1(mean(positions)!) : null,
    avgChange: avgNow !== null && avgBefore !== null ? round1(avgBefore - avgNow) : null,
    improvements: improvements.slice(0, MOVES_SHOWN),
    drops: drops.slice(0, MOVES_SHOWN),
    biggestMove,
    pageTwo: pageTwo
      .sort((a, b) => (b.volume ?? -1) - (a.volume ?? -1) || a.position - b.position)
      .slice(0, PAGE_TWO_SHOWN),
  }
}
