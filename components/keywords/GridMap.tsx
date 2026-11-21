'use client'

/**
 * THE AREA MAP: one pin per measurement point of a geo-grid check, laid over
 * the actual map, at the coordinates it was measured at, and coloured by the
 * position found there.
 *
 * THE MAP UNDERNEATH is OpenStreetMap, chosen by the owner on 2026-11-21 for
 * the reason that it costs nothing. It is drawn as a still mosaic of tiles by
 * lib/maps/osm-tiles.ts — no mapping library, no pan, no zoom — because a geo
 * grid is a picture of a square that was measured once, and Leaflet or MapLibre
 * would add a package, a stylesheet and a second way for this screen to break.
 * The attribution is a condition of using those tiles, so it is rendered on the
 * map and the suite fails if it is removed. If the tiles do not load, the pins
 * are still in the right places on a plain surface: the map is the backdrop,
 * never the data.
 *
 * COLOUR IS NEVER THE ONLY ENCODING. Every pin prints its own position, and the
 * check table on the same screen is the table view of the same data, which is
 * what makes the four marks legal for a reader who cannot separate them: the
 * marks were stepped against the dataviz validator (see the --color-grid-*
 * tokens in app/globals.css) and the dark mode is stepped for the dark surface
 * rather than flipped. Over map tiles each pin also carries a ring of the
 * page's own surface colour, so a pin never has to be told apart from a road.
 *
 * A POINT THE SCAN NEVER REACHED is drawn as a dashed outline at the place it
 * WOULD have been measured, computed from the lattice the measured points
 * describe — never as a grey pin, because "not measured" is not "not found",
 * and never omitted, because a 5x5 that stopped at 18 points must not read as
 * a complete picture.
 *
 * THE GRID IS NOT MIRRORED IN HEBREW. Everything else on the screen runs right
 * to left; a map does not. West is on the left in every language, so the map
 * itself is pinned to `dir="ltr"` while its caption and legend follow the page.
 */
import { useEffect, useRef, useState } from 'react'
import { gridBucket, type GridBucket } from '@/lib/scanner/grid-scan'
import {
  boundsOf, planTiles, TILE_SIZE, TILE_ATTRIBUTION, TILE_ATTRIBUTION_HREF, type LatLng,
} from '@/lib/maps/osm-tiles'

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
  notMeasured: string
  average: string
  inTop3: string
  north: string
  /** Said instead of an average when the business was found at no point at all. */
  noneFound: (total: number) => string
}

const MARK: Record<GridBucket, string> = {
  top3: 'bg-grid-top3 text-grid-top3-ink',
  top10: 'bg-grid-top10 text-grid-top10-ink',
  rest: 'bg-grid-rest text-grid-rest-ink',
  absent: 'bg-grid-absent text-grid-absent-ink border-2 border-grid-absent-ink/60',
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
export function gridMapSummary(points: GridMapPoint[]): { average: number | null; top3: number; total: number; found: number } {
  if (points.length === 0) return { average: null, top3: 0, total: 0, found: 0 }
  const sum = points.reduce((s, p) => s + (p.found && p.position !== null ? p.position : 21), 0)
  return {
    average: Math.round((sum / points.length) * 10) / 10,
    top3: points.filter((p) => gridBucket(p) === 'top3').length,
    total: points.length,
    found: points.filter((p) => p.found && p.position !== null).length,
  }
}

/**
 * WHERE A CELL THE SCAN NEVER REACHED WOULD HAVE BEEN.
 *
 * The points of a grid are a lattice: a fixed step of latitude between rows and
 * a fixed step of longitude between columns. Two measured points in different
 * rows give the latitude step, two in different columns the longitude step, and
 * one measured point anchors both. A grid that was stopped early is missing
 * whole trailing rows, so the measured points always span enough of the lattice
 * to describe it — unless only one point was measured, in which case there is
 * nothing to interpolate and `null` is returned rather than a guess.
 */
export function gridLattice(points: GridMapPoint[]): ((row: number, col: number) => LatLng) | null {
  const usable = points.filter((p) => Number.isFinite(p.lat) && Number.isFinite(p.lng))
  if (usable.length < 2) return null
  const anchor = usable[0]

  const rowPair = usable.find((p) => p.row !== anchor.row)
  const colPair = usable.find((p) => p.col !== anchor.col)
  if (!rowPair || !colPair) return null

  const dLat = (rowPair.lat - anchor.lat) / (rowPair.row - anchor.row)
  const dLng = (colPair.lng - anchor.lng) / (colPair.col - anchor.col)
  if (!Number.isFinite(dLat) || !Number.isFinite(dLng)) return null

  return (row: number, col: number) => ({
    lat: anchor.lat + (row - anchor.row) * dLat,
    lng: anchor.lng + (col - anchor.col) * dLng,
  })
}

/** The box the map is drawn in before the real width is known. */
const DEFAULT_BOX = 420

export default function GridMap({ points, labels }: { points: GridMapPoint[]; labels: GridMapLabels }) {
  const boxRef = useRef<HTMLDivElement>(null)
  const [box, setBox] = useState(DEFAULT_BOX)

  useEffect(() => {
    const el = boxRef.current
    if (!el || typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(([entry]) => {
      const w = Math.round(entry.contentRect.width)
      if (w > 0) setBox(w)
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const side = gridSide(points)
  if (side === 0) return null

  const summary = gridMapSummary(points)
  const byCell = new Map(points.map((p) => [`${p.row}:${p.col}`, p]))
  const lattice = gridLattice(points)

  // The pin's own size, so a 9x9 does not become a wall of touching circles.
  const pin = Math.max(20, Math.min(40, Math.floor((box / side) * 0.78)))
  const bounds = boundsOf(points.filter((p) => Number.isFinite(p.lat) && Number.isFinite(p.lng)))
  const plan = bounds ? planTiles(bounds, box, box, { padPx: Math.ceil(pin / 2) + 4 }) : null

  // The pin is sized from the real distance between neighbouring points on THIS
  // map, not from the box alone: the tiles are fitted to a whole zoom level, so
  // on a narrow phone the points can sit closer than box/side suggests and 25
  // circles used to cover the whole map.
  let drawnPin = pin
  if (plan) {
    let spacing = Infinity
    for (const a of points) {
      for (const b of points) {
        if (!(Math.abs(a.row - b.row) + Math.abs(a.col - b.col) === 1)) continue
        if (![a.lat, a.lng, b.lat, b.lng].every(Number.isFinite)) continue
        const pa = plan.positionOf({ lat: a.lat, lng: a.lng })
        const pb = plan.positionOf({ lat: b.lat, lng: b.lng })
        spacing = Math.min(spacing, Math.hypot(pa.left - pb.left, pa.top - pb.top))
      }
    }
    // Leave at least a third of the gap open so the map shows between pins.
    if (Number.isFinite(spacing)) drawnPin = Math.max(14, Math.min(pin, Math.floor(spacing * 0.62)))
  }

  const cells = Array.from({ length: side * side }, (_, i) => ({
    row: Math.floor(i / side),
    col: i % side,
  }))

  return (
    <div>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-section font-semibold text-ink">{labels.title}</h2>
      </div>

      <div
        ref={boxRef}
        dir="ltr"
        className="relative mx-auto mt-3 w-full max-w-[560px] overflow-hidden rounded-control bg-sunk"
        style={{ height: box }}
      >
        {plan?.tiles.map((t) => (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            key={`${t.z}/${t.x}/${t.y}`}
            src={t.url}
            alt=""
            aria-hidden="true"
            width={TILE_SIZE}
            height={TILE_SIZE}
            loading="lazy"
            referrerPolicy="no-referrer"
            className="pointer-events-none absolute select-none"
            style={{ left: t.left, top: t.top, width: TILE_SIZE, height: TILE_SIZE }}
          />
        ))}

        {plan &&
          cells.map(({ row, col }) => {
            const point = byCell.get(`${row}:${col}`)
            const at = point && Number.isFinite(point.lat) ? { lat: point.lat, lng: point.lng } : lattice?.(row, col)
            if (!at) return null
            const pos = plan.positionOf(at)
            const style = {
              left: pos.left,
              top: pos.top,
              width: drawnPin,
              height: drawnPin,
              transform: 'translate(-50%, -50%)',
            } as const

            if (!point) {
              // Never reached: the place it would have been, drawn as an outline.
              return (
                <div
                  key={`${row}:${col}`}
                  className="absolute rounded-full border border-dashed border-line bg-surface/60"
                  style={style}
                  title={labels.notMeasured}
                />
              )
            }

            const bucket = gridBucket(point)
            return (
              <div
                key={`${row}:${col}`}
                className={`absolute flex items-center justify-center rounded-full text-caption font-bold tabular-nums ring-2 ring-surface ${MARK[bucket]}`}
                style={style}
                title={`${point.lat.toFixed(4)}, ${point.lng.toFixed(4)} — ${bucket === 'absent' ? labels.notFound : String(point.position)}`}
              >
                {bucket === 'absent' ? '×' : String(point.position)}
              </div>
            )
          })}

        {/* North is stated ON the map, where the reader is looking, not at the
            far end of the heading row. */}
        <span className="absolute left-1.5 top-1.5 rounded bg-surface/90 px-1.5 py-0.5 text-caption font-semibold text-ink">
          ↑ {labels.north}
        </span>

        <a
          href={TILE_ATTRIBUTION_HREF}
          target="_blank"
          rel="noopener noreferrer"
          className="absolute bottom-0 right-0 bg-surface/80 px-1.5 py-0.5 text-caption text-muted"
        >
          {TILE_ATTRIBUTION}
        </a>
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
        {/* The dashed outline is the one mark a reader has no prior for, so it is
            named — and only when the picture actually contains one. */}
        {points.length < side * side && (
          <span className="flex items-center gap-1.5">
            <span
              className="inline-block h-3 w-3 rounded-full border border-dashed border-line bg-surface"
              aria-hidden="true"
            />
            {labels.notMeasured}
          </span>
        )}
      </div>

      {/* Nothing found anywhere: the "average" would be the 21 the rule gives a
          miss, which reads as "ranked about 21" next to cards that show dashes.
          Say the plain thing instead. */}
      {summary.found === 0 ? (
        <p className="mt-3 text-copy font-medium text-ink">{labels.noneFound(summary.total)}</p>
      ) : (
        <div className="mt-3 flex flex-wrap gap-x-6 gap-y-1 text-copy">
          <span className="text-muted">
            {labels.average} <strong className="text-ink tabular-nums">{summary.average ?? '—'}</strong>
          </span>
          <span className="text-muted">
            {labels.inTop3} <strong className="text-ink tabular-nums">{summary.top3}/{summary.total}</strong>
          </span>
        </div>
      )}
    </div>
  )
}
