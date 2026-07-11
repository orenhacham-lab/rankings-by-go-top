/**
 * GEO Competitor Intelligence — Phase 2B deterministic competitor analysis.
 *
 * Analyzes which competitor domains repeatedly appear in successful AI answers,
 * their authority patterns, how different engines prefer different competitors,
 * and what content dominates when our business loses visibility.
 *
 * Pure aggregation over citations, no AI, no hallucinations, no external APIs.
 */

import type { CitationType } from './geo-signals'

export type CompetitorCategory =
  | 'marketplace'
  | 'review'
  | 'forum'
  | 'brand'
  | 'editorial'
  | 'directory'
  | 'unknown'

export interface CompetitorDomain {
  domain: string
  appearanceCount: number
  uniqueEngineCount: number
  citationTypes: CitationType[]
  category: CompetitorCategory
  authorityScore: number // 0-100, deterministic
}

export interface EngineCompetitorPreference {
  engine: string
  topCompetitors: Array<{
    domain: string
    frequency: number
  }>
}

export interface VisibilityLossPattern {
  dominantDomains: string[]
  dominantCategories: CompetitorCategory[]
  frequentCitationTypes: Array<{
    type: CitationType
    frequency: number
  }>
}

export interface GeoCompetitorIntelligence {
  trustedDomains: CompetitorDomain[]
  categoryBreakdown: Array<{
    category: CompetitorCategory
    count: number
    percentage: number
  }>
  enginePreferences: EngineCompetitorPreference[]
  visibilityLossPatterns: VisibilityLossPattern
  totalSuccessfulResults: number
  totalFailedResults: number
}

export interface CompetitorIntelligenceInput {
  engine: string
  displayMentioned: boolean
  displayCited: boolean
  targetDomain: string | null
  citations: Array<{
    domain: string
    citationType: CitationType
  }>
}

// Minimum sample size for a competitor to be included
const MIN_COMPETITOR_APPEARANCES = 3

// Domains to exclude as they're generic/noise
const EXCLUDED_DOMAINS = new Set([
  'google.com',
  'youtube.com',
  'wikipedia.org',
  'github.com',
  'stackoverflow.com',
])

function isGenericDomain(domain: string): boolean {
  // Check exact matches
  if (EXCLUDED_DOMAINS.has(domain)) return true
  // Check if it's a generic platform subdomain
  if (domain.includes('reddit.com')) return false // Reddit is valuable competitive data
  if (domain.includes('twitter.com')) return false
  if (domain.includes('linkedin.com')) return false
  return false
}

function normalizeDomain(url: string): string {
  try {
    const u = new URL(url.startsWith('http') ? url : `https://${url}`)
    return u.hostname || url
  } catch {
    return url
  }
}

function inferCategory(citationTypes: CitationType[]): CompetitorCategory {
  // Priority-based categorization
  if (citationTypes.includes('review')) return 'review'
  if (citationTypes.includes('marketplace')) return 'marketplace'
  if (citationTypes.includes('forum')) return 'forum'
  if (citationTypes.includes('blog')) return 'editorial'
  if (citationTypes.includes('directory')) return 'directory'
  if (citationTypes.includes('brand_site') || citationTypes.includes('homepage'))
    return 'brand'
  return 'unknown'
}

function computeAuthorityScore(
  appearanceRate: number, // appearances / total successful
  engineCoverage: number, // unique engines / total engines
  citationTypeStrength: number // weighted by type
): number {
  // Deterministic formula: weighted average
  const score =
    appearanceRate * 40 + // frequency: 40%
    engineCoverage * 40 + // engine diversity: 40%
    Math.min(citationTypeStrength / 2, 20) // citation boost: 20%
  return Math.round(score)
}

function getCitationTypeWeight(type: CitationType): number {
  switch (type) {
    case 'brand_site':
      return 2.0
    case 'review':
      return 1.5
    case 'comparison':
      return 1.5
    case 'marketplace':
      return 1.0
    case 'category':
      return 1.0
    case 'product':
      return 0.8
    case 'blog':
      return 0.8
    case 'homepage':
      return 1.2
    case 'forum':
      return 0.7
    case 'directory':
      return 0.9
    default:
      return 0.5
  }
}

/**
 * Analyze competitor intelligence from all scan results.
 *
 * Returns deterministic insights about:
 * - Which competitor domains AI repeatedly trusts
 * - Categorization of competitors
 * - Which engines prefer which competitors
 * - What appears when our business loses visibility
 */
export function computeGeoCompetitorIntelligence(
  results: ReadonlyArray<CompetitorIntelligenceInput>
): GeoCompetitorIntelligence {
  const successful = results.filter((r) => r.displayMentioned || r.displayCited)
  const failed = results.filter((r) => !r.displayMentioned && !r.displayCited)

  // ─────────────────────────────────────────────────────────────────────
  // 1. Aggregate competitor domains from successful results
  // ─────────────────────────────────────────────────────────────────────

  const domainMap = new Map<
    string,
    {
      appearances: number
      engines: Set<string>
      citationTypes: Set<CitationType>
    }
  >()

  for (const r of successful) {
    for (const citation of r.citations) {
      const domain = normalizeDomain(citation.domain)

      // Skip target domain and generic domains
      if (domain === r.targetDomain || isGenericDomain(domain)) continue

      if (!domainMap.has(domain)) {
        domainMap.set(domain, {
          appearances: 0,
          engines: new Set(),
          citationTypes: new Set(),
        })
      }

      const entry = domainMap.get(domain)!
      entry.appearances++
      entry.engines.add(r.engine)
      entry.citationTypes.add(citation.citationType)
    }
  }

  // ─────────────────────────────────────────────────────────────────────
  // 2. Compute authority scores and filter by minimum sample
  // ─────────────────────────────────────────────────────────────────────

  const trustedDomains: CompetitorDomain[] = []
  const totalEngines = new Set(results.map((r) => r.engine)).size

  for (const [domain, data] of domainMap) {
    if (data.appearances < MIN_COMPETITOR_APPEARANCES) continue

    const citationTypes = Array.from(data.citationTypes)
    const category = inferCategory(citationTypes)

    // Compute authority score
    const appearanceRate = successful.length > 0 ? data.appearances / successful.length : 0
    const engineCoverage = data.engines.size / totalEngines
    const citationTypeStrength = citationTypes.reduce(
      (sum, t) => sum + getCitationTypeWeight(t),
      0
    )
    const authorityScore = computeAuthorityScore(
      appearanceRate,
      engineCoverage,
      citationTypeStrength
    )

    trustedDomains.push({
      domain,
      appearanceCount: data.appearances,
      uniqueEngineCount: data.engines.size,
      citationTypes,
      category,
      authorityScore,
    })
  }

  // Sort by authority score (highest first)
  trustedDomains.sort((a, b) => b.authorityScore - a.authorityScore)

  // ─────────────────────────────────────────────────────────────────────
  // 3. Compute category breakdown
  // ─────────────────────────────────────────────────────────────────────

  const categoryCount = new Map<CompetitorCategory, number>()
  for (const domain of trustedDomains) {
    categoryCount.set(domain.category, (categoryCount.get(domain.category) || 0) + 1)
  }

  const totalCompetitors = trustedDomains.length
  const categoryBreakdown = Array.from(categoryCount.entries())
    .map(([category, count]) => ({
      category,
      count,
      percentage: totalCompetitors > 0 ? Math.round((count / totalCompetitors) * 100) : 0,
    }))
    .sort((a, b) => b.count - a.count)

  // ─────────────────────────────────────────────────────────────────────
  // 4. Engine-specific competitor preferences
  // ─────────────────────────────────────────────────────────────────────

  const engineDomainFreq = new Map<string, Map<string, number>>()

  for (const r of successful) {
    if (!engineDomainFreq.has(r.engine)) {
      engineDomainFreq.set(r.engine, new Map())
    }

    const freqMap = engineDomainFreq.get(r.engine)!
    for (const citation of r.citations) {
      const domain = normalizeDomain(citation.domain)
      if (domain === r.targetDomain || isGenericDomain(domain)) continue
      freqMap.set(domain, (freqMap.get(domain) || 0) + 1)
    }
  }

  const enginePreferences: EngineCompetitorPreference[] = Array.from(
    engineDomainFreq.entries()
  )
    .map(([engine, freqMap]) => ({
      engine,
      topCompetitors: Array.from(freqMap.entries())
        .map(([domain, frequency]) => ({ domain, frequency }))
        .sort((a, b) => b.frequency - a.frequency)
        .slice(0, 2), // Top 2 per engine
    }))
    .filter((ep) => ep.topCompetitors.length > 0)

  // ─────────────────────────────────────────────────────────────────────
  // 5. Visibility loss patterns (what appears when we don't)
  // ─────────────────────────────────────────────────────────────────────

  const failedDomainFreq = new Map<string, number>()
  const failedCategoryFreq = new Map<CompetitorCategory, number>()
  const failedCitationTypeFreq = new Map<CitationType, number>()

  for (const r of failed) {
    for (const citation of r.citations) {
      const domain = normalizeDomain(citation.domain)
      if (domain === r.targetDomain || isGenericDomain(domain)) continue

      failedDomainFreq.set(domain, (failedDomainFreq.get(domain) || 0) + 1)
      const category = inferCategory([citation.citationType])
      failedCategoryFreq.set(category, (failedCategoryFreq.get(category) || 0) + 1)
      failedCitationTypeFreq.set(
        citation.citationType,
        (failedCitationTypeFreq.get(citation.citationType) || 0) + 1
      )
    }
  }

  const visibilityLossPatterns: VisibilityLossPattern = {
    dominantDomains: Array.from(failedDomainFreq.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([domain]) => domain),
    dominantCategories: Array.from(failedCategoryFreq.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([category]) => category),
    frequentCitationTypes: Array.from(failedCitationTypeFreq.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([type, frequency]) => ({ type, frequency })),
  }

  return {
    trustedDomains: trustedDomains.slice(0, 5), // Top 5 trusted competitors
    categoryBreakdown,
    enginePreferences,
    visibilityLossPatterns,
    totalSuccessfulResults: successful.length,
    totalFailedResults: failed.length,
  }
}
