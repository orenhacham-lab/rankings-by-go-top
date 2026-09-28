'use client'

import Link from 'next/link'
import { ChevronRight } from 'lucide-react'
import type { Locale } from '@/lib/i18n/locales'
import { getPublicDictionary } from '@/lib/i18n/getPublicDictionary'

interface BreadcrumbItem {
  label: string
  href: string
}

export function Breadcrumbs({ items, locale = 'he' }: { items: BreadcrumbItem[]; locale?: Locale }) {
  const dict = getPublicDictionary(locale)
  const homeHref = locale === 'en' ? '/en' : '/'
  const linkClass = 'rounded-control text-muted transition-colors duration-150 ease-snappy hover:text-ink focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-action/20'

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
            <ChevronRight className="size-3.5 shrink-0 text-muted rtl:-scale-x-100" aria-hidden="true" />
            {index === items.length - 1 ? (
              <span className="max-w-64 truncate font-medium text-ink" aria-current="page">{item.label}</span>
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
