/**
 * The "scheduled" tile on the articles screen counts two sources:
 *   - generated articles whose own status is `scheduled`, and
 *   - automation-queue items (article_pool_items) still heading toward publish.
 * A queue item that already has its article is the SAME piece of work as that
 * article, whatever the article's own status is, so it must be counted once.
 * Measured on a walk account 15.11.2026: one `ready` article with a queue item
 * showed "all articles 1 / ready to publish 1 / scheduled 1" — one article read
 * as two. Only a queue item with no article yet (work planned but not written)
 * adds to the tile; an article already in the loaded list is represented by its
 * own status tile.
 */
export type OverviewArticleStatus = { id: string; status: string }

export function queueItemsNotYetCounted(
  queueTotal: number,
  queueArticleIds: ReadonlyArray<string | null | undefined>,
  articles: ReadonlyArray<OverviewArticleStatus>,
): number {
  const alreadyOnScreen = new Set(articles.map((a) => a.id))
  let alreadyCounted = 0
  for (const id of queueArticleIds) {
    if (id && alreadyOnScreen.has(id)) alreadyCounted += 1
  }
  return Math.max(0, queueTotal - alreadyCounted)
}
