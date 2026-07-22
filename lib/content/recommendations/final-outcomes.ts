/**
 * STAGE-AWARE final-outcome view (Scope 2) — Preview/operator diagnostics only.
 *
 * The evidence-first engine's `candidateOutcomes` stop at ENGINE acceptance. A candidate
 * the engine accepted can still be dropped by ROUTE finalization (exact guard / salvage /
 * coverage / keyword-collision / intra-run dedup) or the BLOG-ARTICLE gate, so it would
 * NOT be persisted. This module builds a SEPARATE final view — one record per generated
 * candidate — tracing the engine-accepted set through finalization and the blog gate to
 * the exact `fresh` set that WOULD persist.
 *
 * It is purely observational: it reads the arrays the route already computed and changes
 * NO decision and NO order. The engine view is never renamed or removed; this is added
 * alongside it. Order-preservation across stages (fresh ⊆ engineFresh ⊆ engine-accepted,
 * all in the same order) is what makes the persisted records line up 1:1 with `fresh`.
 */
import { normalizeText } from './topic-idea-store'
import type { CandidateOutcome, CandidateBlocker } from './generate-from-briefs'
import type { GscInputDiagnostics, SelectedGscBriefDetail } from '@/lib/gsc/recommendations/types'

export type FinalOutcomeLabel =
  | 'accepted_for_persistence'
  | 'rejected_by_engine'
  | 'rejected_by_route_finalization'
  | 'rejected_by_blog_gate'
  | 'not_processed'
  | 'dropped'

export interface FinalCandidateOutcome {
  briefId: string | null
  opportunityId: string | null
  sourceFamily: string | null
  briefSubject: string | null
  modelTitle: string | null
  modelPrimaryKeyword: string | null
  finalTitle: string | null
  finalPrimaryKeyword: string | null
  finalRecommendedPageType: string | null
  finalOutcome: FinalOutcomeLabel
  stage: string | null
  reason: string | null
  blocker: CandidateBlocker | null
  wouldPersist: boolean
}

export interface FinalCandidateAccounting {
  generated: number
  accepted_for_persistence: number
  rejected_by_engine: number
  rejected_by_route_finalization: number
  rejected_by_blog_gate: number
  not_processed: number
  dropped: number
  wouldPersistCount: number
  reconciles: boolean
  orderMatchesFresh: boolean
}

/** Minimal shape the tracer needs from a route suggestion (engineFresh / fresh items). */
export type RouteSuggestion = { title: string; primaryKeyword: string; recommendedPageType?: string | null }

export function buildFinalCandidateOutcomes(args: {
  engineOutcomes: CandidateOutcome[]
  engineFresh: RouteSuggestion[]
  fresh: RouteSuggestion[]
  blogRejectedByTitle: Map<string, string>
}): { finalCandidateOutcomes: FinalCandidateOutcome[]; finalCandidateAccounting: FinalCandidateAccounting } {
  const { engineOutcomes, engineFresh, fresh, blogRejectedByTitle } = args
  const nt = (s: string | null | undefined) => normalizeText(s ?? '')

  // Consumable per-title queues so exact-duplicate titles are still matched 1:1.
  const freshByTitle = new Map<string, RouteSuggestion[]>()
  for (const f of fresh) { const k = nt(f.title); const q = freshByTitle.get(k) ?? []; q.push(f); freshByTitle.set(k, q) }
  const engineFreshCount = new Map<string, number>()
  for (const f of engineFresh) engineFreshCount.set(nt(f.title), (engineFreshCount.get(nt(f.title)) ?? 0) + 1)
  // Of the engine-accepted items sharing a title, the first freshCount survived the blog
  // gate (persisted), the next (engineFreshCount − freshCount) were blog-rejected, the
  // remainder were finalization-rejected. Track the blog-reject budget per title.
  const blogRejectBudget = new Map<string, number>()
  for (const [k, c] of engineFreshCount) blogRejectBudget.set(k, Math.max(0, c - (freshByTitle.get(k)?.length ?? 0)))

  const base = (o: CandidateOutcome) => ({ briefId: o.briefId, opportunityId: o.opportunityId, sourceFamily: o.sourceFamily, briefSubject: o.briefSubject, modelTitle: o.modelTitle, modelPrimaryKeyword: o.modelPrimaryKeyword })
  const out: FinalCandidateOutcome[] = []
  for (const o of engineOutcomes) {
    if (o.outcome === 'not_processed') { out.push({ ...base(o), finalTitle: o.modelTitle, finalPrimaryKeyword: o.finalPrimaryKeyword, finalRecommendedPageType: null, finalOutcome: 'not_processed', stage: o.rejectionStage ?? 'target_reached', reason: null, blocker: null, wouldPersist: false }); continue }
    if (o.outcome === 'dropped') { out.push({ ...base(o), finalTitle: o.modelTitle, finalPrimaryKeyword: o.finalPrimaryKeyword, finalRecommendedPageType: null, finalOutcome: 'dropped', stage: o.rejectionStage ?? 'brief_not_found', reason: null, blocker: null, wouldPersist: false }); continue }
    if (o.outcome === 'rejected') { out.push({ ...base(o), finalTitle: o.modelTitle, finalPrimaryKeyword: o.finalPrimaryKeyword, finalRecommendedPageType: null, finalOutcome: 'rejected_by_engine', stage: o.rejectionStage, reason: o.rejectionReason, blocker: o.blocker, wouldPersist: false }); continue }
    // Engine-accepted — trace the ROUTE stages by title (order-preserving).
    const k = nt(o.modelTitle)
    const fq = freshByTitle.get(k)
    if (fq && fq.length) {
      const f = fq.shift() as RouteSuggestion
      out.push({ ...base(o), finalTitle: f.title, finalPrimaryKeyword: f.primaryKeyword, finalRecommendedPageType: f.recommendedPageType ?? null, finalOutcome: 'accepted_for_persistence', stage: 'persistence', reason: null, blocker: null, wouldPersist: true })
      continue
    }
    const budget = blogRejectBudget.get(k) ?? 0
    if (budget > 0) {
      blogRejectBudget.set(k, budget - 1)
      out.push({ ...base(o), finalTitle: o.modelTitle, finalPrimaryKeyword: o.finalPrimaryKeyword, finalRecommendedPageType: null, finalOutcome: 'rejected_by_blog_gate', stage: 'blog_article_gate', reason: blogRejectedByTitle.get(k) ?? 'blog_gate_rejected', blocker: null, wouldPersist: false })
      continue
    }
    out.push({ ...base(o), finalTitle: o.modelTitle, finalPrimaryKeyword: o.finalPrimaryKeyword, finalRecommendedPageType: null, finalOutcome: 'rejected_by_route_finalization', stage: 'route_finalization', reason: 'route_finalization_removed', blocker: null, wouldPersist: false })
  }

  const persisted = out.filter((r) => r.wouldPersist)
  const orderMatchesFresh = persisted.length === fresh.length && persisted.every((r, i) => nt(r.finalTitle) === nt(fresh[i].title) && nt(r.finalPrimaryKeyword) === nt(fresh[i].primaryKeyword))
  const finalCandidateAccounting: FinalCandidateAccounting = {
    generated: out.length,
    accepted_for_persistence: persisted.length,
    rejected_by_engine: out.filter((r) => r.finalOutcome === 'rejected_by_engine').length,
    rejected_by_route_finalization: out.filter((r) => r.finalOutcome === 'rejected_by_route_finalization').length,
    rejected_by_blog_gate: out.filter((r) => r.finalOutcome === 'rejected_by_blog_gate').length,
    not_processed: out.filter((r) => r.finalOutcome === 'not_processed').length,
    dropped: out.filter((r) => r.finalOutcome === 'dropped').length,
    wouldPersistCount: persisted.length,
    reconciles: persisted.length === fresh.length && out.length === engineOutcomes.length,
    orderMatchesFresh,
  }
  return { finalCandidateOutcomes: out, finalCandidateAccounting }
}

/**
 * Stage E3A FIX 4 — resolve `finalOutcome` for engine-accepted GSC briefs (left null at synthesis)
 * using the stage-aware final outcomes. Purely observational: reads the arrays the route already
 * computed, changes NO decision and NO order, and returns a NEW gscInput (never mutates). Records
 * already resolved at synthesis (`not_consumed` / `rejected_by_engine`) are preserved as-is, so an
 * engine-accepted brief that a later route/blog gate rejected is never mislabeled accepted.
 */
export function applyFinalOutcomesToGscDetails(
  gscInput: GscInputDiagnostics | null,
  finalCandidateOutcomes: FinalCandidateOutcome[],
): GscInputDiagnostics | null {
  if (!gscInput || !gscInput.selectedGscBriefDetails?.length) return gscInput
  const byId = new Map<string, FinalOutcomeLabel>()
  for (const f of finalCandidateOutcomes) if (f.opportunityId) byId.set(f.opportunityId, f.finalOutcome)
  const selectedGscBriefDetails = gscInput.selectedGscBriefDetails.map((d) => {
    if (d.finalOutcome !== null) return d // engine-determined (not_consumed / rejected_by_engine)
    const label = byId.get(d.briefId)
    const finalOutcome: SelectedGscBriefDetail['finalOutcome'] =
      label === 'accepted_for_persistence' ? 'accepted_for_persistence'
        : label === 'rejected_by_route_finalization' ? 'rejected_by_route_finalization'
          : label === 'rejected_by_blog_gate' ? 'rejected_by_blog_gate'
            : label === 'rejected_by_engine' ? 'rejected_by_engine'
              : d.finalOutcome
    return { ...d, finalOutcome }
  })
  return { ...gscInput, selectedGscBriefDetails }
}
