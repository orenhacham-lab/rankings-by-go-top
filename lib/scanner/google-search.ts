import { ScanInput, ScanOutput } from './types'
import { generateRadiusPoints, aggregateRadiusResults, type RadiusPointResult } from './radius-scan'

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

// Helper function to execute a single search query from a specific coordinate
async function executeSingleSearch(
  apiKey: string,
  keyword: string,
  requestParams: Record<string, string>,
  lat: number,
  lng: number,
  label: string,
): Promise<{ response: SerperSearchResponse | null; error: string | null }> {
  const body: Record<string, unknown> = {
    q: keyword,
    gl: requestParams.gl,
    hl: requestParams.hl,
    type: 'search',
    num: 100,
  }

  if (requestParams.device) {
    body.device = requestParams.device
  }

  const ll = `@${lat},${lng},13z`
  body.ll = ll

  console.log(`[GoogleSearch:radius:${label}] Sending query from ${label}:`, {
    keyword,
    ll,
    gl: requestParams.gl,
    hl: requestParams.hl,
  })

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)

  try {
    const response = await fetch(SERPER_API_URL, {
      method: 'POST',
      headers: {
        'X-API-KEY': apiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    })

    if (!response.ok) {
      const text = await response.text().catch(() => '')
      return {
        response: null,
        error: `Serper API error: ${response.status} ${response.statusText}${text ? ` — ${text.slice(0, 200)}` : ''}`,
      }
    }

    const data: SerperSearchResponse = await response.json()
    return { response: data, error: null }
  } catch (err) {
    if ((err as Error).name === 'AbortError') {
      return { response: null, error: 'Serper API request timed out' }
    }
    return { response: null, error: (err as Error).message }
  } finally {
    clearTimeout(timer)
  }
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

  // Handle radius mode with multiple scan points
  if (input.locationMode === 'radius' && input.radiusCenter) {
    console.log(`[GoogleSearch] RADIUS SCAN MODE - Multi-point strategy`)
    console.log(`  Center ZIP: ${input.radiusCenter.centerZip}`)
    console.log(`  Center coords: ${input.radiusCenter.lat}, ${input.radiusCenter.lng}`)
    console.log(`  Radius: ${input.radiusCenter.radiusMiles} miles`)

    // Validate all required values before calling generateRadiusPoints
    const { lat, lng, radiusMiles, centerZip } = input.radiusCenter

    if (typeof lat !== 'number' || typeof lng !== 'number') {
      return makeError(`Radius mode requires valid numeric coordinates. Got: lat=${lat} (${typeof lat}), lng=${lng} (${typeof lng})`)
    }

    if (radiusMiles === null || radiusMiles === undefined || typeof radiusMiles !== 'number') {
      return makeError(`Radius mode requires valid numeric radiusMiles. Got: ${radiusMiles} (${typeof radiusMiles})`)
    }

    if (radiusMiles <= 0) {
      return makeError(`Radius mode requires positive radiusMiles. Got: ${radiusMiles}`)
    }

    // Generate radius points around center
    const radiusPoints = generateRadiusPoints(lat, lng, radiusMiles, centerZip || 'unknown')

    console.log(`[GoogleSearch] Generated ${radiusPoints.length} radius scan points:`)
    radiusPoints.forEach(p => {
      console.log(`  - ${p.label}: ${p.lat.toFixed(4)}, ${p.lng.toFixed(4)} (${p.distanceMiles.toFixed(1)}mi)`)
    })

    const requestParams: Record<string, string> = {
      engine: input.engine,
      device: input.deviceType || 'desktop',
      gl: (input.country || 'IL').toLowerCase(),
      hl: input.language || 'he',
      mode: 'organic',
    }

    const radiusResults: RadiusPointResult[] = []

    // Execute scan from each radius point
    for (const point of radiusPoints) {
      const { response, error } = await executeSingleSearch(
        apiKey,
        input.keyword,
        requestParams,
        point.lat,
        point.lng,
        point.label
      )

      if (error) {
        console.log(`[GoogleSearch:radius:${point.label}] Error: ${error}`)
        radiusResults.push({
          point,
          found: false,
          error,
        })
        continue
      }

      if (!response) {
        console.log(`[GoogleSearch:radius:${point.label}] No response`)
        radiusResults.push({
          point,
          found: false,
          error: 'No response from Serper',
        })
        continue
      }

      if (response.error) {
        console.log(`[GoogleSearch:radius:${point.label}] Serper error: ${response.error}`)
        radiusResults.push({
          point,
          found: false,
          error: response.error,
        })
        continue
      }

      const results = response.organic ?? []
      console.log(`[GoogleSearch:radius:${point.label}] Got ${results.length} organic results`)

      // Search for domain match in results
      let found = false
      let matchedPosition: number | undefined
      let matchedTitle: string | undefined

      for (let i = 0; i < results.length; i++) {
        const result = results[i]
        const resultNormalized = normalizeDomain(result.link)
        const position = i + 1

        const matched = isDomainMatch(resultNormalized, normalizedTarget)
        if (matched) {
          console.log(`[GoogleSearch:radius:${point.label}] MATCH at position ${position}: "${result.link}"`)
          found = true
          matchedPosition = position
          matchedTitle = result.title || undefined
          break
        }
      }

      radiusResults.push({
        point,
        found,
        position: matchedPosition,
        title: matchedTitle,
      })
    }

    // Aggregate results from all radius points
    const aggregated = aggregateRadiusResults(radiusResults)
    console.log(`[GoogleSearch:radius] AGGREGATED RESULTS:`)
    console.log(`  - Successful scans: ${aggregated.successCount}/${radiusPoints.length}`)
    console.log(`  - Best match: ${aggregated.bestMatch ? `position ${aggregated.bestMatch.position} from ${aggregated.bestMatch.point.label}` : 'not found'}`)

    if (aggregated.bestMatch && typeof aggregated.bestMatch.position === 'number') {
      return {
        found: true,
        position: aggregated.bestMatch.position,
        resultUrl: null, // Google Search doesn't provide URLs in results
        resultTitle: aggregated.bestMatch.title || null,
        resultAddress: null,
        error: null,
        // Store radius scan metadata in audit-like format
        radiusScanMetadata: {
          centerZip: input.radiusCenter.centerZip,
          centerLat: input.radiusCenter.lat,
          centerLng: input.radiusCenter.lng,
          radiusMiles: radiusMiles as number,
          pointsScanned: radiusPoints.length,
          successfulScans: aggregated.successCount,
          radiusAttempts: radiusResults.map(r => ({
            direction: r.point.direction,
            label: r.point.label,
            lat: r.point.lat,
            lng: r.point.lng,
            distanceMiles: r.point.distanceMiles,
            found: r.found,
            position: r.position ?? null,
          })),
          bestMatch: {
            direction: aggregated.bestMatch.point.direction,
            label: aggregated.bestMatch.point.label,
            position: aggregated.bestMatch.position,
          },
        },
      }
    } else {
      return {
        found: false,
        position: null,
        resultUrl: null,
        resultTitle: null,
        resultAddress: null,
        error: null,
        radiusScanMetadata: {
          centerZip: input.radiusCenter.centerZip,
          centerLat: input.radiusCenter.lat,
          centerLng: input.radiusCenter.lng,
          radiusMiles: radiusMiles as number,
          pointsScanned: radiusPoints.length,
          successfulScans: aggregated.successCount,
          radiusAttempts: radiusResults.map(r => ({
            direction: r.point.direction,
            label: r.point.label,
            lat: r.point.lat,
            lng: r.point.lng,
            distanceMiles: r.point.distanceMiles,
            found: r.found,
            position: r.position ?? null,
          })),
          bestMatch: null,
        },
      }
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
    // Validate location constraints early
    if (input.locationMode === 'exact_point' && !input.exactPoint) {
      return makeError(`exact_point mode requires valid coordinates`)
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

    // exact_point is the source of truth — ll alone drives geo targeting.
    // Do not send location (city/zip) when exact_point is active.
    if (input.locationMode === 'exact_point' && input.exactPoint) {
      body.ll = `@${input.exactPoint.lat},${input.exactPoint.lng},13z`
      console.log(`[GoogleSearch] ✓ EXACT_POINT BRANCH TAKEN: ll=${body.ll}`)
    } else if (input.city) {
      body.location = input.city
      console.log(`[GoogleSearch] ✗ FALLBACK TO CITY BRANCH: location="${input.city}"`)
    } else {
      console.log(`[GoogleSearch] ✗ NO LOCATION SET - neither city nor ll`)
    }

    console.log(`[GoogleSearch] FINAL REQUEST BODY:`, JSON.stringify(body))

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
