/**
 * Detect if target domain is cited in the provider's citations/sources
 * Uses robust domain normalization to match domains in citations
 */

import { AICitation } from '../providers/types'
import { isDomainMatch } from './domain-normalize'

export interface TargetCitationResult {
  targetCited: boolean
  matchingCitations: AICitation[]
  citationCount: number
}

/**
 * Check if any citation matches the target domain
 */
function isCitationForTargetDomain(citation: AICitation, targetDomain: string): boolean {
  if (!citation.url || !targetDomain) return false

  // Use robust domain matching (handles www prefix, subdomains, etc.)
  return isDomainMatch(citation.url, targetDomain)
}

/**
 * Detect if target domain appears in the citations
 */
export function detectTargetCited(citations: AICitation[], targetDomain: string | null): TargetCitationResult {
  if (!citations || !targetDomain) {
    return {
      targetCited: false,
      matchingCitations: [],
      citationCount: 0,
    }
  }

  const matchingCitations = citations.filter((c) => isCitationForTargetDomain(c, targetDomain))

  return {
    targetCited: matchingCitations.length > 0,
    matchingCitations,
    citationCount: matchingCitations.length,
  }
}
