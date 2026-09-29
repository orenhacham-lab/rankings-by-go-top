import { cn } from '@/lib/utils'

/**
 * The screen's context card (one per screen): deep navy, a cobalt glow that drifts
 * very slowly in its corner (.glow-drift, 18s, only with no-preference), a fine
 * grid fading downwards and a hairline of light along its top edge. Whatever the
 * screen's key numbers are go inside it (HeroStat), so the first thing a merchant
 * sees on a tab is where things stand.
 */
export default function HeroPanel({ children, className, ...data }: {
  children: React.ReactNode
  className?: string
} & Record<`data-${string}`, string | undefined>) {
  return (
    <section
      {...data}
      className={cn('relative isolate overflow-hidden rounded-card bg-contrast text-contrast-ink shadow-pop ring-1 ring-contrast-ink/5', className)}
    >
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
        <div className="glow-drift absolute -inset-[25%] bg-[radial-gradient(34rem_18rem_at_78%_12%,color-mix(in_srgb,var(--color-action)_46%,transparent),transparent_70%),radial-gradient(26rem_16rem_at_8%_96%,color-mix(in_srgb,var(--color-brand)_24%,transparent),transparent_70%)]" />
        <div className="absolute inset-0 opacity-[0.07] [background-image:linear-gradient(to_right,var(--color-contrast-ink)_1px,transparent_1px),linear-gradient(to_bottom,var(--color-contrast-ink)_1px,transparent_1px)] [background-size:32px_32px] [mask-image:linear-gradient(to_bottom,black,transparent_85%)]" />
        <div className="absolute inset-x-8 top-0 h-px bg-[linear-gradient(90deg,transparent,color-mix(in_srgb,var(--color-contrast-ink)_45%,transparent),transparent)]" />
      </div>
      {children}
    </section>
  )
}

/**
 * A secondary action on the context card: light outline and light words on the
 * navy (the inverse of the secondary button). Pass it to Button / a link as className.
 */
export const HERO_INVERSE_BUTTON = 'border border-contrast-ink/25 bg-contrast-ink/10 text-contrast-ink shadow-none hover:border-contrast-ink/40 hover:bg-contrast-ink/15 hover:text-contrast-ink focus-visible:ring-contrast-ink focus-visible:ring-offset-contrast'

/** One key number on the context card: a label, the figure, a line under it. */
export function HeroStat({ label, value, hint, icon, className }: {
  label: string
  value: React.ReactNode
  hint?: React.ReactNode
  icon?: React.ReactNode
  className?: string
}) {
  return (
    <div data-hero-stat="" className={cn('min-w-0 rounded-inset bg-contrast-ink/[0.06] p-4 ring-1 ring-inset ring-contrast-ink/10', className)}>
      <p className="flex items-center gap-1.5 text-caption font-medium text-contrast-ink/70 [&_svg]:size-3.5 [&_svg]:shrink-0">
        {icon && <span aria-hidden="true" className="contents">{icon}</span>}
        <span className="truncate">{label}</span>
      </p>
      <p className="mt-2 text-metric font-bold tracking-tight tabular-nums">{value}</p>
      {hint && <p className="mt-1 truncate text-caption text-contrast-ink/65">{hint}</p>}
    </div>
  )
}

/** A small status pill for the context card: a dot (pinging while something runs) and its words. */
export function HeroBadge({ children, tone = 'ok', live = false }: {
  children: React.ReactNode
  tone?: 'ok' | 'action' | 'commit' | 'muted'
  live?: boolean
}) {
  const dot = tone === 'ok' ? 'bg-ok' : tone === 'action' ? 'bg-rail-focus' : tone === 'commit' ? 'bg-commit' : 'bg-contrast-ink/50'
  return (
    <span className="inline-flex items-center gap-2 rounded-pill bg-contrast-ink/10 px-2.5 py-1 text-caption font-semibold ring-1 ring-contrast-ink/10">
      <span aria-hidden="true" className="relative inline-flex size-1.5">
        {live && <span className={cn('dot-ping absolute inset-0 rounded-pill', dot)} />}
        <span className={cn('relative size-1.5 rounded-pill', dot)} />
      </span>
      {children}
    </span>
  )
}
