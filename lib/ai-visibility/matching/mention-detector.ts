/**
 * Detect if target brand name or domain appears in AI response text
 * Tracks positions and returns detailed match info
 */

export interface MentionDetectionResult {
  mentioned: boolean
  positions: number[]
  matchType: 'brand_name' | 'domain' | 'none'
}

/**
 * Normalize text for comparison: lowercase, trim, remove common punctuation
 */
function normalizeForComparison(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[,.'"""''()\-–—]/g, ' ')
    .replace(/\s+/g, ' ')
}

/**
 * Extract word-boundary matches from text
 * Avoids false positives like "example" matching "example123" or "notexample"
 */
function findWordBoundaryMatches(text: string, searchTerm: string): number[] {
  const normalized = normalizeForComparison(text)
  const normalizedSearch = normalizeForComparison(searchTerm)
  const positions: number[] = []

  if (!normalizedSearch || normalizedSearch.length === 0) return positions

  let startIndex = 0
  while (true) {
    const index = normalized.indexOf(normalizedSearch, startIndex)
    if (index === -1) break

    // Check word boundaries
    const beforeOk = index === 0 || /\s/.test(normalized[index - 1])
    const afterOk = index + normalizedSearch.length >= normalized.length || /\s/.test(normalized[index + normalizedSearch.length])

    if (beforeOk && afterOk) {
      positions.push(index)
    }

    startIndex = index + 1
  }

  return positions
}

/**
 * Detect if target brand name appears in the response text
 */
export function detectBrandNameMention(text: string, brandName: string | null): MentionDetectionResult {
  if (!text || !brandName) {
    return { mentioned: false, positions: [], matchType: 'none' }
  }

  const positions = findWordBoundaryMatches(text, brandName)

  return {
    mentioned: positions.length > 0,
    positions,
    matchType: positions.length > 0 ? 'brand_name' : 'none',
  }
}

/**
 * Detect if target domain appears in the response text
 * Looks for the normalized domain, handling www prefix
 */
export function detectDomainMention(text: string, domain: string | null): MentionDetectionResult {
  if (!text || !domain) {
    return { mentioned: false, positions: [], matchType: 'none' }
  }

  const normalized = normalizeForComparison(domain)
  const withoutWww = normalized.replace(/^www\./, '')
  const withWww = normalized.startsWith('www.') ? normalized : `www. ${normalized}`

  // Try both with and without www
  const positionsWithoutWww = findWordBoundaryMatches(text, withoutWww)
  const positionsWithWww = findWordBoundaryMatches(text, withWww)

  const positions = [...new Set([...positionsWithoutWww, ...positionsWithWww])]

  return {
    mentioned: positions.length > 0,
    positions: positions.sort((a, b) => a - b),
    matchType: positions.length > 0 ? 'domain' : 'none',
  }
}

/**
 * Combined detection: check both brand name and domain
 * Returns true if EITHER is mentioned
 */
export function detectMention(
  text: string,
  brandName: string | null,
  domain: string | null
): MentionDetectionResult {
  const brandResult = brandName ? detectBrandNameMention(text, brandName) : { mentioned: false, positions: [], matchType: 'none' as const }
  const domainResult = domain ? detectDomainMention(text, domain) : { mentioned: false, positions: [], matchType: 'none' as const }

  const allPositions = [...new Set([...brandResult.positions, ...domainResult.positions])]

  return {
    mentioned: brandResult.mentioned || domainResult.mentioned,
    positions: allPositions.sort((a, b) => a - b),
    matchType: brandResult.mentioned ? 'brand_name' : domainResult.mentioned ? 'domain' : 'none',
  }
}
