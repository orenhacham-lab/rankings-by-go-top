/**
 * The merchant-facing sentences for the engine's own rejection ledger.
 *
 * Kept OUT of the component on purpose. "The strings are in both dictionaries" is
 * not evidence that the screen says anything true — the composition is where a
 * reason code can leak, a count can be dropped, or a bucket can be silently folded
 * into another. Putting the composition in one pure function means the test drives
 * the SAME code the card renders, with the SAME dictionaries, instead of a copy of it.
 *
 * CONTRACT:
 *   - a reason CODE is never emitted; an unmapped code becomes the localized
 *     fallback sentence, so a newly-added engine reason degrades to "did not pass
 *     one of our checks" rather than printing `title_unknown_latin_token` at a user;
 *   - the three non-verdict outcomes get their own sentences and are never merged
 *     into the reason list — a run that hit its target, an internal reconciliation
 *     loss, and an unrecorded removal are three different statements;
 *   - nothing is emitted for a bucket that is zero.
 */

export interface EngineRejectionDict {
  engineRejectionsLine: string
  engineRejectionItem: string
  engineNotReviewedLine: string
  engineDroppedLine: string
  engineUnexplainedLine: string
  rejectionReasonOther: string
  rejectionReasons: Record<string, string>
}

export interface EngineRejectionFunnel {
  engineRejections?: { reason: string; count: number }[]
  engineNotProcessed?: number
  engineDropped?: number
  engineUnexplained?: number
}

export function buildEngineRejectionLines(funnel: EngineRejectionFunnel | null | undefined, t: EngineRejectionDict): string[] {
  if (!funnel) return []
  const out: string[] = []
  const reasons = funnel.engineRejections ?? []
  if (reasons.length > 0) {
    const list = reasons
      .map((r) => t.engineRejectionItem
        .replace('{n}', String(r.count))
        .replace('{reason}', t.rejectionReasons[r.reason] ?? t.rejectionReasonOther))
      .join(' · ')
    out.push(t.engineRejectionsLine.replace('{list}', list))
  }
  const n = (v: number | undefined) => Math.max(0, v ?? 0)
  if (n(funnel.engineNotProcessed) > 0) out.push(t.engineNotReviewedLine.replace('{n}', String(n(funnel.engineNotProcessed))))
  if (n(funnel.engineDropped) > 0) out.push(t.engineDroppedLine.replace('{n}', String(n(funnel.engineDropped))))
  if (n(funnel.engineUnexplained) > 0) out.push(t.engineUnexplainedLine.replace('{n}', String(n(funnel.engineUnexplained))))
  return out
}
