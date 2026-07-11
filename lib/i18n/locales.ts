export type Locale = 'he' | 'en'

export const LOCALES: Locale[] = ['he', 'en']
export const DEFAULT_LOCALE: Locale = 'he'

export const LOCALE_CONFIG: Record<Locale, { dir: 'rtl' | 'ltr'; lang: string; ogLocale: string }> = {
  he: { dir: 'rtl', lang: 'he', ogLocale: 'he_IL' },
  en: { dir: 'ltr', lang: 'en', ogLocale: 'en_US' },
}

export function getLocaleConfig(locale: Locale) {
  return LOCALE_CONFIG[locale]
}

export function getOppositeLocale(locale: Locale): Locale {
  return locale === 'he' ? 'en' : 'he'
}

export function getLocaleHref(href: string, locale: Locale): string {
  if (locale === 'he') return href
  if (href === '/') return '/en'
  return `/en${href}`
}
