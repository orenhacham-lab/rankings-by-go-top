import { cn } from '@/lib/utils'

/**
 * The one empty state (design contract §7), drawn as a small composition rather
 * than a lonely icon: the icon on a raised tile, inside two quiet rings on a soft
 * cobalt glow, with two placeholder "cards" floating beside it, all in tokens.
 * The floating parts drift slowly (.float-y, 6s) and only with no-preference.
 *
 * `compact` keeps the small form, for an empty result inside a card that already
 * says what the screen is (a search with no matches).
 */
export default function EmptyState({
  icon, title, body, action, secondary, className, compact = false,
}: {
  icon?: React.ReactNode
  title: string
  body?: string
  action?: React.ReactNode
  secondary?: React.ReactNode
  className?: string
  compact?: boolean
}) {
  return (
    <div data-empty-state={compact ? 'compact' : 'art'} className={cn('flex flex-col items-center text-center gap-3 px-6', compact ? 'py-10' : 'py-14', className)}>
      {icon && (compact ? (
        <div className="relative mb-1 flex size-12 items-center justify-center rounded-inset bg-action-soft text-action ring-8 ring-sunk/70 [&_svg]:size-5" aria-hidden="true">
          {icon}
        </div>
      ) : (
        <EmptyArt icon={icon} />
      ))}
      <div className="max-w-md space-y-1.5">
        <p className="text-section font-semibold text-ink text-balance">{title}</p>
        {body && <p className="text-copy text-muted text-pretty">{body}</p>}
      </div>
      {action && <div className="mt-3">{action}</div>}
      {secondary && <div className="text-caption text-muted">{secondary}</div>}
    </div>
  )
}

/** The illustration: rings, a glow, the icon tile and two floating placeholder cards. Decorative. */
export function EmptyArt({ icon, className }: { icon: React.ReactNode; className?: string }) {
  return (
    <div aria-hidden="true" className={cn('relative mb-3 grid size-36 place-items-center', className)}>
      <span className="absolute inset-0 rounded-pill bg-[radial-gradient(closest-side,color-mix(in_srgb,var(--color-action)_16%,transparent),transparent)]" />
      <span className="absolute inset-3 rounded-pill border border-dashed border-line-strong/80" />
      <span className="absolute inset-9 rounded-pill border border-line bg-surface/60" />
      <span className="relative grid size-16 place-items-center rounded-card bg-surface text-action shadow-lift ring-1 ring-line [&_svg]:size-7">
        <span className="absolute inset-0 rounded-card bg-[linear-gradient(180deg,transparent,color-mix(in_srgb,var(--color-action)_10%,transparent))]" />
        <span className="relative">{icon}</span>
      </span>
      <span className="float-y absolute -end-5 top-5 flex h-7 items-center gap-1.5 rounded-pill bg-surface px-2.5 shadow-card ring-1 ring-line">
        <span className="size-2 rounded-pill bg-action" />
        <span className="h-1.5 w-9 rounded-pill bg-line-strong" />
      </span>
      <span className="float-y absolute -start-6 bottom-6 flex h-7 items-center gap-1.5 rounded-pill bg-surface px-2.5 shadow-card ring-1 ring-line" style={{ '--float-delay': '1.4s' } as React.CSSProperties}>
        <span className="h-1.5 w-6 rounded-pill bg-action/40" />
        <span className="h-1.5 w-4 rounded-pill bg-line-strong" />
      </span>
      <span className="float-y absolute bottom-2 end-6 size-2.5 rounded-pill bg-action/50" style={{ '--float-delay': '2.6s' } as React.CSSProperties} />
    </div>
  )
}
