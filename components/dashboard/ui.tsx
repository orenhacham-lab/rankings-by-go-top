/**
 * The pieces every dashboard widget is made of, so the fourteen widgets read as
 * one screen: the same frame (title, one line of what it is, one header link),
 * the same empty state (icon, one sentence on what will appear, one action), the
 * same error (a sentence and a retry) and the same loading shape.
 *
 * Presentational only: no data, no effects. Every widget file composes these.
 */
import Link from 'next/link'
import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

type LinkVariant = 'primary' | 'commit' | 'secondary' | 'quiet'

/** A link that looks like the app's Button: the same two action colours and nothing else. */
export function linkButtonClass(variant: LinkVariant = 'primary', size: 'sm' | 'md' = 'md'): string {
  return cn(
    'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-control font-semibold transition-[background-color,color,transform] duration-150 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-action focus-visible:ring-offset-2 focus-visible:ring-offset-canvas',
    size === 'sm' ? 'h-8 px-3 text-caption' : 'h-9 px-4 text-copy',
    variant === 'primary' && 'bg-action text-action-ink hover:bg-action-hover',
    variant === 'commit' && 'bg-commit text-commit-ink hover:bg-commit-hover',
    variant === 'secondary' && 'border border-line bg-surface text-body hover:bg-sunk',
    variant === 'quiet' && 'px-0 text-action hover:underline',
  )
}

export function LinkButton({ href, children, variant = 'primary', size = 'md', className }: {
  href: string
  children: ReactNode
  variant?: LinkVariant
  size?: 'sm' | 'md'
  className?: string
}) {
  return <Link href={href} className={cn(linkButtonClass(variant, size), className)}>{children}</Link>
}

/** The one link a widget's header may carry ("View all", "Manage competitors"). */
export function HeaderLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link href={href} className="shrink-0 rounded-pill px-2.5 py-1 text-caption font-semibold text-action transition-colors hover:bg-action-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-action">
      {children}
    </Link>
  )
}

export function Widget({ id, title, subtitle, icon, action, state, tone = 'default', className, children }: {
  /** Stable name, also the data attribute a journey or a screenshot looks for. */
  id: string
  title: string
  subtitle?: string
  icon?: ReactNode
  action?: ReactNode
  /** What the widget is showing: ready, empty, error, loading, or a state of its own. */
  state: string
  /** `attention`: a warm tint for the one widget that lists what needs fixing, so it is not one more white card. */
  tone?: 'default' | 'attention'
  className?: string
  children: ReactNode
}) {
  const titleId = `dashboard-${id}-title`
  const attention = tone === 'attention'
  return (
    <section
      aria-labelledby={titleId}
      data-dashboard-widget={id}
      data-state={state}
      className={cn(
        'min-w-0 overflow-hidden rounded-card border shadow-card',
        attention ? 'border-warn/25 bg-warn-soft/60' : 'border-line bg-surface',
        className,
      )}
    >
      <header className="flex items-start justify-between gap-3 px-5 pt-5">
        <div className="flex min-w-0 items-start gap-3">
          {icon && (
            <span
              aria-hidden="true"
              className={cn(
                'grid size-9 shrink-0 place-items-center rounded-xl ring-1',
                attention ? 'bg-surface text-warn ring-warn/20' : 'bg-action-soft text-action ring-action/10',
              )}
            >
              {icon}
            </span>
          )}
          <div className="min-w-0">
            <h2 id={titleId} className="text-section font-bold text-ink">{title}</h2>
            {subtitle && <p className="mt-0.5 text-caption text-muted">{subtitle}</p>}
          </div>
        </div>
        {action}
      </header>
      <div className="px-5 pb-5 pt-4">{children}</div>
    </section>
  )
}

/**
 * An empty widget is not an error: an icon, a title that is not a negation of
 * the widget's title, one sentence about what appears here and when, and exactly
 * one action. Never a zero that only means "nothing yet".
 */
export function WidgetEmpty({ icon, title, body, action }: {
  icon: ReactNode
  /** Left out when the widget's own title already says it. */
  title?: string
  body: string
  action?: ReactNode
}) {
  return (
    <div data-empty="" className="flex items-start gap-3 rounded-xl border border-dashed border-line-strong bg-sunk/50 p-4">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-surface text-action shadow-card ring-1 ring-line" aria-hidden="true">
        {icon}
      </span>
      <div className="min-w-0 space-y-1">
        {title && <p className="text-copy font-semibold text-ink">{title}</p>}
        <p className="text-copy text-muted">{body}</p>
        {action && <div className="pt-2">{action}</div>}
      </div>
    </div>
  )
}

export function WidgetError({ message, retryLabel, onRetry }: { message: string; retryLabel: string; onRetry: () => void }) {
  return (
    <p data-error="" className="text-copy text-muted">
      {message}{' '}
      <button type="button" onClick={onRetry} className="font-medium text-action underline decoration-dotted underline-offset-2 hover:text-action-hover">
        {retryLabel}
      </button>
    </p>
  )
}

export function WidgetLoading({ lines = 3, label }: { lines?: number; label: string }) {
  return (
    <div className="flex flex-col gap-3" aria-busy="true">
      {Array.from({ length: lines }, (_, i) => (
        <span key={i} aria-hidden="true" className={cn('skeleton h-3.5 rounded-control', i === lines - 1 ? 'w-1/2' : 'w-full')} />
      ))}
      <span className="sr-only">{label}</span>
    </div>
  )
}

/** A status fact beside a line: soft tint plus text, never a filled colour. */
export function StatusPill({ tone, children }: { tone: 'ok' | 'warn' | 'bad' | 'info' | 'neutral'; children: ReactNode }) {
  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center whitespace-nowrap rounded-pill border px-2 py-0.5 text-caption font-medium',
        tone === 'ok' && 'border-ok/20 bg-ok-soft text-ok',
        tone === 'warn' && 'border-warn/20 bg-warn-soft text-warn',
        tone === 'bad' && 'border-bad/20 bg-bad-soft text-bad',
        tone === 'info' && 'border-info/20 bg-info-soft text-info',
        tone === 'neutral' && 'border-line bg-sunk text-muted',
      )}
    >
      {children}
    </span>
  )
}
