/**
 * THE AREA MAP — what the picture is allowed to say.
 *
 * Oren asked for the pin map his competitors show: a square of coloured pins
 * over the area, each one the position measured there. The data behind it is
 * lib/scanner/grid-scan.ts and scan_grid_points; this suite is about the
 * drawing, and about the four ways a drawing like this lies.
 *
 *   1. COLOUR ALONE. Four marks a colour-blind reader cannot separate is a
 *      picture that says nothing to them, so every pin prints its own position
 *      and the check table on the same screen is the table view. The marks
 *      themselves were stepped against the dataviz validator: `warn` (#a04a06)
 *      and `bad` (#b42318) are 7.4 apart on the normal-vision scale and 0.8
 *      under deuteranopia — a yellow and a red nobody can tell apart — so the
 *      "4-10" mark is the commit amber and dark mode is re-stepped for the
 *      dark surface rather than flipped.
 *   2. A MIRRORED MAP. Hebrew runs right to left and a map does not. West is
 *      on the left in every language.
 *   3. FLATTERY. The figure under the map counts a point where the business was
 *      not found as 21, so it cannot improve by finding nothing.
 *   4. A GREY PIN FOR A POINT NOBODY MEASURED. "Not measured" (the deadline
 *      stopped the batch) is not "not found". It is an empty cell.
 *
 * Run: npx tsx components/keywords/__qa__/grid-map.qa.ts
 */
import { readFileSync } from 'fs'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import GridMap, { gridMapSummary, gridSide, type GridMapPoint } from '../GridMap'

let pass = 0, fail = 0
function check(name: string, cond: boolean, detail?: string) {
  if (cond) { pass++; console.log(`  ✓ ${name}`) } else { fail++; console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`) }
}
function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').split('\n').filter((l) => !l.trim().startsWith('//')).join('\n')
}

const MAP_SRC = stripComments(readFileSync('components/keywords/GridMap.tsx', 'utf8'))
const CSS_SRC = readFileSync('app/globals.css', 'utf8')
const PAGE_SRC = stripComments(readFileSync('app/(dashboard)/keywords/[id]/history/page.tsx', 'utf8'))

const LABELS = { title: 'Area map', notFound: 'Not found', average: 'Average:', inTop3: 'In the top 3:', north: 'North is up' }

/** A 3 x 3 grid: 1 at the centre, 7 north-west, 14 south, nothing in one corner. */
const POINTS: GridMapPoint[] = [
  { row: 0, col: 0, lat: 45.48, lng: 9.17, found: true, position: 7 },
  { row: 0, col: 1, lat: 45.48, lng: 9.19, found: true, position: 2 },
  { row: 0, col: 2, lat: 45.48, lng: 9.21, found: false, position: null },
  { row: 1, col: 0, lat: 45.46, lng: 9.17, found: true, position: 3 },
  { row: 1, col: 1, lat: 45.46, lng: 9.19, found: true, position: 1 },
  { row: 1, col: 2, lat: 45.46, lng: 9.21, found: true, position: 11 },
  { row: 2, col: 0, lat: 45.44, lng: 9.17, found: true, position: 14 },
  { row: 2, col: 1, lat: 45.44, lng: 9.19, found: true, position: 9 },
  { row: 2, col: 2, lat: 45.44, lng: 9.21, found: false, position: null },
]

const html = renderToStaticMarkup(createElement(GridMap, { points: POINTS, labels: LABELS }))

console.log('\nA) the pins')
check('the square\'s side comes from the points themselves', gridSide(POINTS) === 3)
check('one pin per point', (html.match(/aspect-square/g) || []).length === 9)
check('every measured pin prints its own position, so colour is never the only encoding',
  ['>7<', '>2<', '>3<', '>1<', '>11<', '>14<', '>9<'].every((n) => html.includes(n)))
check('the four marks are the validated tokens, not hand-picked colours',
  html.includes('bg-grid-top3') && html.includes('bg-grid-top10') && html.includes('bg-grid-rest') && html.includes('bg-grid-absent'))
check('each mark carries an ink chosen for it',
  html.includes('text-grid-top3-ink') && html.includes('text-grid-rest-ink') && html.includes('text-grid-absent-ink'))
check('a pin where the business was not found says so in words on hover', html.includes('Not found'))
check('every pin\'s own coordinates are on it', html.includes('45.4600, 9.1900') && html.includes('45.4400, 9.2100'))

console.log('\nB) the map is not mirrored')
check('the grid is pinned to left-to-right', /dir="ltr"/.test(html))
check('…in the source, with the reason', /dir="ltr"/.test(MAP_SRC))
check('north is stated rather than assumed', html.includes('North is up'))

console.log('\nC) the figures cannot flatter')
{
  const s = gridMapSummary(POINTS)
  // 7+2+21+3+1+11+14+9+21 = 89 over 9 points.
  check('a point that found nothing counts as 21, the same rule the metrics use', s.average === 9.9, String(s.average))
  // Positions 1, 2 and 3 are in; 7, 9, 11 and 14 are not, and the two points
  // that found nothing are never counted as good.
  check('the top-3 count is the pins that really are in the top 3 (3 of 9)', s.top3 === 3 && s.total === 9)
  const allAbsent = POINTS.map((p) => ({ ...p, found: false, position: null }))
  check('a grid that found nothing anywhere averages 21, not nothing',
    gridMapSummary(allAbsent).average === 21 && gridMapSummary(allAbsent).top3 === 0)
  check('an empty grid has no average to show rather than a zero', gridMapSummary([]).average === null)
  const better = POINTS.map((p) => ({ ...p, found: true, position: 1 }))
  check('finding the business everywhere is what makes the figure good', gridMapSummary(better).average === 1)
}

console.log('\nD) a point nobody measured')
{
  const stopped = POINTS.filter((p) => !(p.row === 2 && p.col === 2))
  const partial = renderToStaticMarkup(createElement(GridMap, { points: stopped, labels: LABELS }))
  check('the square keeps its shape when the batch stopped early', (partial.match(/rounded-full/g) || []).length >= 9)
  check('the unmeasured cell is empty, never a grey pin',
    partial.includes('border-dashed') && (partial.match(/bg-grid-absent/g) || []).length < (html.match(/bg-grid-absent/g) || []).length)
  check('the average is over what was measured, not over what was planned',
    gridMapSummary(stopped).total === 8)
  check('nothing at all is drawn with no points', renderToStaticMarkup(createElement(GridMap, { points: [], labels: LABELS })) === '')
}

console.log('\nE) the tokens, and the screen')
const guardTokensBothModes = (src: string) =>
  (src.match(/--color-grid-top3:/g) || []).length === 2 &&
  (src.match(/--color-grid-rest:/g) || []).length === 2 &&
  (src.match(/--color-grid-absent:/g) || []).length === 2
const guardAmberNotWarn = (src: string) => /--color-grid-top10: #f0b03f;/.test(src) && !/--color-grid-top10: #a04a06;/.test(src)
const guardDarkRestRestepped = (src: string) => /--color-grid-rest: #ef5a4c;/.test(src)
const guardNoTileProvider = (src: string) => !/mapbox|googleapis\.com\/maps|tile\.openstreetmap|leaflet/i.test(src)
const guardMapOnlyForGrid = (src: string) => /location_mode === 'grid'/.test(src)
const guardMapAfterTheScreen = (src: string) =>
  src.indexOf('setLoading(false)') < src.indexOf(".from('scan_grid_points')")

check('both light and dark define every mark', guardTokensBothModes(CSS_SRC))
check('the "4-10" mark is the amber, not the brown that reads as the red', guardAmberNotWarn(CSS_SRC))
check('dark mode re-steps the "11+" mark instead of flipping it', guardDarkRestRestepped(CSS_SRC))
check('no tile provider is contacted to draw the map', guardNoTileProvider(MAP_SRC))
check('the map is read only for a grid keyword', guardMapOnlyForGrid(PAGE_SRC))
check('…and only after the history itself is on screen', guardMapAfterTheScreen(PAGE_SRC))

console.log('\nE-MUT) mutation controls')
check('the both-modes guard fails when dark mode is left out',
  !guardTokensBothModes('--color-grid-top3: #157a3c; --color-grid-rest: #b42318; --color-grid-absent: #eee;'))
check('the amber guard fails on the brown that was rejected',
  !guardAmberNotWarn('--color-grid-top10: #a04a06;'))
check('the dark-mode guard fails if the salmon is kept', !guardDarkRestRestepped('--color-grid-rest: #f58c80;'))
check('the no-tiles guard fails on a tile layer', !guardNoTileProvider("const url = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png'"))
check('the grid-only guard fails when every keyword is read', !guardMapOnlyForGrid("if (latest) { read('scan_grid_points') }"))
check('the ordering guard fails when the screen waits for the map',
  !guardMapAfterTheScreen("const p = await supabase.from('scan_grid_points'); setLoading(false)"))

console.log(`\n${pass} passed, ${fail} failed`)
if (fail > 0) process.exit(1)

export {}
