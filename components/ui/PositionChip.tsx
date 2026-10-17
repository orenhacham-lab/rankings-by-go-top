import { cn } from '@/lib/utils'

/**
 * A Google position as a chip, its weight by how much it is worth: the top three
 * filled in the action colour, the first page on its soft tint, the second page
 * quiet, anything further outlined, and "not found" a dashed outline. One colour
 * family (the action blue), so the column reads as one scale, not a traffic light.
 */
export type PositionBucket = 'top3' | 'page1' | 'page2' | 'beyond' | 'none'

export function positionBucket(position: number | null | undefined, found = true): PositionBucket {
  if (!found || position == null || position <= 0) return 'none'
  if (position <= 3) return 'top3'
  if (position <= 10) return 'page1'
  if (position <= 20) return 'page2'
  return 'beyond'
}

const TONE: Record<PositionBucket, string> = {
  top3: 'bg-action text-action-ink shadow-control',
  page1: 'bg-action-soft text-action ring-1 ring-inset ring-action/20',
  page2: 'bg-sunk text-ink ring-1 ring-inset ring-line',
  beyond: 'bg-surface text-body ring-1 ring-inset ring-line-strong',
  none: 'border border-dashed border-line-strong bg-surface text-muted',
}

export default function PositionChip({ position, found = true, notFoundLabel, className }: {
  position: number | null | undefined
  found?: boolean
  /** The words for a check where the site was not in the results. */
  notFoundLabel: string
  className?: string
}) {
  const bucket = positionBucket(position, found)
  return (
    <span
      data-position-chip={bucket}
      className={cn(
        'inline-flex h-8 min-w-11 items-center justify-center whitespace-nowrap rounded-control px-2.5 tabular-nums',
        bucket === 'none' ? 'text-caption font-medium' : 'text-copy font-bold',
        TONE[bucket],
        className,
      )}
    >
      {bucket === 'none' ? notFoundLabel : `#${position}`}
    </span>
  )
}
