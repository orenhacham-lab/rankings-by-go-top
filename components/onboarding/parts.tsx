'use client'

/**
 * Small pieces the onboarding screens share. Links that look like buttons are
 * real links (a <Link>, never a <button> inside an <a>), so they open in a new
 * tab, show their address and read as links to a screen reader.
 */
import Link from 'next/link'
import type { ReactNode } from 'react'
import { useDashboardLanguage } from '@/lib/i18n/dashboard/useDashboardLanguage'
import type { Locale } from '@/lib/i18n/locales'
import { cn } from '@/lib/utils'
import type { Tone } from '@/lib/onboarding/summary-view'

/**
 * Small letter-spaced capitals, for Latin labels only: Hebrew has no capitals,
 * and spacing its letters apart breaks the word into single letters.
 */
export function capsLabel(language: Locale): string {
  return language === 'en' ? 'uppercase tracking-[0.14em]' : ''
}

/**
 * A site address or a phrase in another script, isolated inside a sentence
 * (FIRST STRONG ISOLATE ... POP DIRECTIONAL ISOLATE), so "סרקנו את shop.co.il
 * הרגע" keeps its word order in both directions.
 */
export function isolate(text: string): string {
  return `\u2068${text}\u2069`
}

const LINK_BASE =
  'inline-flex items-center justify-center gap-2 font-semibold rounded-control transition-[background-color,color,transform] duration-150 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-action focus-visible:ring-offset-2 focus-visible:ring-offset-canvas'

export function ActionLink({
  href,
  children,
  variant = 'primary',
  size = 'md',
  className,
}: {
  href: string
  children: ReactNode
  variant?: 'primary' | 'secondary' | 'onInk'
  size?: 'md' | 'lg'
  className?: string
}) {
  return (
    <Link
      href={href}
      className={cn(
        LINK_BASE,
        variant === 'primary' && 'bg-action text-action-ink hover:bg-action-hover',
        variant === 'secondary' && 'bg-surface text-body border border-line hover:bg-sunk',
        variant === 'onInk' && 'bg-contrast-ink text-contrast hover:opacity-90',
        size === 'md' ? 'text-copy px-4 py-2 h-9' : 'text-copy px-6 py-2.5 h-12',
        className,
      )}
    >
      {children}
    </Link>
  )
}

const DOT: Record<Tone, string> = {
  ok: 'bg-ok',
  warn: 'bg-warn',
  bad: 'bg-bad',
  neutral: 'bg-line-strong',
}

/** The coloured status point of a tile. Decorative: the value beside it says the same in words. */
export function StatusDot({ tone, className }: { tone: Tone; className?: string }) {
  return (
    <span aria-hidden className={cn('relative inline-flex h-2.5 w-2.5 shrink-0', className)}>
      <span className={cn('absolute inset-0 rounded-pill opacity-25 scale-[1.9]', DOT[tone])} />
      <span className={cn('relative h-2.5 w-2.5 rounded-pill', DOT[tone])} />
    </span>
  )
}

/** The small label above a heading. */
export function Eyebrow({ children, className }: { children: ReactNode; className?: string }) {
  const { language } = useDashboardLanguage()
  return <p className={cn('text-caption font-semibold', capsLabel(language), className)}>{children}</p>
}

/**
 * One block of the research summary: a heading with its one action, then the
 * content. `index` is the block's place in the summary, shown as a quiet
 * numeral beside the section's icon so the page reads as the ordered brief it
 * is. `tone="attention"` tints the whole block, for the one section that asks
 * the merchant to act (what is holding the site back), so it does not sit in
 * the same white as everything around it.
 */
export function SummaryBlock({
  id,
  index,
  title,
  description,
  action,
  icon,
  tone = 'default',
  children,
  className,
}: {
  id: string
  index: number
  title: string
  description?: ReactNode
  action?: ReactNode
  icon?: ReactNode
  tone?: 'default' | 'attention'
  children: ReactNode
  className?: string
}) {
  const headingId = `seed-block-${id}`
  return (
    <section
      aria-labelledby={headingId}
      data-summary-block={id}
      className={cn(
        'rounded-card border p-5 md:p-6',
        'border-line bg-surface shadow-card', tone === 'attention' && 'border-s-[3px] border-s-warn',
        className,
      )}
    >
      <div className="mb-5 flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
        <div className="flex min-w-0 items-start gap-3">
          {icon && (
            <span
              aria-hidden
              className={cn(
                'flex size-10 shrink-0 items-center justify-center rounded-inset [&_svg]:size-5',
                tone === 'attention' ? 'bg-warn-soft text-warn' : 'bg-action-soft text-action',
              )}
            >
              {icon}
            </span>
          )}
          <div className="min-w-0">
            <p aria-hidden className="text-overline tabular-nums text-muted">{String(index).padStart(2, '0')}</p>
            <h2 id={headingId} className="text-section font-semibold text-ink">{title}</h2>
            {description && <p className="mt-1 max-w-[65ch] text-copy text-muted">{description}</p>}
          </div>
        </div>
        {action && <div className="shrink-0">{action}</div>}
      </div>
      {children}
    </section>
  )
}

/** A quiet, honest line for a block with nothing in it. */
export function BlockNote({ icon, children }: { icon?: ReactNode; children: ReactNode }) {
  return (
    <div className="flex items-start gap-3 rounded-control bg-sunk px-4 py-3 text-copy text-muted">
      {icon && <span className="mt-0.5 shrink-0">{icon}</span>}
      <p>{children}</p>
    </div>
  )
}
