import { cn } from '@/lib/utils'
import ChangeArrow, { ChangeSign } from './ChangeArrow'

/**
 * One number, said the same way everywhere.
 *
 * Every screen had its own way of showing a figure, and none of them said where
 * the figure came from — so a merchant reading "1,240" could not tell whether it
 * was this week, this month, or everything ever. `source` is therefore not
 * optional decoration: it names the data source or the time range ("Search
 * Console · 30 days"), which is the difference between a number and evidence.
 *
 * `delta` is a change against the previous period, coloured only by direction:
 * a lucide arrow and the number, in ok / bad / muted (never a ▲▼ glyph).
 *
 * Layout: the label and its icon on top, the figure large and tabular, the
 * source pinned to the bottom — so a row of tiles lines up
 * figure-to-figure and source-to-source even when one label wraps.
 */
export interface StatTileProps {
  label: string
  value: React.ReactNode
  /** Where the number comes from, or the period it covers. */
  source?: string
  delta?: { value: string; direction: 'up' | 'down' | 'flat' }
  icon?: React.ReactNode
  /** Shown instead of the value when there is nothing to show yet. */
  empty?: string
  className?: string
}

export default function StatTile({ label, value, source, delta, icon, empty, className }: StatTileProps) {
  const hasValue = !empty
  return (
    <div className={cn('flex h-full min-w-0 flex-col rounded-card border border-line bg-surface p-4 shadow-card sm:p-5', className)}>
      <div className="flex items-start justify-between gap-2">
        <span className="text-caption font-medium text-muted">{label}</span>
        {icon && (
          <span className="-mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-control bg-sunk text-muted [&_svg]:size-4" aria-hidden="true">
            {icon}
          </span>
        )}
      </div>
      {hasValue ? (
        <div className="mt-2 flex flex-wrap items-baseline gap-x-2 gap-y-1">
          <span className="text-metric font-semibold tracking-tight text-ink tabular-nums">{value}</span>
          {delta && (
            <span
              className={cn(
                'inline-flex items-center gap-0.5 rounded-pill px-1.5 text-caption font-semibold tabular-nums',
                delta.direction === 'up' && 'bg-ok-soft text-ok',
                delta.direction === 'down' && 'bg-bad-soft text-bad',
                delta.direction === 'flat' && 'bg-sunk text-muted'
              )}
            >
              <ChangeArrow direction={delta.direction} />
              <ChangeSign direction={delta.direction} />
              {delta.value}
            </span>
          )}
        </div>
      ) : (
        <span className="mt-2 text-copy text-muted">{empty}</span>
      )}
      {source && <span className="mt-auto pt-3 text-overline text-muted">{source}</span>}
    </div>
  )
}
