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
            <div className="h-9 w-9 animate-pulse rounded-control bg-sunk" />
            <div className="space-y-2">
              <div className="h-3.5 w-36 animate-pulse rounded-pill bg-sunk" />
              <div className="h-3 w-56 max-w-[50vw] animate-pulse rounded-pill bg-sunk" />
            </div>
          </div>
          <div className="mt-6 space-y-3">
            <div className="h-9 animate-pulse rounded-control bg-sunk" />
            <div className="h-9 w-2/3 animate-pulse rounded-control bg-sunk" />
          </div>
        </div>
      ))}
    </div>
  )
}
