'use client'

import Link from 'next/link'
import { ChevronRight } from 'lucide-react'
import { localeHomeHref, type PublicLocale } from '@/lib/i18n/locales'
import { getPublicDictionary } from '@/lib/i18n/getPublicDictionary'

interface BreadcrumbItem {
  label: string
  href: string
}

/** `inverse`: light ink, for a navy hero (the About page). */
export function Breadcrumbs({ items, locale = 'he', inverse = false }: { items: BreadcrumbItem[]; locale?: PublicLocale; inverse?: boolean }) {
  const dict = getPublicDictionary(locale)
  const homeHref = localeHomeHref(locale)
  const linkClass = inverse
    ? 'rounded-control text-contrast-ink/75 transition-colors duration-150 ease-snappy hover:text-contrast-ink focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-white/40'
    : 'rounded-control text-muted transition-colors duration-150 ease-snappy hover:text-ink focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-action/20'

  return (
    <nav className="text-caption" aria-label={dict.breadcrumbs.aria}>
      <ol className="flex flex-wrap items-center gap-1.5">
        <li>
          <Link href={homeHref} className={linkClass}>
            {dict.breadcrumbs.home}
          </Link>
        </li>
        {items.map((item, index) => (
          <li key={item.href} className="flex min-w-0 items-center gap-1.5">
            <ChevronRight className={`size-3.5 shrink-0 rtl:-scale-x-100 ${inverse ? 'text-contrast-ink/60' : 'text-muted'}`} aria-hidden="true" />
            {index === items.length - 1 ? (
              <span className={`max-w-64 truncate font-medium ${inverse ? 'text-contrast-ink' : 'text-ink'}`} aria-current="page">{item.label}</span>
            ) : (
              <Link href={item.href} className={linkClass}>
                {item.label}
              </Link>
            )}
          </li>
        ))}
      </ol>
    </nav>
  )
}
