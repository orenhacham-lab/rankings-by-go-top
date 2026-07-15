/**
 * Atomic approve + link-plan + enqueue — the per-topic RESULT CONTRACT (Part L).
 *
 * The live defect ("הנושאים נוספו לתור, אבל חלק מהקישורים לא נשמרו") is an AMBIGUOUS
 * partial success: the client saved links and enqueued as two independent calls and
 * reported success even when the link save partly failed. This pure module encodes
 * the authoritative rule — a topic is 'success' ONLY when every required stage
 * succeeded — so a caller can never report a topic as fully added when its links did
 * not save. No DB/network here; the endpoint runs the stages and calls classify().
 */

export type TopicStage = 'validate' | 'link_plan' | 'approval' | 'enqueue' | 'done'
export type TopicResultState =
  | 'success'
  | 'validation_failed'
  | 'link_plan_failed'
  | 'approval_failed'
  | 'enqueue_failed'
  | 'already_queued'

export interface TopicStageOutcomes {
  /** Ownership + status + selected-link-URL validation passed. */
  validated: boolean
  /** Link plan requested for this topic (false ⇒ skip link stage). */
  linkPlanRequested: boolean
  /** ALL selected links persisted+approved (only meaningful when requested). */
  linkPlanSaved: boolean
  /** Topic transitioned to (or already) 'approved'. */
  approved: boolean
  /** Newly inserted into the pool. */
  enqueued: boolean
  /** Already present in the pool (idempotent). */
  alreadyQueued: boolean
}

export interface TopicResult {
  topicId: string
  state: TopicResultState
  failedStage: TopicStage | null
  /** Safe typed error code (no secrets). */
  errorCode: string | null
  retryable: boolean
}

/**
 * Classify one topic's outcome. A topic is 'success' ONLY when it validated, its
 * requested link plan fully saved, it is approved, and it was enqueued OR already
 * queued. A link-plan failure NEVER yields success (the defect) — it stops before
 * enqueue and reports link_plan_failed. Order: validate → link_plan → approval →
 * enqueue. Idempotent: already-queued is a success-equivalent terminal state.
 */
export function classifyTopicOutcome(topicId: string, o: TopicStageOutcomes): TopicResult {
  const r = (state: TopicResultState, failedStage: TopicStage | null, errorCode: string | null, retryable: boolean): TopicResult =>
    ({ topicId, state, failedStage, errorCode, retryable })

  if (!o.validated) return r('validation_failed', 'validate', 'topic_validation_failed', false)
  // Link plan must fully save BEFORE we approve/enqueue — no silent dropped links.
  if (o.linkPlanRequested && !o.linkPlanSaved) return r('link_plan_failed', 'link_plan', 'link_plan_save_failed', true)
  if (!o.approved) return r('approval_failed', 'approval', 'topic_approval_failed', true)
  if (o.alreadyQueued && !o.enqueued) return r('already_queued', null, null, false)
  if (!o.enqueued) return r('enqueue_failed', 'enqueue', 'queue_insert_failed', true)
  return r('success', null, null, false)
}

/** A batch is fully successful only when EVERY topic reached a success-equivalent
 *  terminal state; partial failures are reported truthfully (never "all added"). */
export function summarizeBatch(results: TopicResult[]): {
  ok: boolean
  added: number
  alreadyQueued: number
  failed: number
  byState: Record<TopicResultState, number>
} {
  const byState = { success: 0, validation_failed: 0, link_plan_failed: 0, approval_failed: 0, enqueue_failed: 0, already_queued: 0 } as Record<TopicResultState, number>
  for (const r of results) byState[r.state]++
  const added = byState.success
  const alreadyQueued = byState.already_queued
  const failed = results.length - added - alreadyQueued
  return { ok: failed === 0, added, alreadyQueued, failed, byState }
}
