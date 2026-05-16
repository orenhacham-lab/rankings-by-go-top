'use client'

import Link from 'next/link'
import type { Locale } from '@/lib/i18n/locales'

interface BreadcrumbItem {
  label: string
  href: string
}

export function Breadcrumbs({ items, locale = 'he' }: { items: BreadcrumbItem[]; locale?: Locale }) {
  const homeLabel = locale === 'en' ? 'Home' : 'דף הבית'
  const homeHref = locale === 'en' ? '/en' : '/'

  return (
    <nav className="flex items-center gap-2 text-sm mb-6" aria-label="Breadcrumb">
      <Link href={homeHref} className="text-blue-600 hover:underline">
        {homeLabel}
      </Link>
      {items.map((item, index) => (
        <div key={item.href} className="flex items-center gap-2">
          <span className="text-slate-400">/</span>
          {index === items.length - 1 ? (
            <span className="text-slate-600">{item.label}</span>
          ) : (
            <Link href={item.href} className="text-blue-600 hover:underline">
              {item.label}
            </Link>
          )}
        </div>
      ))}
    </nav>
  )
}
