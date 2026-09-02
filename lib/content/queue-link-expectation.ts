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
 * It is deliberately CONSERVATIVE — `expectsLinks: false` is returned only when
 * every condition for "there is genuinely nothing to save" holds. Everything
 * else, including the moment before the preview has resolved, keeps the
 * existing save-then-verify flow. That asymmetry is the safety property: the
 * failure mode of guessing wrong in one direction is a merchant who cannot
 * queue an article; in the other it is links silently dropped from an article
 * that was supposed to have them.
 */

export interface QueueLinkExpectationInput {
  /** The dry-run preview has resolved (successfully or not). */
  previewLoaded: boolean
  /** A preview request is in flight right now. */
  previewRunning: boolean
  /** `cacheState` from the preview: 'ok' | 'stale' | 'missing' | … , null before it loads. */
  cacheState: string | null
  /** Recommended + manual links actually CHECKED for saving (anchor-bearing only). */
  checkedLinkCount: number
  /** A link-plan batch already exists for this topic. */
  savedPlanExists: boolean
}

export type QueueLinkExpectationReason =
  /** The preview has not resolved — the cache state is not yet known. */
  | 'preview_pending'
  /** The user checked links, so they must be persisted and verified. */
  | 'links_selected'
  /** A saved plan exists and is being claimed; the server must confirm it. */
  | 'saved_plan_claimed'
  /** An index exists, so the normal plan flow applies. */
  | 'cache_available'
  /** No index and nothing selected — queue the article on its own. */
  | 'no_links_no_index'

export interface QueueLinkExpectationDecision {
  /** Sent to approve-and-queue; true ⇒ the server verifies a persisted plan. */
  expectsLinks: boolean
  /** Whether the client must call plan/save or plan/bulk-save first. */
  persistPlan: boolean
  reason: QueueLinkExpectationReason
}

/**
 * PURE. Returns `expectsLinks: false` ONLY when all of these hold:
 *
 *   1. the preview has resolved and is not still running — otherwise a fast
 *      double-click could land on the no-links path before the cache state is
 *      even known, and silently queue an article whose links were about to
 *      load;
 *   2. the site-index cache is genuinely 'missing' — a present-but-stale index
 *      still goes through the normal plan flow, including its cache-changed
 *      protection;
 *   3. zero links are checked — one checked link means the user reviewed and
 *      chose it, and it must be persisted and server-verified;
 *   4. no saved plan exists for the topic — a topic that already has a batch is
 *      claiming it, and the server must confirm it rather than take the
 *      caller's word.
 *
 * Every other input returns `expectsLinks: true` with `persistPlan: true`, i.e.
 * exactly the pre-existing behaviour.
 */
export function resolveQueueLinkExpectation(input: QueueLinkExpectationInput): QueueLinkExpectationDecision {
  const expect = (reason: QueueLinkExpectationReason): QueueLinkExpectationDecision =>
    ({ expectsLinks: true, persistPlan: true, reason })

  if (!input.previewLoaded || input.previewRunning) return expect('preview_pending')
  if (input.checkedLinkCount > 0) return expect('links_selected')
  if (input.savedPlanExists) return expect('saved_plan_claimed')
  if (input.cacheState !== 'missing') return expect('cache_available')

  // Nothing to save and nothing to verify: queue the article by itself. No
  // empty link-plan batch is created to satisfy the queue — the absence of a
  // plan is the truthful state, and approve-and-queue accepts it because
  // expectsLinks is false.
  return { expectsLinks: false, persistPlan: false, reason: 'no_links_no_index' }
}
