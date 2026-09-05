/**
 * THE ONE dedupe + disposition implementation.
 *
 * The family path and the recovery path each had their own copy of "drop a
 * candidate whose key is empty or already seen". Two copies meant two places to
 * instrument, and whichever one was missed produced a removal nobody could
 * explain — which is how a run reported candidates generated, none accepted, and
 * no reason for any of it.
 *
 * Rules this enforces, so neither caller can get them wrong:
 *   - candidates are identified by a STABLE id, never by keyword alone. Two
 *     candidates can normalize to the same key; a keyword lookup cannot tell
 *     them apart, and on a second duplicate would reclassify the survivor.
 *   - a reason is recorded AT the moment of removal, never inferred afterwards
 *     from a candidate's absence.
 *   - the first occurrence of a key is retained; every later one is a duplicate
 *     that names the id it collided with.
 *
 * PURE — no I/O, no model, no logging.
 */

export type DropReason = 'empty_primary_keyword' | 'cross_family_duplicate'

export interface DroppedCandidate<T> {
  item: T
  candidateId: string
  reason: DropReason
  /** For a duplicate: the id of the candidate already holding that key. */
  duplicateOfCandidateId: string | null
  /** For a duplicate: the normalized key they collided on. */
  duplicateOfKey: string | null
}

export interface DispositionResult<T> {
  retained: T[]
  dropped: DroppedCandidate<T>[]
}

/**
 * A dedupe pass over one batch, against keys already claimed by earlier batches.
 * `seen` is mutated so successive calls share one namespace — that is what makes
 * "cross-family" duplicates detectable at all.
 */
export function applyDispositions<T>(
  items: readonly T[],
  opts: {
    keyOf: (item: T) => string
    idOf: (item: T) => string | undefined
    /** key → the candidate id that claimed it. Mutated across calls. */
    seen: Map<string, string>
  },
): DispositionResult<T> {
  const retained: T[] = []
  const dropped: DroppedCandidate<T>[] = []

  for (const item of items) {
    const candidateId = opts.idOf(item) ?? ''
    const key = opts.keyOf(item)

    if (!key) {
      dropped.push({ item, candidateId, reason: 'empty_primary_keyword', duplicateOfCandidateId: null, duplicateOfKey: null })
      continue
    }
    const claimedBy = opts.seen.get(key)
    if (claimedBy !== undefined) {
      dropped.push({ item, candidateId, reason: 'cross_family_duplicate', duplicateOfCandidateId: claimedBy, duplicateOfKey: key })
      continue
    }
    opts.seen.set(key, candidateId)
    retained.push(item)
  }

  return { retained, dropped }
}
