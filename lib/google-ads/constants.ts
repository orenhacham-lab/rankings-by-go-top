/**
 * The markets Google Ads is asked about: the geo target and language criterion
 * ids behind the keyword-research screen's two pickers.
 *
 * EVERY NUMBER HERE IS GOOGLE'S OWN AND WAS READ BACK FROM THE API, not copied
 * from documentation. The queries that produced them (read-only GAQL against our
 * own customer, 4 October 2026):
 *
 *   SELECT language_constant.id, language_constant.code, language_constant.name
 *   FROM language_constant
 *   SELECT geo_target_constant.id, geo_target_constant.country_code
 *   FROM geo_target_constant WHERE geo_target_constant.target_type = 'Country'
 *
 * That check found a wrong one: Greek was 1016, which is Google's id for
 * Portuguese (Brazil) — Greek is 1022. Choosing Greek had been asking Google for
 * Brazilian Portuguese keyword ideas. The ids are pinned in
 * __qa__/markets.qa.ts so the next one cannot be typed in unnoticed.
 *
 * The language chooses which keyword IDEAS Google returns; the country chooses
 * the search volumes. They are independent of the UI locale and of the project's
 * content language, which is lib/content/language.ts.
 *
 * France and Italy were added on 24 October 2026, read back from the API the
 * same way (FR 2250, IT 2380, fr 1002, it 1004). They were missing while the
 * blog already asked for them: lib/blog/auto/keyword-plan.ts declares
 * `fr: { country: 'FR', language: 'fr' }`, both maps are `Record<string,
 * number>` so nothing failed to compile, and the request went out as
 * `geoTargetConstants/undefined`. Google answered 404 NOT_FOUND, the research
 * returned no ideas, the French queue stayed empty, and the French blog never
 * published a word — four days, with no error anywhere but the raw runtime log.
 * markets.qa.ts pins these two as well, and blog-auto.qa.ts now asserts that
 * every market the blog research asks for resolves in both maps.
 *
 * Japan was added on 30 October 2026, with the Japanese blog, and both values
 * were read back from the live API rather than inferred from the pattern:
 * `geoTargetConstants/2392` answers name "Japan", countryCode JP, targetType
 * Country, status ENABLED, and `languageConstants/1005` answers code "ja",
 * name "Japanese", targetable true.
 *
 * SUPPORTED_COUNTRIES and SUPPORTED_LANGUAGES below are deliberately NOT
 * widened: they drive the keyword-research screen's pickers, whose labels are
 * translated per locale, and the blog's own research does not go through them.
 */

export const COUNTRY_GEO_TARGETS: Record<string, number> = {
  IL: 2376, // Israel
  US: 2840, // United States
  GB: 2826, // United Kingdom
  GR: 2300, // Greece
  CY: 2196, // Cyprus
  ES: 2724, // Spain
  MX: 2484, // Mexico
  AR: 2032, // Argentina
  BR: 2076, // Brazil
  PT: 2620, // Portugal
  FR: 2250, // France
  IT: 2380, // Italy
  JP: 2392, // Japan
}

export const LANGUAGE_IDS: Record<string, number> = {
  he: 1027, // Hebrew (Google's code is the legacy `iw`)
  en: 1000, // English
  el: 1022, // Greek
  ar: 1019, // Arabic
  ru: 1031, // Russian
  es: 1003, // Spanish
  pt: 1014, // Portuguese
  fr: 1002, // French
  it: 1004, // Italian
  ja: 1005, // Japanese
}

export const SUPPORTED_COUNTRIES = ['IL', 'US', 'GB', 'ES', 'MX', 'AR', 'BR', 'PT', 'GR', 'CY'] as const
export const SUPPORTED_LANGUAGES = ['he', 'en', 'es', 'pt', 'el', 'ar', 'ru'] as const

export type CountryCode = (typeof SUPPORTED_COUNTRIES)[number]
export type LanguageCode = (typeof SUPPORTED_LANGUAGES)[number]

export function isValidCountry(code: string): code is CountryCode {
  return SUPPORTED_COUNTRIES.includes(code as CountryCode)
}

export function isValidLanguage(code: string): code is LanguageCode {
  return SUPPORTED_LANGUAGES.includes(code as LanguageCode)
}
