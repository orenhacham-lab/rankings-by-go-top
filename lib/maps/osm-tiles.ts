/**
 * THE MAP UNDER THE GRID PINS, WITHOUT A MAP LIBRARY.
 *
 * The owner chose OpenStreetMap on 2026-11-21, for the reason that it costs
 * nothing. What that choice does NOT include is a mapping library: Leaflet or
 * MapLibre would add a package, a stylesheet, a pan/zoom surface nobody asked
 * for and a second way for this screen to break. A geo-grid is a still picture
 * of a square that was measured once, so what it needs is a still picture.
 *
 * So this file is Web Mercator and nothing else: given the corners of the
 * measured square and a box in pixels, it says which tiles cover it and where
 * each pin sits inside that box. Every function here is pure, which is why the
 * projection can be checked against known coordinates in
 * lib/maps/__qa__/osm-tiles.qa.ts instead of by looking at a screenshot.
 *
 * TWO THINGS THE TILE SERVER IMPOSES, and they are not ours to waive:
 *   1. OpenStreetMap's own tile servers are for low-volume use. This screen
 *      loads at most `MAX_TILES` tiles when a customer opens one grid check,
 *      and nothing prefetches, crawls or bulk-downloads. If this ever becomes
 *      a busy screen it needs a tile host of its own, and `TILE_URL` is the one
 *      line that would change.
 *   2. The attribution is a condition of use, not decoration. `TILE_ATTRIBUTION`
 *      is rendered on the map itself and the component's QA suite fails if it
 *      is removed.
 *
 * A tile request also tells the tile server the viewer's IP address, which
 * makes OpenStreetMap a recipient the privacy policy has to name. That sentence
 * is a legal change, not a code change, and it is tracked separately.
 */

export const TILE_SIZE = 256
export const TILE_URL = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png'
export const TILE_ATTRIBUTION = '© OpenStreetMap'
export const TILE_ATTRIBUTION_HREF = 'https://www.openstreetmap.org/copyright'

/** The most tiles one grid may request. A 5x5 at 1.5 km fits in far fewer. */
export const MAX_TILES = 20

/** Zoom is bounded: below 3 the world repeats, above 18 OSM has no tiles everywhere. */
export const MIN_ZOOM = 3
export const MAX_ZOOM = 18

export interface LatLng {
  lat: number
  lng: number
}

export interface Bounds {
  north: number
  south: number
  east: number
  west: number
}

/**
 * Web Mercator, in "world pixels" at a given zoom: the whole world is
 * `TILE_SIZE * 2^zoom` pixels on a side. Latitude is clamped to the Mercator
 * limit (±85.05112878°) rather than allowed to run to infinity at the poles.
 */
export function project(point: LatLng, zoom: number): { x: number; y: number } {
  const scale = TILE_SIZE * Math.pow(2, zoom)
  const lat = Math.max(-85.05112878, Math.min(85.05112878, point.lat))
  const lng = ((((point.lng + 180) % 360) + 360) % 360) - 180
  const sin = Math.sin((lat * Math.PI) / 180)
  return {
    x: ((lng + 180) / 360) * scale,
    y: (0.5 - Math.log((1 + sin) / (1 - sin)) / (4 * Math.PI)) * scale,
  }
}

export function boundsOf(points: LatLng[]): Bounds | null {
  if (!points.length) return null
  let north = -Infinity
  let south = Infinity
  let east = -Infinity
  let west = Infinity
  for (const p of points) {
    if (!Number.isFinite(p.lat) || !Number.isFinite(p.lng)) continue
    north = Math.max(north, p.lat)
    south = Math.min(south, p.lat)
    east = Math.max(east, p.lng)
    west = Math.min(west, p.lng)
  }
  if (!Number.isFinite(north) || !Number.isFinite(west)) return null
  return { north, south, east, west }
}

/**
 * The largest zoom at which the bounds still fit inside the box, so the square
 * fills as much of the picture as it can without being cut.
 *
 * `padPx` is the room the pins themselves need: a pin at the very edge is drawn
 * centred on its point, so half a pin hangs outside the bounds.
 */
export function fitZoom(bounds: Bounds, widthPx: number, heightPx: number, padPx = 0): number {
  const usableW = Math.max(1, widthPx - padPx * 2)
  const usableH = Math.max(1, heightPx - padPx * 2)
  for (let zoom = MAX_ZOOM; zoom > MIN_ZOOM; zoom--) {
    const nw = project({ lat: bounds.north, lng: bounds.west }, zoom)
    const se = project({ lat: bounds.south, lng: bounds.east }, zoom)
    if (Math.abs(se.x - nw.x) <= usableW && Math.abs(se.y - nw.y) <= usableH) return zoom
  }
  return MIN_ZOOM
}

export interface TileRef {
  z: number
  x: number
  y: number
  /** Where this tile's top-left corner sits inside the box, in pixels. */
  left: number
  top: number
  url: string
}

export interface TilePlan {
  zoom: number
  tiles: TileRef[]
  /** Turns a point into its position inside the box, in pixels. */
  positionOf: (point: LatLng) => { left: number; top: number }
  /** True when the plan was cut short by MAX_TILES and the map is incomplete. */
  truncated: boolean
}

/**
 * Which tiles cover the bounds inside a box of this size, and where each goes.
 *
 * The box is centred on the bounds' own centre, so the measured square sits in
 * the middle of the picture whatever its shape.
 */
export function planTiles(
  bounds: Bounds,
  widthPx: number,
  heightPx: number,
  options: { padPx?: number; zoom?: number; maxTiles?: number } = {}
): TilePlan {
  const padPx = options.padPx ?? 0
  const maxTiles = options.maxTiles ?? MAX_TILES
  const zoom = options.zoom ?? fitZoom(bounds, widthPx, heightPx, padPx)
  const scale = TILE_SIZE * Math.pow(2, zoom)
  const worldPerTile = Math.pow(2, zoom)

  const nw = project({ lat: bounds.north, lng: bounds.west }, zoom)
  const se = project({ lat: bounds.south, lng: bounds.east }, zoom)
  const centre = { x: (nw.x + se.x) / 2, y: (nw.y + se.y) / 2 }
  // World-pixel coordinates of the box's own top-left corner.
  const originX = centre.x - widthPx / 2
  const originY = centre.y - heightPx / 2

  const positionOf = (point: LatLng) => {
    const p = project(point, zoom)
    return { left: p.x - originX, top: p.y - originY }
  }

  const firstX = Math.floor(originX / TILE_SIZE)
  const lastX = Math.floor((originX + widthPx) / TILE_SIZE)
  const firstY = Math.floor(originY / TILE_SIZE)
  const lastY = Math.floor((originY + heightPx) / TILE_SIZE)

  const tiles: TileRef[] = []
  let truncated = false
  for (let ty = firstY; ty <= lastY; ty++) {
    // Above the north pole or below the south pole there is no tile to ask for.
    if (ty < 0 || ty >= worldPerTile) continue
    for (let tx = firstX; tx <= lastX; tx++) {
      if (tiles.length >= maxTiles) {
        truncated = true
        break
      }
      // Longitude wraps, so a box straddling the antimeridian asks for the
      // tile on the other side rather than for a tile that does not exist.
      const wrappedX = ((tx % worldPerTile) + worldPerTile) % worldPerTile
      tiles.push({
        z: zoom,
        x: wrappedX,
        y: ty,
        left: tx * TILE_SIZE - originX,
        top: ty * TILE_SIZE - originY,
        url: TILE_URL.replace('{z}', String(zoom)).replace('{x}', String(wrappedX)).replace('{y}', String(ty)),
      })
    }
    if (truncated) break
  }

  void scale
  return { zoom, tiles, positionOf, truncated }
}
