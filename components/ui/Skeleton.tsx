import { cn } from '@/lib/utils'

/**
 * A loading placeholder in the shape of what is coming, instead of a "Loading…"
 * sentence: the screen keeps its layout, so nothing jumps when the data lands.
 * The shimmer (.skeleton in globals.css) is the one looping animation the app
 * allows, and it stops by construction when the skeleton is replaced. With
 * reduced motion it is a still tint.
 *
 * Every skeleton is hidden from screen readers; the wrapper that shows it says
 * what is loading once, in a live region (`label`).
 */
export function Skeleton({ className }: { className?: string }) {
  return <span aria-hidden="true" className={cn('skeleton block rounded-control', className)} />
}

/** The live region a skeleton sits in: one sentence for screen readers, nothing visible. */
function Loading({ label, className, children }: { label: string; className?: string; children: React.ReactNode }) {
  return (
    <div role="status" aria-busy="true" className={className} data-skeleton="">
      <span className="sr-only">{label}</span>
      {children}
    </div>
  )
}

/**
 * A whole screen loading: an opening card, a row of four tiles and a few table
 * rows. The shape every per-project tab shares while its project resolves.
 */
export function ScreenSkeleton({ label }: { label: string }) {
  return (
    <Loading label={label} className="space-y-6">
      <Skeleton className="h-[180px] rounded-card" />
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        {[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-24 rounded-card" />)}
      </div>
      <TableRowsSkeleton rows={6} />
    </Loading>
  )
}

/** Table rows loading, inside the table's own frame. */
export function TableSkeleton({ label, rows = 6 }: { label: string; rows?: number }) {
  return (
    <Loading label={label}>
      <TableRowsSkeleton rows={rows} />
    </Loading>
  )
}

function TableRowsSkeleton({ rows }: { rows: number }) {
  return (
    <div aria-hidden="true" className="overflow-hidden rounded-card border border-line bg-surface shadow-card">
      <div className="h-10 border-b border-line bg-sunk/70" />
      <div className="divide-y divide-line">
        {Array.from({ length: rows }, (_, i) => (
          <div key={i} className="flex items-center gap-4 px-4 py-3.5">
            <Skeleton className="h-3.5 w-2/5" />
            <Skeleton className="h-3.5 w-1/6" />
            <Skeleton className="ms-auto h-3.5 w-1/5" />
          </div>
        ))}
      </div>
    </div>
  )
}
