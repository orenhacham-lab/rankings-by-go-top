/**
 * THE TWO LOCALE TYPES, and why they are not one.
 *
 * `Locale` ('he' | 'en') is the BILINGUAL surfaces' language: the dashboard, the
 * auth pages, the Shopify entry points. Those are driven by two large
 * dictionaries and ~160 files of he/en conditionals, so a third value there would
 * not add a language, it would silently serve English wherever a ternary tested
 * for Hebrew.
 *
 * `PublicLocale` ('he' | 'en' | 'es') is the PUBLIC SITE's language, which is a
 * property of the URL: `/` is Hebrew, `/en/…` English, `/es/…` Spanish. Those
 * pages take their words from a per-locale copy object, so a locale is added by
 * adding its copy — nothing is inferred and nothing falls through.
 *
 * Every `Locale` is a `PublicLocale`; the reverse needs a deliberate decision, so
 * the compiler asks for one. When the dashboard is translated, the two types
 * converge and this comment goes away.
 */

export type Locale = 'he' | 'en'
export type PublicLocale = Locale | 'es'

export const LOCALES: Locale[] = ['he', 'en']
export const PUBLIC_LOCALES: PublicLocale[] = ['he', 'en', 'es']
export const DEFAULT_LOCALE: Locale = 'he'

/** The URL prefix a public locale lives under. Hebrew is the bare root. */
export const LOCALE_PREFIX: Record<PublicLocale, string> = { he: '', en: '/en', es: '/es' }

export const LOCALE_CONFIG: Record<PublicLocale, { dir: 'rtl' | 'ltr'; lang: string; ogLocale: string }> = {
  he: { dir: 'rtl', lang: 'he', ogLocale: 'he_IL' },
  en: { dir: 'ltr', lang: 'en', ogLocale: 'en_US' },
  // es-ES is the market the Spanish site opens with (Spain); the copy itself is
  // written in neutral Spanish so Latin-American readers are not addressed in a
  // dialect that is not theirs.
  es: { dir: 'ltr', lang: 'es', ogLocale: 'es_ES' },
}

export function getLocaleConfig(locale: PublicLocale) {
  return LOCALE_CONFIG[locale]
}

/** Validate an untrusted value to a public locale, or null. */
export function normalizePublicLocale(value: unknown): PublicLocale | null {
  return value === 'he' || value === 'en' || value === 'es' ? value : null
}

/**
 * The counterpart of a HEBREW path in another public locale. The Hebrew tree is
 * the canonical one, so every other locale is its prefix plus the same path.
 */
export function getLocaleHref(href: string, locale: PublicLocale): string {
  const prefix = LOCALE_PREFIX[locale]
  if (!prefix) return href
  if (href === '/') return prefix
  return `${prefix}${href}`
}

/** The home page of a public locale. */
export function localeHomeHref(locale: PublicLocale): string {
  return LOCALE_PREFIX[locale] || '/'
}

/**
 * Narrow a public locale to the two the BILINGUAL surfaces have: the dashboard,
 * the auth pages, the Shopify entry points and the server actions those
 * surfaces display refusals from.
 *
 * Spanish becomes ENGLISH, never Hebrew: a Spanish reader arrived from a
 * latin-script, left-to-right site, so an English page is one they can read
 * while a right-to-left Hebrew one is not. Every call site is a to-do for the
 * dashboard translation wave.
 */
export function toBilingualLocale(locale: PublicLocale): Locale {
  return locale === 'he' ? 'he' : 'en'
}

/**
 * The OTHER bilingual locale. Only meaningful for the two-language surfaces (the
 * switcher inside the dashboard); the public switcher lists every locale a page
 * exists in instead of toggling between two.
 */
export function getOppositeLocale(locale: Locale): Locale {
  return locale === 'he' ? 'en' : 'he'
}
