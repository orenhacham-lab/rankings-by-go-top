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
 * SUPPORTED_COUNTRIES and SUPPORTED_LANGUAGES below drive the keyword-research
 * screen's two pickers, whose labels are translated per locale. They used to be
 * deliberately narrower than the maps above, on the reasoning that the blog's
 * own research does not go through them — but that left the screen offering
 * Greek, Arabic and Russian while the seven markets the product actually ships
 * in (France, Italy, Germany, the Netherlands, Poland, Japan, Korea) could not
 * be chosen at all. An owner of a German site researching German keywords had to
 * pick "English" and a country we do not sell in. Reported by the owner on
 * 13 November 2026 and widened here to every market whose ids are pinned above.
 *
 * Nothing new was invented to do it: every code added below ALREADY had a
 * Google id in the two maps, read back from the live API when its language
 * shipped, and markets.qa.ts group A still compares each one against Google's
 * own answer. Widening the pickers therefore adds pickable markets, not
 * unverified ids.
 *
 * Two consequences a new entry here has to carry with it, both held by
 * markets.qa.ts:
 *   - a LABEL in all eleven dashboard dictionaries (group C), or the picker
 *     renders an empty option — a dictionary gap of this shape is a runtime
 *     blank, never a type error;
 *   - a prose language in lib/content/language.ts (group D), or the topic
 *     titles a German research produces come back in English.
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
  DE: 2276, // Germany
  NL: 2528, // Netherlands
  PL: 2616, // Poland
  KR: 2410, // South Korea — read back from the live API on 12 Nov 2026, the way
  //          Poland's 2616 was, rather than taken from memory.
  // Belgium (2056) is deliberately ABSENT. Flemish readers read the Dutch
  // pages, but Belgium was never measured in Keyword Planner and its prices
  // were never set, and offering Austria and Switzerland on German's say-so had
  // to be reverted for exactly that reason. A market goes in here when it is
  // researched, not when its language is.
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
  de: 1001, // German
  nl: 1010, // Dutch
  pl: 1030, // Polish
  ko: 1012, // Korean — read back from the live API on 12 Nov 2026
}

export const SUPPORTED_COUNTRIES = [
  'IL', 'US', 'GB', 'ES', 'MX', 'AR', 'BR', 'PT', 'GR', 'CY',
  // The markets the product ships a site language in, added 13 Nov 2026.
  'FR', 'IT', 'DE', 'NL', 'PL', 'JP', 'KR',
] as const
export const SUPPORTED_LANGUAGES = [
  'he', 'en', 'es', 'pt', 'el', 'ar', 'ru',
  // The same seven, as research languages.
  'fr', 'it', 'de', 'nl', 'pl', 'ja', 'ko',
] as const

export type CountryCode = (typeof SUPPORTED_COUNTRIES)[number]
export type LanguageCode = (typeof SUPPORTED_LANGUAGES)[number]

export function isValidCountry(code: string): code is CountryCode {
  return SUPPORTED_COUNTRIES.includes(code as CountryCode)
}

export function isValidLanguage(code: string): code is LanguageCode {
  return SUPPORTED_LANGUAGES.includes(code as LanguageCode)
}

/**
 * Where a locale's own research starts: the market an owner reading that
 * language is most likely to want. Until 13 Nov 2026 both pickers opened on
 * Israel and Hebrew for everyone, which was invisible while only Israel and the
 * English-speaking markets were offered and is a wrong first answer now that all
 * eleven are. It is a DEFAULT, not a restriction — every option stays choosable.
 *
 * pt-BR opens on Brazil rather than Portugal: that is the locale's own market
 * and the one the Portuguese blog researches (lib/blog/auto/keyword-plan.ts).
 * The language code is Google's, where Portuguese is one language ('pt'), not
 * one per country.
 */
export const LOCALE_RESEARCH_DEFAULT: Record<string, { country: string; language: string }> = {
  he: { country: 'IL', language: 'he' },
  en: { country: 'US', language: 'en' },
  es: { country: 'ES', language: 'es' },
  'pt-BR': { country: 'BR', language: 'pt' },
  fr: { country: 'FR', language: 'fr' },
  it: { country: 'IT', language: 'it' },
  ja: { country: 'JP', language: 'ja' },
  de: { country: 'DE', language: 'de' },
  nl: { country: 'NL', language: 'nl' },
  pl: { country: 'PL', language: 'pl' },
  ko: { country: 'KR', language: 'ko' },
}

/** The pair to open the pickers on, falling back to Israel for an unknown locale. */
export function researchDefaultFor(locale: string): { country: CountryCode; language: LanguageCode } {
  const d = LOCALE_RESEARCH_DEFAULT[locale]
  const country = d && isValidCountry(d.country) ? d.country : 'IL'
  const language = d && isValidLanguage(d.language) ? d.language : 'he'
  return { country, language }
}
