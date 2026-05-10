/**
 * Domain normalization utilities for AI Visibility citation matching
 * DUPLICATED from lib/scanner/google-search.ts (not imported to guarantee isolation)
 * Used to robustly match target domain against citation URLs
 */

export function safeDecodeURL(url: string): string {
  try {
    return decodeURIComponent(url)
  } catch {
    return url
  }
}

export function extractHostname(url: string): string | null {
  try {
    const decoded = safeDecodeURL(url)
    const urlObj = new URL(decoded)
    return urlObj.hostname || null
  } catch {
    // Fallback: try simple regex extraction for edge cases
    const decoded = safeDecodeURL(url)
    const match = decoded.match(/^https?:\/\/([^/?#]+)/)
    return match ? match[1] : null
  }
}

export function normalizeDomain(input: string): string {
  const hostname = extractHostname(input)
  if (!hostname) return input.toLowerCase().trim()

  // Remove www. prefix if present
  return hostname.replace(/^www\./, '').toLowerCase()
}

export function isDomainMatch(resultUrl: string, targetDomain: string): boolean {
  if (!resultUrl || !targetDomain) return false

  const resultNormalized = normalizeDomain(resultUrl)
  const targetNormalized = normalizeDomain(targetDomain)

  if (resultNormalized === targetNormalized) return true

  // Allow subdomain matches (e.g., blog.example.com matches example.com)
  if (resultNormalized.endsWith('.' + targetNormalized)) return true

  return false
}
