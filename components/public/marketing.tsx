/**
 * The public site's building blocks: the same tokens, radii, shadows and type
 * steps as the app (app/globals.css), arranged for marketing pages.
 *
 * Every public page used to spell its own look out of raw Tailwind: purple
 * gradients on one feature page, amber on the next, gradient text in the hero,
 * a different radius on every card. These blocks are the vocabulary instead, so
 * the landing page, the twelve feature pages, pricing, about and the free check
 * read as one product, and as the same product as the dashboard behind them.
 *
 *   PageHero        the one warm-paper hero, solid headline, accent in action
 *   Section         a band: canvas, surface (white with hairlines) or contrast
 *   SectionIntro    eyebrow, title, one lead paragraph
 *   FeatureCard     a card with ONE accent: the action-soft icon squircle
 *   StepCard        a numbered step, the number in the same squircle
 *   CheckList       lucide Check in action; CrossList, lucide X in muted
 *   CtaBand         the navy closing band (bg-contrast), one primary action
 *   FaqList         native <details>, lucide chevron
 *   ProductFrame    a quiet window frame around a product illustration
 *   ButtonLink      a link that looks like ui/Button (primary / secondary /
 *                   ghost / inverse on the navy band)
 *
 * No 'use client': these render on the server for the static pages and inside
 * the few client pages (the blog) alike.
 */
import Link from 'next/link'
import type { LucideIcon } from 'lucide-react'
import { Check, ChevronDown, X } from 'lucide-react'
import { cn } from '@/lib/utils'

export const CONTAINER = 'mx-auto w-full max-w-6xl px-4 sm:px-6 lg:px-8'

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'inverse'
type ButtonSize = 'md' | 'lg'

export function buttonClasses(variant: ButtonVariant = 'primary', size: ButtonSize = 'md', className?: string): string {
  return cn(
    'inline-flex select-none items-center justify-center gap-2 whitespace-nowrap rounded-control font-semibold text-copy',
    'transition-[background-color,border-color,color,box-shadow] duration-150 ease-snappy',
    'focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-action/20',
    size === 'lg' ? 'h-11 px-6' : 'h-10 px-4',
    variant === 'primary' && 'bg-action text-action-ink hover:bg-action-hover shadow-[inset_0_1px_0_rgb(255_255_255/0.14),0_1px_2px_rgb(20_24_60/0.18)]',
    variant === 'secondary' && 'border border-line bg-surface text-ink shadow-control hover:border-line-strong hover:bg-sunk/60',
    variant === 'ghost' && 'text-body hover:bg-sunk hover:text-ink',
    variant === 'inverse' && 'border border-white/20 text-contrast-ink hover:bg-white/10',
    className,
  )
}

export function ButtonLink({
  href, variant = 'primary', size = 'md', className, children, onClick,
}: {
  href: string
  variant?: ButtonVariant
  size?: ButtonSize
  className?: string
  children: React.ReactNode
  onClick?: () => void
}) {
  const cls = buttonClasses(variant, size, className)
  // mailto:/tel: are not routes; next/link would try to prefetch them.
  if (/^(mailto|tel):/.test(href)) return <a href={href} className={cls} onClick={onClick}>{children}</a>
  return <Link href={href} className={cls} onClick={onClick}>{children}</Link>
}

export function IconSquircle({ icon: Icon, className }: { icon: LucideIcon; className?: string }) {
  return (
    <span className={cn('flex size-10 shrink-0 items-center justify-center rounded-inset bg-action-soft text-action', className)} aria-hidden="true">
      <Icon className="size-5" />
    </span>
  )
}

export function NumberSquircle({ n }: { n: number | string }) {
  return (
    <span className="flex size-10 shrink-0 items-center justify-center rounded-inset bg-action-soft text-section font-bold tabular-nums text-action" aria-hidden="true">
      {n}
    </span>
  )
}

/** The small pill above a hero title. Never a second title. */
export function Eyebrow({ children, icon: Icon }: { children: React.ReactNode; icon?: LucideIcon }) {
  return (
    <span className="inline-flex h-7 items-center gap-2 rounded-pill border border-line bg-surface px-3 text-caption font-semibold text-body shadow-control">
      {Icon ? <Icon className="size-3.5 text-action" aria-hidden="true" /> : <span className="size-1.5 rounded-pill bg-action" aria-hidden="true" />}
      {children}
    </span>
  )
}

export function PageHero({
  eyebrow, eyebrowIcon, title, accent, subtitle, children, before, align = 'center', compact = false,
}: {
  eyebrow?: React.ReactNode
  eyebrowIcon?: LucideIcon
  title: React.ReactNode
  /** The headline's second half, in solid action blue. Never gradient text. */
  accent?: React.ReactNode
  subtitle?: React.ReactNode
  children?: React.ReactNode
  /** Above the eyebrow, e.g. breadcrumbs. */
  before?: React.ReactNode
  align?: 'center' | 'start'
  compact?: boolean
}) {
  const center = align === 'center'
  return (
    <section className="relative overflow-hidden border-b border-line bg-canvas">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 h-[520px] bg-[radial-gradient(55%_65%_at_50%_0%,rgb(0_112_214/0.09),transparent_72%)]"
      />
      <div className={cn(CONTAINER, 'relative', compact ? 'pt-28 pb-12 sm:pt-32 sm:pb-14' : 'pt-28 pb-16 sm:pt-36 sm:pb-20')}>
        {before && <div className="mb-8">{before}</div>}
        <div className={cn(center ? 'mx-auto max-w-3xl text-center' : 'max-w-3xl')}>
          {eyebrow && <div className="mb-5"><Eyebrow icon={eyebrowIcon}>{eyebrow}</Eyebrow></div>}
          <h1 className="text-title font-bold tracking-tight text-ink text-balance sm:text-display">
            {title}
            {accent && <>{' '}<span className="text-action">{accent}</span></>}
          </h1>
          {subtitle && <p className={cn('mt-5 max-w-2xl text-section font-normal text-body text-pretty', center && 'mx-auto')}>{subtitle}</p>}
        </div>
        {children && <div className="mt-8 sm:mt-10">{children}</div>}
      </div>
    </section>
  )
}

export function Section({
  children, tone = 'canvas', id, className, narrow = false,
}: {
  children: React.ReactNode
  tone?: 'canvas' | 'surface' | 'contrast'
  id?: string
  className?: string
  narrow?: boolean
}) {
  return (
    <section
      id={id}
      className={cn(
        'py-16 sm:py-20 lg:py-24',
        tone === 'canvas' && 'bg-canvas',
        tone === 'surface' && 'border-y border-line bg-surface',
        tone === 'contrast' && 'bg-contrast text-contrast-ink',
        className,
      )}
    >
      <div className={cn(CONTAINER, narrow && 'max-w-3xl')}>{children}</div>
    </section>
  )
}

export function SectionIntro({
  eyebrow, title, description, align = 'center', inverse = false, as: As = 'h2', className,
}: {
  eyebrow?: string
  title: React.ReactNode
  description?: React.ReactNode
  align?: 'center' | 'start'
  inverse?: boolean
  as?: 'h1' | 'h2'
  className?: string
}) {
  const center = align === 'center'
  return (
    <div className={cn('mb-10 sm:mb-12', center ? 'mx-auto max-w-2xl text-center' : 'max-w-2xl', className)}>
      {eyebrow && (
        <p className={cn('mb-3 text-overline font-semibold uppercase tracking-wide', inverse ? 'text-rail-tagline' : 'text-action')}>{eyebrow}</p>
      )}
      <As className={cn('text-title font-bold tracking-tight text-balance', inverse ? 'text-contrast-ink' : 'text-ink')}>{title}</As>
      {description && (
        <p className={cn('mt-3 text-section font-normal text-pretty', inverse ? 'text-contrast-ink/75' : 'text-body')}>{description}</p>
      )}
    </div>
  )
}

/** A card with one accent. `icon` is the squircle; without it the card is plain. */
export function FeatureCard({
  icon, title, children, className, as: As = 'h3', aside,
}: {
  icon?: LucideIcon
  title: React.ReactNode
  children?: React.ReactNode
  className?: string
  as?: 'h3' | 'h4'
  aside?: React.ReactNode
}) {
  return (
    <div className={cn('flex h-full flex-col gap-3 rounded-card border border-line bg-surface p-5 shadow-card sm:p-6', className)}>
      {(icon || aside) && (
        <div className="flex items-start justify-between gap-3">
          {icon && <IconSquircle icon={icon} />}
          {aside}
        </div>
      )}
      <As className="text-section font-semibold text-ink">{title}</As>
      {children && <div className="space-y-3 text-copy text-body">{children}</div>}
    </div>
  )
}

export function StepCard({ n, title, children, className }: { n: number | string; title: React.ReactNode; children?: React.ReactNode; className?: string }) {
  return (
    <div className={cn('flex h-full flex-col gap-3 rounded-card border border-line bg-surface p-5 shadow-card sm:p-6', className)}>
      <NumberSquircle n={n} />
      <h3 className="text-section font-semibold text-ink">{title}</h3>
      {children && <div className="text-copy text-body">{children}</div>}
    </div>
  )
}

export function CheckList({ items, className, inverse = false }: { items: React.ReactNode[]; className?: string; inverse?: boolean }) {
  return (
    <ul className={cn('space-y-2.5', className)}>
      {items.map((item, i) => (
        <li key={i} className={cn('flex items-start gap-2.5 text-copy', inverse ? 'text-contrast-ink/90' : 'text-body')}>
          <Check className={cn('mt-1 size-4 shrink-0', inverse ? 'text-rail-tagline' : 'text-action')} aria-hidden="true" />
          <span>{item}</span>
        </li>
      ))}
    </ul>
  )
}

export function CrossList({ items, className }: { items: React.ReactNode[]; className?: string }) {
  return (
    <ul className={cn('space-y-2.5', className)}>
      {items.map((item, i) => (
        <li key={i} className="flex items-start gap-2.5 text-copy text-body">
          <X className="mt-1 size-4 shrink-0 text-muted" aria-hidden="true" />
          <span>{item}</span>
        </li>
      ))}
    </ul>
  )
}

/** The navy closing band. One primary action; the rest are inverse outlines. */
export function CtaBand({
  title, body, children, footnote, className,
}: {
  title: React.ReactNode
  body?: React.ReactNode
  children?: React.ReactNode
  footnote?: React.ReactNode
  className?: string
}) {
  return (
    <div
      className={cn(
        'relative overflow-hidden rounded-card bg-contrast px-6 py-12 text-center text-contrast-ink shadow-card sm:px-12 sm:py-16',
        'bg-[radial-gradient(90%_120%_at_100%_0%,rgb(0_134_245/0.22),transparent_60%)] rtl:bg-[radial-gradient(90%_120%_at_0%_0%,rgb(0_134_245/0.22),transparent_60%)]',
        className,
      )}
    >
      <h2 className="mx-auto max-w-2xl text-title font-bold tracking-tight text-balance text-contrast-ink">{title}</h2>
      {body && <p className="mx-auto mt-3 max-w-xl text-section font-normal text-contrast-ink/75 text-pretty">{body}</p>}
      {children && <div className="mt-8 flex flex-col items-stretch justify-center gap-3 sm:flex-row sm:items-center">{children}</div>}
      {footnote && <p className="mx-auto mt-10 max-w-xl border-t border-white/10 pt-6 text-caption text-contrast-ink/60">{footnote}</p>}
    </div>
  )
}

export function FaqList({ items }: { items: { q: string; a: React.ReactNode }[] }) {
  return (
    <div className="space-y-3">
      {items.map((faq) => (
        <details
          key={faq.q}
          className="group rounded-card border border-line bg-surface shadow-card transition-[border-color] duration-150 ease-snappy hover:border-line-strong"
        >
          <summary className="flex cursor-pointer list-none items-center justify-between gap-4 rounded-card px-5 py-4 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-action/20 sm:px-6 [&::-webkit-details-marker]:hidden">
            <h3 className="text-section font-semibold text-ink">{faq.q}</h3>
            <ChevronDown className="size-4 shrink-0 text-muted transition-transform duration-150 ease-snappy group-open:rotate-180" aria-hidden="true" />
          </summary>
          <div className="px-5 pb-5 text-copy text-body sm:px-6">{faq.a}</div>
        </details>
      ))}
    </div>
  )
}

/** A quiet window around a product illustration: hairline, no traffic lights. */
export function ProductFrame({ address, children, className }: { address?: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={cn('overflow-hidden rounded-card border border-line bg-surface text-start shadow-card', className)}>
      <div className="flex items-center gap-1.5 border-b border-line bg-sunk px-4 py-3" aria-hidden="true">
        <span className="size-2.5 rounded-pill bg-line-strong" />
        <span className="size-2.5 rounded-pill bg-line-strong" />
        <span className="size-2.5 rounded-pill bg-line-strong" />
        {address && (
          <span dir="ltr" className="ms-3 truncate rounded-pill border border-line bg-surface px-3 py-0.5 text-caption text-muted">
            {address}
          </span>
        )}
      </div>
      <div className="p-4 sm:p-6">{children}</div>
    </div>
  )
}

/** A soft callout band inside a section (the "note" rows of the feature pages). */
export function Callout({ icon, title, children, as: As = 'h3' }: { icon?: LucideIcon; title?: React.ReactNode; children: React.ReactNode; as?: 'h2' | 'h3' }) {
  return (
    <div className="flex flex-col items-start gap-4 rounded-card border border-line bg-surface p-5 shadow-card sm:flex-row sm:p-6">
      {icon && <IconSquircle icon={icon} />}
      <div className="min-w-0 space-y-2">
        {title && <As className="text-section font-semibold text-ink">{title}</As>}
        <div className="space-y-3 text-copy text-body">{children}</div>
      </div>
    </div>
  )
}
