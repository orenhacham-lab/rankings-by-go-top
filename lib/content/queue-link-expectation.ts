/**
 * Should "add to publishing queue" claim a saved internal-link plan?
 *
 * THE DEFECT THIS EXISTS FOR. A manually created topic could not be queued at
 * all when the project had no internal-link site index. The drawer's automatic
 * preview came back with `cacheState: 'missing'` and zero links, but
 * `saveAndQueue()` still called `persistSelection()` unconditionally, which
 * POSTs to /internal-links/plan/bulk-save — and bulk-save correctly refuses a
 * missing cache. The save failed, `onSaveAndQueue()` was never reached, and the
 * user saw "Site index missing — refresh the index and try again", as though
 * the OPTIONAL internal-link index were a prerequisite for writing an article.
 *
 * The queue and the link plan are separate concerns: internal links are an
 * enhancement to an article, never a condition of creating one. This module is
 * the single place that decides which of the two flows a queue action takes, so
 * the rule is stated once and can be tested exhaustively without a DOM.
 *
 * It is deliberately CONSERVATIVE. The no-links path is taken only when both
 * lookups POSITIVELY CONFIRMED their fact — the preview explicitly reported a
 * missing cache, and the saved-plan lookup explicitly reported no plan. A
 * failure is never read as a confirmation: a thrown fetch is not proof that the
 * index is missing, and a failed saved-plan lookup is not proof that no plan
 * exists. Anything unconfirmed refuses the queue action outright.
 *
 * That asymmetry is the safety property: the failure mode of guessing wrong in
 * one direction is a merchant who has to retry; in the other it is links
 * silently dropped from an article that was supposed to have them.
 */

/**
 * What the link-plan PREVIEW (`GET …/internal-links/plan`) actually told us.
 *
 * 'unavailable' and a confirmed missing index are DIFFERENT FACTS and must not
 * be conflated. A thrown fetch, a network failure or a non-2xx that carries no
 * explicit `cacheState` says nothing about whether the site has an index — it
 * says the lookup did not complete. Treating that as "missing" would let an
 * infrastructure blip silently queue an article without the internal links it
 * was supposed to have.
 */
export type PreviewLookup =
  | { status: 'pending' }
  | { status: 'unavailable' }
  | { status: 'loaded'; cacheState: string }

/**
 * What the SAVED-PLAN lookup (`GET …/internal-links/plan/saved`) actually told
 * us. Same rule: a failed lookup is not proof that no saved plan exists, and a
 * result belonging to a previously opened topic must never be reused.
 */
export type SavedPlanLookup =
  | { status: 'pending' }
  | { status: 'unavailable' }
  | { status: 'loaded'; exists: boolean }

export interface QueueLinkExpectationInput {
  preview: PreviewLookup
  savedPlan: SavedPlanLookup
  /** Recommended + manual links actually CHECKED for saving (anchor-bearing only). */
  checkedLinkCount: number
}

export type QueueLinkExpectationReason =
  /** The preview has not resolved yet. */
  | 'preview_pending'
  /** The preview failed — the cache state is UNKNOWN, not missing. */
  | 'preview_unavailable'
  /** The saved-plan lookup has not resolved yet. */
  | 'saved_plan_pending'
  /** The saved-plan lookup failed — whether a plan exists is UNKNOWN. */
  | 'saved_plan_unavailable'
  /** The user checked links, so they must be persisted and verified. */
  | 'links_selected'
  /** A saved plan exists and is being claimed; the server must confirm it. */
  | 'saved_plan_claimed'
  /**
   * A saved plan exists, nothing new was selected, and the site index is
   * confirmed missing — so it is claimed WITHOUT a save. bulk-save refuses a
   * missing cache (409 `cacheState: 'missing'`), which means persisting is not
   * merely unnecessary here, it is impossible.
   */
  | 'saved_plan_claimed_no_index'
  /** An index exists, so the normal plan flow applies. */
  | 'cache_available'
  /** Confirmed: no index and nothing selected — queue the article on its own. */
  | 'no_links_no_index'

export type QueueLinkExpectationDecision =
  /**
   * A required lookup has not positively confirmed its fact. The queue action
   * is refused outright rather than guessed at — the caller shows its ordinary
   * loading / error-and-retry state.
   */
  | { canQueue: false; reason: Extract<QueueLinkExpectationReason, 'preview_pending' | 'preview_unavailable' | 'saved_plan_pending' | 'saved_plan_unavailable'> }
  | {
      canQueue: true
      /** Sent to approve-and-queue; true ⇒ the server verifies a persisted plan. */
      expectsLinks: boolean
      /** Whether the client must call plan/save or plan/bulk-save first. */
      persistPlan: boolean
      reason: Extract<QueueLinkExpectationReason, 'links_selected' | 'saved_plan_claimed' | 'saved_plan_claimed_no_index' | 'cache_available' | 'no_links_no_index'>
    }

/**
 * PURE. Returns `expectsLinks: false` ONLY when every one of these was
 * POSITIVELY CONFIRMED — never merely assumed from a failure:
 *
 *   1. the preview completed and explicitly reported `cacheState === 'missing'`
 *      — a pending or failed preview proves nothing about the index;
 *   2. the saved-plan lookup completed and explicitly reported `exists: false`
 *      — a pending or failed lookup proves nothing about a saved plan, and the
 *      two requests run concurrently, so the preview resolving first must not
 *      be enough on its own;
 *   3. zero links are checked — one checked link means the user reviewed and
 *      chose it, and it must be persisted and server-verified.
 *
 * A saved plan that already exists is CLAIMED rather than re-saved when the
 * index is missing (`saved_plan_claimed_no_index`): `expectsLinks` stays true,
 * so the server still verifies the plan, but no impossible write is attempted.
 * BATCH CALLERS MUST NOTE: this decision takes a single aggregated saved-plan
 * fact. A caller enqueueing several topics at once on that path must ensure
 * they ALL have a plan — claiming for a topic that has none would fail its
 * server verification and partially queue the batch.
 *
 * A present-but-stale index still goes through the normal plan flow, including
 * its cache-changed protection. Anything unconfirmed refuses the action
 * (`canQueue: false`); anything confirmed but not matching the three conditions
 * keeps the pre-existing save-then-server-verify flow exactly.
 */
export function resolveQueueLinkExpectation(input: QueueLinkExpectationInput): QueueLinkExpectationDecision {
  // 1) BOTH lookups must have positively completed. Order matters only for the
  //    reason code; either being unconfirmed refuses the action.
  if (input.preview.status === 'pending') return { canQueue: false, reason: 'preview_pending' }
  if (input.preview.status === 'unavailable') return { canQueue: false, reason: 'preview_unavailable' }
  if (input.savedPlan.status === 'pending') return { canQueue: false, reason: 'saved_plan_pending' }
  if (input.savedPlan.status === 'unavailable') return { canQueue: false, reason: 'saved_plan_unavailable' }

  const ready = (reason: 'links_selected' | 'saved_plan_claimed' | 'cache_available'): QueueLinkExpectationDecision =>
    ({ canQueue: true, expectsLinks: true, persistPlan: true, reason })

  // 2) Anything the user chose keeps the existing save-then-server-verify flow.
  //    With a missing index the save will fail — truthfully, with the save
  //    error — which is right: a checked link must never be silently dropped.
  if (input.checkedLinkCount > 0) return ready('links_selected')

  // 3) A plan already exists and nothing new was selected. Normally it is
  //    re-saved and then claimed. But when the index is CONFIRMED MISSING the
  //    save cannot succeed at all — bulk-save answers 409 `cacheState:
  //    'missing'` — so re-saving would strand the topic exactly the way the
  //    original incident did. There is nothing to write in this case anyway:
  //    the plan is already persisted, and `expectsLinks: true` asks the server
  //    to VERIFY it, which is the whole guarantee. So it is claimed directly.
  if (input.savedPlan.exists) {
    return input.preview.cacheState === 'missing'
      ? { canQueue: true, expectsLinks: true, persistPlan: false, reason: 'saved_plan_claimed_no_index' }
      : ready('saved_plan_claimed')
  }
  if (input.preview.cacheState !== 'missing') return ready('cache_available')

  // 3) Confirmed: no index, no saved plan, nothing checked. Nothing to save and
  //    nothing to verify, so the article is queued on its own. No empty link-plan
  //    batch is invented to satisfy the queue — the absence of a plan is the
  //    truthful state, and approve-and-queue accepts it because expectsLinks is
  //    false.
  return { canQueue: true, expectsLinks: false, persistPlan: false, reason: 'no_links_no_index' }
}
