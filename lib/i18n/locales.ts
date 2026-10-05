/**
 * THE TWO LOCALE TYPES, and why they are not one.
 *
 * `PublicLocale` ('he' | 'en' | 'es') is the language of the WORDS on a screen.
 * On the public site it is a property of the URL — `/` is Hebrew, `/en/…`
 * English, `/es/…` Spanish — and inside the dashboard it is what the switcher
 * sets and what `getDashboardDictionary` takes. Each locale's words come from
 * its own copy object, so a language is added by adding its copy: nothing is
 * inferred and nothing falls through.
 *
 * `Locale` ('he' | 'en') is the BILINGUAL value everything AROUND those words
 * runs on: ~300 `locale === 'he' ? … : …` conditionals, the auth pages, the
 * Shopify entry points, the server actions whose refusals those surfaces
 * display, the PDF and Excel exports. A third value there would not add a
 * language — it would silently serve English wherever a conditional tested for
 * Hebrew, and Hebrew wherever one tested for English, which is the worse half.
 *
 * Every `Locale` is a `PublicLocale`; the reverse is a decision, so the compiler
 * asks for one. `toBilingualLocale` is where it is made, once, and every call
 * site of it is a place a language could still be translated further.
 */
import { spanishSiteEnabled } from './spanish-site'
import { portugueseSiteEnabled } from './portuguese-site'

export type Locale = 'he' | 'en'
export type PublicLocale = Locale | 'es' | 'pt-BR'

export const LOCALES: Locale[] = ['he', 'en']
export const PUBLIC_LOCALES: PublicLocale[] = ['he', 'en', 'es', 'pt-BR']
export const DEFAULT_LOCALE: Locale = 'he'

/**
 * The URL prefix a public locale lives under. Hebrew is the bare root.
 *
 * 'pt-BR' keeps its region in the URL deliberately: the documents are written to
 * Brazilian law (the Consumer Code's seven-day withdrawal right, the LGPD), so a
 * bare '/pt' would promise European Portuguese readers rules that are not theirs.
 */
export const LOCALE_PREFIX: Record<PublicLocale, string> = { he: '', en: '/en', es: '/es', 'pt-BR': '/pt-BR' }

export const LOCALE_CONFIG: Record<PublicLocale, { dir: 'rtl' | 'ltr'; lang: string; ogLocale: string }> = {
  he: { dir: 'rtl', lang: 'he', ogLocale: 'he_IL' },
  en: { dir: 'ltr', lang: 'en', ogLocale: 'en_US' },
  // es-ES is the market the Spanish site opens with (Spain); the copy itself is
  // written in neutral Spanish so Latin-American readers are not addressed in a
  // dialect that is not theirs.
  es: { dir: 'ltr', lang: 'es', ogLocale: 'es_ES' },
  'pt-BR': { dir: 'ltr', lang: 'pt-BR', ogLocale: 'pt_BR' },
}

/**
 * What `Intl` and the payment SDKs call each language. A date or a thousands
 * separator is NOT a property of the words on the screen, so it needs its own
 * table: the ternaries this replaces (`language === 'en' ? 'en-US' : 'he-IL'`)
 * answer Hebrew for every value that is not English, which would have printed
 * Spanish prices and dates in Hebrew.
 *
 * Spain is the first Spanish market, so es-ES; a Latin-American market gets its
 * own entry the day its currency is set, because that is the same decision.
 */
export const INTL_LOCALE: Record<PublicLocale, string> = { he: 'he-IL', en: 'en-US', es: 'es-ES', 'pt-BR': 'pt-BR' }

/** PayPal's own locale spelling, which uses an underscore and no others. */
export const PAYPAL_LOCALE: Record<PublicLocale, string> = { he: 'he_IL', en: 'en_US', es: 'es_ES', 'pt-BR': 'pt_BR' }

/**
 * The `Intl` tag of a language that reached us as a plain string — a prop typed
 * `string`, a column, a cookie. The formatters used to answer `he-IL` for every
 * value that was not English, which printed Spanish numbers and dates in Hebrew;
 * this answers the table, and English for anything it does not know.
 */
export function intlLocaleOf(language: string): string {
  return INTL_LOCALE[normalizePublicLocale(language) ?? 'en']
}

export function getLocaleConfig(locale: PublicLocale) {
  return LOCALE_CONFIG[locale]
}

/**
 * Validate an untrusted value to a public locale, or null.
 *
 * Read from PUBLIC_LOCALES rather than listed by hand. The hand-written version
 * said he/en/es, so adding Portuguese to the table was not enough: this function
 * answered null for 'pt-BR', the proxy's locale header was discarded, and every
 * /pt-BR page shipped `<html lang="en">` over Portuguese copy while the copy
 * itself was perfect. A cast downstream hid it from the compiler.
 */
export function normalizePublicLocale(value: unknown): PublicLocale | null {
  return typeof value === 'string' && (PUBLIC_LOCALES as readonly string[]).includes(value)
    ? (value as PublicLocale)
    : null
}

/**
 * The STORED language preference — the `language` cookie and the localStorage
 * key beside it.
 *
 * This is the ONE signal that can say Spanish on a route with no language of
 * its own. A public page takes its language from its URL, so `/` is Hebrew and
 * `/es/…` Spanish whatever the cookie holds; the DASHBOARD has no such URL, so
 * a reader who picked Spanish in the switcher is recognised here or nowhere.
 * Before this, `/dashboard` with `language=es` resolved to English, because
 * every step of the chain narrowed the cookie to the bilingual pair.
 *
 * Spanish is accepted only while the Spanish build is on, so with the flag off
 * a hand-edited cookie changes nothing anywhere.
 */
export function normalizeStoredLocale(value: unknown): PublicLocale | null {
  const locale = normalizePublicLocale(value)
  if (locale === 'es' && !spanishSiteEnabled()) return null
  if (locale === 'pt-BR' && !portugueseSiteEnabled()) return null
  return locale
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
