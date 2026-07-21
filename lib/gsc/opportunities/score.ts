/**
 * Stage E2A — explainable, deterministic 0–100 opportunity score (pure).
 *
 * The score is PROJECT-RELATIVE and data-informed — not a single rigid global impressions
 * threshold. Demand is scaled by the project's own max impressions; the CTR gap is measured
 * against the median CTR of comparable rows in the SAME project + position band. Every score
 * returns its component values and reason codes. It is a prioritization signal, never a
 * guarantee or prediction. Low-scoring opportunities are scored, not discarded.
 */
import type { ReasonCode, ScoreComponents } from './types'

export type PositionBand = 'none' | 'p1_3' | 'p4_10' | 'p11_20' | 'p21_plus'

export function positionBand(position: number): PositionBand {
  if (!(position > 0)) return 'none'
  if (position <= 3) return 'p1_3'
  if (position <= 10) return 'p4_10'
  if (position <= 20) return 'p11_20'
  return 'p21_plus'
}

/** Median of a numeric list (0 for empty). Deterministic. */
export function median(values: number[]): number {
  if (values.length === 0) return 0
  const s = values.slice().sort((a, b) => a - b)
  const mid = Math.floor(s.length / 2)
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2
}

/** Project-relative demand: log-scaled by the dataset's max impressions (never a fixed cutoff). */
function demandStrength(impressions: number, maxImpressions: number): number {
  if (impressions <= 0 || maxImpressions <= 0) return 0
  return Math.min(1, Math.log1p(impressions) / Math.log1p(maxImpressions))
}

/** Striking-distance emphasis: peak at positions 4–10, tapering through 11–20. */
function positionOpportunity(position: number): number {
  if (!(position > 0)) return 0
  if (position <= 3) return 0.2
  if (position <= 10) return 1
  if (position <= 20) return 0.7 - 0.4 * ((position - 10) / 10)
  return 0.15
}

/** CTR gap vs the project's median CTR for the SAME position band (0 when at/above median). */
function ctrGap(actualCtr: number, bandMedianCtr: number): number {
  if (bandMedianCtr <= 0) return 0
  const gap = Math.max(0, bandMedianCtr - actualCtr)
  return Math.min(1, gap / bandMedianCtr)
}

/** Multi-page diagnostic signal strength (0 when a query maps to a single page). */
function distinctPageSignal(distinctPageCount: number): number {
  if (distinctPageCount <= 1) return 0
  return Math.min(1, 0.5 + 0.25 * (distinctPageCount - 2))
}

const WEIGHTS = { demandStrength: 0.35, positionOpportunity: 0.30, ctrGap: 0.15, contentMatchConfidence: 0.10, distinctPageSignal: 0.10 }

export interface ScoreContext { maxImpressions: number; bandMedianCtr: Record<PositionBand, number> }
export interface ScoreInput { impressions: number; ctr: number; averagePosition: number; distinctPageCount: number; contentMatchConfidence: number }

/** Compute the score, its components, and complete reason codes. */
export function scoreOpportunity(input: ScoreInput, ctx: ScoreContext): { score: number; components: ScoreComponents; reasons: ReasonCode[] } {
  const band = positionBand(input.averagePosition)
  const components: ScoreComponents = {
    demandStrength: demandStrength(input.impressions, ctx.maxImpressions),
    positionOpportunity: positionOpportunity(input.averagePosition),
    ctrGap: ctrGap(input.ctr, ctx.bandMedianCtr[band] ?? 0),
    contentMatchConfidence: Math.max(0, Math.min(1, input.contentMatchConfidence)),
    distinctPageSignal: distinctPageSignal(input.distinctPageCount),
  }
  const score = Math.round(100 * (
    WEIGHTS.demandStrength * components.demandStrength +
    WEIGHTS.positionOpportunity * components.positionOpportunity +
    WEIGHTS.ctrGap * components.ctrGap +
    WEIGHTS.contentMatchConfidence * components.contentMatchConfidence +
    WEIGHTS.distinctPageSignal * components.distinctPageSignal
  ))

  const reasons: ReasonCode[] = []
  reasons.push(components.demandStrength >= 0.5
    ? { code: 'high_demand', detail: 'Impressions are high relative to this project.', value: components.demandStrength }
    : { code: 'low_demand', detail: 'Impressions are modest relative to this project.', value: components.demandStrength })
  if (band === 'p4_10' || band === 'p11_20') reasons.push({ code: 'striking_distance_position', detail: 'Average position is within striking distance (4–20).', value: components.positionOpportunity })
  else if (band === 'p1_3') reasons.push({ code: 'already_ranking_well', detail: 'Average position is already strong (1–3).', value: components.positionOpportunity })
  else if (band === 'p21_plus') reasons.push({ code: 'far_position', detail: 'Average position is far from page one (>20).', value: components.positionOpportunity })
  if (components.ctrGap > 0) reasons.push({ code: 'ctr_below_band_median', detail: 'CTR is below the median for comparable rows in this position band.', value: components.ctrGap })
  reasons.push(components.contentMatchConfidence > 0
    ? { code: 'has_existing_content_match', detail: 'A relevant existing page or topic was matched.', value: components.contentMatchConfidence }
    : { code: 'no_close_content_match', detail: 'No sufficiently close existing content was matched.', value: 0 })
  if (input.distinctPageCount > 1) reasons.push({ code: 'multi_page_signal', detail: 'The query appears across multiple distinct pages (signal only, not confirmed cannibalization).', value: input.distinctPageCount })

  return { score, components, reasons }
}
