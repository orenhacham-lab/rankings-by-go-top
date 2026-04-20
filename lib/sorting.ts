import { TrackingTarget, ScanResult } from '@/lib/supabase/types'

/**
 * Sort tracking targets by position (ascending).
 * Not found / null positions are placed at the bottom.
 * Stable sort: preserves original order for equal positions.
 */
export function sortTargetsByPosition(
  targets: TrackingTarget[],
  latestResults: Record<string, ScanResult>
): TrackingTarget[] {
  // Create array with indices to preserve original order for equal elements
  const indexed = targets.map((target, index) => ({
    target,
    originalIndex: index,
  }))

  indexed.sort((a, b) => {
    const resultA = latestResults[a.target.id]
    const resultB = latestResults[b.target.id]

    // Get position: found position or POSITIVE_INFINITY for not found
    const posA =
      resultA?.found && resultA.position != null ? resultA.position : Number.POSITIVE_INFINITY
    const posB =
      resultB?.found && resultB.position != null ? resultB.position : Number.POSITIVE_INFINITY

    // Primary sort: by position
    if (posA !== posB) {
      return posA - posB
    }

    // Secondary sort: preserve original order (stable)
    return a.originalIndex - b.originalIndex
  })

  return indexed.map(({ target }) => target)
}
