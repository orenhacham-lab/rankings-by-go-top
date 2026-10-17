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
}

export const LANGUAGE_IDS: Record<string, number> = {
  he: 1027, // Hebrew (Google's code is the legacy `iw`)
  en: 1000, // English
  el: 1022, // Greek
  ar: 1019, // Arabic
  ru: 1031, // Russian
  es: 1003, // Spanish
  pt: 1014, // Portuguese
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
