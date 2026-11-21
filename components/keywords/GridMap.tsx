'use client'

/**
 * THE AREA MAP: one pin per measurement point of a geo-grid check, laid out as
 * the square was measured — row 0 northernmost, column 0 westernmost — and
 * coloured by the position found there.
 *
 * WHY THERE IS NO MAP UNDERNEATH. A tile layer (Google, Mapbox, even
 * OpenStreetMap through a hosted provider) is a third-party request per view, a
 * key to hold, an attribution to honour and, above a free tier, a bill. What
 * the picture has to say — "first place at your own door, eleventh three
 * kilometres north" — is carried entirely by the pins' arrangement and their
 * numbers. So the grid is drawn on our own surface, with north stated in words,
 * and a tile layer can be slid underneath later without changing this
 * component's contract.
 *
 * COLOUR IS NEVER THE ONLY ENCODING. Every pin prints its own position, and the
 * check table on the same screen is the table view of the same data, which is
 * what makes the four marks legal for a reader who cannot separate them: the
 * marks were stepped against the dataviz validator (see the --color-grid-*
 * tokens in app/globals.css) and the dark mode is stepped for the dark surface
 * rather than flipped.
 *
 * THE GRID IS NOT MIRRORED IN HEBREW. Everything else on the screen runs right
 * to left; a map does not. West is on the left in every language, so the grid
 * itself is pinned to `dir="ltr"` while its caption and legend follow the page.
 */
import { gridBucket, type GridBucket } from '@/lib/scanner/grid-scan'

export interface GridMapPoint {
  row: number
  col: number
  lat: number
  lng: number
  found: boolean
  position: number | null
}

export interface GridMapLabels {
  title: string
  notFound: string
  average: string
  inTop3: string
  north: string
}

const MARK: Record<GridBucket, string> = {
  top3: 'bg-grid-top3 text-grid-top3-ink',
  top10: 'bg-grid-top10 text-grid-top10-ink',
  rest: 'bg-grid-rest text-grid-rest-ink',
  absent: 'bg-grid-absent text-grid-absent-ink',
}

/** The square's side, taken from the points themselves rather than passed in. */
export function gridSide(points: GridMapPoint[]): number {
  return points.reduce((n, p) => Math.max(n, p.row + 1, p.col + 1), 0)
}

/**
 * What the two figures under the map say. The average counts a point where the
 * business was not found as 21, the same rule `gridMetrics` uses, so the figure
 * cannot improve by failing to find anything.
 */
export function gridMapSummary(points: GridMapPoint[]): { average: number | null; top3: number; total: number } {
  if (points.length === 0) return { average: null, top3: 0, total: 0 }
  const sum = points.reduce((s, p) => s + (p.found && p.position !== null ? p.position : 21), 0)
  return {
    average: Math.round((sum / points.length) * 10) / 10,
    top3: points.filter((p) => gridBucket(p) === 'top3').length,
    total: points.length,
  }
}

export default function GridMap({ points, labels }: { points: GridMapPoint[]; labels: GridMapLabels }) {
  const side = gridSide(points)
  if (side === 0) return null
  const byCell = new Map(points.map((p) => [`${p.row}:${p.col}`, p]))
  const summary = gridMapSummary(points)

  return (
    <div>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-section font-semibold text-ink">{labels.title}</h2>
        <span className="text-caption text-muted">{labels.north}</span>
      </div>

      <div
        dir="ltr"
        className="mt-3 grid gap-1 rounded-control bg-sunk p-2"
        style={{ gridTemplateColumns: `repeat(${side}, minmax(0, 1fr))` }}
      >
        {Array.from({ length: side * side }, (_, i) => {
          const row = Math.floor(i / side)
          const col = i % side
          const point = byCell.get(`${row}:${col}`)
          if (!point) {
            // A point the deadline stopped us from measuring: an empty cell,
            // never a grey pin, because "not measured" is not "not found".
            return <div key={i} className="aspect-square rounded-full border border-dashed border-line" />
          }
          const bucket = gridBucket(point)
          const text = bucket === 'absent' ? '·' : String(point.position)
          return (
            <div
              key={i}
              className={`flex aspect-square items-center justify-center rounded-full text-caption font-bold tabular-nums ${MARK[bucket]}`}
              title={`${point.lat.toFixed(4)}, ${point.lng.toFixed(4)} — ${bucket === 'absent' ? labels.notFound : String(point.position)}`}
            >
              {text}
            </div>
          )
        })}
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-caption">
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-3 w-3 rounded-full bg-grid-top3" aria-hidden="true" />1-3
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-3 w-3 rounded-full bg-grid-top10" aria-hidden="true" />4-10
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-3 w-3 rounded-full bg-grid-rest" aria-hidden="true" />11+
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-3 w-3 rounded-full bg-grid-absent" aria-hidden="true" />{labels.notFound}
        </span>
      </div>

      <div className="mt-3 flex flex-wrap gap-x-6 gap-y-1 text-copy">
        <span className="text-muted">
          {labels.average} <strong className="text-ink tabular-nums">{summary.average ?? '—'}</strong>
        </span>
        <span className="text-muted">
          {labels.inTop3} <strong className="text-ink tabular-nums">{summary.top3}/{summary.total}</strong>
        </span>
      </div>
    </div>
  )
}
