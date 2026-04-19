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
}

interface SerperMapsResponse {
  places?: SerperMapsPlace[]
  error?: string
}

// Israeli cities with their coordinates for proper geo context
const ISRAELI_CITIES: Record<string, { lat: number; lng: number }> = {
  'tel aviv': { lat: 32.0853, lng: 34.7818 },
  'תל אביב': { lat: 32.0853, lng: 34.7818 },
  'jerusalem': { lat: 31.7683, lng: 35.2137 },
  'ירושלים': { lat: 31.7683, lng: 35.2137 },
  'haifa': { lat: 32.8193, lng: 34.9991 },
  'חיפה': { lat: 32.8193, lng: 34.9991 },
  'be\'er sheva': { lat: 31.2507, lng: 34.7915 },
  'beersheva': { lat: 31.2507, lng: 34.7915 },
  'באר שבע': { lat: 31.2507, lng: 34.7915 },
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

  // Use explicit coordinates if available, otherwise use location string
  if (coordinates) {
    body.ll = `${coordinates.lat},${coordinates.lng}`
  } else if (location) {
    body.location = location
  }

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)

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

  // Resolve coordinates for Israeli cities
  const cityLower = input.city?.toLowerCase() || ''
  const cityCoordinates = cityLower ? ISRAELI_CITIES[cityLower] : undefined

  console.log('[Maps] ========== SCAN START ==========')
  console.log('[Maps] Input:', {
    keyword: input.keyword,
    businessName,
    country,
    language,
    city: input.city,
    ...(cityCoordinates && { cityCoordinates }),
  })

  // Context-only retries — keyword text NEVER changes between attempts
  // For Israeli cities, use explicit coordinates; otherwise use location string
  const contextAttempts: Array<{ label: string; location: string | undefined; coordinates?: { lat: number; lng: number } }> = [
    {
      label: 'city',
      location: input.city || undefined,
      coordinates: cityCoordinates,
    },
    ...(input.city && !cityCoordinates
      ? [{ label: 'city+country', location: `${input.city}, ${country.toUpperCase()}`, coordinates: undefined }]
      : []),
    {
      label: 'country',
      location: country.toUpperCase(),
      coordinates: country === 'il' ? { lat: 31.5, lng: 34.75 } : undefined, // Israel center
    },
    { label: 'no location', location: undefined, coordinates: undefined },
  ]

  try {
    for (const attempt of contextAttempts) {
      const coordStr = attempt.coordinates ? `[${attempt.coordinates.lat},${attempt.coordinates.lng}]` : '(none)'
      console.log(`[Maps] Attempt "${attempt.label}": keyword="${input.keyword}" location=${attempt.location ?? '(none)'} coordinates=${coordStr}`)

      const response = await querySerperMaps(input.keyword, country, language, attempt.location, attempt.coordinates)

      if (!response) {
        console.log(`[Maps] Attempt "${attempt.label}": no response, skipping`)
        continue
      }
      if (response.error) {
        return makeError(`Serper API error: ${response.error}`)
      }

      const places = response.places ?? []
      console.log(`[Maps] Attempt "${attempt.label}": ${places.length} places returned`)

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

    console.log('[Maps] ✗ NO MATCH — all context attempts exhausted, keyword was never modified')
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
