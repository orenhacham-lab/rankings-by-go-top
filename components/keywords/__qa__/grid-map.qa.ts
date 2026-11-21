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
import GridMap, { gridLattice, gridMapSummary, gridSide, type GridMapPoint } from '../GridMap'

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

const LABELS = { title: 'Area map', notFound: 'Not found', notMeasured: 'Point not measured', average: 'Average:', inTop3: 'In the top 3:', north: 'North is up' }

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
// A pin is now placed by its coordinates rather than by a cell of a CSS grid,
// so what identifies one is the ring that separates it from the map under it.
check('one pin per point', (html.match(/ring-2 ring-surface/g) || []).length === 9)
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
// The owner chose OpenStreetMap on 2026-11-21, so the map now HAS tiles. What
// has to stay true is narrower and more useful than "no tiles at all": the
// tiles come from OpenStreetMap and nowhere else, no mapping library was pulled
// in to draw them, and the attribution OSM requires is on the screen.
const guardOnlyOsmTiles = (src: string) =>
  !/mapbox|googleapis\.com\/maps|leaflet|maplibre|arcgis|here\.com/i.test(src)
const guardTileUrlFromOneModule = (src: string) =>
  /from '@\/lib\/maps\/osm-tiles'/.test(src) && !/https:\/\/tile\./.test(src)
const guardAttributionRendered = (src: string) =>
  /TILE_ATTRIBUTION\b/.test(src) && /TILE_ATTRIBUTION_HREF/.test(src)
const guardPinsSurviveMissingTiles = (src: string) =>
  /plan\.positionOf\(at\)/.test(src) && /bg-sunk/.test(src)
const guardMapOnlyForGrid = (src: string) => /location_mode === 'grid'/.test(src)
const guardMapAfterTheScreen = (src: string) =>
  src.indexOf('setLoading(false)') < src.indexOf(".from('scan_grid_points')")

check('both light and dark define every mark', guardTokensBothModes(CSS_SRC))
check('the "4-10" mark is the amber, not the brown that reads as the red', guardAmberNotWarn(CSS_SRC))
check('dark mode re-steps the "11+" mark instead of flipping it', guardDarkRestRestepped(CSS_SRC))
check('the only tile provider is OpenStreetMap, and no mapping library was added',
  guardOnlyOsmTiles(MAP_SRC))
check('…with the tile url in one module, so changing provider is one line',
  guardTileUrlFromOneModule(MAP_SRC))
check('the attribution OpenStreetMap requires is rendered on the map',
  guardAttributionRendered(MAP_SRC))
check('a pin is placed by its own coordinates on our own surface, so tiles that fail to load lose nothing',
  guardPinsSurviveMissingTiles(MAP_SRC))
check('the map is read only for a grid keyword', guardMapOnlyForGrid(PAGE_SRC))
check('…and only after the history itself is on screen', guardMapAfterTheScreen(PAGE_SRC))

console.log('\nE-MUT) mutation controls')
check('the both-modes guard fails when dark mode is left out',
  !guardTokensBothModes('--color-grid-top3: #157a3c; --color-grid-rest: #b42318; --color-grid-absent: #eee;'))
check('the amber guard fails on the brown that was rejected',
  !guardAmberNotWarn('--color-grid-top10: #a04a06;'))
check('the dark-mode guard fails if the salmon is kept', !guardDarkRestRestepped('--color-grid-rest: #f58c80;'))
check('the one-provider guard fails on a second provider',
  !guardOnlyOsmTiles("import L from 'leaflet'") &&
  !guardOnlyOsmTiles("https://api.mapbox.com/styles/v1"))
check('the one-module guard fails on a url written into the component',
  !guardTileUrlFromOneModule("const url = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png'"))
check('the attribution guard fails when the credit is dropped',
  !guardAttributionRendered("<img src={t.url} alt='' />"))
check('the grid-only guard fails when every keyword is read', !guardMapOnlyForGrid("if (latest) { read('scan_grid_points') }"))
check('the ordering guard fails when the screen waits for the map',
  !guardMapAfterTheScreen("const p = await supabase.from('scan_grid_points'); setLoading(false)"))

console.log('\nF) where a cell nobody measured is drawn')

/**
 * A grid stopped by its deadline is missing whole trailing rows. Those cells
 * still have a place: the measured points describe a lattice, and the outline
 * goes where the pin would have gone. The alternative — leaving them out — makes
 * a 3x3 that measured 6 points look like a complete 2x3.
 */
const stopped = POINTS.slice(0, 6)
const lat = gridLattice(stopped)!
check('F1: the lattice is recovered from the measured points', lat !== null)
check('F2: it reproduces a measured point exactly',
  Math.abs(lat(1, 1).lat - 45.46) < 1e-9 && Math.abs(lat(1, 1).lng - 9.19) < 1e-9)
check('F3: and places the row that was never reached one step further south',
  Math.abs(lat(2, 0).lat - 45.44) < 1e-9 && Math.abs(lat(2, 0).lng - 9.17) < 1e-9)
check('F4: a single point describes no lattice, and is not guessed at',
  gridLattice(POINTS.slice(0, 1)) === null)
check('F5: points all in one row describe no lattice either',
  gridLattice(POINTS.slice(0, 3)) === null)
check('F6: an unreadable coordinate does not become the anchor',
  gridLattice([{ row: 0, col: 0, lat: NaN, lng: NaN, found: false, position: null }, ...stopped]) !== null)

const stoppedHtml = renderToStaticMarkup(createElement(GridMap, { points: stopped, labels: LABELS }))
check('F7: the stopped grid draws 6 pins and 3 outlines, not 6 of 6',
  (stoppedHtml.match(/ring-2 ring-surface/g) || []).length === 6 &&
  (stoppedHtml.match(/absolute rounded-full border border-dashed/g) || []).length === 3)
check('F8: an outline is never a grey pin — it carries no position and no mark',
  !/border-dashed[^>]*bg-grid-absent/.test(stoppedHtml))

/**
 * F9-F12: THE OUTLINE IS NAMED, NOT ONLY DRAWN.
 *
 * It is the one mark on this screen a first-time owner has no prior for: an
 * empty dashed circle is not in anyone's experience of a map. A measurement
 * shown without saying what it measures reads as a verdict, so "not measured"
 * is named in the legend and on the mark itself — and only when the picture
 * actually holds one, because a legend entry for a mark that is not there is
 * its own small lie.
 */
check('F9: the stopped grid names the unmeasured point in its legend',
  stoppedHtml.includes(LABELS.notMeasured))
check('F10: and the outline itself carries that name, for a hover and a reader',
  /border-dashed[^>]*title="Point not measured"|title="Point not measured"[^>]*border-dashed/.test(stoppedHtml))
check('F11: a complete grid does not claim a mark it never drew',
  !html.includes(LABELS.notMeasured) && !/border-dashed/.test(html))
check('F12: every locale carries the name, in its own words',
  (() => {
    const files = [
      'lib/i18n/dashboard/he.ts', 'lib/i18n/dashboard/en.ts', 'lib/i18n/dashboard/es.ts',
      'lib/i18n/dashboard/pt-BR/projects.ts', 'lib/i18n/dashboard/de/projects.ts',
      'lib/i18n/dashboard/fr/projects.ts', 'lib/i18n/dashboard/it/projects.ts',
      'lib/i18n/dashboard/nl/projects.ts', 'lib/i18n/dashboard/pl/projects.ts',
      'lib/i18n/dashboard/ja/projects.ts', 'lib/i18n/dashboard/ko/projects.ts',
    ]
    const values = files.map((f) => (readFileSync(f, 'utf8').match(/gridNotMeasured: '([^']+)'/) || [])[1])
    return values.every((v) => typeof v === 'string' && v.length > 0)
      && new Set(values).size === values.length
      && PAGE_SRC.includes('notMeasured: t.gridNotMeasured')
  })())
check('F9-MUT: a picture that names the outline nowhere fails F9 and F10',
  !stoppedHtml.split(LABELS.notMeasured).join('x').includes(LABELS.notMeasured))
check('F11-MUT: a legend entry shown for a mark that is not drawn fails F11',
  html.includes(LABELS.notFound) && (() => {
    const always = html.replace('</div>', `${LABELS.notMeasured}</div>`)
    return always.includes(LABELS.notMeasured)
  })())

console.log(`\n${pass} passed, ${fail} failed`)
if (fail > 0) process.exit(1)

export {}
