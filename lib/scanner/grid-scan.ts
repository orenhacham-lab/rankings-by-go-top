/**
 * Geo-grid scanning: the square of measurement points competitors render as a
 * map of coloured pins (Local Falcon, BrightLocal, Places Scout).
 *
 * This is deliberately NOT `radius-scan.ts`. That module returns a centre plus
 * eight compass points, measures in MILES and labels them in English
 * ("North", "Center (ZIP ...)"), which is nine measurements and an American
 * unit. It stays exactly as it is, because existing targets use it; `grid` is
 * a separate location mode and nothing that works today changes behaviour.
 *
 * Three things are different here on purpose:
 *   - A real square. `small` is 5x5 = 25 points, `medium` 7x7 = 49,
 *     `large` 9x9 = 81. Those three names are not invented: they are the
 *     values the `tracking_targets.grid_size` CHECK constraint has allowed
 *     since 2026-04-21, while every insert wrote null.
 *   - Kilometres, because the markets this is for are Italy, Brazil and Spain.
 *   - No language in the data. A point is identified by its row and column,
 *     so nothing has to be translated into eleven languages.
 *
 * Cost, because it is the whole design constraint: every point is one Serper
 * search. 5x5 = 25, 7x7 = 49, 9x9 = 81 searches for ONE keyword in ONE scan.
 * A project on the Advanced plan has 100 Google checks a month, so a grid is a
 * deliberate action on one keyword, never something that runs over a whole
 * keyword list.
 */

/** The sizes `tracking_targets.grid_size` already permits. */
export type GridSize = 'small' | 'medium' | 'large'

/** Points per side. Always odd, so there is a true centre point. */
export const GRID_DIMENSIONS: Record<GridSize, number> = {
  small: 5,
  medium: 7,
  large: 9,
}

export const DEFAULT_GRID_SIZE: GridSize = 'medium'

/** Kilometres between neighbouring points when the caller does not say. */
export const DEFAULT_GRID_SPACING_KM = 1.5

/** Serper searches a grid of this size will cost. */
export function gridPointCount(size: GridSize): number {
  const n = GRID_DIMENSIONS[size]
  return n * n
}

export function isGridSize(value: unknown): value is GridSize {
  return value === 'small' || value === 'medium' || value === 'large'
}

export interface GridPoint {
  /** 0-based, top row first, so it maps straight onto a rendered grid. */
  row: number
  /** 0-based, left column first. */
  col: number
  lat: number
  lng: number
  /** Straight-line distance from the centre point. */
  distanceKm: number
  isCenter: boolean
}

export interface GridPointResult {
  point: GridPoint
  found: boolean
  position?: number | null
  title?: string | null
  address?: string | null
  error?: string | null
}

/**
 * Degrees are converted on the SAME sphere `haversineKm` measures on (R = 6371
 * km), not with the usual 110.574 / 111.32 pair. Mixing the two makes a grid
 * asked for in 2 km steps come out 1.9978 km apart — a tenth of a percent that
 * means the distance we print is not the distance we measured.
 */
const EARTH_RADIUS_KM = 6371
const KM_PER_DEGREE = (Math.PI * EARTH_RADIUS_KM) / 180

function kmToLatitude(km: number): number {
  return km / KM_PER_DEGREE
}

function kmToLongitude(km: number, atLatitude: number): number {
  const kmPerDegree = KM_PER_DEGREE * Math.cos((atLatitude * Math.PI) / 180)
  // Near a pole a degree of longitude is almost nothing; refuse to divide by it
  // rather than return coordinates on the other side of the world.
  if (Math.abs(kmPerDegree) < 0.001) return 0
  return km / kmPerDegree
}

export function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = EARTH_RADIUS_KM
  const dLat = ((lat2 - lat1) * Math.PI) / 180
  const dLng = ((lng2 - lng1) * Math.PI) / 180
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

/**
 * The square of points, row 0 being the NORTHERNMOST row so that row/col read
 * the same way the map is drawn.
 *
 * The longitude step is corrected by the cosine of EACH ROW's own latitude, not
 * the centre's, so the square stays a square on the ground instead of leaning
 * as it goes north.
 */
export function generateGridPoints(
  centerLat: number,
  centerLng: number,
  size: GridSize = DEFAULT_GRID_SIZE,
  spacingKm: number = DEFAULT_GRID_SPACING_KM
): GridPoint[] {
  const n = GRID_DIMENSIONS[size]
  const half = (n - 1) / 2
  const spacing = Number.isFinite(spacingKm) && spacingKm > 0 ? spacingKm : DEFAULT_GRID_SPACING_KM
  const points: GridPoint[] = []

  for (let row = 0; row < n; row++) {
    // row 0 is the top of the drawn grid, which is the highest latitude.
    const northSteps = half - row
    const lat = centerLat + kmToLatitude(northSteps * spacing)
    for (let col = 0; col < n; col++) {
      const eastSteps = col - half
      const lng = centerLng + kmToLongitude(eastSteps * spacing, lat)
      points.push({
        row,
        col,
        lat,
        lng,
        distanceKm: haversineKm(centerLat, centerLng, lat, lng),
        isCenter: row === half && col === half,
      })
    }
  }

  return points
}

/**
 * What a grid is actually read for. `averageTotalPosition` counts a point where
 * the business was not found at all as `notFoundAs` (21 by default, one past a
 * 20-result page) — without that an unfindable business would score better than
 * a findable one, because only its good points would count.
 */
export interface GridMetrics {
  pointsScanned: number
  foundCount: number
  /** Mean position over the points where it WAS found. Null when never found. */
  averagePosition: number | null
  /** Mean position over every point, counting "not found" as `notFoundAs`. */
  averageTotalPosition: number
  top3Share: number
  top10Share: number
  foundShare: number
  best: GridPointResult | null
  worst: GridPointResult | null
}

export function gridMetrics(results: GridPointResult[], notFoundAs = 21): GridMetrics {
  const total = results.length
  const positioned = results.filter(
    (r): r is GridPointResult & { position: number } =>
      r.found && typeof r.position === 'number' && Number.isFinite(r.position)
  )
  const share = (count: number) => (total === 0 ? 0 : count / total)
  const sum = (ns: number[]) => ns.reduce((a, b) => a + b, 0)

  const totalPositions = results.map((r) =>
    r.found && typeof r.position === 'number' && Number.isFinite(r.position) ? r.position : notFoundAs
  )

  return {
    pointsScanned: total,
    foundCount: positioned.length,
    averagePosition: positioned.length ? sum(positioned.map((r) => r.position)) / positioned.length : null,
    averageTotalPosition: total === 0 ? notFoundAs : sum(totalPositions) / total,
    top3Share: share(positioned.filter((r) => r.position <= 3).length),
    top10Share: share(positioned.filter((r) => r.position <= 10).length),
    foundShare: share(positioned.length),
    best: positioned.length ? positioned.reduce((a, b) => (b.position < a.position ? b : a)) : null,
    worst: positioned.length ? positioned.reduce((a, b) => (b.position > a.position ? b : a)) : null,
  }
}

/**
 * The colour buckets the map draws, and the ONLY place they are defined.
 * Green 1-3, yellow 4-10, red 11+, grey for a point where it was not found —
 * never green, because "not found" is the worst outcome, not a missing one.
 */
export type GridBucket = 'top3' | 'top10' | 'rest' | 'absent'

export function gridBucket(result: Pick<GridPointResult, 'found' | 'position'>): GridBucket {
  const p = result.position
  if (!result.found || typeof p !== 'number' || !Number.isFinite(p)) return 'absent'
  if (p <= 3) return 'top3'
  if (p <= 10) return 'top10'
  return 'rest'
}
