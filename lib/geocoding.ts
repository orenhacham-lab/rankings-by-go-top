/**
 * Address geocoding with primary + fallback providers.
 *
 * Primary: Google Geocoding API — highest accuracy, aligned with
 *          Google Search / Maps result indexing. Requires GOOGLE_GEOCODING_API_KEY.
 * Fallback: Nominatim (OpenStreetMap) — used only when the primary call fails
 *          (no key, quota exhaustion, 5xx, timeout, or ZERO_RESULTS).
 *
 * Contract: on success returns a GeocodeSuccess with resolved coords and
 *           audit metadata (provider, query, usedFallback). On failure returns
 *           a GeocodeFailure with an explicit reason and the providers that
 *           were tried. Callers must treat failure as blocking — never silently
 *           substitute a different location.
 */

const GOOGLE_GEOCODING_URL = 'https://maps.googleapis.com/maps/api/geocode/json'
const NOMINATIM_URL = 'https://nominatim.openstreetmap.org/search'
const REQUEST_TIMEOUT_MS = 10_000

export interface GeocodeSuccess {
  ok: true
  lat: number
  lng: number
  provider: 'google' | 'nominatim'
  usedFallback: boolean
  queryUsed: string
  formattedAddress: string | null
  providersTried: string[]
}

export interface GeocodeFailure {
  ok: false
  reason: string
  providersTried: string[]
}

export type GeocodeResult = GeocodeSuccess | GeocodeFailure

interface GoogleGeocodeResponse {
  status: string
  error_message?: string
  results?: Array<{
    geometry?: { location?: { lat: number; lng: number } }
    formatted_address?: string
  }>
}

type NominatimResponse = Array<{ lat: string; lon: string; display_name?: string }>

function countryToGoogleRegion(country: string): string {
  return country.toLowerCase()
}

function countryToNominatimCode(country: string): string {
  const c = country.toLowerCase()
  if (c === 'us' || c === 'il' || c === 'gb') return c
  return ''
}

async function fetchWithTimeout(url: string, init: RequestInit = {}): Promise<Response> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
  try {
    return await fetch(url, { ...init, signal: controller.signal })
  } finally {
    clearTimeout(timer)
  }
}

async function geocodeGoogle(address: string, country: string): Promise<
  | { ok: true; lat: number; lng: number; formattedAddress: string | null }
  | { ok: false; reason: string }
> {
  const apiKey = process.env.GOOGLE_GEOCODING_API_KEY
  if (!apiKey) {
    return { ok: false, reason: 'GOOGLE_GEOCODING_API_KEY not configured' }
  }

  const params = new URLSearchParams({
    address,
    key: apiKey,
    region: countryToGoogleRegion(country),
  })

  try {
    const response = await fetchWithTimeout(`${GOOGLE_GEOCODING_URL}?${params.toString()}`)
    if (!response.ok) {
      return { ok: false, reason: `HTTP ${response.status}` }
    }
    const data = (await response.json()) as GoogleGeocodeResponse
    if (data.status !== 'OK') {
      return { ok: false, reason: `status=${data.status}${data.error_message ? ` (${data.error_message})` : ''}` }
    }
    const first = data.results?.[0]
    const loc = first?.geometry?.location
    if (!loc || !Number.isFinite(loc.lat) || !Number.isFinite(loc.lng)) {
      return { ok: false, reason: 'no geometry in response' }
    }
    return {
      ok: true,
      lat: loc.lat,
      lng: loc.lng,
      formattedAddress: first?.formatted_address ?? null,
    }
  } catch (err) {
    const msg = (err as Error).name === 'AbortError' ? 'timeout' : (err as Error).message
    return { ok: false, reason: `fetch failed: ${msg}` }
  }
}

async function geocodeNominatim(address: string, country: string): Promise<
  | { ok: true; lat: number; lng: number; formattedAddress: string | null }
  | { ok: false; reason: string }
> {
  const params = new URLSearchParams({
    q: address,
    format: 'json',
    limit: '1',
  })
  const cc = countryToNominatimCode(country)
  if (cc) params.set('countrycodes', cc)

  try {
    const response = await fetchWithTimeout(`${NOMINATIM_URL}?${params.toString()}`, {
      headers: { 'User-Agent': 'rankings-by-go-top/1.0 (geocoding-fallback)' },
    })
    if (!response.ok) {
      return { ok: false, reason: `HTTP ${response.status}` }
    }
    const data = (await response.json()) as NominatimResponse
    if (!data.length) {
      return { ok: false, reason: 'no results' }
    }
    const lat = parseFloat(data[0].lat)
    const lng = parseFloat(data[0].lon)
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      return { ok: false, reason: 'invalid coordinates in response' }
    }
    return {
      ok: true,
      lat,
      lng,
      formattedAddress: data[0].display_name ?? null,
    }
  } catch (err) {
    const msg = (err as Error).name === 'AbortError' ? 'timeout' : (err as Error).message
    return { ok: false, reason: `fetch failed: ${msg}` }
  }
}

export async function geocodeAddress(
  rawAddress: string,
  country: string
): Promise<GeocodeResult> {
  const address = rawAddress.trim()
  if (!address) {
    return { ok: false, reason: 'empty address', providersTried: [] }
  }

  const providersTried: string[] = []

  // Primary: Google
  providersTried.push('google')
  const google = await geocodeGoogle(address, country)
  if (google.ok) {
    return {
      ok: true,
      lat: google.lat,
      lng: google.lng,
      provider: 'google',
      usedFallback: false,
      queryUsed: address,
      formattedAddress: google.formattedAddress,
      providersTried,
    }
  }
  console.warn(`[Geocoding] google failed for "${address}": ${google.reason}`)

  // Fallback: Nominatim
  providersTried.push('nominatim')
  const nominatim = await geocodeNominatim(address, country)
  if (nominatim.ok) {
    return {
      ok: true,
      lat: nominatim.lat,
      lng: nominatim.lng,
      provider: 'nominatim',
      usedFallback: true,
      queryUsed: address,
      formattedAddress: nominatim.formattedAddress,
      providersTried,
    }
  }
  console.warn(`[Geocoding] nominatim failed for "${address}": ${nominatim.reason}`)

  return {
    ok: false,
    reason: `all providers failed (google: ${google.reason}; nominatim: ${nominatim.reason})`,
    providersTried,
  }
}

export function validateCoordinatePair(
  rawLat: unknown,
  rawLng: unknown
): { ok: true; lat: number; lng: number } | { ok: false; reason: string } {
  const lat = typeof rawLat === 'number' ? rawLat : parseFloat(String(rawLat ?? ''))
  const lng = typeof rawLng === 'number' ? rawLng : parseFloat(String(rawLng ?? ''))
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return { ok: false, reason: 'lat/lng must be finite numbers' }
  }
  if (lat < -90 || lat > 90) {
    return { ok: false, reason: 'lat out of range (-90..90)' }
  }
  if (lng < -180 || lng > 180) {
    return { ok: false, reason: 'lng out of range (-180..180)' }
  }
  return { ok: true, lat, lng }
}
