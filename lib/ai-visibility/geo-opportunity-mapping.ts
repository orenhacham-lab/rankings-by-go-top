/**
 * GEO Opportunity Mapping — Phase 2A project-level aggregation layer.
 *
 * Pure deterministic aggregation over all AI scan results for a project.
 * Computes which content patterns, citation types, and engine behaviors
 * correlate with the business appearing in AI answers.
 *
 * No AI calls, no embeddings, no ML scoring, no semantic guessing.
 * Every number comes from straight counts over geoInsights + display flags.
 */

import type { GeoInsights, CitationType } from './geo-signals'

export type ContentSignalKey =
  | 'pricing'
  | 'reviews'
  | 'comparison'
  | 'list'
  | 'recommendation'
  | 'local'

export interface SignalStats {
  signal: ContentSignalKey
  totalWithSignal: number
  successWithSignal: number
  visibilityRate: number // 0-100, integer
}

export interface CitationStats {
  type: CitationType
  totalWithType: number
  successWithType: number
  visibilityRate: number // 0-100, integer
}

export interface EngineStats {
  engine: string
  totalScans: number
  totalSuccess: number
  topSignals: ContentSignalKey[]
  topCitationTypes: CitationType[]
}

export interface MissingOpportunity {
  /** Signal key (content signal or citation type). */
  signal: string
  category: 'content' | 'citation'
  failureCount: number
  failureRate: number // % of failed results missing this signal
}

export interface GeoOpportunityMapping {
  totalResults: number
  totalSuccess: number
  totalFailed: number
  contentSignals: SignalStats[]
  citationTypes: CitationStats[]
  enginePatterns: EngineStats[]
  missingOpportunities: MissingOpportunity[]
}

export interface OpportunityResultInput {
  engine: string
  displayMentioned: boolean
  displayCited: boolean
  geoInsights: GeoInsights | null
}

/**
 * Minimum sample size before a rate/percentage is reported.
 * Below this threshold we drop the row entirely rather than report
 * a misleading number off 1-2 data points.
 */
const MIN_SAMPLE = 3

/** Fraction of successful results in which a signal must appear to be "top". */
const ENGINE_TOP_SIGNAL_THRESHOLD = 0.5

/** Fraction of failed results that must lack a signal for it to be "missing". */
const MISSING_THRESHOLD = 0.5

const CONTENT_SIGNAL_KEYS: ContentSignalKey[] = [
  'pricing',
  'reviews',
  'comparison',
  'list',
  'recommendation',
  'local',
]

const CITATION_TYPES_TRACKED: CitationType[] = [
  'homepage',
  'category',
  'product',
  'comparison',
  'review',
  'blog',
  'marketplace',
  'forum',
  'directory',
  'brand_site',
]

const CITATION_TYPES_FOR_MISSING: CitationType[] = ['brand_site', 'comparison', 'review']

function hasContentSignal(
  insights: GeoInsights | null,
  signal: ContentSignalKey
): boolean {
  if (!insights) return false
  const cs = insights.contentSignals
  switch (signal) {
    case 'pricing':
      return cs.hasPricingLanguage
    case 'reviews':
      return cs.hasReviewLanguage
    case 'comparison':
      return cs.hasComparisonLanguage
    case 'list':
      return cs.hasList
    case 'recommendation':
      return cs.hasRecommendationLanguage
    case 'local':
      return cs.hasLocalLanguage
  }
}

function hasCitationType(insights: GeoInsights | null, type: CitationType): boolean {
  if (!insights) return false
  return insights.citationTypes.includes(type)
}

function isSuccess(r: OpportunityResultInput): boolean {
  return r.displayMentioned || r.displayCited
}

function rate(numerator: number, denominator: number): number {
  if (denominator <= 0) return 0
  return Math.round((numerator / denominator) * 100)
}

/**
 * Compute project-level GEO opportunity insights from all scan results.
 *
 * Formulas:
 *   visibility_rate(signal)   = #(results with signal AND success) / #(results with signal)
 *   visibility_rate(citation) = #(results citing type AND success) / #(results citing type)
 *   engine top signals        = signals appearing in >= 50% of engine's successful results
 *   missing opportunity rate  = #(failed results missing signal) / #(failed results)
 *
 * Sample-size gate: any aggregate with fewer than MIN_SAMPLE data points
 * is dropped to avoid noisy single-result percentages.
 */
export function computeGeoOpportunityMapping(
  results: ReadonlyArray<OpportunityResultInput>
): GeoOpportunityMapping {
  // Only include results that have geoInsights — others can't contribute
  const usable = results.filter((r) => r.geoInsights !== null)
  const totalResults = usable.length
  const successful = usable.filter(isSuccess)
  const failed = usable.filter((r) => !isSuccess(r))
  const totalSuccess = successful.length
  const totalFailed = failed.length

  // ─────────────────────────────────────────────────────────────────────
  // 1. Content Signal Success Rates
  // ─────────────────────────────────────────────────────────────────────
  const contentSignals: SignalStats[] = []
  for (const signal of CONTENT_SIGNAL_KEYS) {
    const withSignal = usable.filter((r) => hasContentSignal(r.geoInsights, signal))
    if (withSignal.length < MIN_SAMPLE) continue
    const successWithSignal = withSignal.filter(isSuccess).length
    contentSignals.push({
      signal,
      totalWithSignal: withSignal.length,
      successWithSignal,
      visibilityRate: rate(successWithSignal, withSignal.length),
    })
  }
  contentSignals.sort((a, b) => b.visibilityRate - a.visibilityRate)

  // ─────────────────────────────────────────────────────────────────────
  // 2. Citation Type Performance
  // ─────────────────────────────────────────────────────────────────────
  const citationTypes: CitationStats[] = []
  for (const type of CITATION_TYPES_TRACKED) {
    const withType = usable.filter((r) => hasCitationType(r.geoInsights, type))
    if (withType.length < MIN_SAMPLE) continue
    const successWithType = withType.filter(isSuccess).length
    citationTypes.push({
      type,
      totalWithType: withType.length,
      successWithType,
      visibilityRate: rate(successWithType, withType.length),
    })
  }
  citationTypes.sort((a, b) => b.visibilityRate - a.visibilityRate)

  // ─────────────────────────────────────────────────────────────────────
  // 3. Engine Patterns — dominant signals/citation types per engine
  // ─────────────────────────────────────────────────────────────────────
  const enginesSet = new Set(usable.map((r) => r.engine))
  const enginePatterns: EngineStats[] = []
  for (const engine of enginesSet) {
    const engineResults = usable.filter((r) => r.engine === engine)
    const engineSuccess = engineResults.filter(isSuccess)
    if (engineSuccess.length < MIN_SAMPLE) continue

    // Signals appearing in >= ENGINE_TOP_SIGNAL_THRESHOLD of successful results
    const signalCounts = new Map<ContentSignalKey, number>()
    for (const r of engineSuccess) {
      for (const sig of CONTENT_SIGNAL_KEYS) {
        if (hasContentSignal(r.geoInsights, sig)) {
          signalCounts.set(sig, (signalCounts.get(sig) || 0) + 1)
        }
      }
    }
    const topSignals = Array.from(signalCounts.entries())
      .filter(([, count]) => count / engineSuccess.length >= ENGINE_TOP_SIGNAL_THRESHOLD)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([sig]) => sig)

    // Citation types appearing in successful results, ranked by frequency
    const typeCounts = new Map<CitationType, number>()
    for (const r of engineSuccess) {
      const types = r.geoInsights?.citationTypes ?? []
      for (const t of types) {
        typeCounts.set(t, (typeCounts.get(t) || 0) + 1)
      }
    }
    const topCitationTypes = Array.from(typeCounts.entries())
      .filter(([, count]) => count / engineSuccess.length >= 0.4)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 2)
      .map(([t]) => t)

    enginePatterns.push({
      engine,
      totalScans: engineResults.length,
      totalSuccess: engineSuccess.length,
      topSignals,
      topCitationTypes,
    })
  }
  enginePatterns.sort((a, b) => b.totalSuccess - a.totalSuccess)

  // ─────────────────────────────────────────────────────────────────────
  // 4. Missing Opportunities — what's commonly missing in failed results
  // ─────────────────────────────────────────────────────────────────────
  const missingOpportunities: MissingOpportunity[] = []
  if (totalFailed >= MIN_SAMPLE) {
    for (const signal of CONTENT_SIGNAL_KEYS) {
      const missingCount = failed.filter(
        (r) => !hasContentSignal(r.geoInsights, signal)
      ).length
      const failureRate = rate(missingCount, totalFailed)
      if (failureRate >= Math.round(MISSING_THRESHOLD * 100)) {
        missingOpportunities.push({
          signal,
          category: 'content',
          failureCount: missingCount,
          failureRate,
        })
      }
    }
    for (const type of CITATION_TYPES_FOR_MISSING) {
      const missingCount = failed.filter(
        (r) => !hasCitationType(r.geoInsights, type)
      ).length
      const failureRate = rate(missingCount, totalFailed)
      if (failureRate >= 60) {
        missingOpportunities.push({
          signal: type,
          category: 'citation',
          failureCount: missingCount,
          failureRate,
        })
      }
    }
    missingOpportunities.sort((a, b) => b.failureRate - a.failureRate)
  }

  return {
    totalResults,
    totalSuccess,
    totalFailed,
    contentSignals,
    citationTypes,
    enginePatterns,
    missingOpportunities,
  }
}
