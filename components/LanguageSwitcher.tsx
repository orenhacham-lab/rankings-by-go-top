'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Languages } from 'lucide-react'
import type { Locale } from '@/lib/i18n/locales'
import { getPublicDictionary } from '@/lib/i18n/getPublicDictionary'
import { cn } from '@/lib/utils'

function getCounterpartPath(pathname: string, currentLocale: Locale): string {
  if (currentLocale === 'en') {
    if (pathname === '/en' || pathname === '/en/') return '/'
    if (pathname.startsWith('/en/articles/')) return '/articles'
    if (pathname.startsWith('/en/')) return pathname.slice(3) || '/'
    return '/'
  }
  if (pathname === '/' || pathname === '') return '/en'
  if (pathname.startsWith('/articles/')) return '/en/articles'
  return `/en${pathname.startsWith('/') ? pathname : `/${pathname}`}`
}

/** `inverse`: white ink, for the nav while it sits over a navy hero. */
export function LanguageSwitcher({ locale, className, inverse = false }: { locale: Locale; className?: string; inverse?: boolean }) {
  const pathname = usePathname() ?? '/'
  const dict = getPublicDictionary(locale)
  const counterpartHref = getCounterpartPath(pathname, locale)
  const otherLocale: Locale = locale === 'he' ? 'en' : 'he'

  return (
    <Link
      href={counterpartHref}
      hrefLang={otherLocale}
      lang={otherLocale}
      className={cn(
        'inline-flex h-9 items-center gap-1.5 rounded-control px-3 text-copy font-medium',
        'transition-[background-color,color] duration-150 ease-snappy focus-visible:outline-none focus-visible:ring-4',
        inverse
          ? 'text-contrast-ink/85 hover:bg-white/10 hover:text-contrast-ink focus-visible:ring-white/40'
          : 'text-body hover:bg-sunk hover:text-ink focus-visible:ring-action/20',
        className,
      )}
      aria-label={dict.languageSwitcher.aria}
    >
      <Languages className={cn('size-4', inverse ? 'text-contrast-ink/70' : 'text-muted')} aria-hidden="true" />
      {dict.languageSwitcher[otherLocale]}
    </Link>
  )
}
