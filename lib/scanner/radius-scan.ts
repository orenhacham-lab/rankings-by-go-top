/**
 * Radius scan utilities for generating multiple scan points around a center location
 */

export interface RadiusPoint {
  direction: string
  lat: number
  lng: number
  distanceMiles: number
  label: string
}

/**
 * Convert miles to degrees latitude (roughly 69 miles per degree)
 * and longitude (varies by latitude, approximate for mid-US)
 */
function milesToLatitude(miles: number): number {
  return miles / 69.0
}

function milesToLongitude(miles: number, lat: number): number {
  const latitudeRadians = (lat * Math.PI) / 180
  const milesPerDegree = 69.0 * Math.cos(latitudeRadians)
  return miles / milesPerDegree
}

/**
 * Generate radius points around a center coordinate
 * Returns the center point plus 8 cardinal/diagonal points
 */
export function generateRadiusPoints(
  centerLat: number,
  centerLng: number,
  radiusMiles: number,
  centerZip: string
): RadiusPoint[] {
  const points: RadiusPoint[] = []

  // Center point
  points.push({
    direction: 'center',
    lat: centerLat,
    lng: centerLng,
    distanceMiles: 0,
    label: `Center (ZIP ${centerZip})`,
  })

  const latOffset = milesToLatitude(radiusMiles)
  const lngOffset = milesToLongitude(radiusMiles, centerLat)

  // Cardinal directions
  points.push({
    direction: 'north',
    lat: centerLat + latOffset,
    lng: centerLng,
    distanceMiles: radiusMiles,
    label: `North`,
  })

  points.push({
    direction: 'south',
    lat: centerLat - latOffset,
    lng: centerLng,
    distanceMiles: radiusMiles,
    label: `South`,
  })

  points.push({
    direction: 'east',
    lat: centerLat,
    lng: centerLng + lngOffset,
    distanceMiles: radiusMiles,
    label: `East`,
  })

  points.push({
    direction: 'west',
    lat: centerLat,
    lng: centerLng - lngOffset,
    distanceMiles: radiusMiles,
    label: `West`,
  })

  // Diagonal directions (reduce distance to ~70% for better coverage)
  const diagonalFactor = 0.7
  const diagonalLatOffset = latOffset * diagonalFactor
  const diagonalLngOffset = lngOffset * diagonalFactor
  const diagonalMiles = radiusMiles * diagonalFactor

  points.push({
    direction: 'northeast',
    lat: centerLat + diagonalLatOffset,
    lng: centerLng + diagonalLngOffset,
    distanceMiles: diagonalMiles,
    label: `Northeast`,
  })

  points.push({
    direction: 'northwest',
    lat: centerLat + diagonalLatOffset,
    lng: centerLng - diagonalLngOffset,
    distanceMiles: diagonalMiles,
    label: `Northwest`,
  })

  points.push({
    direction: 'southeast',
    lat: centerLat - diagonalLatOffset,
    lng: centerLng + diagonalLngOffset,
    distanceMiles: diagonalMiles,
    label: `Southeast`,
  })

  points.push({
    direction: 'southwest',
    lat: centerLat - diagonalLatOffset,
    lng: centerLng - diagonalLngOffset,
    distanceMiles: diagonalMiles,
    label: `Southwest`,
  })

  return points
}

/**
 * Radius scan result from a single point
 */
export interface RadiusPointResult {
  point: RadiusPoint
  found: boolean
  position?: number | null
  title?: string | null
  address?: string | null
  error?: string | null
}

/**
 * Aggregate radius scan results
 */
export function aggregateRadiusResults(results: RadiusPointResult[]): {
  bestMatch: RadiusPointResult | null
  allResults: RadiusPointResult[]
  successCount: number
  failureCount: number
} {
  const successful = results.filter(r => r.found && r.position !== null && r.position !== undefined)
  const bestMatch = successful.length > 0
    ? successful.reduce((best, current) =>
      (current.position ?? Infinity) < (best.position ?? Infinity) ? current : best
    )
    : null

  return {
    bestMatch,
    allResults: results,
    successCount: successful.length,
    failureCount: results.length - successful.length,
  }
}
