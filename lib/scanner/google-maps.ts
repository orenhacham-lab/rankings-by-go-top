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

export async function scanGoogleMaps(input: ScanInput): Promise<ScanOutput> {
  const apiKey = process.env.SERPER_API_KEY
  if (!apiKey) {
    return makeError('SERPER_API_KEY is not configured')
  }

  const businessName = input.targetBusinessName?.trim()
  if (!businessName) {
    return makeError('No target business name specified')
  }

  console.log('[Maps] Starting scan', {
    keyword: input.keyword,
    businessName,
    country: input.country,
    language: input.language,
    city: input.city,
    device: input.deviceType,
  })

  try {
    const body: Record<string, unknown> = {
      q: input.keyword,
      gl: (input.country || 'IL').toLowerCase(),
      hl: input.language || 'he',
    }

    if (input.city) {
      body.location = input.city
    }

    console.log('[Maps] Request payload:', body)

    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)

    let response: Response
    try {
      response = await fetch(SERPER_MAPS_URL, {
        method: 'POST',
        headers: {
          'X-API-KEY': apiKey,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      })
    } finally {
      clearTimeout(timer)
    }

    if (!response.ok) {
      const text = await response.text().catch(() => '')
      return makeError(`Serper API error: ${response.status} ${response.statusText}${text ? ` — ${text.slice(0, 200)}` : ''}`)
    }

    let data: SerperMapsResponse
    try {
      data = await response.json()
    } catch {
      return makeError('Serper API returned invalid JSON')
    }

    if (data.error) {
      return makeError(`Serper: ${data.error}`)
    }

    const places = data.places ?? []
    console.log('[Maps] Found places:', places.length, places.map(p => ({ title: p.title, position: p.position })))

    const normalizedTarget = normalizeBusinessName(businessName)
    console.log('[Maps] Normalized target:', normalizedTarget)

    for (const place of places) {
      const normalizedPlace = normalizeBusinessName(place.title)
      const matches = isBusinessMatch(normalizedPlace, normalizedTarget)

      console.log('[Maps] Checking place', {
        original: place.title,
        normalized: normalizedPlace,
        target: normalizedTarget,
        position: place.position,
        matches,
        similarity: diceSimilarity(normalizedPlace, normalizedTarget),
      })

      if (matches) {
        console.log('[Maps] MATCH FOUND at position', place.position)
        return {
          found: true,
          position: place.position,
          resultUrl: place.website || null,
          resultTitle: place.title,
          resultAddress: place.address || null,
          error: null,
        }
      }
    }

    console.log('[Maps] No match found in results')
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
