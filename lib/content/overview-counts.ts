/**
 * The "scheduled" tile on the articles screen counts two sources:
 *   - generated articles whose own status is `scheduled`, and
 *   - automation-queue items (article_pool_items) still heading toward publish.
 * A queue item that already has its article, and that article is itself
 * `scheduled`, is the SAME piece of work, so it must be counted once.
 */
export type OverviewArticleStatus = { id: string; status: string }

export function queueItemsNotYetCounted(
  queueTotal: number,
  queueArticleIds: ReadonlyArray<string | null | undefined>,
  articles: ReadonlyArray<OverviewArticleStatus>,
): number {
  const countedAsScheduled = new Set(articles.filter((a) => a.status === 'scheduled').map((a) => a.id))
  let alreadyCounted = 0
  for (const id of queueArticleIds) {
    if (id && countedAsScheduled.has(id)) alreadyCounted += 1
  }
  return Math.max(0, queueTotal - alreadyCounted)
}
