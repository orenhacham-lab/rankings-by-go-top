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
    <Link href={href} className="shrink-0 rounded-control text-copy font-medium text-action hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-action">
      {children}
    </Link>
  )
}

export function Widget({ id, title, subtitle, icon, action, state, className, children }: {
  /** Stable name, also the data attribute a journey or a screenshot looks for. */
  id: string
  title: string
  subtitle?: string
  icon?: ReactNode
  action?: ReactNode
  /** What the widget is showing: ready, empty, error, loading, or a state of its own. */
  state: string
  className?: string
  children: ReactNode
}) {
  const titleId = `dashboard-${id}-title`
  return (
    <section
      aria-labelledby={titleId}
      data-dashboard-widget={id}
      data-state={state}
      className={cn('min-w-0 rounded-card border border-line bg-surface shadow-card', className)}
    >
      <header className="flex items-start justify-between gap-3 px-5 pt-5">
        <div className="min-w-0">
          <h2 id={titleId} className="flex items-center gap-2 text-section font-semibold text-ink">
            {icon && <span className="shrink-0 text-muted" aria-hidden="true">{icon}</span>}
            <span className="min-w-0">{title}</span>
          </h2>
          {subtitle && <p className="mt-0.5 text-caption text-muted">{subtitle}</p>}
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
    <div data-empty="" className="flex items-start gap-3 rounded-control bg-sunk/70 p-4">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-pill bg-action-soft text-action" aria-hidden="true">
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
        <span key={i} aria-hidden="true" className={cn('h-3.5 rounded-control bg-sunk', i === lines - 1 ? 'w-1/2' : 'w-full')} />
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
