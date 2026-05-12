/**
 * Domain normalization utilities for AI Visibility citation matching.
 *
 * Handles every common URL form we see in AI responses:
 *   - https://www.example.com/
 *   - http://example.com
 *   - www.example.com
 *   - example.com/path?q=1#h
 *   - [www.example.com](https://www.example.com)  (markdown links)
 *   - "  https://Example.com  "                    (whitespace + case)
 */

export function safeDecodeURL(url: string): string {
  try {
    return decodeURIComponent(url)
  } catch {
    return url
  }
}

/**
 * Strip markdown link wrappers like `[label](https://url)` and pull out the
 * destination URL. If the input isn't markdown, the original string is returned.
 */
export function stripMarkdownLink(input: string): string {
  if (!input) return input
  const trimmed = input.trim()
  // [label](url) — return the url
  const md = trimmed.match(/^\[[^\]]*\]\(([^)]+)\)$/)
  if (md && md[1]) return md[1].trim()
  return trimmed
}

export function extractHostname(url: string): string | null {
  if (!url) return null
  const cleaned = stripMarkdownLink(url).trim()
  // Add a scheme if missing so `new URL` succeeds
  const withScheme = /^https?:\/\//i.test(cleaned) ? cleaned : `https://${cleaned}`
  try {
    const decoded = safeDecodeURL(withScheme)
    const urlObj = new URL(decoded)
    return urlObj.hostname || null
  } catch {
    const decoded = safeDecodeURL(cleaned)
    const match = decoded.match(/^(?:https?:\/\/)?([^/?#\s]+)/i)
    return match ? match[1] : null
  }
}

export function normalizeDomain(input: string): string {
  if (!input) return ''
  const hostname = extractHostname(input)
  if (!hostname) {
    return stripMarkdownLink(input).toLowerCase().trim().replace(/^www\./, '')
  }
  return hostname.toLowerCase().replace(/^www\./, '')
}

/**
 * Strict match: result URL points to the target domain (or a subdomain).
 * Both inputs are passed through full normalization (markdown, scheme, www, case).
 */
export function isDomainMatch(resultUrl: string, targetDomain: string): boolean {
  if (!resultUrl || !targetDomain) return false

  const resultNormalized = normalizeDomain(resultUrl)
  const targetNormalized = normalizeDomain(targetDomain)
  if (!resultNormalized || !targetNormalized) return false

  if (resultNormalized === targetNormalized) return true

  // Allow subdomain matches (e.g., blog.example.com matches example.com)
  if (resultNormalized.endsWith('.' + targetNormalized)) return true

  return false
}
