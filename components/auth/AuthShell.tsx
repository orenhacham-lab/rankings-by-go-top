'use client'

import Image from 'next/image'
import Link from 'next/link'
import type { CSSProperties, ReactNode } from 'react'
import { Check, TrendingUp } from 'lucide-react'
import { AUTH_BRAND, type AuthBrandVariant } from '@/lib/i18n/auth-brand'
import { landingHe } from '@/lib/i18n/public/landing-he'
import { landingEn } from '@/lib/i18n/public/landing-en'
import HeroBackdrop from '@/components/public/HeroBackdrop'
import { cn } from '@/lib/utils'

export interface AuthFooterCopy {
  accessibility: string
  privacy: string
  articles: string
  accessibilityHref: string
  privacyHref: string
  articlesHref: string
}

/** The product's name: the same in both languages. */
const BRAND = 'Go Top SEO'
const MAKER = 'Go Top'
const MAKER_URL = 'https://www.gotop.co.il'

/**
 * The frame every signed-out page draws (sign in, sign up, forgot and reset
 * password, both languages), in the landing page's design language (w7 P1-9):
 *
 * - the form column on the warm paper canvas, under the landing's faint
 *   drafting grid and cobalt glow, with ONE surface card holding the form, an
 *   optional line under it (the "have an account?" switch) and a quiet footer;
 * - from `lg`, a navy brand panel beside it with the landing's own headline,
 *   three things the account does, a small illustrative glimpse of the product
 *   and the landing's trust line. On a phone the panel gives way to one line of
 *   trust above the card, so the form is on the first screen.
 *
 * The form and the panel enter with the shared CSS stagger (.stagger-in in
 * app/globals.css): it runs from the first paint, needs no script, and exists
 * only with prefers-reduced-motion: no-preference (w7 P2-17).
 *
 * Design tokens only; the public site's floating widgets never render on these
 * routes (components/public/PublicSiteWidgets.tsx), so nothing covers the form
 * on a phone. The page's own heading is the card's <h1> (AUTH_TITLE_CLASSES),
 * so a screen has one H1 and it names the task, not the brand.
 */
export const AUTH_TITLE_CLASSES = 'text-title font-bold tracking-tight text-ink'
export const AUTH_LINK_CLASSES =
  'rounded-control font-semibold text-action underline-offset-2 hover:text-action-hover hover:underline ' +
  'focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-action/20'
const FOOTER_LINK = 'rounded-control transition-colors duration-150 ease-snappy hover:text-ink focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-action/20'

/** The panel's own grid, in the landing stage's white hairlines. */
const PANEL_GRID_STYLE: CSSProperties = {
  backgroundImage:
    'linear-gradient(to right, rgb(255 255 255 / 0.05) 1px, transparent 1px), linear-gradient(to bottom, rgb(255 255 255 / 0.05) 1px, transparent 1px)',
  backgroundSize: '32px 32px',
  maskImage: 'linear-gradient(to bottom, #000, transparent 85%)',
  WebkitMaskImage: 'linear-gradient(to bottom, #000, transparent 85%)',
}

export default function AuthShell({
  locale,
  logoAlt,
  subtitle,
  footer,
  below,
  variant = 'login',
  children,
}: {
  locale: 'he' | 'en'
  logoAlt: string
  subtitle: string
  footer: AuthFooterCopy
  below?: ReactNode
  /** Which form this is: it picks the brand panel's eyebrow and three lines. */
  variant?: AuthBrandVariant
  children: ReactNode
}) {
  const brand = AUTH_BRAND[locale]
  const copy = brand[variant]
  const landing = locale === 'en' ? landingEn : landingHe
  const homeHref = locale === 'en' ? '/en' : '/'
  const rank = landing.demo.rank
  const rows = [{ keyword: rank.keyword, from: rank.from, to: rank.to }, ...rank.rows].slice(0, 4)

  return (
    <main
      dir={locale === 'en' ? 'ltr' : 'rtl'}
      data-auth-shell
      data-auth-variant={variant}
      className="relative min-h-screen bg-canvas lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] xl:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)]"
    >
      {/* ── The form column ── */}
      <div className="relative flex min-h-screen flex-col overflow-hidden px-4 py-6 sm:px-8 sm:py-8">
        <HeroBackdrop height={560} />

        <header className="relative flex items-center">
          <Link href={homeHref} className="flex items-center gap-2.5 rounded-control focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-action/20">
            <Image
              src="/gotop-primary.png"
              alt={logoAlt}
              width={160}
              height={64}
              className="h-9 w-auto object-contain"
              sizes="90px"
              priority
            />
            <span className="flex flex-col leading-tight">
              <span className="text-copy font-semibold text-ink">{BRAND}</span>
              <span className="text-caption text-muted">{subtitle}</span>
            </span>
          </Link>
        </header>

        <div className="relative mx-auto flex w-full max-w-md flex-1 flex-col justify-center py-8 sm:py-10">
          {/* Below lg the brand panel is not there: one line of trust in its place. */}
          <ul className="mb-5 flex flex-wrap items-center justify-center gap-x-4 gap-y-1.5 text-caption font-medium text-body lg:hidden" data-auth-trust>
            {brand.mobileTrust.map((line) => (
              <li key={line} className="flex items-center gap-1.5">
                <Check className="size-3.5 text-action" strokeWidth={2.5} aria-hidden="true" />
                {line}
              </li>
            ))}
          </ul>

          <div className="stagger-in">
            <div className="rounded-card border border-line bg-surface p-6 shadow-pop sm:p-8">{children}</div>
            {below && <div className="mt-6 text-center text-copy text-body">{below}</div>}
          </div>
        </div>

        <footer className="relative space-y-2 text-center text-caption text-muted">
          <nav className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1">
            <Link href={footer.accessibilityHref} className={FOOTER_LINK}>{footer.accessibility}</Link>
            <span aria-hidden="true" className="size-1 rounded-pill bg-line-strong" />
            <Link href={footer.privacyHref} className={FOOTER_LINK}>{footer.privacy}</Link>
            <span aria-hidden="true" className="size-1 rounded-pill bg-line-strong" />
            <Link href={footer.articlesHref} className={FOOTER_LINK}>{footer.articles}</Link>
          </nav>
          <p dir="ltr">
            {BRAND} &copy; {new Date().getFullYear()} &middot; by{' '}
            <a href={MAKER_URL} target="_blank" rel="noopener noreferrer" className="font-medium text-body hover:text-ink hover:underline">
              {MAKER}
            </a>
          </p>
        </footer>
      </div>

      {/* ── The brand panel (lg+): the landing's navy stage ── */}
      <aside
        data-auth-brand
        className={cn(
          'relative hidden overflow-hidden bg-contrast text-contrast-ink lg:flex lg:flex-col lg:justify-center lg:px-12 lg:py-16 xl:px-16',
          'bg-[radial-gradient(60%_60%_at_85%_0%,rgb(0_134_245/0.35),transparent_60%),radial-gradient(50%_60%_at_10%_100%,rgb(127_195_255/0.18),transparent_65%)]',
        )}
      >
        <div aria-hidden="true" className="pointer-events-none absolute inset-0" style={PANEL_GRID_STYLE} />
        <div className="stagger-in relative mx-auto w-full max-w-lg">
          <p className="inline-flex h-7 items-center gap-1.5 rounded-pill bg-contrast-ink/10 px-3 text-caption font-semibold text-rail-tagline">
            <span aria-hidden="true" className="size-1.5 rounded-pill bg-rail-tagline" />
            {copy.eyebrow}
          </p>
          <p className="mt-5 text-title font-bold tracking-tight text-contrast-ink text-balance xl:text-display">
            {landing.hero.title}
            <span className="block text-rail-tagline">{landing.hero.accent}</span>
          </p>
          <ul className="mt-7 space-y-3">
            {copy.points.map((point) => (
              <li key={point} className="flex items-start gap-3 text-copy text-contrast-ink/90">
                <span aria-hidden="true" className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-pill bg-rail-tagline/15">
                  <Check className="size-3.5 text-rail-tagline" strokeWidth={2.75} />
                </span>
                {point}
              </li>
            ))}
          </ul>

          {/* A small, labelled glimpse of the product: the landing demo's own illustrative rows. */}
          <figure className="mt-9 rounded-card border border-contrast-ink/10 bg-contrast-ink/5 p-4 shadow-pop">
            <p className="mb-2 text-caption font-semibold text-contrast-ink">{brand.glimpse}</p>
            <ul className="divide-y divide-contrast-ink/10">
              {rows.map((row) => (
                <li key={row.keyword} className="flex items-center justify-between gap-3 py-2 text-caption">
                  <span className="min-w-0 truncate text-contrast-ink/85">{row.keyword}</span>
                  <span className="flex shrink-0 items-center gap-2 tabular-nums">
                    <span className="font-semibold text-contrast-ink">{row.to}</span>
                    <span className="inline-flex h-5 items-center gap-0.5 rounded-pill bg-ok/25 px-1.5 font-semibold text-contrast-ink">
                      <TrendingUp className="size-3" aria-hidden="true" />
                      {row.from - row.to}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
            <figcaption className="mt-2 text-overline text-contrast-ink/55">{landing.demo.caption}</figcaption>
          </figure>

          <ul className="mt-8 flex flex-wrap items-center gap-x-5 gap-y-2 text-caption text-contrast-ink/75">
            {landing.hero.trust.map((line) => (
              <li key={line} className="flex items-center gap-1.5">
                <Check className="size-3.5 text-rail-tagline" strokeWidth={2.5} aria-hidden="true" />
                {line}
              </li>
            ))}
          </ul>
        </div>
      </aside>
    </main>
  )
}
