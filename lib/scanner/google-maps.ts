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

interface MapsScanAttempt {
  query: string
  places: SerperMapsPlace[]
  matchFound: boolean
  matchedPlace?: SerperMapsPlace
  fallbackAttempt?: number
}

async function querySerperMaps(query: string, country: string, language: string, location?: string): Promise<SerperMapsResponse | null> {
  const apiKey = process.env.SERPER_API_KEY
  if (!apiKey) return null

  const body: Record<string, unknown> = {
    q: query,
    gl: country.toLowerCase(),
    hl: language,
  }

  if (location) {
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

  console.log('[Maps] ========== SCAN START ==========')
  console.log('[Maps] Input:', {
    keyword: input.keyword,
    businessName,
    country,
    language,
    city: input.city,
  })

  try {
    // ATTEMPT 1: Original keyword with standard location
    console.log('[Maps] Attempt 1: Original keyword query')
    let response = await querySerperMaps(input.keyword, country, language, input.city || undefined)

    if (!response || response.error) {
      return makeError(`Serper API error: ${response?.error || 'Unknown error'}`)
    }

    const places1 = response.places ?? []
    console.log('[Maps] Attempt 1 results:', places1.length, 'places')

    let matchedPlace = findBusinessMatch(places1, businessName)

    if (matchedPlace) {
      console.log('[Maps] ✓ FOUND in attempt 1 at position', matchedPlace.position)
      console.log('[Maps] ========== SCAN END (ATTEMPT 1) ==========')
      return {
        found: true,
        position: matchedPlace.position,
        resultUrl: matchedPlace.website || null,
        resultTitle: matchedPlace.title,
        resultAddress: matchedPlace.address || null,
        error: null,
      }
    }

    // ATTEMPT 2: Keyword with full location string (e.g., "Tel Aviv, Israel")
    if (input.city) {
      console.log('[Maps] Attempt 2: Keyword with full location context')
      const fullLocation = `${input.city}, ${country.toUpperCase()}`

      response = await querySerperMaps(input.keyword, country, language, fullLocation || undefined)
      if (response && !response.error) {
        const places2 = response.places ?? []
        console.log('[Maps] Attempt 2 results:', places2.length, 'places')

        matchedPlace = findBusinessMatch(places2, businessName)
        if (matchedPlace) {
          console.log('[Maps] ✓ FOUND in attempt 2 (full location) at position', matchedPlace.position)
          console.log('[Maps] ========== SCAN END (ATTEMPT 2) ==========')
          return {
            found: true,
            position: matchedPlace.position,
            resultUrl: matchedPlace.website || null,
            resultTitle: matchedPlace.title,
            resultAddress: matchedPlace.address || null,
            error: null,
          }
        }
      }
    }

    // ATTEMPT 3: Keyword + city in Hebrew (branded local variant)
    if (language === 'he' || input.city) {
      console.log('[Maps] Attempt 3: Keyword with Hebrew city variant')
      const query3 = `${input.keyword} תל אביב` // Default to Tel Aviv for Hebrew

      response = await querySerperMaps(query3, country, language, input.city || undefined)
      if (response && !response.error) {
        const places3 = response.places ?? []
        console.log('[Maps] Attempt 3 results:', places3.length, 'places')

        matchedPlace = findBusinessMatch(places3, businessName)
        if (matchedPlace) {
          console.log('[Maps] ✓ FOUND in attempt 3 (Hebrew variant) at position', matchedPlace.position)
          console.log('[Maps] ========== SCAN END (ATTEMPT 3) ==========')
          return {
            found: true,
            position: matchedPlace.position,
            resultUrl: matchedPlace.website || null,
            resultTitle: matchedPlace.title,
            resultAddress: matchedPlace.address || null,
            error: null,
          }
        }
      }
    }

    // ATTEMPT 4: Business name itself as final fallback
    console.log('[Maps] Attempt 4: Business name as final fallback query')
    response = await querySerperMaps(businessName, country, language, input.city || undefined)
    if (response && !response.error) {
      const places4 = response.places ?? []
      console.log('[Maps] Attempt 4 results:', places4.length, 'places')

      matchedPlace = findBusinessMatch(places4, businessName)
      if (matchedPlace) {
        console.log('[Maps] ✓ FOUND in attempt 4 (business name) at position', matchedPlace.position)
        console.log('[Maps] ========== SCAN END (ATTEMPT 4) ==========')
        return {
          found: true,
          position: matchedPlace.position,
          resultUrl: matchedPlace.website || null,
          resultTitle: matchedPlace.title,
          resultAddress: matchedPlace.address || null,
          error: null,
        }
      }
    }

    console.log('[Maps] ✗ NO MATCH - All 4 fallback attempts failed')
    console.log('[Maps] ========== SCAN END (NO MATCH) ==========')
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
