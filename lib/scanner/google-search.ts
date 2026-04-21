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

    if (input.locationMode === 'radius') {
      console.log(`[GoogleSearch] RADIUS MODE: Checking conditions...`)
      console.log(`  - locationMode === 'radius': ${input.locationMode === 'radius'}`)
      console.log(`  - radiusCenter exists: ${!!input.radiusCenter}`)
      console.log(`  - Will enter radius branch: ${input.locationMode === 'radius' && input.radiusCenter}`)
    }

    // exact_point is the source of truth — ll alone drives geo targeting.
    // Do not send location (city/zip) when exact_point is active.
    if (input.locationMode === 'exact_point' && input.exactPoint) {
      body.ll = `@${input.exactPoint.lat},${input.exactPoint.lng},13z`
      console.log(`[GoogleSearch] exact_point: ll=${body.ll} (location suppressed)`)
    } else if (input.locationMode === 'radius' && input.radiusCenter) {
      body.ll = `@${input.radiusCenter.lat},${input.radiusCenter.lng},13z`
      console.log(`[GoogleSearch] RADIUS BRANCH ACTIVATED - setting ll only`)
      console.log(`  - ll: ${body.ll}`)
      console.log(`  - NOT setting location (city suppressed)`)
    } else if (input.city) {
      body.location = input.city
      console.log(`[GoogleSearch] FALLBACK TO CITY: location="${input.city}"`)
    } else {
      console.log(`[GoogleSearch] NO LOCATION SET (no city, no ll)`)
    }

    console.log(`[GoogleSearch] FINAL REQUEST BODY:`, JSON.stringify(body))
    console.log(`[GoogleSearch] FINAL - location field:`, body.location || 'null')
    console.log(`[GoogleSearch] FINAL - uule field:`, body.uule || 'null')
    console.log(`[GoogleSearch] FINAL - ll field:`, body.ll || 'null')

    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)

    let response: Response
    try {
      response = await fetch(SERPER_API_URL, {
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

    let data: SerperSearchResponse
    try {
      data = await response.json()
    } catch {
      return makeError('Serper API returned invalid JSON')
    }

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
