/**
 * The document's <html lang> and <html dir> for a locale. PURE — no React, no
 * DOM — so the mapping is testable on its own and cannot drift between the
 * dashboard (client-side language switch) and the public /en routes.
 *
 * Anything that is not a known locale is Hebrew/RTL: Hebrew is the product's
 * default and the safe direction for an unknown or absent value. A locale whose
 * own script is latin (English, Spanish) is LTR, and labelling a Spanish
 * document `lang="he" dir="rtl"` would mis-order its punctuation on the first
 * paint, before any client code runs.
 */
import { LOCALE_CONFIG, normalizePublicLocale } from './locales'

export type DocumentLocaleAttributes = { lang: 'he' | 'en' | 'es'; dir: 'rtl' | 'ltr' }

export function documentLocaleAttributes(locale: string | null | undefined): DocumentLocaleAttributes {
  const known = normalizePublicLocale(locale)
  if (!known) return { lang: 'he', dir: 'rtl' }
  const { lang, dir } = LOCALE_CONFIG[known]
  return { lang: lang as 'he' | 'en' | 'es', dir }
}
