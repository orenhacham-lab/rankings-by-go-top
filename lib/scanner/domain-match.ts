/**
 * How the rank scanner decides that a search result belongs to a domain.
 *
 * These functions were private to google-search.ts, where they located the
 * project's own site in Serper's organic results. They live here, unchanged, so
 * that everything else that has to answer "is this result that domain?" answers
 * it with the SAME rules: the competitor positions recorded from the same result
 * page (./competitor-positions.ts), and the screens that match those rows back to
 * the competitors a merchant configured. A second copy of this logic would drift,
 * and a competitor matched by different rules than the project is not a fair
 * comparison.
 *
 * Pure: no I/O, no environment, safe in the browser.
 */

/** The URL-bearing fields of one organic result. */
export interface OrganicResultUrls {
  link: string
  displayedLink?: string
  sitelinks?: Array<{
    title?: string
    link: string
  }>
}

/**
 * Safely decode a URL string. Handles malformed encodings gracefully by
 * falling back to the original input. Catches multi-pass encodings (e.g.
 * %2520 → %20 → space) by decoding up to 3 times.
 */
export function safeDecodeURL(input: string): string {
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

/**
 * Detect Google redirect URLs and extract the real destination URL.
 * Handles formats like:
 * - https://www.google.com/url?q=https://destination.com&sa=...
 * - https://google.com/url?url=https://destination.com
 * - http://www.google.com/aclk?...&adurl=https://destination.com
 * Returns the destination URL if found, otherwise the original input.
 */
export function unwrapRedirect(input: string): string {
  if (!input) return input
  try {
    const url = input.startsWith('http') ? input : `https://${input}`
    const parsed = new URL(url)
    const host = parsed.hostname.toLowerCase()

    // Only treat as redirect if hostname is a Google domain
    const isGoogleHost =
      host === 'google.com' ||
      host.endsWith('.google.com') ||
      /\.google\.[a-z.]+$/.test(host) ||
      host === 'googleadservices.com' ||
      host.endsWith('.googleadservices.com')

    if (!isGoogleHost) return input

    // Common destination params used by Google
    const destinationParams = ['q', 'url', 'adurl', 'dest', 'u']
    for (const param of destinationParams) {
      const value = parsed.searchParams.get(param)
      if (value && /^https?:\/\//i.test(value)) {
        return safeDecodeURL(value)
      }
    }
    return input
  } catch {
    return input
  }
}

/**
 * Extract hostname from URL or domain string.
 * Handles:
 * - http/https protocols
 * - www and subdomains
 * - paths, query params, fragments
 * - trailing slashes
 * - encoded URLs (decodeURIComponent)
 * - Google redirect URLs (unwraps to destination)
 * Returns just the hostname part, lowercase.
 */
export function extractHostname(input: string): string {
  if (!input) return ''
  // First, decode any URL-encoded characters
  const decoded = safeDecodeURL(input)
  // Then unwrap Google redirect URLs to reveal the real destination
  const unwrapped = unwrapRedirect(decoded)
  try {
    // Try URL constructor approach first — most reliable
    const url = unwrapped.startsWith('http') ? unwrapped : `https://${unwrapped}`
    const hostname = new URL(url).hostname || ''
    return hostname.toLowerCase()
  } catch {
    // Fallback: manual parsing
    return unwrapped
      .replace(/^https?:\/\//, '')
      .split('/')[0]
      .split('?')[0]
      .split('#')[0]
      .toLowerCase()
      .trim()
  }
}

/**
 * Normalize a domain by extracting hostname and removing www prefix.
 * Examples:
 * - "https://www.example.com/path?q=1" → "example.com"
 * - "example.com" → "example.com"
 * - "blog.example.com" → "blog.example.com"
 * - "www.example.com" → "example.com"
 * - "https://www.google.com/url?q=https%3A%2F%2Fexample.com" → "example.com"
 */
export function normalizeDomain(input: string): string {
  const hostname = extractHostname(input)
  // Remove www. prefix if present (but keep other subdomains like m., blog., etc.)
  return hostname.replace(/^www\./, '')
}

/**
 * Extract all URLs from a Serper search result.
 * Checks: link, displayedLink, sitelinks.
 * Returns array of { url, source } tuples to track where each URL came from.
 */
export function extractAllURLsFromResult(
  result: OrganicResultUrls
): Array<{ url: string; source: string }> {
  const urls: Array<{ url: string; source: string }> = []

  if (result.link) {
    urls.push({ url: result.link, source: 'link' })
  }
  if (result.displayedLink && result.displayedLink !== result.link) {
    urls.push({ url: result.displayedLink, source: 'displayedLink' })
  }
  if (Array.isArray(result.sitelinks)) {
    result.sitelinks.forEach((sitelink, idx) => {
      if (sitelink.link) {
        urls.push({ url: sitelink.link, source: `sitelinks[${idx}]` })
      }
    })
  }

  return urls
}

/**
 * Check if a result hostname matches the target domain.
 * Handles:
 * - www. prefix (stripped from both sides)
 * - subdomains (m.example.com matches example.com)
 * - exact domain matches
 * - case-insensitive
 * Does NOT use includes() to avoid false positives (e.g., "example.co" matching "notexample.com")
 */
export function isDomainMatch(resultNormalized: string, targetNormalized: string): boolean {
  if (!resultNormalized || !targetNormalized) return false

  // Exact match after normalization
  if (resultNormalized === targetNormalized) return true

  // Subdomain check: result must end with "." + target
  // This ensures "blog.example.com" matches "example.com"
  // but "notexample.com" does NOT match "example.com"
  if (resultNormalized.endsWith('.' + targetNormalized)) return true

  return false
}
