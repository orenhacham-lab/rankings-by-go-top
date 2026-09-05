/**
 * The bridge from the engine's candidate ledger to the numbers the MERCHANT sees.
 *
 * The run summary in AutomationIdeas renders `meta.funnel`, whose buckets did
 * not include any of the ledger's own outcomes — so a parser failure, a
 * duplicate inside the generated batch, or an internal removal nobody could name
 * simply never reached the screen. A run could show "0 new ideas" with nothing
 * accounting for it.
 *
 * PURE, and deliberately KEEPS THE THREE APART:
 *   - a schema/parse failure is not a quality judgement about the idea;
 *   - a duplicate inside the batch is not a rejection;
 *   - an internal/unnamed removal must NEVER be folded into "quality filtered",
 *     which would present a bug as a considered decision about the content.
 */

export interface FunnelDiagnostics {
  /** Items the model emitted that the parser could not use at all. */
  parserDropped: number
  /** Candidates that repeated another candidate IN THE SAME generated batch. */
  batchDuplicates: number
  /** Removed with no reason any boundary recorded — an internal failure. */
  internalUnaccounted: number
}

export const EMPTY_FUNNEL_DIAGNOSTICS: FunnelDiagnostics = {
  parserDropped: 0, batchDuplicates: 0, internalUnaccounted: 0,
}

/** Read the three counts off the opportunity diagnostics. Never throws. */
export function buildFunnelDiagnostics(diag: {
  parser_dropped_items?: number
  duplicates?: number
  rejected_by_reason?: Record<string, number>
} | null | undefined): FunnelDiagnostics {
  if (!diag) return EMPTY_FUNNEL_DIAGNOSTICS
  return {
    parserDropped: Math.max(0, diag.parser_dropped_items ?? 0),
    batchDuplicates: Math.max(0, diag.duplicates ?? 0),
    // `unaccounted` is tracked as a rejection reason but is NOT a quality
    // verdict — it is surfaced on its own line so it cannot masquerade as one.
    internalUnaccounted: Math.max(0, diag.rejected_by_reason?.unaccounted ?? 0),
  }
}

/** True when anything here is worth showing at all. */
export function hasFunnelDiagnostics(f: FunnelDiagnostics): boolean {
  return f.parserDropped > 0 || f.batchDuplicates > 0 || f.internalUnaccounted > 0
}
