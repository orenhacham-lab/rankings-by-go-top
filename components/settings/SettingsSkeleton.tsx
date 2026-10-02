import { Skeleton } from '@/components/ui/Skeleton'

/**
 * The shape of the settings screen while its data loads, so the cards appear
 * where the skeleton was instead of pushing each other down one by one.
 */
export default function SettingsSkeleton({ label }: { label: string }) {
  return (
    <div role="status" aria-busy="true" className="space-y-6">
      <span className="sr-only">{label}</span>
      {[0, 1, 2].map((card) => (
        <div key={card} aria-hidden className="rounded-card border border-line bg-surface p-5 shadow-card sm:p-6">
          <div className="flex items-center gap-3">
            <Skeleton className="size-10 rounded-inset" />
            <div className="space-y-2">
              <Skeleton className="h-3.5 w-36 rounded-pill" />
              <Skeleton className="h-3 w-56 max-w-[50vw] rounded-pill" />
            </div>
          </div>
          <div className="mt-6 space-y-3">
            <Skeleton className="h-10" />
            <Skeleton className="h-10 w-2/3" />
          </div>
        </div>
      ))}
    </div>
  )
}
