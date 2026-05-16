'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import type { Locale } from '@/lib/i18n/locales'
import { getPublicDictionary } from '@/lib/i18n/getPublicDictionary'

function getCounterpartPath(pathname: string, currentLocale: Locale): string {
  if (currentLocale === 'en') {
    if (pathname === '/en' || pathname === '/en/') return '/'
    if (pathname.startsWith('/en/')) return pathname.slice(3) || '/'
    return '/'
  }
  if (pathname === '/' || pathname === '') return '/en'
  return `/en${pathname.startsWith('/') ? pathname : `/${pathname}`}`
}

export function LanguageSwitcher({ locale, className }: { locale: Locale; className?: string }) {
  const pathname = usePathname() ?? '/'
  const dict = getPublicDictionary(locale)
  const counterpartHref = getCounterpartPath(pathname, locale)
  const otherLocale: Locale = locale === 'he' ? 'en' : 'he'

  return (
    <Link
      href={counterpartHref}
      hrefLang={otherLocale}
      className={`text-sm font-medium text-slate-600 hover:text-blue-600 transition-colors ${className ?? ''}`}
      aria-label={`Switch to ${otherLocale === 'en' ? 'English' : 'Hebrew'}`}
    >
      {dict.languageSwitcher[otherLocale]}
    </Link>
  )
}
