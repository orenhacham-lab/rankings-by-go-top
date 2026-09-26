import { cn } from '@/lib/utils'

/**
 * One number, said the same way everywhere.
 *
 * Every screen had its own way of showing a figure, and none of them said where
 * the figure came from — so a merchant reading "1,240" could not tell whether it
 * was this week, this month, or everything ever. `source` is therefore not
 * optional decoration: it names the data source or the time range ("Search
 * Console · 30 days"), which is the difference between a number and evidence.
 *
 * `delta` is a change against the previous period, coloured only by direction.
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
    <div className={cn('rounded-card border border-line bg-surface p-4 flex flex-col gap-1', className)}>
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-medium text-muted">{label}</span>
        {icon && <span className="text-muted shrink-0">{icon}</span>}
      </div>
      {hasValue ? (
        <div className="flex items-baseline gap-2">
          <span className="text-2xl font-bold text-ink tabular-nums leading-tight">{value}</span>
          {delta && (
            <span
              className={cn(
                'text-xs font-semibold tabular-nums',
                delta.direction === 'up' && 'text-ok',
                delta.direction === 'down' && 'text-bad',
                delta.direction === 'flat' && 'text-muted'
              )}
            >
              {delta.direction === 'up' ? '▲' : delta.direction === 'down' ? '▼' : '•'} {delta.value}
            </span>
          )}
        </div>
      ) : (
        <span className="text-sm text-muted">{empty}</span>
      )}
      {source && <span className="text-[11px] text-muted">{source}</span>}
    </div>
  )
}
