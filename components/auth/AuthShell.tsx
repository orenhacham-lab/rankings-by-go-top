'use client'

import Image from 'next/image'
import Link from 'next/link'
import type { ReactNode } from 'react'

export interface AuthFooterCopy {
  accessibility: string
  privacy: string
  articles: string
  accessibilityHref: string
  privacyHref: string
  articlesHref: string
}

/** The product's name: the same in both languages. */
const BRAND = 'Rankings by Go Top'
const MAKER = 'Go Top'
const MAKER_URL = 'https://www.gotop.co.il'

/**
 * The frame every signed-out page draws (sign in, sign up, forgot and reset
 * password, both languages): warm paper canvas, the logo and product name, ONE
 * surface card, an optional line under it (the "have an account?" switch), and
 * a quiet footer. Design tokens only; the public site's floating widgets never
 * render on these routes (components/public/PublicSiteWidgets.tsx), so nothing
 * covers the form on a phone.
 *
 * The page's own heading is the card's <h1> (AUTH_TITLE_CLASSES), so a screen
 * has one H1 and it names the task, not the brand.
 */
export const AUTH_TITLE_CLASSES = 'text-title font-bold tracking-tight text-ink'
export const AUTH_LINK_CLASSES =
  'rounded-control font-semibold text-action underline-offset-2 hover:text-action-hover hover:underline ' +
  'focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-action/20'
const FOOTER_LINK = 'rounded-control transition-colors duration-150 ease-snappy hover:text-ink focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-action/20'

export default function AuthShell({
  locale,
  logoAlt,
  subtitle,
  footer,
  below,
  children,
}: {
  locale: 'he' | 'en'
  logoAlt: string
  subtitle: string
  footer: AuthFooterCopy
  below?: ReactNode
  children: ReactNode
}) {
  return (
    <main dir={locale === 'en' ? 'ltr' : 'rtl'} data-auth-shell className="flex min-h-screen flex-col bg-canvas px-4 py-10 sm:py-16">
      <div className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center">
        <div className="mb-8 flex flex-col items-center text-center">
          <Image
            src="/gotop-primary.png"
            alt={logoAlt}
            width={160}
            height={64}
            className="h-12 w-auto object-contain"
            sizes="120px"
            priority
          />
          <p className="mt-3 text-section font-semibold text-ink">{BRAND}</p>
          <p className="mt-0.5 text-copy text-muted">{subtitle}</p>
        </div>

        <div className="rounded-card border border-line bg-surface p-6 shadow-card sm:p-8">{children}</div>

        {below && <div className="mt-6 text-center text-copy text-body">{below}</div>}

        <footer className="mt-10 space-y-2 text-center text-caption text-muted">
          <nav className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1">
            <Link href={footer.accessibilityHref} className={FOOTER_LINK}>{footer.accessibility}</Link>
            <span aria-hidden="true" className="size-1 rounded-pill bg-line-strong" />
            <Link href={footer.privacyHref} className={FOOTER_LINK}>{footer.privacy}</Link>
            <span aria-hidden="true" className="size-1 rounded-pill bg-line-strong" />
            <Link href={footer.articlesHref} className={FOOTER_LINK}>{footer.articles}</Link>
          </nav>
          <p dir="ltr">
            {BRAND.slice(0, -MAKER.length)}
            <a href={MAKER_URL} target="_blank" rel="noopener noreferrer" className="font-medium text-body hover:text-ink hover:underline">
              {MAKER}
            </a>{' '}
            &copy; {new Date().getFullYear()}
          </p>
        </footer>
      </div>
    </main>
  )
}
