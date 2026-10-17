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
/**
 * One placeholder block. `tone="contrast"` is for a block on the dark context
 * surface (the shimmer in the contrast ink, not a light hole in a dark card).
 * `inline` sits in a line of text or in a StatTile's value (inline-block,
 * baseline-aligned). `label` is for a skeleton that stands alone — a figure
 * still on its way in a table cell — and says what is loading to a screen
 * reader; a skeleton inside a `SkeletonRegion` needs none.
 *
 *   <Skeleton className="h-4 w-2/5" />
 *   <StatTile value={data ? n : <Skeleton inline className="h-7 w-12" />} … />
 *   <Skeleton inline label={t.volumePending} className="h-3.5 w-14" />
 */
export function Skeleton({
  className,
  tone = 'default',
  inline = false,
  label,
}: {
  className?: string
  tone?: 'default' | 'contrast'
  inline?: boolean
  label?: string
}) {
  const block = (
    <span
      aria-hidden="true"
      data-skeleton-block={tone}
      className={cn(
        tone === 'contrast' ? 'skeleton-contrast' : 'skeleton',
        inline ? 'inline-block align-middle' : 'block',
        'rounded-control',
        className
      )}
    />
  )
  if (!label) return block
  return (
    <span role="status" className={inline ? 'inline-block align-middle' : 'block'}>
      <span className="sr-only">{label}</span>
      {block}
    </span>
  )
}

/**
 * The live region a group of skeletons sits in: one sentence for screen
 * readers, nothing visible. Every composed skeleton below is one; use it
 * directly to lay out your own shape.
 */
export function SkeletonRegion({ label, className, children }: { label: string; className?: string; children: React.ReactNode }) {
  return (
    <div role="status" aria-busy="true" className={className} data-skeleton="">
      <span className="sr-only">{label}</span>
      {children}
    </div>
  )
}

/**
 * A StatTile loading, in the tile's own frame and rhythm: the label, the
 * figure and the source line, so the tile lands exactly where it was.
 */
export function StatTileSkeleton({ className }: { className?: string }) {
  return (
    <div aria-hidden="true" data-skeleton-tile="" className={cn('flex h-full min-w-0 flex-col rounded-card border border-line bg-surface p-4 shadow-card sm:p-5', className)}>
      <Skeleton className="h-3.5 w-20 rounded-pill" />
      <Skeleton className="mt-3 h-7 w-16" />
      <span className="mt-auto block pt-3">
        <Skeleton className="h-3 w-28 max-w-full rounded-pill" />
      </span>
    </div>
  )
}

/**
 * The dark context card (Card tone="ink", a screen's hero) loading: its
 * overline, headline and one line of copy in the contrast shimmer, and, with
 * `ring`, the (still) score ring the scan hero shows at its end from md up.
 * The card itself is a still navy surface; only the text placeholders move.
 */
export function ContextCardSkeleton({ ring = false, className }: { ring?: boolean; className?: string }) {
  return (
    <div
      aria-hidden="true"
      data-skeleton-context=""
      className={cn('flex items-center justify-between gap-6 overflow-hidden rounded-card border border-contrast-ink/5 bg-contrast p-5 shadow-card sm:p-8', className)}
    >
      <div className="min-w-0 flex-1">
        <Skeleton tone="contrast" className="h-6 w-28 rounded-pill" />
        <Skeleton tone="contrast" className="mt-5 h-9 w-3/4 max-w-xl" />
        <Skeleton tone="contrast" className="mt-3 h-4 w-1/3" />
      </div>
      {ring && <span className="hidden size-32 shrink-0 rounded-pill border-[10px] border-contrast-ink/10 md:block" />}
    </div>
  )
}

/**
 * A whole screen loading: an opening card, a row of four tiles and a few table
 * rows. The shape every per-project tab shares while its project resolves.
 */
export function ScreenSkeleton({ label }: { label: string }) {
  return (
    <SkeletonRegion label={label} className="space-y-6">
      <Skeleton className="h-[180px] rounded-card" />
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        {[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-24 rounded-card" />)}
      </div>
      <TableRowsSkeleton rows={6} />
    </SkeletonRegion>
  )
}

/** Table rows loading, inside the table's own frame. */
export function TableSkeleton({ label, rows = 6 }: { label: string; rows?: number }) {
  return (
    <SkeletonRegion label={label}>
      <TableRowsSkeleton rows={rows} />
    </SkeletonRegion>
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
