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

  const targetHostname = normalizeDomain(rawDomain)
  if (!targetHostname) {
    return makeError(`Could not parse target domain: "${rawDomain}"`)
  }

  try {
    const body: Record<string, unknown> = {
      q: input.keyword,
      gl: (input.country || 'IL').toLowerCase(),
      hl: input.language || 'he',
      num: 100,
    }

    if (input.city) {
      body.location = input.city
    }

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

    for (const result of results) {
      if (isDomainMatch(result.link, targetHostname)) {
        return {
          found: true,
          position: result.position,
          resultUrl: result.link,
          resultTitle: result.title || null,
          resultAddress: null,
          error: null,
        }
      }
    }

    // Keyword searched successfully, domain not found in results
    return { found: false, position: null, resultUrl: null, resultTitle: null, resultAddress: null, error: null }
  } catch (err) {
    if ((err as Error).name === 'AbortError') {
      return makeError('Serper API request timed out')
    }
    return makeError((err as Error).message)
  }
}

/**
 * Strict domain matching:
 * - Exact: "example.co.il" matches "example.co.il"
 * - Subdomain: "blog.example.co.il" matches target "example.co.il"
 * - Does NOT match "best-example.co.il" or "example.co.il.evil.com"
 */
function isDomainMatch(resultUrl: string, targetHostname: string): boolean {
  const resultHostname = normalizeDomain(resultUrl)
  if (!resultHostname) return false
  if (resultHostname === targetHostname) return true
  // Subdomain check: resultHostname must end with exactly "." + targetHostname
  if (resultHostname.endsWith('.' + targetHostname)) return true
  return false
}

/**
 * Extract and normalize hostname from a URL or plain domain.
 * Strips www., lowercases, removes trailing dot.
 */
function normalizeDomain(input: string): string {
  try {
    const url = input.startsWith('http') ? input : `https://${input}`
    const hostname = new URL(url).hostname
    return hostname.replace(/^www\./, '').toLowerCase().replace(/\.$/, '')
  } catch {
    // Fallback: strip protocol and path manually
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
