/**
 * The bridge from the engine's candidate ledger to the numbers the MERCHANT sees.
 *
 * The run summary in AutomationIdeas renders `meta.funnel`, whose buckets did not
 * include any of the engine's own outcomes — so a candidate the engine removed left
 * no trace beyond `engineFiltered`, a subtraction. A run could show "0 new ideas"
 * with nothing accounting for it.
 *
 * PURE, and deliberately KEEPS THE VERDICTS APART FROM THE FAILURES:
 *   - a candidate never reviewed (the run met its target) is not a rejection;
 *   - a candidate that could not be reconciled with its brief is a defect, not a
 *     verdict about the content;
 *   - a removal nobody recorded must NEVER be folded into a named reason, which
 *     would present a bug as a considered decision.
 */

/**
 * The ENGINE's own rejection breakdown, for the production brief engine
 * (generateFromBriefs — the default when every RECO_* path flag is off).
 *
 * `meta.funnel.engineFiltered` is a SUBTRACTION (generated − accepted). It says how
 * many candidates disappeared and nothing about why, so a run could truthfully report
 * "17 generated · 17 did not pass quality/relevance checks · 0 duplicates · 0 quality
 * filtered · 0 already exists · 0 covered" — six numbers, none of which explains the
 * seventeen. The engine had the answer the whole time in `rejected_by_reason`; it was
 * simply never carried to the response. This turns that residual into the ledger the
 * engine actually recorded.
 *
 * The three non-verdict outcomes stay OUT of the reason list on purpose:
 *   - not_processed — the run hit its target; nothing was judged;
 *   - dropped — a candidate could not be matched back to its brief. A defect, not a
 *     verdict about the content;
 *   - unexplained — must be 0. If it is not, something removed a candidate without
 *     recording it, and that is reported as itself rather than absorbed into a reason.
 */
export interface EngineRejectionSummary {
  /** Typed engine rejection reasons, most frequent first. Reason CODES — the caller
   *  localizes them; a code must never be rendered to a merchant as-is. */
  reasons: { reason: string; count: number }[]
  /** Candidates never validated because the run's target was already reached. */
  notProcessed: number
  /** Candidates that could not be reconciled with a brief (an internal failure). */
  dropped: number
  /** generated − accepted − Σreasons − notProcessed − dropped. Zero when honest. */
  unexplained: number
}

export const EMPTY_ENGINE_REJECTIONS: EngineRejectionSummary = { reasons: [], notProcessed: 0, dropped: 0, unexplained: 0 }

/** Read the breakdown off the brief engine's diagnostics. Pure; never throws. */
export function buildEngineRejectionSummary(diag: {
  rejected_by_reason?: Record<string, number>
  candidateAccounting?: { generated: number; accepted: number; rejected: number; not_processed: number; dropped: number } | null
  generated_opportunities?: number
} | null | undefined): EngineRejectionSummary {
  if (!diag) return EMPTY_ENGINE_REJECTIONS
  const reasons = Object.entries(diag.rejected_by_reason ?? {})
    .filter(([, n]) => n > 0)
    .map(([reason, count]) => ({ reason, count }))
    // Deterministic: count desc, then reason asc, so the same run always renders
    // the same order (an unstable list reads as a changing explanation).
    .sort((a, b) => (b.count - a.count) || a.reason.localeCompare(b.reason))
  const acc = diag.candidateAccounting ?? null
  const generated = acc?.generated ?? diag.generated_opportunities ?? 0
  const accepted = acc?.accepted ?? 0
  const notProcessed = Math.max(0, acc?.not_processed ?? 0)
  const dropped = Math.max(0, acc?.dropped ?? 0)
  const named = reasons.reduce((s, r) => s + r.count, 0)
  return { reasons, notProcessed, dropped, unexplained: Math.max(0, generated - accepted - named - notProcessed - dropped) }
}

/** True when the breakdown has anything to say. */
export function hasEngineRejections(s: EngineRejectionSummary): boolean {
  return s.reasons.length > 0 || s.notProcessed > 0 || s.dropped > 0 || s.unexplained > 0
}
