// Google Ads API geo targeting IDs and language codes
// Source: Google Ads API documentation

export const COUNTRY_GEO_TARGETS: Record<string, number> = {
  IL: 2376, // Israel
  US: 2840, // United States
  GB: 2826, // United Kingdom
  GR: 2300, // Greece
  CY: 2196, // Cyprus
}

export const LANGUAGE_IDS: Record<string, number> = {
  he: 1009, // Hebrew
  en: 1000, // English
  el: 1016, // Greek
}

export const SUPPORTED_COUNTRIES = ['IL', 'US', 'GB', 'GR', 'CY'] as const
export const SUPPORTED_LANGUAGES = ['he', 'en', 'el'] as const

export type CountryCode = (typeof SUPPORTED_COUNTRIES)[number]
export type LanguageCode = (typeof SUPPORTED_LANGUAGES)[number]

export function isValidCountry(code: string): code is CountryCode {
  return SUPPORTED_COUNTRIES.includes(code as CountryCode)
}

export function isValidLanguage(code: string): code is LanguageCode {
  return SUPPORTED_LANGUAGES.includes(code as LanguageCode)
}
