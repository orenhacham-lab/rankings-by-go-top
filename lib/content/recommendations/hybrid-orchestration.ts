/**
 * Pure helpers for cost-aware STAGED Hybrid orchestration (no model calls, no DB).
 * The engine builds cheap evidence signals per source; this orders them so the two
 * strongest run first and weaker/more-expensive sources run only when still needed.
 */

export interface SourceSignals { [source: string]: number }

/**
 * Deterministic source order by evidence capacity (strongest first). A source with
 * a NEGATIVE signal is ineligible (e.g. a 'keyword' source with no seed) and is
 * dropped. Stable tie-break by name. No hardcoded niche order.
 */
export function orderSourcesByEvidence<S extends string>(eligible: readonly S[], signals: SourceSignals): S[] {
  return eligible
    .filter((s) => (signals[s] ?? 0) >= 0)
    .slice()
    .sort((a, b) => (signals[b] ?? 0) - (signals[a] ?? 0) || (a < b ? -1 : 1))
}

/** The Stage-1 sources (at most the two strongest). */
export function stage1Sources<S extends string>(ordered: readonly S[]): S[] {
  return ordered.slice(0, 2)
}
