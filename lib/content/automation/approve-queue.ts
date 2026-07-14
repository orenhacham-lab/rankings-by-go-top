/**
 * Pure decision logic for the manual-topic "approve links + add to queue" flow.
 *
 * Manual topics are created with status='suggested'; the review-panel action saved
 * the internal-link plan but never transitioned the TOPIC to 'approved', so the
 * enqueue endpoint (correctly) rejected it as notApproved. This module decides —
 * with NO DB/network — which topics are eligible to be promoted (ONLY manual +
 * suggested, so genuinely non-approved auto topics are never silently approved) and
 * how the final set partitions into queued / already-queued / not-approved.
 */

export interface TopicStatusRow {
  id: string
  status: string
  source: string | null
}

/** Manual topics still at 'suggested' → the ONLY topics this flow may promote. */
export function selectManualTopicsToApprove(rows: TopicStatusRow[]): string[] {
  return rows.filter((r) => r.source === 'manual' && r.status === 'suggested').map((r) => r.id)
}

/** The set of topic ids that count as approved AFTER promotion (already-approved
 *  ∪ the manual ones just promoted). Non-manual suggested topics are NOT included. */
export function approvedTopicIds(rows: TopicStatusRow[], newlyApprovedIds: string[]): Set<string> {
  const approved = new Set<string>(newlyApprovedIds)
  for (const r of rows) if (r.status === 'approved') approved.add(r.id)
  return approved
}

export interface QueuePartition {
  /** Approved + not-yet-queued → insert as queued. */
  toQueue: string[]
  /** Approved but already in this pool → treated as success. */
  alreadyQueued: string[]
  /** Still not approved (e.g. a non-manual suggested topic) → rejected. */
  notApproved: string[]
}

/**
 * Partition the requested topics for enqueue. Order preserved; ids not present in
 * `requestedIds` are ignored. `approved` is the post-promotion approved set.
 */
export function partitionForQueue(
  requestedIds: string[],
  approved: Set<string>,
  alreadyQueued: Set<string>,
): QueuePartition {
  const toQueue: string[] = []
  const alreadyQ: string[] = []
  const notApproved: string[] = []
  const seen = new Set<string>()
  for (const id of requestedIds) {
    if (seen.has(id)) continue
    seen.add(id)
    if (!approved.has(id)) { notApproved.push(id); continue }
    if (alreadyQueued.has(id)) { alreadyQ.push(id); continue }
    toQueue.push(id)
  }
  return { toQueue, alreadyQueued: alreadyQ, notApproved }
}

/** A run is a success when something was queued OR was already queued (idempotent
 *  repeat click). Pure — used by the route + the client's truthful success check. */
export function isQueueSuccess(added: number, alreadyQueuedCount: number): boolean {
  return added > 0 || alreadyQueuedCount > 0
}
