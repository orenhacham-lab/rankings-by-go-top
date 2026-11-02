/**
 * WHICH LANGUAGES THE PRODUCT IS ACTUALLY SERVED IN, said once.
 *
 * `inLanguage` / `availableLanguage` is the field an entity resolver reads to
 * answer "does this tool speak Japanese?". Ours was a hand-written array in
 * lib/seo/organization.ts — `['he', 'en', 'es', 'pt', 'fr', 'it', 'ja']` — with
 * two defects of its own:
 *
 * 1. `pt` is not the language the site serves. Every other surface spells it
 *    `pt-BR` (LOCALE_CONFIG, hreflang, og:locale, the URL itself), because the
 *    copy and the legal documents are Brazilian. Bare `pt` claims European
 *    Portuguese, which is the one Portuguese reader we do not address.
 * 2. It could not go stale safely in the other direction either: a locale that
 *    is behind its build flag and 404s today was still advertised here, and a
 *    language claim a crawler can disprove by following the hreflang is worse
 *    than one language fewer.
 *
 * So it is read from the same gate everything else reads — `publicLocaleEnabled`
 * via `enabledPublicLocales()` — and spelled by `LOCALE_CONFIG[locale].lang`,
 * which is the tag the document itself ships in <html lang>.
 *
 * Its own module, not organization.ts, so the Organization and the
 * SoftwareApplication can both read it without importing each other.
 */
import { LOCALE_CONFIG, enabledPublicLocales, type PublicLocale } from '@/lib/i18n/locales'

/**
 * The BCP-47 tags of the public locales that are live right now, in site order.
 *
 * `flags` is a parameter for the same reason `publicLocaleEnabled` takes one: the
 * gates are NEXT_PUBLIC_* build-time values, so a guard that read the ambient
 * environment would assert he/en in this repo and seven languages in production,
 * and the one claim worth testing — that `pt-BR` is never flattened to `pt` —
 * would be untestable here. The defaults read the real flags.
 *
 * On production (verified 2 Nov 2026: all five NEXT_PUBLIC_*_SITE_ENABLED are
 * "true" on the production target) this answers all seven.
 */
export function publicSiteLanguages(flags?: Partial<Record<PublicLocale, boolean>>): string[] {
  return enabledPublicLocales(flags).map((locale) => LOCALE_CONFIG[locale].lang)
}
