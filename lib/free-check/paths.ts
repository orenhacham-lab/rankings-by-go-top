import { LOCALE_PREFIX, type PublicLocale } from '@/lib/i18n/locales'

/**
 * The free check's page in one language.
 *
 * It exists as a function, in a plain module, for two reasons. The hero form is
 * a client component, so a destination computed inside it can only be checked
 * by reading its source; and the line it replaces —
 * `locale === 'en' ? '/en/free-check' : '/free-check'` — sent Spanish and
 * Portuguese visitors to the Hebrew page for as long as those languages
 * existed. Read off LOCALE_PREFIX, a new language is right the day it is added.
 */
export function freeCheckPath(locale: PublicLocale): string {
  return `${LOCALE_PREFIX[locale]}/free-check`
}
