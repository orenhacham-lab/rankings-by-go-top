/**
 * THE PROJECTION UNDER THE AREA MAP.
 *
 * A map drawn with the wrong projection is not a smaller error than a wrong
 * position: the pins would sit over the wrong streets and the picture would
 * still look plausible. So Web Mercator is checked against coordinates whose
 * tile numbers are known independently, and the parts that only matter at the
 * edges of the world — the poles, the antimeridian — are checked too, because
 * nobody will notice them in a screenshot of Tel Aviv.
 *
 * Run: npx tsx lib/maps/__qa__/osm-tiles.qa.ts
 */
import {
  project, boundsOf, fitZoom, planTiles,
  TILE_SIZE, TILE_URL, TILE_ATTRIBUTION, MAX_TILES, MIN_ZOOM, MAX_ZOOM,
} from '../osm-tiles'

let pass = 0, fail = 0
function check(name: string, cond: boolean, detail?: string) {
  if (cond) { pass++; console.log(`  ✓ ${name}`) } else { fail++; console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`) }
}
const near = (a: number, b: number, eps = 1e-6) => Math.abs(a - b) <= eps

console.log('\nA) Web Mercator, against known values')

// At zoom 0 the whole world is one 256px tile: (0,0) is its exact centre.
const z0 = project({ lat: 0, lng: 0 }, 0)
check('A1: the origin is the centre of the single zoom-0 tile', near(z0.x, 128) && near(z0.y, 128))
// 180°E and 180°W are the SAME meridian, so a wrapped world has to put them in
// the same place, and that place is the seam at x=0. Expecting 256 for one and
// 0 for the other would be expecting the world to have two edges.
check('A2: the antimeridian is one line, at the seam, however it is written',
  near(project({ lat: 0, lng: 180 }, 0).x, 0) &&
  near(project({ lat: 0, lng: -180 }, 0).x, 0) &&
  near(project({ lat: 0, lng: 179.9 }, 0).x, 255.9288888889, 1e-6))

// Greenwich/equator at zoom 2: four tiles a side, so x = 2 tiles in.
check('A3: zoom 2 puts the origin on the tile boundary at x=512',
  near(project({ lat: 0, lng: 0 }, 2).x, 512))

// Tel Aviv, 32.0853 N 34.7818 E, is tile 19/14 at zoom 5 (known value).
const tlv = project({ lat: 32.0853, lng: 34.7818 }, 5)
check('A4: Tel Aviv falls in tile 19/12 at zoom 5',
  Math.floor(tlv.x / TILE_SIZE) === 19 && Math.floor(tlv.y / TILE_SIZE) === 12,
  `${Math.floor(tlv.x / TILE_SIZE)}/${Math.floor(tlv.y / TILE_SIZE)}`)

// São Paulo, 23.55 S 46.63 W — southern AND western, the quadrant a sign error hides in.
const sp = project({ lat: -23.5507, lng: -46.6334 }, 5)
check('A5: São Paulo is south of the equator and west of Greenwich',
  sp.y > TILE_SIZE * 16 && sp.x < TILE_SIZE * 16)
check('A5-MUT: a flipped latitude would put it in the northern half',
  project({ lat: 23.5507, lng: -46.6334 }, 5).y < TILE_SIZE * 16)

check('A6: latitude is clamped to the Mercator limit instead of running to infinity',
  Number.isFinite(project({ lat: 90, lng: 0 }, 5).y) && Number.isFinite(project({ lat: -90, lng: 0 }, 5).y))
check('A7: a longitude past the antimeridian wraps instead of leaving the world',
  near(project({ lat: 0, lng: 190 }, 0).x, project({ lat: 0, lng: -170 }, 0).x))
check('A8: north is up — a higher latitude is a SMALLER y',
  project({ lat: 33, lng: 34.78 }, 10).y < project({ lat: 32, lng: 34.78 }, 10).y)

console.log('\nB) the bounds of a measured square')
const square = [
  { lat: 32.10, lng: 34.76 }, { lat: 32.10, lng: 34.80 },
  { lat: 32.06, lng: 34.76 }, { lat: 32.06, lng: 34.80 },
]
const b = boundsOf(square)!
check('B1: the corners are the extremes', b.north === 32.10 && b.south === 32.06 && b.west === 34.76 && b.east === 34.80)
check('B2: no points, no bounds', boundsOf([]) === null)
check('B3: a point that is not a number is ignored, not averaged in',
  boundsOf([...square, { lat: NaN, lng: 34.78 }])!.north === 32.10)
check('B4: every point unreadable is the same as no points',
  boundsOf([{ lat: NaN, lng: NaN }]) === null)

console.log('\nC) the zoom that fits, and the tiles it needs')
const zoom = fitZoom(b, 480, 480, 16)
check('C1: the fitted zoom is inside the allowed range', zoom >= MIN_ZOOM && zoom <= MAX_ZOOM)
const nw = project({ lat: b.north, lng: b.west }, zoom)
const se = project({ lat: b.south, lng: b.east }, zoom)
check('C2: at that zoom the square fits inside the box, pins included',
  Math.abs(se.x - nw.x) <= 480 - 32 && Math.abs(se.y - nw.y) <= 480 - 32)
const nwPlus = project({ lat: b.north, lng: b.west }, zoom + 1)
const sePlus = project({ lat: b.south, lng: b.east }, zoom + 1)
check('C3: and one zoom closer it would NOT fit, so the square fills the picture',
  zoom === MAX_ZOOM || Math.abs(sePlus.x - nwPlus.x) > 480 - 32 || Math.abs(sePlus.y - nwPlus.y) > 480 - 32)

const plan = planTiles(b, 480, 480, { padPx: 16 })
check('C4: the plan covers the box', plan.tiles.length > 0 && !plan.truncated)
check('C5: every tile is a real tile of its zoom',
  plan.tiles.every((t) => t.z === plan.zoom && t.x >= 0 && t.y >= 0 && t.x < 2 ** t.z && t.y < 2 ** t.z))
check('C6: the tiles tile — each is TILE_SIZE from its neighbour, with no gap',
  plan.tiles.every((t) => Number.isInteger((t.left - plan.tiles[0].left) / TILE_SIZE) &&
                          Number.isInteger((t.top - plan.tiles[0].top) / TILE_SIZE)))
check('C7: together they cover the whole box',
  Math.min(...plan.tiles.map((t) => t.left)) <= 0 &&
  Math.min(...plan.tiles.map((t) => t.top)) <= 0 &&
  Math.max(...plan.tiles.map((t) => t.left)) + TILE_SIZE >= 480 &&
  Math.max(...plan.tiles.map((t) => t.top)) + TILE_SIZE >= 480)
check('C8: the url is the OSM one, with z/x/y filled in and no placeholder left',
  plan.tiles.every((t) => t.url === TILE_URL.replace('{z}', String(t.z)).replace('{x}', String(t.x)).replace('{y}', String(t.y))) &&
  plan.tiles.every((t) => !t.url.includes('{')))

console.log('\nD) the square lands where it should inside the box')
const centre = { lat: (b.north + b.south) / 2, lng: (b.east + b.west) / 2 }
const c = plan.positionOf(centre)
check('D1: the centre of the square is the centre of the picture', near(c.left, 240, 0.5) && near(c.top, 240, 0.5))
const topLeft = plan.positionOf({ lat: b.north, lng: b.west })
const bottomRight = plan.positionOf({ lat: b.south, lng: b.east })
check('D2: the northwest corner is up and to the left of the southeast one',
  topLeft.left < bottomRight.left && topLeft.top < bottomRight.top)
check('D3: every measured point is inside the box', square.every((p) => {
  const q = plan.positionOf(p)
  return q.left >= 0 && q.left <= 480 && q.top >= 0 && q.top <= 480
}))
check('D4: a point one row north is drawn ABOVE one row south',
  plan.positionOf({ lat: 32.10, lng: 34.78 }).top < plan.positionOf({ lat: 32.06, lng: 34.78 }).top)

console.log('\nE) the limits that protect the tile server and the screen')
const huge = planTiles({ north: 60, south: -60, east: 170, west: -170 }, 4000, 4000, { zoom: 10 })
check('E1: a plan never asks for more than MAX_TILES', huge.tiles.length <= MAX_TILES)
check('E2: …and says so, instead of silently drawing a half map', huge.truncated)
check('E3: a tiny grid is well under the limit', plan.tiles.length <= MAX_TILES && plan.tiles.length <= 9,
  String(plan.tiles.length))
const polar = planTiles({ north: 85, south: 84.9, east: 1, west: 0 }, 480, 480)
check('E4: near the pole no tile above the world is requested',
  polar.tiles.every((t) => t.y >= 0 && t.y < 2 ** t.z))
const dateline = planTiles({ north: 1, south: -1, east: -179, west: 179 }, 480, 480, { zoom: 4 })
check('E5: across the antimeridian the tiles wrap instead of going out of range',
  dateline.tiles.every((t) => t.x >= 0 && t.x < 2 ** t.z))
check('E6: the attribution is a constant this code carries, not something a caller may forget',
  TILE_ATTRIBUTION.includes('OpenStreetMap'))

console.log(`\n${pass} passed, ${fail} failed`)
if (fail > 0) process.exit(1)

export {}
