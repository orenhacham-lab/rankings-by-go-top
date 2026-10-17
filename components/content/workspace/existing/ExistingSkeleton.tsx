'use client'

/**
 * The first load's placeholder, in the shape of what arrives: the summary card
 * (total, bar, four kinds, Google's panel), the tabs, the toolbar and a few
 * rows. Nothing that could be read as data ("0 pages", an empty state) shows
 * before the data does.
 */
import { Card } from '@/components/ui/Card'
import { Skeleton } from '@/components/ui/Skeleton'

export default function ExistingSkeleton({ label }: { label: string }) {
  return (
    <div role="status" aria-label={label} data-existing-skeleton="" className="space-y-6">
      <span className="sr-only">{label}</span>
      <Card padding={false}>
        <div aria-hidden="true" className="grid gap-8 p-5 sm:p-6 lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
          <div className="space-y-5">
            <Skeleton className="h-3 w-20" />
            <Skeleton className="h-11 w-56" />
            <Skeleton className="h-2 w-full rounded-pill" />
            <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
              {[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-16 rounded-inset" />)}
            </div>
            <Skeleton className="h-3 w-64" />
          </div>
          <Skeleton className="h-48 rounded-inset" />
        </div>
      </Card>
      <div aria-hidden="true" className="space-y-4">
        <div className="flex gap-3 border-b border-line pb-2">
          {[0, 1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-7 w-24" />)}
        </div>
        <div className="flex flex-wrap gap-3">
          <Skeleton className="h-10 w-full max-w-md" />
          <Skeleton className="h-10 w-44" />
        </div>
        <div className="space-y-px overflow-hidden rounded-card border border-line bg-surface">
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="flex items-center gap-4 px-4 py-4">
              <div className="min-w-0 flex-1 space-y-2">
                <Skeleton className="h-4 w-2/5" />
                <Skeleton className="h-3 w-1/4" />
              </div>
              <Skeleton className="hidden h-4 w-16 sm:block" />
              <Skeleton className="hidden h-4 w-16 sm:block" />
              <Skeleton className="h-8 w-28" />
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
