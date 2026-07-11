export function getEstimatedCtrByPosition(position: number | null | undefined): number {
  if (position == null || position <= 0) return 0
  if (position === 1) return 0.28
  if (position === 2) return 0.15
  if (position === 3) return 0.10
  if (position === 4) return 0.07
  if (position === 5) return 0.05
  if (position <= 10) return 0.03
  if (position <= 20) return 0.01
  return 0
}

export function getEstimatedOrganicClicks(
  avgMonthlySearches: number | null | undefined,
  position: number | null | undefined,
): number {
  const volume = avgMonthlySearches ?? 0
  if (volume <= 0) return 0
  const ctr = getEstimatedCtrByPosition(position)
  if (ctr === 0) return 0
  return Math.round(volume * ctr)
}
