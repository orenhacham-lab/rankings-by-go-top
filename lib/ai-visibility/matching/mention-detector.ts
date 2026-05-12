/**
 * Detect if target brand name or domain appears in AI response text
 * Tracks positions and returns detailed match info.
 *
 * Supports multiple brand-name variants (Hebrew + English + domain-derived).
 * Example: Business "פרפיום קלאב", Domain "perfumeclub.co.il"
 *   matches: "פרפיום קלאב", "Perfume Club", "perfumeclub", "PerfumeClub"
 */

export interface MentionDetectionResult {
  mentioned: boolean
  positions: number[]
  matchType: 'brand_name' | 'domain' | 'none'
  matchedVariants: string[]
}

/**
 * Normalize text for comparison: lowercase, trim, remove common punctuation.
 * Preserves Hebrew characters and word characters intact.
 */
function normalizeForComparison(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[,.'"""''()\-–—\[\]]/g, ' ')
    .replace(/\s+/g, ' ')
}

/**
 * Check whether a character at a given position is a word-boundary character.
 * Hebrew letters are considered part of a word. Latin word chars and digits too.
 */
function isWordChar(ch: string | undefined): boolean {
  if (!ch) return false
  // Hebrew letters U+0590..U+05FF, Latin letters, digits, underscore
  return /[A-Za-z0-9_֐-׿]/.test(ch)
}

/**
 * Extract word-boundary matches from text.
 * Allows Hebrew word characters too — the previous version only checked whitespace.
 */
function findWordBoundaryMatches(text: string, searchTerm: string): number[] {
  const normalized = normalizeForComparison(text)
  const normalizedSearch = normalizeForComparison(searchTerm)
  const positions: number[] = []

  if (!normalizedSearch || normalizedSearch.length < 2) return positions

  let startIndex = 0
  while (true) {
    const index = normalized.indexOf(normalizedSearch, startIndex)
    if (index === -1) break

    const before = index > 0 ? normalized[index - 1] : undefined
    const afterIdx = index + normalizedSearch.length
    const after = afterIdx < normalized.length ? normalized[afterIdx] : undefined

    const beforeOk = !isWordChar(before)
    const afterOk = !isWordChar(after)

    if (beforeOk && afterOk) {
      positions.push(index)
    }

    startIndex = index + 1
  }

  return positions
}

/**
 * Derive brand-name variants from raw inputs.
 *
 * Given a business name and/or domain, returns a deduplicated list of
 * candidate strings to search for in the response text.
 *
 * Variants include:
 *   - business name (as-is, trimmed)
 *   - domain "brand" (hostname without TLD or www, e.g. perfumeclub.co.il → "perfumeclub")
 *   - spaced form of the brand if it contains capitals or compound words
 */
export function getBrandVariants(
  brandName: string | null | undefined,
  domain: string | null | undefined
): string[] {
  const variants = new Set<string>()
  const push = (s: string | null | undefined) => {
    if (!s) return
    const trimmed = s.trim()
    if (trimmed.length >= 2) variants.add(trimmed)
  }

  // 1. Business name as-is
  push(brandName ?? null)

  // 2. Extract brand-part from domain (perfumeclub.co.il → perfumeclub)
  if (domain) {
    const cleaned = domain
      .replace(/^https?:\/\//i, '')
      .replace(/^www\./i, '')
      .replace(/\/.*$/, '')
      .toLowerCase()
    const firstLabel = cleaned.split('.')[0]
    if (firstLabel && firstLabel.length >= 3) {
      push(firstLabel)
      // 3. Spaced form for compound names like "perfumeclub" → "perfume club"
      const spaced = splitCompound(firstLabel)
      if (spaced && spaced !== firstLabel) push(spaced)
    }
  }

  return Array.from(variants)
}

/**
 * Try to split a compound lowercase string into common English words.
 * Currently uses a small dictionary of frequent retail/tech words.
 * Falls back to inserting a space before mid-word capitals.
 */
function splitCompound(input: string): string {
  // CamelCase split
  const camel = input.replace(/([a-z])([A-Z])/g, '$1 $2')
  if (camel !== input) return camel.toLowerCase()

  // Common English compound brand suffixes/prefixes
  const KNOWN = [
    'perfume', 'club', 'shop', 'store', 'world', 'land', 'mart', 'house',
    'sport', 'sports', 'beauty', 'kids', 'baby', 'home', 'garden',
    'food', 'drink', 'tech', 'media', 'group', 'global', 'online',
    'fashion', 'style', 'design', 'studio', 'agency', 'web', 'digital',
    'central', 'plus', 'pro', 'express', 'direct', 'market',
  ]

  for (const word of KNOWN) {
    if (input.startsWith(word) && input.length > word.length + 2) {
      const rest = input.slice(word.length)
      return `${word} ${rest}`
    }
    if (input.endsWith(word) && input.length > word.length + 2) {
      const head = input.slice(0, input.length - word.length)
      return `${head} ${word}`
    }
  }

  return input
}

/**
 * Detect if any of the brand-name variants appear in the response text.
 */
export function detectBrandNameMention(
  text: string,
  brandName: string | null,
  domain?: string | null
): MentionDetectionResult {
  if (!text) {
    return { mentioned: false, positions: [], matchType: 'none', matchedVariants: [] }
  }

  const variants = getBrandVariants(brandName, domain)
  if (variants.length === 0) {
    return { mentioned: false, positions: [], matchType: 'none', matchedVariants: [] }
  }

  const allPositions: number[] = []
  const matched: string[] = []

  for (const variant of variants) {
    const positions = findWordBoundaryMatches(text, variant)
    if (positions.length > 0) {
      matched.push(variant)
      allPositions.push(...positions)
    }
  }

  const positions = Array.from(new Set(allPositions)).sort((a, b) => a - b)
  return {
    mentioned: positions.length > 0,
    positions,
    matchType: positions.length > 0 ? 'brand_name' : 'none',
    matchedVariants: matched,
  }
}

/**
 * Detect if target domain appears anywhere in the response text.
 * Handles markdown links: `[www.example.com](https://www.example.com)`,
 * raw URLs with/without scheme, www prefix, trailing slashes, and paths.
 */
export function detectDomainMention(text: string, domain: string | null): MentionDetectionResult {
  if (!text || !domain) {
    return { mentioned: false, positions: [], matchType: 'none', matchedVariants: [] }
  }

  const normalizedTarget = domain
    .toLowerCase()
    .trim()
    .replace(/^https?:\/\//, '')
    .replace(/^www\./, '')
    .replace(/\/.*$/, '')

  if (!normalizedTarget) {
    return { mentioned: false, positions: [], matchType: 'none', matchedVariants: [] }
  }

  // Match any occurrence of the bare domain anywhere in text (allow www. prefix
  // and any path/query). Match must be preceded/followed by a non-domain char.
  const escaped = normalizedTarget.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const re = new RegExp(`(?:^|[^a-zA-Z0-9.-])(?:www\\.)?${escaped}(?:[/?#][^\\s\\]\\)]*)?(?:[^a-zA-Z0-9.-]|$)`, 'gi')

  const positions: number[] = []
  const lowered = text.toLowerCase()
  let m: RegExpExecArray | null
  while ((m = re.exec(lowered)) !== null) {
    positions.push(m.index)
    if (re.lastIndex === m.index) re.lastIndex++
  }

  return {
    mentioned: positions.length > 0,
    positions,
    matchType: positions.length > 0 ? 'domain' : 'none',
    matchedVariants: positions.length > 0 ? [normalizedTarget] : [],
  }
}

/**
 * Combined detection: check both brand name and domain (and variants).
 * Returns true if EITHER is mentioned.
 */
export function detectMention(
  text: string,
  brandName: string | null,
  domain: string | null
): MentionDetectionResult {
  const brandResult = detectBrandNameMention(text, brandName, domain)
  const domainResult = detectDomainMention(text, domain)

  const allPositions = Array.from(
    new Set([...brandResult.positions, ...domainResult.positions])
  ).sort((a, b) => a - b)

  const matchedVariants = Array.from(
    new Set([...brandResult.matchedVariants, ...domainResult.matchedVariants])
  )

  return {
    mentioned: brandResult.mentioned || domainResult.mentioned,
    positions: allPositions,
    matchType: brandResult.mentioned
      ? 'brand_name'
      : domainResult.mentioned
      ? 'domain'
      : 'none',
    matchedVariants,
  }
}
