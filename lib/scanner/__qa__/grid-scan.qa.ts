/**
 * THE GRID MUST BE A SQUARE ON THE GROUND, AND ITS NUMBERS MUST NOT FLATTER US.
 *
 * Two failures this suite exists to prevent:
 *   1. A grid that leans. Degrees of longitude shrink towards the poles, so a
 *      fixed longitude step drawn from the centre's latitude makes the top and
 *      bottom rows wider than the middle. Each row is corrected by its OWN
 *      latitude; this suite measures the real ground distance between
 *      neighbours in every row and requires them to match.
 *   2. A score that improves when the business disappears. If "not found" were
 *      dropped from the average instead of counted as 21, a business visible at
 *      one point and invisible at 48 would average 1.0 — better than a business
 *      ranked 2nd everywhere. That is the number a customer would be shown.
 *
 * Also checked: the three sizes are exactly the values the DB constraint has
 * allowed since 2026-04-21, the centre point is the real centre, and the colour
 * buckets never call a missing business green.
 *
 * MUTATION CONTROLS at the end re-run the two structural checks against a
 * deliberately broken generator and a deliberately broken average.
 *
 * Run: npx tsx lib/scanner/__qa__/grid-scan.qa.ts
 */
import { readFileSync } from 'fs'
import {
  GRID_DIMENSIONS, DEFAULT_GRID_SIZE, DEFAULT_GRID_SPACING_KM, gridPointCount, isGridSize,
  generateGridPoints, gridMetrics, gridBucket, haversineKm, type GridPointResult, type GridSize,
} from '../grid-scan'

let pass = 0, fail = 0
function check(name: string, cond: boolean, detail?: string) {
  if (cond) { pass++; console.log(`  ✓ ${name}`) } else { fail++; console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`) }
}
const near = (a: number, b: number, tol: number) => Math.abs(a - b) <= tol

// ------------------------------------------------- A. sizes match the schema
console.log('\nA. The sizes are the ones the database already allows')
{
  // The database CHECK constraint from that migration is gone in production
  // (measured 21.11.2026), so the type in lib/supabase/types.ts is the only
  // contract left. A size that is not in it must not exist here.
  const dbTypes = readFileSync('lib/supabase/types.ts', 'utf8')
  const declared = /export type GridSize = ([^\n]+)/.exec(dbTypes)?.[1] ?? ''
  for (const size of Object.keys(GRID_DIMENSIONS) as GridSize[]) {
    check(`the stored GridSize type carries '${size}'`, declared.includes(`'${size}'`), declared)
  }
  check('the stored type has no size this module does not implement',
    (declared.match(/'[a-z]+'/g) ?? []).every((q) => q.slice(1, -1) in GRID_DIMENSIONS), declared)
  check('the migration that created the column is still the historical record',
    readFileSync('supabase/migrations/20260421_add_location_mode_to_targets.sql', 'utf8').includes("'grid'"))
  check('every side is odd, so a true centre exists',
    Object.values(GRID_DIMENSIONS).every((n) => n % 2 === 1), JSON.stringify(GRID_DIMENSIONS))
  check('5x5 = 25, 7x7 = 49, 9x9 = 81 searches',
    gridPointCount('small') === 25 && gridPointCount('medium') === 49 && gridPointCount('large') === 81)
  check('isGridSize accepts the three and rejects anything else',
    isGridSize('small') && isGridSize('large') && !isGridSize('huge') && !isGridSize(7) && !isGridSize(null))
}

// --------------------------------------------------------- B. the geometry
console.log('\nB. The square is a square on the ground')
const MILAN = { lat: 45.4642, lng: 9.19 }
for (const size of ['small', 'medium', 'large'] as GridSize[]) {
  const n = GRID_DIMENSIONS[size]
  const pts = generateGridPoints(MILAN.lat, MILAN.lng, size, 2)
  check(`${size}: ${n * n} points`, pts.length === n * n, String(pts.length))
  check(`${size}: exactly one centre, and it is the centre`, (() => {
    const centres = pts.filter((p) => p.isCenter)
    return centres.length === 1 && near(centres[0].lat, MILAN.lat, 1e-9) && near(centres[0].lng, MILAN.lng, 1e-9)
  })())
  check(`${size}: every row and column index appears`, (() => {
    const rows = new Set(pts.map((p) => p.row)); const cols = new Set(pts.map((p) => p.col))
    return rows.size === n && cols.size === n && Math.min(...rows) === 0 && Math.max(...rows) === n - 1
  })())
}
{
  const pts = generateGridPoints(MILAN.lat, MILAN.lng, 'medium', 2)
  const n = GRID_DIMENSIONS.medium
  const at = (r: number, c: number) => pts.find((p) => p.row === r && p.col === c)!

  check('row 0 is the northernmost row', at(0, 0).lat > at(n - 1, 0).lat)
  check('col 0 is the westernmost column', at(0, 0).lng < at(0, n - 1).lng)

  // The real defect: neighbour spacing must be the same in every row.
  const rowSpacings = Array.from({ length: n }, (_, r) => haversineKm(at(r, 0).lat, at(r, 0).lng, at(r, 1).lat, at(r, 1).lng))
  check('east-west spacing is exactly 2 km in every row', rowSpacings.every((d) => near(d, 2, 1e-6)), rowSpacings.map((d) => d.toFixed(6)).join(', '))
  check('the top row is spaced the same as the middle row', near(rowSpacings[0], rowSpacings[(n - 1) / 2], 1e-6),
    `${rowSpacings[0].toFixed(4)} vs ${rowSpacings[(n - 1) / 2].toFixed(4)}`)
  const colSpacings = Array.from({ length: n }, (_, c) => haversineKm(at(0, c).lat, at(0, c).lng, at(1, c).lat, at(1, c).lng))
  check('north-south spacing is exactly 2 km in every column', colSpacings.every((d) => near(d, 2, 1e-6)), colSpacings.map((d) => d.toFixed(3)).join(', '))

  check('the centre records distance 0', near(at((n - 1) / 2, (n - 1) / 2).distanceKm, 0, 1e-9))
  check('a corner of a 7x7 at 2 km is ~8.49 km away', near(at(0, 0).distanceKm, Math.sqrt(2) * 6, 0.05), at(0, 0).distanceKm.toFixed(3))
  check('a bad spacing falls back to the default rather than collapsing', (() => {
    const bad = generateGridPoints(MILAN.lat, MILAN.lng, 'small', 0)
    return bad.length === 25 && bad.some((p) => p.distanceKm > 0)
  })())
  check('the default size and spacing are the documented ones',
    DEFAULT_GRID_SIZE === 'medium' && DEFAULT_GRID_SPACING_KM === 1.5)
}
{
  // Southern hemisphere, because Brazil is the second market.
  const sp = generateGridPoints(-23.5505, -46.6333, 'small', 3)
  const at = (r: number, c: number) => sp.find((p) => p.row === r && p.col === c)!
  check('São Paulo: row 0 is still the northernmost', at(0, 0).lat > at(4, 0).lat)
  check('São Paulo: spacing holds in the southern hemisphere',
    near(haversineKm(at(0, 0).lat, at(0, 0).lng, at(0, 1).lat, at(0, 1).lng), 3, 1e-6))
}

// ------------------------------------------------------------- C. the metrics
console.log('\nC. The numbers cannot flatter us')
function results(positions: Array<number | null>): GridPointResult[] {
  const pts = generateGridPoints(MILAN.lat, MILAN.lng, 'medium', 2)
  return positions.map((p, i) => ({ point: pts[i], found: p !== null, position: p }))
}
{
  const allSecond = results(Array(49).fill(2))
  const oneFirstRestMissing = results([1, ...Array(48).fill(null)])
  const a = gridMetrics(allSecond)
  const b = gridMetrics(oneFirstRestMissing)
  check('ranked 2nd everywhere beats found-once-at-1', a.averageTotalPosition < b.averageTotalPosition,
    `${a.averageTotalPosition.toFixed(2)} vs ${b.averageTotalPosition.toFixed(2)}`)
  check('the found-only average is still reported, and is 1.0 there', b.averagePosition === 1)
  check('found-once reports a 1/49 found share', near(b.foundShare, 1 / 49, 1e-9))
  check('never found gives a null average and the floor score', (() => {
    const m = gridMetrics(results(Array(49).fill(null)))
    return m.averagePosition === null && m.averageTotalPosition === 21 && m.best === null && m.foundCount === 0
  })())
  const mixed = gridMetrics(results([1, 2, 3, 4, 10, 11, 20, null, ...Array(41).fill(null)]))
  check('top3Share counts 1-3 only', near(mixed.top3Share, 3 / 49, 1e-9), String(mixed.top3Share))
  check('top10Share counts 1-10 inclusive', near(mixed.top10Share, 5 / 49, 1e-9), String(mixed.top10Share))
  check('best is 1 and worst is 20', mixed.best?.position === 1 && mixed.worst?.position === 20)
  check('an empty grid does not divide by zero',
    gridMetrics([]).averageTotalPosition === 21 && gridMetrics([]).foundShare === 0)
}

// -------------------------------------------------------------- D. the colours
console.log('\nD. A missing business is never green')
check('1, 2, 3 are top3', [1, 2, 3].every((p) => gridBucket({ found: true, position: p }) === 'top3'))
check('4 and 10 are top10', [4, 10].every((p) => gridBucket({ found: true, position: p }) === 'top10'))
check('11 and 20 are rest', [11, 20].every((p) => gridBucket({ found: true, position: p }) === 'rest'))
check('not found is absent, not top3', gridBucket({ found: false, position: null }) === 'absent')
check('found with no position is absent', gridBucket({ found: true, position: null }) === 'absent')
check('found with a nonsense position is absent', gridBucket({ found: true, position: NaN }) === 'absent')

// ---------------------------------------------------------- E. mutation controls
console.log('\nE. Mutation controls')
{
  // A generator that uses the CENTRE's latitude for every row — the lean.
  const n = 7, half = 3, spacing = 2
  const KMD = (Math.PI * 6371) / 180
  const lngStep = spacing / (KMD * Math.cos((MILAN.lat * Math.PI) / 180))
  const broken = Array.from({ length: n }, (_, r) =>
    Array.from({ length: n }, (_, c) => ({
      row: r, col: c,
      lat: MILAN.lat + ((half - r) * spacing) / KMD,
      lng: MILAN.lng + (c - half) * lngStep,
    }))
  ).flat()
  const at = (r: number, c: number) => broken.find((p) => p.row === r && p.col === c)!
  const top = haversineKm(at(0, 0).lat, at(0, 0).lng, at(0, 1).lat, at(0, 1).lng)
  const mid = haversineKm(at(3, 0).lat, at(3, 0).lng, at(3, 1).lat, at(3, 1).lng)
  check('the spacing check FAILS on a grid drawn from the centre latitude', !near(top, mid, 1e-6),
    `${top.toFixed(4)} vs ${mid.toFixed(4)}`)
}
{
  // An average that drops "not found" instead of counting it.
  const flattering = (rs: GridPointResult[]) => {
    const p = rs.filter((r) => typeof r.position === 'number').map((r) => r.position as number)
    return p.length ? p.reduce((a, b) => a + b, 0) / p.length : 21
  }
  const allSecond = flattering(results(Array(49).fill(2)))
  const oneFirst = flattering(results([1, ...Array(48).fill(null)]))
  check('the flattery check FAILS on an average that drops "not found"', !(allSecond < oneFirst),
    `${allSecond} vs ${oneFirst}`)
}

console.log(`\n${pass} passed, ${fail} failed`)
if (fail > 0) process.exit(1)

export {}
