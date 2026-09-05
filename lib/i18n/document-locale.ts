/**
 * The document's <html lang> and <html dir> for a locale. PURE — no React, no
 * DOM — so the mapping is testable on its own and cannot drift between the
 * dashboard (client-side language switch) and the public /en routes.
 *
 * Anything that is not English is Hebrew/RTL: Hebrew is the product's default
 * and the safe direction for an unknown or absent value.
 */
export type DocumentLocaleAttributes = { lang: 'he' | 'en'; dir: 'rtl' | 'ltr' }

export function documentLocaleAttributes(locale: string | null | undefined): DocumentLocaleAttributes {
  return locale === 'en' ? { lang: 'en', dir: 'ltr' } : { lang: 'he', dir: 'rtl' }
}
