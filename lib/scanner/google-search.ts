import { ScanInput, ScanOutput } from './types'

const SERPER_API_URL = 'https://google.serper.dev/search'
const REQUEST_TIMEOUT_MS = 15_000
const SERPER_MAX_RETRIES = 2

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

const MAX_ORGANIC_RESULTS = 20
const RESULTS_PER_PAGE = 10
const MIN_EXPECTED_NEW_LINKS_PER_PAGE = 5

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

  console.log(`[GoogleSearch] Scanning keyword="${input.keyword}" target="${rawDomain}" → normalized="${normalizedTarget}"`)

  try {
    const results: SerperSearchResult[] = []
    const seenLinks = new Set<string>()
    const pagesToScan = Math.ceil(MAX_ORGANIC_RESULTS / RESULTS_PER_PAGE)

    for (let page = 1; page <= pagesToScan; page++) {
      const start = (page - 1) * RESULTS_PER_PAGE
      let pageResults = await fetchSerperPage({
        apiKey,
        input,
        page,
        start,
        mode: 'page',
      })

      // In some responses Serper can repeat page 1 when "page" is ignored.
      // If page N is a full duplicate, retry with explicit "start" offset.
      const newLinksFromPageMode = pageResults.filter((r) => !seenLinks.has(r.link)).length
      if (page > 1 && newLinksFromPageMode < MIN_EXPECTED_NEW_LINKS_PER_PAGE) {
        console.log(`[GoogleSearch] Page ${page} looked suspicious (${newLinksFromPageMode} new links), retrying via start=${start}`)
        pageResults = await fetchSerperPage({
          apiKey,
          input,
          page,
          start,
          mode: 'start',
        })
      }

      const newLinksAfterStartFallback = pageResults.filter((r) => !seenLinks.has(r.link)).length
      if (page > 1 && (pageResults.length === 0 || newLinksAfterStartFallback < MIN_EXPECTED_NEW_LINKS_PER_PAGE)) {
        console.log(`[GoogleSearch] Page ${page} still empty/duplicated, retrying via num=20 fallback`)
        const fallbackResults = await fetchSerperPage({
          apiKey,
          input,
          page,
          start,
          mode: 'num20',
        })
        pageResults = fallbackResults.slice(start, start + RESULTS_PER_PAGE)

        const newLinksAfterNum20Fallback = pageResults.filter((r) => !seenLinks.has(r.link)).length
        if (newLinksAfterNum20Fallback < MIN_EXPECTED_NEW_LINKS_PER_PAGE) {
          console.log(`[GoogleSearch] Page ${page} still weak after num=20 (${newLinksAfterNum20Fallback} new links), retrying via num=100 fallback`)
          const deepFallbackResults = await fetchSerperPage({
            apiKey,
            input,
            page,
            start,
            mode: 'num100',
          })
          pageResults = deepFallbackResults.slice(start, start + RESULTS_PER_PAGE)
        }
      }

      console.log(`[GoogleSearch] Page ${page} (start=${start}) returned ${pageResults.length} organic results`)
      if (pageResults.length === 0) break

      for (const item of pageResults) {
        if (seenLinks.has(item.link)) continue
        seenLinks.add(item.link)
        results.push(item)
      }
      if (results.length >= MAX_ORGANIC_RESULTS) break
    }

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

    for (let i = 0; i < Math.min(results.length, MAX_ORGANIC_RESULTS); i++) {
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

type FetchPageArgs = {
  apiKey: string
  input: ScanInput
  page: number
  start: number
  mode: 'page' | 'start' | 'num20' | 'num100'
}

async function fetchSerperPage(args: FetchPageArgs): Promise<SerperSearchResult[]> {
  const { apiKey, input, page, start, mode } = args
  const body: Record<string, unknown> = {
    q: input.keyword,
    gl: (input.country || 'IL').toLowerCase(),
    hl: input.language || 'he',
    num: RESULTS_PER_PAGE,
  }

  if (mode === 'page') {
    body.page = page
  } else if (mode === 'start') {
    body.start = start
  } else if (mode === 'num20') {
    body.num = MAX_ORGANIC_RESULTS
  } else {
    body.num = 100
  }

  if (input.city) {
    body.location = input.city
  }
  if (input.deviceType === 'mobile' || input.deviceType === 'desktop') {
    body.device = input.deviceType
  }

  for (let attempt = 0; attempt <= SERPER_MAX_RETRIES; attempt++) {
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
        const retryable = response.status === 429 || response.status >= 500
        if (retryable && attempt < SERPER_MAX_RETRIES) {
          await sleep(350 * (attempt + 1))
          continue
        }
        throw new Error(`Serper API error: ${response.status} ${response.statusText}${text ? ` — ${text.slice(0, 200)}` : ''}`)
      }

      let data: SerperSearchResponse
      try {
        data = await response.json()
      } catch {
        throw new Error('Serper API returned invalid JSON')
      }

      if (data.error) {
        throw new Error(`Serper: ${data.error}`)
      }

      return data.organic ?? []
    } catch (err) {
      const retryable = (err as Error).name === 'AbortError'
      if (retryable && attempt < SERPER_MAX_RETRIES) {
        await sleep(350 * (attempt + 1))
        continue
      }
      throw err
    } finally {
      clearTimeout(timer)
    }
  }

  return []
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
