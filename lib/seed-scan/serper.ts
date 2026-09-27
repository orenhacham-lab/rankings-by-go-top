/**
 * Search results for step a4: does a competitor the model suggested really
 * show up for this site's keywords, and who else keeps showing up?
 *
 * Same provider and conventions as the rank scanner (lib/scanner/google-search.ts):
 * Serper's /search endpoint, SERPER_API_KEY in the X-API-KEY header, `gl` as the
 * lower-cased country and `hl` as the language, the first page of organic
 * results. Result links are reduced to a domain exactly the way the scanner
 * does it: decode, unwrap a Google redirect, take the hostname, drop `www.`.
 * The scanner keeps those helpers private and is being extended by another
 * package in parallel, so they are mirrored here verbatim rather than exported
 * from there; seed-serper.qa.ts pins the scanner's documented examples.
 *
 * One request per query and a hard timeout. Failures come back as stable codes:
 * the provider's status text and body are never read into anything returned or
 * logged.
 */

const SERPER_API_URL = 'https://google.serper.dev/search'
/** Per request. The three a4 queries run in parallel, so this is a4's whole budget. */
export const SEARCH_TIMEOUT_MS = 6_000
export const RESULTS_PER_QUERY = 10

/**
 * One organic result as a1's search-index fallback reads it: the link, its
 * title and its snippet, each capped. Text we show nobody verbatim; it is only
 * handed to the model as the site's description in Google's index. A link is
 * never fetched.
 */
export type SearchPage = { url: string; title: string; snippet: string }

export const PAGE_TITLE_CHARS = 200
export const PAGE_SNIPPET_CHARS = 400

export type SearchOutcome =
  | { ok: true; domains: string[]; pages?: SearchPage[] }
  | { ok: false; code: 'search_unavailable' | 'search_failed' | 'search_timeout' }

/** One search: the distinct result domains of the top organic results, in rank order. */
export type SearchFn = (query: string, market: { gl: string; hl: string }) => Promise<SearchOutcome>

// ── Domain normalization, mirrored from lib/scanner/google-search.ts ────────

function safeDecodeURL(input: string): string {
  let current = input
  for (let i = 0; i < 3; i++) {
    try {
      const decoded = decodeURIComponent(current)
      if (decoded === current) return decoded
      current = decoded
    } catch {
      return current
    }
  }
  return current
}

function unwrapRedirect(input: string): string {
  if (!input) return input
  try {
    const url = input.startsWith('http') ? input : `https://${input}`
    const parsed = new URL(url)
    const host = parsed.hostname.toLowerCase()
    const isGoogleHost =
      host === 'google.com' ||
      host.endsWith('.google.com') ||
      /\.google\.[a-z.]+$/.test(host) ||
      host === 'googleadservices.com' ||
      host.endsWith('.googleadservices.com')
    if (!isGoogleHost) return input
    for (const param of ['q', 'url', 'adurl', 'dest', 'u']) {
      const value = parsed.searchParams.get(param)
      if (value && /^https?:\/\//i.test(value)) return safeDecodeURL(value)
    }
    return input
  } catch {
    return input
  }
}

function extractHostname(input: string): string {
  if (!input) return ''
  const unwrapped = unwrapRedirect(safeDecodeURL(input))
  try {
    const url = unwrapped.startsWith('http') ? unwrapped : `https://${unwrapped}`
    return (new URL(url).hostname || '').toLowerCase()
  } catch {
    return unwrapped.replace(/^https?:\/\//, '').split('/')[0].split('?')[0].split('#')[0].toLowerCase().trim()
  }
}

/** "https://www.example.com/path?q=1" → "example.com"; other subdomains are kept. */
export function normalizeResultDomain(input: string): string {
  return extractHostname(input).replace(/^www\./, '')
}

/** Exact domain, or a subdomain of it — never a substring ("notexample.com" ≠ "example.com"). */
export function isDomainMatch(resultDomain: string, target: string): boolean {
  if (!resultDomain || !target) return false
  return resultDomain === target || resultDomain.endsWith(`.${target}`)
}

// ── Obvious non-competitors ─────────────────────────────────────────────────

/**
 * Domains that rank for everything and compete with nobody: social networks,
 * video, encyclopedias and the search engine itself. A domain that shows up in
 * two of our three searches is added as a competitor unless it is one of these.
 */
const NON_COMPETITOR_DOMAINS = [
  // social networks and forums
  'facebook.com', 'instagram.com', 'twitter.com', 'x.com', 'linkedin.com', 'pinterest.com', 'tiktok.com',
  'reddit.com', 'quora.com', 'threads.net', 'snapchat.com', 'whatsapp.com', 'telegram.org', 't.me',
  // video
  'youtube.com', 'youtu.be', 'vimeo.com', 'dailymotion.com', 'twitch.tv',
  // encyclopedias and wikis
  'wikipedia.org', 'wikimedia.org', 'wiktionary.org', 'wikihow.com', 'britannica.com', 'fandom.com',
  // the search engines and their surfaces
  'google.com', 'bing.com', 'yahoo.com', 'duckduckgo.com', 'yandex.com', 'baidu.com',
]

export function isNonCompetitor(domain: string): boolean {
  if (NON_COMPETITOR_DOMAINS.some((d) => isDomainMatch(domain, d))) return true
  // google.co.il, google.de, maps.google.co.uk …
  return /(^|\.)google\.[a-z]{2,3}(\.[a-z]{2})?$/.test(domain)
}

// ── The request ─────────────────────────────────────────────────────────────

type SerperOrganic = { link?: unknown; title?: unknown; snippet?: unknown }

const oneLine = (v: unknown, max: number): string => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, max) : '')

/**
 * A SearchFn bound to Serper. `apiKey` defaults to SERPER_API_KEY; without one
 * every search answers `search_unavailable` and nothing is sent.
 */
export function createSerperSearch(options: { apiKey?: string | null; fetchImpl?: typeof fetch; timeoutMs?: number } = {}): SearchFn {
  const apiKey = options.apiKey === undefined ? process.env.SERPER_API_KEY : options.apiKey
  const fetchImpl = options.fetchImpl ?? fetch
  const timeoutMs = options.timeoutMs ?? SEARCH_TIMEOUT_MS

  return async (query, market) => {
    if (!apiKey) return { ok: false, code: 'search_unavailable' }
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), timeoutMs)
    try {
      const res = await fetchImpl(SERPER_API_URL, {
        method: 'POST',
        headers: { 'X-API-KEY': apiKey, 'Content-Type': 'application/json' },
        body: JSON.stringify({ q: query, gl: market.gl, hl: market.hl, type: 'search', num: RESULTS_PER_QUERY, page: 1 }),
        signal: controller.signal,
      })
      // The status line and body of a refusal are the provider's words: not read.
      if (!res.ok) return { ok: false, code: 'search_failed' }
      let payload: unknown
      try {
        payload = await res.json()
      } catch {
        return { ok: false, code: 'search_failed' }
      }
      const organic = (payload as { organic?: unknown }).organic
      if (!Array.isArray(organic)) return { ok: false, code: 'search_failed' }
      const domains: string[] = []
      const pages: SearchPage[] = []
      for (const r of organic.slice(0, RESULTS_PER_QUERY) as SerperOrganic[]) {
        if (typeof r?.link !== 'string') continue
        const d = normalizeResultDomain(r.link)
        if (d && !domains.includes(d)) domains.push(d)
        if (/^https?:\/\//i.test(r.link) && r.link.length <= 2_000) {
          pages.push({ url: r.link, title: oneLine(r.title, PAGE_TITLE_CHARS), snippet: oneLine(r.snippet, PAGE_SNIPPET_CHARS) })
        }
      }
      return { ok: true, domains, pages }
    } catch (err) {
      const aborted = err instanceof Error && (err.name === 'AbortError' || err.name === 'TimeoutError')
      return { ok: false, code: aborted ? 'search_timeout' : 'search_failed' }
    } finally {
      clearTimeout(timer)
    }
  }
}
