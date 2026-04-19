import { ScanInput, ScanOutput } from './types'

const SERPER_MAPS_URL = 'https://google.serper.dev/maps'
const REQUEST_TIMEOUT_MS = 15_000

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

export async function scanGoogleMaps(input: ScanInput): Promise<ScanOutput> {
  const apiKey = process.env.SERPER_API_KEY
  if (!apiKey) {
    return makeError('SERPER_API_KEY is not configured')
  }

  const businessName = input.targetBusinessName?.trim()
  if (!businessName) {
    return makeError('No target business name specified')
  }

  const country = (input.country || 'IL').toLowerCase()
  const language = input.language || 'he'
  const hasCity = Boolean(input.city?.trim())

  // Resolve coordinates for Israeli cities (if city matches our lookup)
  const cityLower = input.city?.trim().toLowerCase() || ''
  const cityCoordinates = cityLower ? ISRAELI_CITIES[cityLower] : undefined

  console.log('[Maps] ========== SCAN START ==========')
  console.log('[Maps] Input:', {
    keyword: input.keyword,
    businessName,
    projectCountry: country.toUpperCase(),
    projectCity: input.city || '(not set)',
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
    // Project city — primary and only context attempts
    contextAttempts.push({
      label: `project city "${input.city}"`,
      location: input.city!,
      coordinates: cityCoordinates,
    })
    contextAttempts.push({
      label: `project city+country "${input.city}, ${country.toUpperCase()}"`,
      location: `${input.city}, ${country.toUpperCase()}`,
      coordinates: cityCoordinates,
    })
    if (cityCoordinates) {
      contextAttempts.push({
        label: `project city via explicit coordinates only`,
        location: input.city!,
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

  try {
    for (const attempt of contextAttempts) {
      // GUARD: if city was configured, block any generic country-level fallback
      if (hasCity) {
        const isGenericFallback =
          attempt.location === 'IL' ||
          attempt.location === 'is' ||
          attempt.location === country.toUpperCase() ||
          attempt.location === country ||
          (attempt.coordinates?.lat === 31.5 && attempt.coordinates?.lng === 34.75)

        if (isGenericFallback) {
          const msg = `FORBIDDEN: Generic country fallback attempt for city-configured project (city="${input.city}", location="${attempt.location}", ll="${attempt.coordinates ? `@${attempt.coordinates.lat},${attempt.coordinates.lng},13z` : 'none'}")`
          console.error('[Maps] ERROR:', msg)
          throw new Error(msg)
        }
      }

      const outgoingLl = attempt.coordinates ? `@${attempt.coordinates.lat},${attempt.coordinates.lng},13z` : '(none)'
      console.log(`[Maps] ---- Attempt: ${attempt.label} ----`)
      console.log('[Maps] FINAL outgoing request:', {
        keyword: input.keyword,
        projectCity: input.city ?? null,
        projectCountry: input.country ?? null,
        location: attempt.location ?? '(none)',
        ll: outgoingLl,
        gl: country,
        hl: language,
      })

      const response = await querySerperMaps(input.keyword, country, language, attempt.location, attempt.coordinates)

      if (!response) {
        console.log(`[Maps] Attempt "${attempt.label}": no response, skipping`)
        continue
      }
      if (response.error) {
        return makeError(`Serper API error: ${response.error}`)
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
        continue
      }

      console.log(`[Maps] Attempt "${attempt.label}": ${places.length} places returned (geo OK)`)

      const matchedPlace = findBusinessMatch(places, businessName)
      if (matchedPlace) {
        console.log(`[Maps] ✓ FOUND via "${attempt.label}" at position ${matchedPlace.position}`)
        console.log('[Maps] ========== SCAN END (FOUND) ==========')
        return {
          found: true,
          position: matchedPlace.position,
          resultUrl: matchedPlace.website || null,
          resultTitle: matchedPlace.title,
          resultAddress: matchedPlace.address || null,
          error: null,
        }
      }

      console.log(`[Maps] ✗ No match for attempt "${attempt.label}"`)
    }

    console.log('[Maps] ✗ NO MATCH — all project-location attempts exhausted (keyword unchanged)')
    console.log('[Maps] ========== SCAN END (NOT FOUND) ==========')
    return { found: false, position: null, resultUrl: null, resultTitle: null, resultAddress: null, error: null }
  } catch (err) {
    if ((err as Error).name === 'AbortError') {
      return makeError('Serper API request timed out')
    }
    return makeError((err as Error).message)
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

function makeError(message: string): ScanOutput {
  return { found: false, position: null, resultUrl: null, resultTitle: null, resultAddress: null, error: message }
}
