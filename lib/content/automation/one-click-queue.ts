/**
 * PURE decision helpers for the AutomationIdeas one-click "approve + add to publishing
 * queue" flow. The impure orchestration (topics/bulk → GET plan → reviewed-snapshot
 * bulk-save → approve-and-queue) lives in the component; these functions decide, from the
 * bulk-save results, which topics may enter the queue — the truthful core of the fix.
 *
 * A topic with CHECKED links may be queued ONLY when its links fully persisted: the batch
 * saved, every checked link persisted, every persisted link was approved, no approval
 * shortfall, and no silently-dropped checked link. Topics with no checked links queue with
 * expectsLinks=false. Topics whose checked links did not fully persist are NEVER queued.
 */

export type CheckedLinksByTopic = Record<string, { url: string; anchor: string }[]>

export interface BulkSaveTopicResult {
  topicId: string
  ok?: boolean
  linkCount?: number
  approvedCount?: number
  approvalWarning?: boolean
  droppedLinks?: unknown[]
}

/** Split resolved topics into those the user checked links for vs. those without. */
export function partitionByCheckedLinks(topicIds: string[], checked: CheckedLinksByTopic): { withLinks: string[]; noLinks: string[] } {
  const withLinks = topicIds.filter((id) => (checked[id]?.length ?? 0) > 0)
  const noLinks = topicIds.filter((id) => !(checked[id]?.length))
  return { withLinks, noLinks }
}

export interface LinkSaveEvaluation { okIds: string[]; failures: { topicId: string; reason: string }[] }

/**
 * TRUTHFUL per-topic link-save success. A whole-batch failure (`ok:false`) fails every
 * checked-link topic with the given hard reason (e.g. cache_changed_replan_required /
 * no_cache). Otherwise each topic passes only when all checked links persisted AND were
 * approved AND none were dropped AND there is no approval shortfall.
 */
export function evaluateLinkSave(
  withLinksIds: string[],
  checked: CheckedLinksByTopic,
  opts: { ok: boolean; hardReason?: string | null; results?: BulkSaveTopicResult[] },
): LinkSaveEvaluation {
  const out: LinkSaveEvaluation = { okIds: [], failures: [] }
  if (withLinksIds.length === 0) return out
  if (!opts.ok) {
    const reason = opts.hardReason || 'link_plan_failed'
    for (const id of withLinksIds) out.failures.push({ topicId: id, reason })
    return out
  }
  const byId = new Map((opts.results ?? []).map((r) => [r.topicId, r]))
  for (const id of withLinksIds) {
    const checkedCount = checked[id]?.length ?? 0
    const r = byId.get(id)
    const dropped = Array.isArray(r?.droppedLinks) ? r!.droppedLinks!.length : 0
    const persisted = r?.linkCount ?? 0
    const approved = r?.approvedCount ?? 0
    const good = !!r?.ok && persisted === checkedCount && approved === persisted && !r?.approvalWarning && dropped === 0
    if (good) out.okIds.push(id)
    else out.failures.push({ topicId: id, reason: dropped > 0 ? 'dropped_link' : r?.approvalWarning ? 'approval_shortfall' : 'link_plan_failed' })
  }
  return out
}

export interface QueueTopicPlan { topicId: string; expectsLinks: boolean; recommendedPageType: string }

/** Build the approve-and-queue payload: link-free topics (expectsLinks:false) + topics whose
 *  checked links fully persisted (expectsLinks:true). Failed-link topics are excluded. */
export function buildQueueTopics(noLinksIds: string[], linkOkIds: string[], pageType: Record<string, string>): QueueTopicPlan[] {
  return [
    ...noLinksIds.map((id) => ({ topicId: id, expectsLinks: false, recommendedPageType: pageType[id] ?? 'article' })),
    ...linkOkIds.map((id) => ({ topicId: id, expectsLinks: true, recommendedPageType: pageType[id] ?? 'article' })),
  ]
}
