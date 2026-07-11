/**
 * Business Mention Intelligence — Phase 2D deterministic business extraction.
 *
 * Identifies which competitors/businesses were actually mentioned in AI responses
 * (vs. which sources were cited). Pure rule-based matching, no AI, no hallucinations.
 *
 * Only works when explicit competitor list exists in project.
 */

export interface MentionedBusiness {
  name: string
  mentionCount: number
  engines: string[]
}

export interface BusinessMentionIntelligence {
  mentionedBusinesses: MentionedBusiness[]
  totalMentionedBusinesses: number
}

export interface BusinessMentionInput {
  engine: string
  responseText: string | null
  displayMentioned: boolean
  displayCited: boolean
}

// Minimum mention threshold for a business to be included
const MIN_BUSINESS_MENTIONS = 1

function matchesBusinessName(responseText: string, businessName: string): boolean {
  if (!businessName || businessName.length < 2) return false

  try {
    // Use word-boundary regex. For Hebrew/bidirectional text, this is approximate
    // but catches most false positives like "מגה" inside "מגה-דל".
    const escaped = businessName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    // Match word boundary or start/end of string (Hebrew-friendly)
    const pattern = new RegExp(`(^|\\s|[,;:!?\"'\\(\\[])${escaped}([,;:!?\\)\\]\"'\\s]|$)`, 'i')
    return pattern.test(responseText)
  } catch {
    // Fallback to simple substring if regex fails
    return responseText.toLowerCase().includes(businessName.toLowerCase())
  }
}

/**
 * Extract mentioned businesses from AI responses.
 * Only returns businesses from the provided competitor list.
 * Returns top businesses by mention frequency.
 */
export function computeBusinessMentionIntelligence(
  results: ReadonlyArray<BusinessMentionInput>,
  projectCompetitors?: ReadonlyArray<{
    name: string
    aliases?: string[]
  }>
): BusinessMentionIntelligence {
  if (!projectCompetitors || projectCompetitors.length === 0) {
    return {
      mentionedBusinesses: [],
      totalMentionedBusinesses: 0,
    }
  }

  const mentionedMap = new Map<
    string,
    {
      name: string
      mentionCount: number
      engines: Set<string>
    }
  >()

  for (const result of results) {
    // Skip if no response or business wasn't mentioned/cited
    if (!result.responseText || (!result.displayMentioned && !result.displayCited)) {
      continue
    }

    for (const competitor of projectCompetitors) {
      // Check primary name and all aliases
      const candidateNames = [competitor.name, ...(competitor.aliases || [])]
      let matched = false

      for (const candidateName of candidateNames) {
        if (matchesBusinessName(result.responseText, candidateName)) {
          matched = true
          break
        }
      }

      if (!matched) continue

      const key = competitor.name.toLowerCase()
      const existing = mentionedMap.get(key)

      if (existing) {
        existing.mentionCount++
        existing.engines.add(result.engine)
      } else {
        mentionedMap.set(key, {
          name: competitor.name,
          mentionCount: 1,
          engines: new Set([result.engine]),
        })
      }
    }
  }

  // Convert to array, sort by mention count, filter minimum threshold
  const mentionedBusinesses = Array.from(mentionedMap.values())
    .filter((b) => b.mentionCount >= MIN_BUSINESS_MENTIONS)
    .map((b) => ({
      name: b.name,
      mentionCount: b.mentionCount,
      engines: Array.from(b.engines),
    }))
    .sort((a, b) => b.mentionCount - a.mentionCount)
    .slice(0, 5) // Top 5

  return {
    mentionedBusinesses,
    totalMentionedBusinesses: mentionedBusinesses.length,
  }
}
