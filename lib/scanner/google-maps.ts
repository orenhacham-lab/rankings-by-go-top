import { ScanInput, ScanOutput, ScanAudit, ScanAttempt, GridPointResult } from './types'
import { US_ZIP_CODES, type USZIPCode } from './us-zip-codes'

const SERPER_MAPS_URL = 'https://google.serper.dev/maps'
const REQUEST_TIMEOUT_MS = 15_000
const GEOCODING_CACHE: Map<string, GeocodeResult | null> = new Map()

interface GeocodeResult {
  lat: number
  lng: number
  provider: string
  query_used: string
  success: boolean
}

async function resolveUSZIP(zipCode: string): Promise<GeocodeResult | null> {
  const cacheKey = `zip_${zipCode}`
  if (GEOCODING_CACHE.has(cacheKey)) {
    return GEOCODING_CACHE.get(cacheKey) || null
  }

  // Primary: Local dataset lookup
  const localZIP = US_ZIP_CODES[zipCode]
  if (localZIP) {
    const result: GeocodeResult = {
      lat: localZIP.lat,
      lng: localZIP.lng,
      provider: 'local_dataset',
      query_used: `lookup_zip_${zipCode}`,
      success: true,
    }
    GEOCODING_CACHE.set(cacheKey, result)
    return result
  }

  // Secondary fallback: Nominatim (only if local lookup fails)
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 5000)

  try {
    // Fallback attempt 1: postalcode with countrycodes constraint
    let url = `https://nominatim.openstreetmap.org/search?postalcode=${encodeURIComponent(zipCode)}&countrycodes=us&format=json`
    let response = await fetch(url, { signal: controller.signal })

    if (!response.ok) {
      GEOCODING_CACHE.set(cacheKey, null)
      return null
    }

    let data = (await response.json()) as Array<{ lat: string; lon: string }>

    // Fallback attempt 2: if no results, try full text query
    if (data.length === 0) {
      url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(`${zipCode}, United States`)}&format=json`
      response = await fetch(url, { signal: controller.signal })

      if (response.ok) {
        data = (await response.json()) as Array<{ lat: string; lon: string }>
      }
    }

    if (data.length > 0) {
      const result: GeocodeResult = {
        lat: parseFloat(data[0].lat),
        lng: parseFloat(data[0].lon),
        provider: 'external_fallback',
        query_used: 'nominatim_postalcode',
        success: true,
      }
      GEOCODING_CACHE.set(cacheKey, result)
      return result
    }

    console.warn(`[ZIP Resolution] ZIP ${zipCode} not found in local dataset or Nominatim`)
  } catch (err) {
    console.error(`[ZIP Resolution] External fallback failed for ${zipCode}:`, (err as Error).message)
  } finally {
    clearTimeout(timer)
  }

  GEOCODING_CACHE.set(cacheKey, null)
  return null
}

function validateZIPResults(places: SerperMapsPlace[], geocodeResult: GeocodeResult): boolean {
  // Validate that results are approximately within US bounds and not obviously wrong
  // Allow 100+ mile radius for results (ZIP areas can be scattered)
  const VALIDATION_RADIUS_KM = 200

  if (!places.length) return true

  for (const place of places.slice(0, 5)) {
    if (place.latitude !== undefined && place.longitude !== undefined) {
      const distance = calculateDistance(geocodeResult.lat, geocodeResult.lng, place.latitude, place.longitude)
      if (distance <= VALIDATION_RADIUS_KM) {
        return true
      }
    }
  }

  // If no coordinates available in response, assume valid (can't validate)
  return !places.some((p) => p.latitude !== undefined && p.longitude !== undefined)
}

function calculateDistance(lat1: number, lng1: number, lat2: number, lng2: number): number {
  // Haversine formula for distance between two points in km
  const R = 6371
  const dLat = ((lat2 - lat1) * Math.PI) / 180
  const dLng = ((lng2 - lng1) * Math.PI) / 180
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) * Math.sin(dLng / 2)
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
  return R * c
}

interface SerperMapsPlace {
  title: string
  address?: string
  position: number
  rating?: number
  phoneNumber?: string
  website?: string
  latitude?: number
  longitude?: number
  cid?: string
}

interface SerperMapsResponse {
  places?: SerperMapsPlace[]
  error?: string
  searchParameters?: {
    ll?: string
    [key: string]: unknown
  }
}

// Country bounding boxes — used to reject provider responses that return
// results clearly outside the project's country
const COUNTRY_BOUNDS: Record<string, { minLat: number; maxLat: number; minLng: number; maxLng: number }> = {
  il: { minLat: 29.0, maxLat: 33.5, minLng: 34.0, maxLng: 36.0 },
  us: { minLat: 24.0, maxLat: 50.0, minLng: -125.0, maxLng: -66.0 },
  gb: { minLat: 49.0, maxLat: 61.0, minLng: -8.5, maxLng: 2.0 },
}

// Israeli cities with their coordinates for proper geo context
const ISRAELI_CITIES: Record<string, { lat: number; lng: number }> = {
  'tel aviv': { lat: 32.0853, lng: 34.7818 },
  'tel-aviv': { lat: 32.0853, lng: 34.7818 },
  'תל אביב': { lat: 32.0853, lng: 34.7818 },
  'jerusalem': { lat: 31.7683, lng: 35.2137 },
  'ירושלים': { lat: 31.7683, lng: 35.2137 },
  'haifa': { lat: 32.8193, lng: 34.9991 },
  'חיפה': { lat: 32.8193, lng: 34.9991 },
  'be\'er sheva': { lat: 31.2507, lng: 34.7915 },
  'beersheva': { lat: 31.2507, lng: 34.7915 },
  'באר שבע': { lat: 31.2507, lng: 34.7915 },
  'ramat gan': { lat: 32.0684, lng: 34.8248 },
  'רמת גן': { lat: 32.0684, lng: 34.8248 },
  'petah tikva': { lat: 32.0878, lng: 34.8878 },
  'petach tikva': { lat: 32.0878, lng: 34.8878 },
  'פתח תקווה': { lat: 32.0878, lng: 34.8878 },
  'netanya': { lat: 32.3215, lng: 34.8532 },
  'נתניה': { lat: 32.3215, lng: 34.8532 },
  'holon': { lat: 32.0167, lng: 34.7792 },
  'חולון': { lat: 32.0167, lng: 34.7792 },
  'rishon lezion': { lat: 31.9594, lng: 34.8048 },
  'ראשון לציון': { lat: 31.9594, lng: 34.8048 },
  'ashdod': { lat: 31.8044, lng: 34.6553 },
  'אשדוד': { lat: 31.8044, lng: 34.6553 },
  'bat yam': { lat: 32.0171, lng: 34.7506 },
  'בת ים': { lat: 32.0171, lng: 34.7506 },
  'herzliya': { lat: 32.1663, lng: 34.8434 },
  'הרצליה': { lat: 32.1663, lng: 34.8434 },
  'givatayim': { lat: 32.0719, lng: 34.8108 },
  'גבעתיים': { lat: 32.0719, lng: 34.8108 },
  'kfar saba': { lat: 32.1750, lng: 34.9069 },
  'כפר סבא': { lat: 32.1750, lng: 34.9069 },
  'raanana': { lat: 32.1836, lng: 34.8708 },
  'רעננה': { lat: 32.1836, lng: 34.8708 },
  'beit shemesh': { lat: 31.7486, lng: 34.9886 },
  'בית שמש': { lat: 31.7486, lng: 34.9886 },
  'eilat': { lat: 29.5577, lng: 34.9519 },
  'אילת': { lat: 29.5577, lng: 34.9519 },
}

// Parse "lat,lng" or "@lat,lng,zoom" or "@lat,lng" into coordinates
function parseCoordinates(raw: string | undefined): { lat: number; lng: number } | null {
  if (!raw) return null
  const cleaned = raw.replace(/^@/, '')
  const parts = cleaned.split(',').map(s => s.trim())
  if (parts.length < 2) return null
  const lat = parseFloat(parts[0])
  const lng = parseFloat(parts[1])
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null
  return { lat, lng }
}

// Check if a point is inside a country's bounding box
function isInBounds(
  coords: { lat: number; lng: number },
  bounds: { minLat: number; maxLat: number; minLng: number; maxLng: number }
): boolean {
  return (
    coords.lat >= bounds.minLat &&
    coords.lat <= bounds.maxLat &&
    coords.lng >= bounds.minLng &&
    coords.lng <= bounds.maxLng
  )
}

// Validate that the provider's response geo context actually belongs to the
// project's country. Returns { valid, returnedLl, placesInCountry, placesWithCoords }
function validateGeoContext(
  response: SerperMapsResponse,
  country: string
): {
  valid: boolean
  returnedLl: string | null
  returnedCoords: { lat: number; lng: number } | null
  placesWithCoords: number
  placesInCountry: number
  reason: string
} {
  const bounds = COUNTRY_BOUNDS[country.toLowerCase()]
  if (!bounds) {
    return { valid: true, returnedLl: null, returnedCoords: null, placesWithCoords: 0, placesInCountry: 0, reason: 'no bounds defined for country' }
  }

  const returnedLl = response.searchParameters?.ll ?? null
  const returnedCoords = parseCoordinates(returnedLl ?? undefined)

  // If the provider returned ll and it's outside the country, reject
  if (returnedCoords && !isInBounds(returnedCoords, bounds)) {
    return {
      valid: false,
      returnedLl,
      returnedCoords,
      placesWithCoords: 0,
      placesInCountry: 0,
      reason: `returned ll ${returnedLl} is outside ${country.toUpperCase()} bounds`,
    }
  }

  const places = response.places ?? []
  const placesWithCoords = places.filter(
    p => typeof p.latitude === 'number' && typeof p.longitude === 'number'
  )
  const placesInCountry = placesWithCoords.filter(p =>
    isInBounds({ lat: p.latitude as number, lng: p.longitude as number }, bounds)
  )

  // If we have place coordinates, majority must be in-country
  if (placesWithCoords.length > 0) {
    const ratio = placesInCountry.length / placesWithCoords.length
    if (ratio < 0.5) {
      return {
        valid: false,
        returnedLl,
        returnedCoords,
        placesWithCoords: placesWithCoords.length,
        placesInCountry: placesInCountry.length,
        reason: `only ${placesInCountry.length}/${placesWithCoords.length} places are inside ${country.toUpperCase()}`,
      }
    }
  }

  return {
    valid: true,
    returnedLl,
    returnedCoords,
    placesWithCoords: placesWithCoords.length,
    placesInCountry: placesInCountry.length,
    reason: 'geo context valid',
  }
}

async function querySerperMaps(
  query: string,
  country: string,
  language: string,
  location?: string,
  coordinates?: { lat: number; lng: number }
): Promise<SerperMapsResponse | null> {
  const apiKey = process.env.SERPER_API_KEY
  if (!apiKey) return null

  const body: Record<string, unknown> = {
    q: query,
    gl: country.toLowerCase(),
    hl: language,
  }

  // Always set location string for proper geocoding context
  // If coordinates available, add as ll for precision
  if (location) {
    body.location = location
  }

  if (coordinates) {
    // Serper Maps expects ll in "@lat,lng,zoom" format (Google Maps URL format)
    // Zoom level 13 = city-level view; 12 = wider city area
    body.ll = `@${coordinates.lat},${coordinates.lng},13z`
  }

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)

  console.log('[Maps:API] Sending to Serper:', {
    q: body.q,
    gl: body.gl,
    hl: body.hl,
    location: body.location ?? '(not set)',
    ll: body.ll ?? '(not set)',
  })

  try {
    const response = await fetch(SERPER_MAPS_URL, {
      method: 'POST',
      headers: {
        'X-API-KEY': apiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    })

    if (!response.ok) {
      return null
    }

    return await response.json()
  } catch {
    return null
  } finally {
    clearTimeout(timer)
  }
}

function findBusinessMatch(places: SerperMapsPlace[], targetName: string): SerperMapsPlace | null {
  const normalizedTarget = normalizeBusinessName(targetName)

  for (const place of places) {
    const normalizedPlace = normalizeBusinessName(place.title)
    if (isBusinessMatch(normalizedPlace, normalizedTarget)) {
      return place
    }
  }

  return null
}

function computeResultSignature(places: SerperMapsPlace[]): string {
  return places.slice(0, 5).map(p => p.cid || p.title).join('|')
}

function analyzeMatchDebug(places: SerperMapsPlace[], targetName: string): {
  top_places: Array<{ title: string; position: number }>
  business_returned: boolean
  business_rejected: boolean
  rejection_reason?: 'title_mismatch' | 'domain_mismatch' | 'phone_mismatch'
  places_checked_count: number
  target_checked_against_all_places: boolean
  result_signature: string
} {
  const normalizedTarget = normalizeBusinessName(targetName)
  const topPlaces = places.slice(0, 5).map(p => ({ title: p.title, position: p.position }))
  const signature = computeResultSignature(places)

  // Check if business appears in the returned places
  let foundIndex = -1
  for (let i = 0; i < places.length; i++) {
    const normalizedPlace = normalizeBusinessName(places[i].title)
    if (normalizedPlace === normalizedTarget) {
      foundIndex = i
      break
    }
  }

  if (foundIndex >= 0) {
    return {
      top_places: topPlaces,
      business_returned: true,
      business_rejected: false,
      places_checked_count: places.length,
      target_checked_against_all_places: true,
      result_signature: signature,
    }
  }

  // Check if business was in results but title didn't match closely
  const normalizedTarget2 = normalizeBusinessName(targetName)
  for (const place of places) {
    const normalizedPlace = normalizeBusinessName(place.title)
    // Check if it's close but isBusinessMatch rejected it
    const similarity = diceSimilarity(normalizedPlace, normalizedTarget2)
    if (similarity > 0.5) {
      return {
        top_places: topPlaces,
        business_returned: true,
        business_rejected: true,
        rejection_reason: 'title_mismatch',
        places_checked_count: places.length,
        target_checked_against_all_places: true,
        result_signature: signature,
      }
    }
  }

  return {
    top_places: topPlaces,
    business_returned: false,
    business_rejected: false,
    places_checked_count: places.length,
    target_checked_against_all_places: true,
    result_signature: signature,
  }
}

// Grid offsets as [dlat, dlng] from city center
// lat step ~0.009° ≈ 1 km; lng step ~0.011° ≈ 1 km at 32°N
const GRID_CONFIGS: Record<string, [number, number][]> = {
  small: [
    [0, 0],
    [-0.009, 0], [0.009, 0], [0, -0.011], [0, 0.011],
  ],
  medium: [
    [-0.009, -0.011], [-0.009, 0], [-0.009, 0.011],
    [0,      -0.011], [0,      0], [0,      0.011],
    [0.009,  -0.011], [0.009,  0], [0.009,  0.011],
  ],
  large: [
    [-0.009, -0.011], [-0.009, 0], [-0.009, 0.011],
    [0,      -0.011], [0,      0], [0,      0.011],
    [0.009,  -0.011], [0.009,  0], [0.009,  0.011],
    [-0.018, 0],      [0.018,  0], [0,      -0.022], [0,      0.022],
  ],
}

function generateGridPoints(
  center: { lat: number; lng: number },
  size: 'small' | 'medium' | 'large'
): Array<{ lat: number; lng: number; label: string }> {
  const offsets = GRID_CONFIGS[size] || GRID_CONFIGS.small
  return offsets.map(([dlat, dlng], idx) => ({
    lat: Math.round((center.lat + dlat) * 1e6) / 1e6,
    lng: Math.round((center.lng + dlng) * 1e6) / 1e6,
    label: idx === 0 ? 'center' : `offset_${idx}`,
  }))
}

async function runGridScan(
  input: ScanInput,
  center: { lat: number; lng: number },
  gridSize: 'small' | 'medium' | 'large',
  businessName: string,
  country: string,
  language: string,
  effectiveCity: string | null
): Promise<ScanOutput> {
  const gridPoints = generateGridPoints(center, gridSize)
  const perPointResults: GridPointResult[] = []
  const foundPositions: number[] = []

  let bestMatch: SerperMapsPlace | null = null
  let bestMatchPoint: (typeof gridPoints)[0] | null = null
  let lastSignature: string | null = null
  let consecutiveMatches = 0
  let earlyStop = false
  let earlyStopReason: string | null = null

  for (let i = 0; i < gridPoints.length; i++) {
    const point = gridPoints[i]
    const response = await querySerperMaps(input.keyword, country, language, input.city || undefined, point)
    const places = response?.places ?? []
    const matched = response ? findBusinessMatch(places, businessName) : null
    const debug = analyzeMatchDebug(places, businessName)

    perPointResults.push({
      point_index: i,
      lat: point.lat,
      lng: point.lng,
      label: point.label,
      found: Boolean(matched),
      position: matched ? matched.position : null,
      places_count: places.length,
      matched_title: matched ? matched.title : null,
      matched_address: matched ? matched.address || null : null,
      top_places: debug.top_places,
      business_returned: debug.business_returned,
      business_rejected: debug.business_rejected,
      rejection_reason: debug.rejection_reason,
      places_checked_count: debug.places_checked_count,
      target_checked_against_all_places: debug.target_checked_against_all_places,
      result_signature: debug.result_signature,
    })

    if (matched) {
      foundPositions.push(matched.position)
      if (!bestMatch || matched.position < bestMatch.position) {
        bestMatch = matched
        bestMatchPoint = point
      }
    }

    // Early-stop: if this point has identical result signature to previous, increment counter
    if (lastSignature && debug.result_signature === lastSignature) {
      consecutiveMatches++
      // If 2 consecutive points are identical, stop early — results have converged
      if (consecutiveMatches >= 1) {
        earlyStop = true
        earlyStopReason = 'consecutive_identical_result_signatures'
        break
      }
    } else {
      consecutiveMatches = 0
    }
    lastSignature = debug.result_signature
  }

  const found = foundPositions.length > 0
  const bestPosition = found ? Math.min(...foundPositions) : null
  const worstPosition = found ? Math.max(...foundPositions) : null
  const avgPosition = found
    ? Math.round((foundPositions.reduce((a, b) => a + b, 0) / foundPositions.length) * 10) / 10
    : null
  const executedPoints = perPointResults.length
  const skippedPoints = gridPoints.length - executedPoints
  const coverage = executedPoints > 0 ? Math.round((foundPositions.length / executedPoints) * 1000) / 1000 : 0

  const centerLl = `@${center.lat},${center.lng},13z`

  const audit: ScanAudit = {
    request: {
      keyword: input.keyword,
      engine: 'google_maps',
      projectCity: effectiveCity || null,
      projectCountry: country.toUpperCase(),
      locationMode: 'grid',
      locationSent: effectiveCity || 'grid',
      llSent: centerLl,
      gl: country,
      hl: language,
      scanner_version: '2.0-grid',
    },
    response: {
      placesCount: perPointResults.reduce((s, p) => s + p.places_count, 0),
      placesSample: [],
    },
    decision: {
      found,
      matchedPosition: bestPosition,
      matchedTitle: bestMatch?.title || null,
      matchedAddress: bestMatch?.address || null,
      attempts: [],
      geoValidationPassed: true,
      grid_enabled: true,
      grid_size: gridSize,
      grid_points: gridPoints,
      per_point_results: perPointResults,
      best_position: bestPosition,
      avg_position: avgPosition,
      avg_position_mode: 'found_only' as const,
      worst_position: worstPosition,
      coverage,
      position_source: 'best_of_grid' as const,
      early_stopped: earlyStop,
      early_stop_reason: earlyStopReason || undefined,
      executed_points: executedPoints,
      skipped_points: skippedPoints,
    },
  }

  return {
    found,
    position: bestPosition,
    resultUrl: bestMatch?.website || null,
    resultTitle: bestMatch?.title || null,
    resultAddress: bestMatch?.address || null,
    error: null,
    audit,
  }
}

export async function scanGoogleMaps(input: ScanInput): Promise<ScanOutput> {
  const apiKey = process.env.SERPER_API_KEY
  if (!apiKey) {
    return makeError('SERPER_API_KEY is not configured', null, null)
  }

  const businessName = input.targetBusinessName?.trim()
  if (!businessName) {
    return makeError('No target business name specified', null, null)
  }

  const country = (input.country || 'IL').toLowerCase()
  const language = input.language || 'he'

  // exact_point mode: ll is the ONLY source of truth. No city, no ZIP fallback.
  if (input.locationMode === 'exact_point' && input.exactPoint) {
    const { lat, lng } = input.exactPoint
    const auditAttempts: ScanAttempt[] = []
    const outgoingLl = `@${lat},${lng},13z`

    try {
      // Deliberately pass NO location (only ll + gl + hl). This is what makes
      // exact_point deterministic: no city string can drift the geo context.
      const response = await querySerperMaps(input.keyword, country, language, undefined, { lat, lng })
      const lastResponse = response

      if (!response) {
        auditAttempts.push({ attemptNumber: 1, context: 'exact_point', location: null, ll: outgoingLl, found: false })
        const audit = buildAudit(input, country, language, lastResponse, auditAttempts, false, null, null, null, undefined, 'No response from Serper', null)
        if (audit.decision) {
          ;(audit.decision as Record<string, unknown>).exact_point_used = true
          ;(audit.decision as Record<string, unknown>).exact_point_lat = lat
          ;(audit.decision as Record<string, unknown>).exact_point_lng = lng
          ;(audit.decision as Record<string, unknown>).exact_point_resolution_source = input.exactPoint.resolutionSource || null
          ;(audit.decision as Record<string, unknown>).exact_point_geocoding_provider = input.exactPoint.geocodingProvider || null
          ;(audit.decision as Record<string, unknown>).exact_point_address_input = input.exactPoint.addressInput || null
        }
        return { found: false, position: null, resultUrl: null, resultTitle: null, resultAddress: null, error: 'No response from Serper', audit }
      }
      if (response.error) {
        const audit = buildAudit(input, country, language, lastResponse, auditAttempts, false, null, null, null, undefined, response.error, null)
        if (audit.decision) {
          ;(audit.decision as Record<string, unknown>).exact_point_used = true
          ;(audit.decision as Record<string, unknown>).exact_point_lat = lat
          ;(audit.decision as Record<string, unknown>).exact_point_lng = lng
          ;(audit.decision as Record<string, unknown>).exact_point_resolution_source = input.exactPoint.resolutionSource || null
          ;(audit.decision as Record<string, unknown>).exact_point_geocoding_provider = input.exactPoint.geocodingProvider || null
          ;(audit.decision as Record<string, unknown>).exact_point_address_input = input.exactPoint.addressInput || null
        }
        return { ...makeError(response.error, input, audit), audit }
      }

      const places = response.places ?? []
      const matchedPlace = findBusinessMatch(places, businessName)

      if (matchedPlace) {
        auditAttempts.push({
          attemptNumber: 1,
          context: 'exact_point',
          location: null,
          ll: outgoingLl,
          found: true,
          matchedTitle: matchedPlace.title,
          matchedPosition: matchedPlace.position,
          matchedAddress: matchedPlace.address || null,
        })
        const audit = buildAudit(input, country, language, lastResponse, auditAttempts, true, matchedPlace.position, matchedPlace.title, matchedPlace.address || null, 0, null, null)
        if (audit.decision) {
          ;(audit.decision as Record<string, unknown>).exact_point_used = true
          ;(audit.decision as Record<string, unknown>).exact_point_lat = lat
          ;(audit.decision as Record<string, unknown>).exact_point_lng = lng
          ;(audit.decision as Record<string, unknown>).exact_point_resolution_source = input.exactPoint.resolutionSource || null
          ;(audit.decision as Record<string, unknown>).exact_point_geocoding_provider = input.exactPoint.geocodingProvider || null
          ;(audit.decision as Record<string, unknown>).exact_point_address_input = input.exactPoint.addressInput || null
        }
        return {
          found: true,
          position: matchedPlace.position,
          resultUrl: matchedPlace.website || null,
          resultTitle: matchedPlace.title,
          resultAddress: matchedPlace.address || null,
          error: null,
          audit,
        }
      }

      auditAttempts.push({ attemptNumber: 1, context: 'exact_point', location: null, ll: outgoingLl, found: false })
      const audit = buildAudit(input, country, language, lastResponse, auditAttempts, false, null, null, null, undefined, null, null)
      if (audit.decision) {
        ;(audit.decision as Record<string, unknown>).exact_point_used = true
        ;(audit.decision as Record<string, unknown>).exact_point_lat = lat
        ;(audit.decision as Record<string, unknown>).exact_point_lng = lng
        ;(audit.decision as Record<string, unknown>).exact_point_resolution_source = input.exactPoint.resolutionSource || null
        ;(audit.decision as Record<string, unknown>).exact_point_geocoding_provider = input.exactPoint.geocodingProvider || null
        ;(audit.decision as Record<string, unknown>).exact_point_address_input = input.exactPoint.addressInput || null
      }
      return { found: false, position: null, resultUrl: null, resultTitle: null, resultAddress: null, error: null, audit }
    } catch (err) {
      const audit = buildAudit(input, country, language, null, auditAttempts, false, null, null, null, undefined, (err as Error).message, null)
      if (audit.decision) {
        ;(audit.decision as Record<string, unknown>).exact_point_used = true
        ;(audit.decision as Record<string, unknown>).exact_point_lat = lat
        ;(audit.decision as Record<string, unknown>).exact_point_lng = lng
      }
      return { ...makeError((err as Error).message, input, audit), audit }
    }
  }

  // ZIP code mode: geocode ZIP to coordinates, send both location and ll
  if (input.locationMode === 'zip' && input.postalCode?.trim()) {
    const postalCode = input.postalCode.trim()
    const auditAttempts: ScanAttempt[] = []
    let lastResponse: SerperMapsResponse | null = null

    try {
      // Resolve ZIP to coordinates (local dataset first, then external fallback)
      const zipResolution = await resolveUSZIP(postalCode)
      if (!zipResolution) {
        const errorMsg = `Unknown ZIP code: ${postalCode}`
        const audit = buildAudit(input, 'us', 'en', lastResponse, auditAttempts, false, null, null, null, undefined, errorMsg, null)
        // Add ZIP resolution metadata to audit
        if (audit.decision) {
          ;(audit.decision as Record<string, unknown>).zip_resolution_source = 'unknown'
          ;(audit.decision as Record<string, unknown>).resolved_zip = postalCode
          ;(audit.decision as Record<string, unknown>).zip_found = false
        }
        return { found: false, position: null, resultUrl: null, resultTitle: null, resultAddress: null, error: errorMsg, audit }
      }

      const response = await querySerperMaps(input.keyword, 'us', 'en', postalCode, zipResolution)
      lastResponse = response

      if (!response) {
        const audit = buildAudit(input, 'us', 'en', lastResponse, auditAttempts, false, null, null, null, undefined, null, null)
        return { found: false, position: null, resultUrl: null, resultTitle: null, resultAddress: null, error: 'No response from Serper', audit }
      }
      if (response.error) {
        const audit = buildAudit(input, 'us', 'en', lastResponse, auditAttempts, false, null, null, null, undefined, response.error, null)
        return { ...makeError(response.error, input, audit), audit }
      }

      const places = response.places ?? []
      const matchedPlace = findBusinessMatch(places, businessName)

      // Validate: check if results are within expected US bounds for the ZIP
      const withinUSBounds = validateZIPResults(places, zipResolution)
      if (!withinUSBounds && places.length > 0) {
        console.warn(`[ZIP Validation] Results for ${postalCode} appear outside expected ZIP area`)
      }

      if (matchedPlace) {
        auditAttempts.push({
          attemptNumber: 1,
          context: 'postal code',
          location: postalCode,
          found: true,
          matchedTitle: matchedPlace.title,
          matchedPosition: matchedPlace.position,
          matchedAddress: matchedPlace.address || null,
        })
        const validationWarning = !withinUSBounds && places.length > 0 ? ' (geo validation warning)' : ''
        const audit = buildAudit(input, 'us', 'en', lastResponse, auditAttempts, true, matchedPlace.position, matchedPlace.title, matchedPlace.address || null, 0, null, validationWarning ? `ZIP area validation: ${validationWarning}` : null)
        // Add ZIP resolution metadata to audit
        if (audit.decision) {
          ;(audit.decision as Record<string, unknown>).zip_resolution_source = zipResolution.provider
          ;(audit.decision as Record<string, unknown>).resolved_zip = postalCode
          ;(audit.decision as Record<string, unknown>).zip_found = true
          ;(audit.decision as Record<string, unknown>).resolved_lat = zipResolution.lat
          ;(audit.decision as Record<string, unknown>).resolved_lng = zipResolution.lng
        }
        return {
          found: true,
          position: matchedPlace.position,
          resultUrl: matchedPlace.website || null,
          resultTitle: matchedPlace.title,
          resultAddress: matchedPlace.address || null,
          error: null,
          audit,
        }
      }

      auditAttempts.push({
        attemptNumber: 1,
        context: 'postal code',
        location: postalCode,
        found: false,
      })
      const audit = buildAudit(input, 'us', 'en', lastResponse, auditAttempts, false, null, null, null, undefined, null, null)
      // Add ZIP resolution metadata to audit
      if (audit.decision) {
        ;(audit.decision as Record<string, unknown>).zip_resolution_source = zipResolution.provider
        ;(audit.decision as Record<string, unknown>).resolved_zip = postalCode
        ;(audit.decision as Record<string, unknown>).zip_found = true
        ;(audit.decision as Record<string, unknown>).resolved_lat = zipResolution.lat
        ;(audit.decision as Record<string, unknown>).resolved_lng = zipResolution.lng
      }
      return { found: false, position: null, resultUrl: null, resultTitle: null, resultAddress: null, error: null, audit }
    } catch (err) {
      const audit = buildAudit(input, 'us', 'en', lastResponse, auditAttempts, false, null, null, null, undefined, (err as Error).message, null)
      return { ...makeError((err as Error).message, input, audit), audit }
    }
  }

  // Resolve effective city: custom/grid override > project city
  const effectiveCity =
    (input.locationMode === 'custom' || input.locationMode === 'grid') && input.customCity?.trim()
      ? input.customCity.trim()
      : input.city?.trim() || null

  // Grid mode: run multi-point scan if city has known coordinates
  if (input.locationMode === 'grid' && input.gridSize) {
    const gridCity = effectiveCity || ''
    const gridCityCoords = ISRAELI_CITIES[gridCity.toLowerCase()]
    if (gridCityCoords) {
      return runGridScan(
        { ...input, city: gridCity },
        gridCityCoords,
        input.gridSize,
        businessName,
        country,
        language,
        effectiveCity
      )
    }
    // Unknown city for grid — fall through to normal scan
    console.warn(`[Maps:Grid] City "${gridCity}" not in ISRAELI_CITIES, falling back to normal scan`)
  }

  const hasCity = Boolean(effectiveCity)

  // Resolve coordinates using effectiveCity (may be custom or project city)
  const cityLower = effectiveCity?.toLowerCase() || ''
  const cityCoordinates = cityLower ? ISRAELI_CITIES[cityLower] : undefined

  console.log('[Maps] ========== SCAN START ==========')
  console.log('[Maps] Input:', {
    keyword: input.keyword,
    businessName,
    projectCountry: country.toUpperCase(),
    effectiveCity: effectiveCity || '(not set)',
    locationMode: input.locationMode || 'project',
    language,
    cityCoordinatesResolved: cityCoordinates ?? null,
  })

  // Build context attempts — project city is PRIMARY, never replaced by
  // generic country-level context when a city is set.
  // Exact keyword is passed unchanged to every attempt.
  const contextAttempts: Array<{
    label: string
    location: string | undefined
    coordinates?: { lat: number; lng: number }
  }> = []

  if (hasCity) {
    // Effective city (custom or project) — primary and only context attempts
    contextAttempts.push({
      label: `city "${effectiveCity}"`,
      location: effectiveCity!,
      coordinates: cityCoordinates,
    })
    contextAttempts.push({
      label: `city+country "${effectiveCity}, ${country.toUpperCase()}"`,
      location: `${effectiveCity}, ${country.toUpperCase()}`,
      coordinates: cityCoordinates,
    })
    if (cityCoordinates) {
      contextAttempts.push({
        label: `city via explicit coordinates only`,
        location: effectiveCity!,
        coordinates: cityCoordinates,
      })
    }
  } else {
    // No project city — fall back to country-level only (generic)
    contextAttempts.push({
      label: `country "${country.toUpperCase()}" (no city set)`,
      location: country.toUpperCase(),
      coordinates: country === 'il' ? { lat: 31.5, lng: 34.75 } : undefined,
    })
  }

  const auditAttempts: ScanAttempt[] = []
  let lastResponse: SerperMapsResponse | null = null
  let successfulAttemptIndex: number | undefined

  try {
    for (let attemptIndex = 0; attemptIndex < contextAttempts.length; attemptIndex++) {
      const attempt = contextAttempts[attemptIndex]

      // GUARD: if city was configured, block any generic country-level fallback
      if (hasCity) {
        const isGenericFallback =
          attempt.location === 'IL' ||
          attempt.location === 'is' ||
          attempt.location === country.toUpperCase() ||
          attempt.location === country ||
          (attempt.coordinates?.lat === 31.5 && attempt.coordinates?.lng === 34.75)

        if (isGenericFallback) {
          const msg = `FORBIDDEN: Generic country fallback attempt for city-configured project (city="${effectiveCity}", location="${attempt.location}", ll="${attempt.coordinates ? `@${attempt.coordinates.lat},${attempt.coordinates.lng},13z` : 'none'}")`
          console.error('[Maps] ERROR:', msg)
          throw new Error(msg)
        }
      }

      const outgoingLl = attempt.coordinates ? `@${attempt.coordinates.lat},${attempt.coordinates.lng},13z` : undefined
      console.log(`[Maps] ---- Attempt: ${attempt.label} ----`)
      console.log('[Maps] FINAL outgoing request:', {
        keyword: input.keyword,
        projectCity: input.city ?? null,
        projectCountry: input.country ?? null,
        location: attempt.location ?? '(none)',
        ll: outgoingLl ?? '(none)',
        gl: country,
        hl: language,
      })

      const response = await querySerperMaps(input.keyword, country, language, attempt.location, attempt.coordinates)
      lastResponse = response

      if (!response) {
        console.log(`[Maps] Attempt "${attempt.label}": no response, skipping`)
        auditAttempts.push({
          attemptNumber: attemptIndex + 1,
          context: attempt.label,
          location: attempt.location,
          ll: outgoingLl,
          found: false,
        })
        continue
      }
      if (response.error) {
        const errorMsg = `Serper API error: ${response.error}`
        console.error('[Maps] ERROR:', errorMsg)
        const audit = buildAudit(input, country, language, lastResponse, auditAttempts, false, null, null, null, undefined, errorMsg, effectiveCity)
        return { ...makeError(errorMsg, input, audit), audit }
      }

      const places = response.places ?? []

      // Validate returned geo context against project country
      const geoCheck = validateGeoContext(response, country)
      console.log('[Maps] Geo validation:', {
        returnedLl: geoCheck.returnedLl ?? '(not in response)',
        placesTotal: places.length,
        placesWithCoords: geoCheck.placesWithCoords,
        placesInCountry: geoCheck.placesInCountry,
        valid: geoCheck.valid,
        reason: geoCheck.reason,
      })

      if (!geoCheck.valid) {
        console.log(`[Maps] ✗ REJECTED attempt "${attempt.label}" — wrong geo context (${geoCheck.reason})`)
        auditAttempts.push({
          attemptNumber: attemptIndex + 1,
          context: attempt.label,
          location: attempt.location,
          ll: outgoingLl,
          found: false,
          geoValidationPassed: false,
          rejectionReason: geoCheck.reason,
        })
        continue
      }

      console.log(`[Maps] Attempt "${attempt.label}": ${places.length} places returned (geo OK)`)

      const matchedPlace = findBusinessMatch(places, businessName)
      if (matchedPlace) {
        successfulAttemptIndex = attemptIndex
        auditAttempts.push({
          attemptNumber: attemptIndex + 1,
          context: attempt.label,
          location: attempt.location,
          ll: outgoingLl,
          found: true,
          matchedTitle: matchedPlace.title,
          matchedPosition: matchedPlace.position,
          matchedAddress: matchedPlace.address || null,
          geoValidationPassed: true,
        })
        console.log(`[Maps] ✓ FOUND via "${attempt.label}" at position ${matchedPlace.position}`)
        console.log('[Maps] ========== SCAN END (FOUND) ==========')
        const audit = buildAudit(input, country, language, lastResponse, auditAttempts, true, matchedPlace.position, matchedPlace.title, matchedPlace.address || null, successfulAttemptIndex, null, effectiveCity)
        return {
          found: true,
          position: matchedPlace.position,
          resultUrl: matchedPlace.website || null,
          resultTitle: matchedPlace.title,
          resultAddress: matchedPlace.address || null,
          error: null,
          audit,
        }
      }

      console.log(`[Maps] ✗ No match for attempt "${attempt.label}"`)
      auditAttempts.push({
        attemptNumber: attemptIndex + 1,
        context: attempt.label,
        location: attempt.location,
        ll: outgoingLl,
        found: false,
        geoValidationPassed: true,
      })
    }

    console.log('[Maps] ✗ NO MATCH — all project-location attempts exhausted (keyword unchanged)')
    console.log('[Maps] ========== SCAN END (NOT FOUND) ==========')
    const audit = buildAudit(input, country, language, lastResponse, auditAttempts, false, null, null, null, undefined, null, effectiveCity)
    return { found: false, position: null, resultUrl: null, resultTitle: null, resultAddress: null, error: null, audit }
  } catch (err) {
    if ((err as Error).name === 'AbortError') {
      const audit = buildAudit(input, country, language, lastResponse, auditAttempts, false, null, null, null, undefined, 'Serper API request timed out', effectiveCity)
      return { ...makeError('Serper API request timed out', input, audit), audit }
    }
    const audit = buildAudit(input, country, language, lastResponse, auditAttempts, false, null, null, null, undefined, (err as Error).message, effectiveCity)
    return { ...makeError((err as Error).message, input, audit), audit }
  }
}

/**
 * Determine if a Maps result title matches the target business name.
 *
 * Strategy (in order):
 * 1. Exact match after normalization
 * 2. One is a prefix of the other (handles "Foo Bar" vs "Foo Bar Restaurant")
 *    — only if the shorter string is >= 4 chars to avoid false positives
 * 3. For Maps results, check if all major words in target appear in place
 *    (handles business names with descriptions)
 * 4. Dice-coefficient similarity >= 0.75 for strings >= 6 chars
 */
function isBusinessMatch(place: string, target: string): boolean {
  if (place === target) return true

  const shorter = place.length <= target.length ? place : target
  const longer = place.length > target.length ? place : target

  // Prefix match — more lenient (>= 4 chars instead of 5)
  if (shorter.length >= 4 && longer.startsWith(shorter)) return true

  // Word-based matching: check if all main words from target are in place
  // Handles "Go Top - שיווק דיגיטלי..." where Maps shows just the name
  const targetWords = target.split(' ').filter(w => w.length > 2)
  const placeWords = place.split(' ')
  if (targetWords.length > 0 && targetWords.every(word => placeWords.some(pw => pw.includes(word) || word.includes(pw)))) {
    return true
  }

  // Fuzzy match — more lenient (0.75 instead of 0.82)
  if (shorter.length >= 6) {
    const similarity = diceSimilarity(place, target)
    if (similarity >= 0.75) return true
  }

  return false
}

function normalizeBusinessName(name: string): string {
  return name
    .trim()
    .toLowerCase()
    // Strip common legal suffixes and punctuation that don't affect identity
    .replace(/[,.'"""''()\-–—]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/** Sørensen–Dice coefficient on character bigrams */
function diceSimilarity(a: string, b: string): number {
  if (a === b) return 1
  if (a.length < 2 || b.length < 2) return 0

  const getBigrams = (s: string) => {
    const bigrams = new Map<string, number>()
    for (let i = 0; i < s.length - 1; i++) {
      const bg = s.slice(i, i + 2)
      bigrams.set(bg, (bigrams.get(bg) ?? 0) + 1)
    }
    return bigrams
  }

  const aBigrams = getBigrams(a)
  const bBigrams = getBigrams(b)

  let intersection = 0
  for (const [bg, count] of bBigrams) {
    const aCount = aBigrams.get(bg) ?? 0
    intersection += Math.min(count, aCount)
  }

  return (2 * intersection) / (a.length - 1 + (b.length - 1))
}

function makeError(message: string, input: ScanInput | null, audit: ScanAudit | null): ScanOutput {
  return { found: false, position: null, resultUrl: null, resultTitle: null, resultAddress: null, error: message, audit: audit || undefined }
}

function buildAudit(
  input: ScanInput,
  country: string,
  language: string,
  lastResponse: SerperMapsResponse | null,
  attempts: ScanAttempt[],
  found: boolean,
  matchedPosition: number | null,
  matchedTitle: string | null,
  matchedAddress: string | null,
  successfulAttemptIndex: number | undefined,
  rejectionReason: string | null,
  effectiveCity: string | null
): ScanAudit {
  // Limit raw response to prevent excessively large audit data
  let rawResponse: unknown = lastResponse || null
  let rawResponseTruncated = false

  if (lastResponse && typeof lastResponse === 'object') {
    const jsonStr = JSON.stringify(lastResponse)
    if (jsonStr.length > 50000) {
      rawResponseTruncated = true
      rawResponse = {
        places: (lastResponse.places ?? []).slice(0, 10),
        searchParameters: lastResponse.searchParameters,
        error: lastResponse.error,
      }
    }
  }

  // For non-grid scans, determine what was actually sent
  const sentLocation = attempts.find(a => a.location)?.location || null
  const sentLl = attempts.find(a => a.ll)?.ll || null
  const postalCodeSent = input.locationMode === 'zip' ? input.postalCode || null : null

  return {
    request: {
      keyword: input.keyword,
      engine: 'google_maps',
      projectCity: effectiveCity || null,
      projectCountry: country.toUpperCase(),
      locationMode: input.locationMode,
      locationSent: sentLocation,
      llSent: sentLl,
      postalCodeSent,
      gl: country,
      hl: language,
      scanner_version: '2.0',
    },
    response: {
      searchParameters: lastResponse?.searchParameters,
      placesCount: (lastResponse?.places || []).length,
      placesSample: (lastResponse?.places || []).slice(0, 10).map(p => ({ title: p.title })),
      rawResponse,
      rawResponseTruncated,
    },
    decision: {
      found,
      matchedPosition,
      matchedTitle,
      matchedAddress,
      attempts,
      successfulAttemptIndex,
      geoValidationPassed: attempts.length > 0 ? attempts.some(a => a.geoValidationPassed !== false) : undefined,
      rejectionReason,
    },
  }
}
