/**
 * Parse citations/sources from provider raw response
 * Provider adapters pass the raw response structure; this normalizes it
 */

import { AICitation } from '../providers/types'

export interface RawCitationData {
  url?: string
  href?: string
  link?: string
  source?: string
  domain?: string
  title?: string
  name?: string
  snippet?: string
  excerpt?: string
  text?: string
  position?: number
  index?: number
}

/**
 * Extract URL from a raw citation object
 * Handles various field names that different providers use
 */
function extractUrl(raw: RawCitationData | unknown): string | null {
  if (!raw || typeof raw !== 'object') return null

  const obj = raw as Record<string, unknown>
  return (obj.url || obj.href || obj.link || obj.source) as string | null
}

/**
 * Extract domain from URL
 * Handles edge cases and returns normalized domain
 */
function extractDomainFromUrl(url: string): string {
  try {
    const urlObj = new URL(url)
    return urlObj.hostname || url
  } catch {
    // Fallback: extract hostname via regex
    const match = url.match(/^https?:\/\/([^/?#]+)/)
    return match ? match[1] : url
  }
}

/**
 * Extract title from a raw citation object
 */
function extractTitle(raw: RawCitationData | unknown): string | null {
  if (!raw || typeof raw !== 'object') return null

  const obj = raw as Record<string, unknown>
  return (obj.title || obj.name) as string | null
}

/**
 * Extract snippet from a raw citation object
 */
function extractSnippet(raw: RawCitationData | unknown): string | null {
  if (!raw || typeof raw !== 'object') return null

  const obj = raw as Record<string, unknown>
  return (obj.snippet || obj.excerpt || obj.text) as string | null
}

/**
 * Extract position from a raw citation object
 */
function extractPosition(raw: RawCitationData | unknown): number | null {
  if (!raw || typeof raw !== 'object') return null

  const obj = raw as Record<string, unknown>
  const pos = obj.position || obj.index

  if (typeof pos === 'number') return pos
  if (typeof pos === 'string') {
    const parsed = parseInt(pos, 10)
    return !isNaN(parsed) ? parsed : null
  }

  return null
}

/**
 * Parse an array of raw citations into normalized AICitation objects
 */
export function parseCitations(rawCitations: unknown[]): AICitation[] {
  if (!Array.isArray(rawCitations)) return []

  const results: AICitation[] = []

  for (let index = 0; index < rawCitations.length; index++) {
    const raw = rawCitations[index]
    const url = extractUrl(raw)

    // Skip if no URL
    if (!url) continue

    const domain = extractDomainFromUrl(url)

    results.push({
      url,
      domain,
      title: extractTitle(raw) || undefined,
      snippet: extractSnippet(raw) || undefined,
      position: extractPosition(raw) ?? index + 1, // Default to 1-based index if not provided
    })
  }

  return results
}

/**
 * Handle nested citations structure
 * Some providers return { citations: [...] } or { sources: [...] } or { references: [...] }
 */
export function extractCitationsFromNested(data: unknown): unknown[] {
  if (!data || typeof data !== 'object') return []

  const obj = data as Record<string, unknown>

  // Try common field names
  const citationsList =
    (Array.isArray(obj.citations) && obj.citations) ||
    (Array.isArray(obj.sources) && obj.sources) ||
    (Array.isArray(obj.references) && obj.references) ||
    (Array.isArray(obj.links) && obj.links) ||
    (Array.isArray(obj.citations_list) && obj.citations_list)

  return Array.isArray(citationsList) ? citationsList : []
}
