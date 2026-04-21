import { ScanInput, ScanOutput } from './types'

const SERPER_API_URL = 'https://google.serper.dev/search'
const REQUEST_TIMEOUT_MS = 15_000

interface SerperSearchResult {
  title: string
  link: string
  snippet?: string
  position: number
}

interface SerperSearchResponse {
  organic?: SerperSearchResult[]
  error?: string
  statusCode?: number
}

export async function scanGoogleSearch(input: ScanInput): Promise<ScanOutput> {
  const apiKey = process.env.SERPER_API_KEY
  if (!apiKey) {
    return makeError('SERPER_API_KEY is not configured')
  }

  const rawDomain = input.targetDomain?.trim()
  if (!rawDomain) {
    return makeError('No target domain specified')
  }

  const normalizedTarget = normalizeDomain(rawDomain)
  if (!normalizedTarget) {
    return makeError(`Could not parse target domain: "${rawDomain}"`)
  }

  if (input.locationMode === 'radius') {
    console.log(`[GoogleSearch] RADIUS INPUT RECEIVED:`)
    console.log(`  - keyword: ${input.keyword}`)
    console.log(`  - locationMode: ${input.locationMode}`)
    console.log(`  - city (from scanPayload): ${input.city || 'null'}`)
    console.log(`  - radiusCenter: ${input.radiusCenter ? 'SET' : 'NULL'}`)
    if (input.radiusCenter) {
      console.log(`    - centerZip: ${input.radiusCenter.centerZip}`)
      console.log(`    - lat: ${input.radiusCenter.lat}`)
      console.log(`    - lng: ${input.radiusCenter.lng}`)
      console.log(`    - miles: ${input.radiusCenter.radiusMiles}`)
    }
  }

  const requestParams: Record<string, string> = {
    engine: input.engine,
    device: input.deviceType || 'desktop',
    gl: (input.country || 'IL').toLowerCase(),
    hl: input.language || 'he',
    location: input.city?.trim() || '—',
    mode: 'organic',
  }

  console.log(
    `[GoogleSearch] Scanning keyword="${input.keyword}" target="${rawDomain}" params=${JSON.stringify(requestParams)}`
  )

  try {
    // CRITICAL: Validate location constraints early
    if (input.locationMode === 'exact_point' && !input.exactPoint) {
      return makeError(`exact_point mode requires valid coordinates`)
    }
    if (input.locationMode === 'radius' && !input.radiusCenter) {
      return makeError(`radius mode requires radiusCenter object with lat/lng`)
    }
    if (input.locationMode === 'radius' && input.radiusCenter) {
      // Ensure radiusCenter has valid lat/lng
      const { lat, lng } = input.radiusCenter
      if (typeof lat !== 'number' || typeof lng !== 'number') {
        return makeError(`radiusCenter must have numeric lat/lng. Got: lat=${lat} (${typeof lat}), lng=${lng} (${typeof lng})`)
      }
      if (lat < -90 || lat > 90 || lng < -180 || lng > 180) {
        return makeError(`radiusCenter coordinates out of valid range. Got: lat=${lat}, lng=${lng}`)
      }
    }

    const body: Record<string, unknown> = {
      q: input.keyword,
      gl: requestParams.gl,
      hl: requestParams.hl,
      type: 'search',
      num: 100,
    }

    if (requestParams.device) {
      body.device = requestParams.device
    }

    // DEBUG: Log all condition branches
    console.log(`[GoogleSearch] === CONDITION EVALUATION ===`)
    console.log(`  1. exact_point condition: locationMode=${input.locationMode}, exactPoint=${!!input.exactPoint}`)
    console.log(`     → Would enter: ${input.locationMode === 'exact_point' && input.exactPoint}`)
    console.log(`  2. radius condition: locationMode=${input.locationMode}, radiusCenter=${!!input.radiusCenter}`)
    if (input.radiusCenter) {
      console.log(`     radiusCenter details: lat=${input.radiusCenter.lat}, lng=${input.radiusCenter.lng}, zip=${input.radiusCenter.centerZip}`)
    }
    console.log(`     → Would enter: ${input.locationMode === 'radius' && input.radiusCenter}`)
    console.log(`  3. city fallback condition: city=${input.city}`)
    console.log(`     → Would enter: ${!!input.city}`)
    console.log(`[GoogleSearch] === END CONDITION EVALUATION ===`)

    // exact_point is the source of truth — ll alone drives geo targeting.
    // Do not send location (city/zip) when exact_point is active.
    if (input.locationMode === 'exact_point' && input.exactPoint) {
      body.ll = `@${input.exactPoint.lat},${input.exactPoint.lng},13z`
      console.log(`[GoogleSearch] ✓ EXACT_POINT BRANCH TAKEN: ll=${body.ll}`)
    } else if (input.locationMode === 'radius' && input.radiusCenter) {
      body.ll = `@${input.radiusCenter.lat},${input.radiusCenter.lng},13z`
      console.log(`[GoogleSearch] ✓ RADIUS BRANCH TAKEN: ll=${body.ll} (zip=${input.radiusCenter.centerZip})`)
      console.log(`[GoogleSearch]   NOT setting location (it is: ${body.location})`)
    } else if (input.city) {
      body.location = input.city
      console.log(`[GoogleSearch] ✗ FALLBACK TO CITY BRANCH: location="${input.city}"`)
    } else {
      console.log(`[GoogleSearch] ✗ NO LOCATION SET - neither city nor ll`)
    }

    console.log(`[GoogleSearch] FINAL REQUEST BODY:`, JSON.stringify(body))
    console.log(`[GoogleSearch] === FINAL FIELDS BEING SENT TO SERPER ===`)
    console.log(`[GoogleSearch] FINAL - location field:`, body.location || 'null')
    console.log(`[GoogleSearch] FINAL - uule field:`, body.uule || 'null')
    console.log(`[GoogleSearch] FINAL - ll field:`, body.ll || 'null')
    if (input.locationMode === 'radius') {
      console.log(`[GoogleSearch] RADIUS MODE FINAL CHECK:`)
      console.log(`[GoogleSearch]   - ll is SET?`, !!body.ll, '← MUST BE true')
      console.log(`[GoogleSearch]   - location is UNSET?`, !body.location, '← MUST BE true')
      console.log(`[GoogleSearch]   - ll value:`, body.ll, '← should contain Bakersfield coords')
    }
    console.log(`[GoogleSearch] === END FINAL FIELDS ===`)

    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)

    let response: Response
    try {
      console.log(`[GoogleSearch] SENDING TO SERPER - Full request body:`, body)
      console.log(`[GoogleSearch] SENDING - All fields in body:`, Object.keys(body))
      for (const key of Object.keys(body)) {
        console.log(`  ${key}: ${JSON.stringify(body[key])}`)
      }
      response = await fetch(SERPER_API_URL, {
        method: 'POST',
        headers: {
          'X-API-KEY': apiKey,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      })
      console.log(`[GoogleSearch] RESPONSE STATUS: ${response.status}`)
    } finally {
      clearTimeout(timer)
    }

    if (!response.ok) {
      const text = await response.text().catch(() => '')
      return makeError(`Serper API error: ${response.status} ${response.statusText}${text ? ` — ${text.slice(0, 200)}` : ''}`)
    }

    let data: SerperSearchResponse
    try {
      data = await response.json()
    } catch {
      return makeError('Serper API returned invalid JSON')
    }

    console.log(`[GoogleSearch] SERPER RESPONSE:`, {
      searchParameters: (data as any).searchParameters,
      resultsCount: data.organic?.length || 0,
      error: data.error,
    })
    console.log(`[GoogleSearch] SERPER searchParameters details:`, (data as any).searchParameters)

    if (data.error) {
      return makeError(`Serper: ${data.error}`)
    }

    const results = data.organic ?? []

    console.log(`[GoogleSearch] Got ${results.length} organic results from Serper`)

    if (results.length === 0) {
      console.log('[GoogleSearch] No organic results returned')
      return { found: false, position: null, resultUrl: null, resultTitle: null, resultAddress: null, error: null }
    }

    // Log all URLs for debugging
    results.forEach((r, idx) => {
      const norm = normalizeDomain(r.link)
      console.log(`[GoogleSearch] #${idx + 1} url="${r.link}" normalized="${norm}"`)
    })

    for (let i = 0; i < results.length; i++) {
      const result = results[i]
      const resultNormalized = normalizeDomain(result.link)
      const position = i + 1 // use loop index as reliable 1-based position

      const matched = isDomainMatch(resultNormalized, normalizedTarget)
      if (matched) {
        console.log(`[GoogleSearch] MATCH at position ${position}: "${result.link}" (normalized="${resultNormalized}")`)
        return {
          found: true,
          position,
          resultUrl: result.link,
          resultTitle: result.title || null,
          resultAddress: null,
          error: null,
        }
      }
    }

    console.log(`[GoogleSearch] No match found for "${normalizedTarget}" in ${results.length} results`)
    return { found: false, position: null, resultUrl: null, resultTitle: null, resultAddress: null, error: null }
  } catch (err) {
    if ((err as Error).name === 'AbortError') {
      return makeError('Serper API request timed out')
    }
    return makeError((err as Error).message)
  }
}

/**
 * Domain match using includes() so that:
 * - "gotop.co.il" matches result "gotop.co.il"
 * - "gotop.co.il" matches result "www.gotop.co.il" (after normalization strips www.)
 * - "gotop.co.il" matches result "blog.gotop.co.il"
 */
function isDomainMatch(resultNormalized: string, targetNormalized: string): boolean {
  if (!resultNormalized || !targetNormalized) return false
  // Exact match
  if (resultNormalized === targetNormalized) return true
  // Subdomain: result must end with "." + target
  if (resultNormalized.endsWith('.' + targetNormalized)) return true
  // Fallback: includes check (target is fully contained in result domain)
  if (resultNormalized.includes(targetNormalized)) return true
  return false
}

/**
 * Normalize a URL or plain domain:
 * - Remove protocol (https://, http://)
 * - Remove www.
 * - Lowercase
 * - Extract only the hostname (no path/query)
 */
function normalizeDomain(input: string): string {
  try {
    const url = input.startsWith('http') ? input : `https://${input}`
    const hostname = new URL(url).hostname
    return hostname.replace(/^www\./, '').toLowerCase().replace(/\.$/, '')
  } catch {
    return input
      .replace(/^https?:\/\//, '')
      .replace(/^www\./, '')
      .split('/')[0]
      .split('?')[0]
      .split('#')[0]
      .toLowerCase()
      .trim()
  }
}

function makeError(message: string): ScanOutput {
  return { found: false, position: null, resultUrl: null, resultTitle: null, resultAddress: null, error: message }
}
