/**
 * Cross-run dedup helper: fold the project's currently PENDING recommendation
 * cards into the avoid corpus + the Gemini avoid list, so a second "find more"
 * click does not re-propose (or near-duplicate) the first run's ideas.
 *
 * Reuses the EXISTING ExistingCorpus (exact + the frozen jaccard near-dup) — no
 * new fuzzy rules, no Levenshtein, no embeddings, no schema change. Pure and
 * unit-testable (the DB read happens in the engine; this only absorbs rows).
 */

import type { ExistingCorpus } from './dedupe'

export interface PendingRow {
  title: string
  primary_keyword: string | null
}

/**
 * Add each pending card's title + primary keyword to the dedup corpus, and its
 * title to the Gemini avoid list. Returns how many pending titles were added
 * (diagnostic: already_pending_in_avoid_count).
 */
export function absorbPendingIntoAvoid(rows: PendingRow[], corpus: ExistingCorpus, existingTitles: string[]): number {
  let n = 0
  for (const p of rows || []) {
    corpus.add(p.title)
    corpus.add(p.primary_keyword)
    if (p.title && p.title.trim()) { existingTitles.push(p.title); n++ }
  }
  return n
}
