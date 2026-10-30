/**
 * The ONE place that decides which language a project's content is written in.
 *
 * Before this module every content path carried its own copy of
 * `String(x).toLowerCase().startsWith('en') ? 'en' : 'he'`, which silently mapped
 * every other language — Spanish included — onto Hebrew. A project whose content
 * language is Spanish would have been written in Hebrew, audited with Hebrew word
 * lists and rendered right-to-left. So the normalization lives here, once, and the
 * type is the content layer's exhaustiveness check: a `Record<ContentLanguage, …>`
 * stops compiling the moment a language is added without its data.
 *
 * This is the CONTENT language (what we write for the customer's own readers). It is
 * NOT the UI locale (`lib/i18n/locales.ts`) and NOT the billing market: a Spanish
 * site can be managed from a Hebrew dashboard, and currency follows the country.
 */

export type ContentLanguage = 'he' | 'en' | 'es' | 'pt-BR' | 'fr' | 'it' | 'ja'

export const CONTENT_LANGUAGES: ContentLanguage[] = ['he', 'en', 'es', 'pt-BR', 'fr', 'it', 'ja']

export const DEFAULT_CONTENT_LANGUAGE: ContentLanguage = 'he'

/**
 * Normalize an untrusted language value (a DB column, a request body, a scan
 * result) to a supported content language. Accepts BCP-47 tags ('es-MX'), the
 * legacy ISO code for Hebrew ('iw'), and 'cas'/'castellano' for Spanish; anything
 * unrecognized falls back to Hebrew, which is what every caller did before.
 *
 * Portuguese carries its region ('pt-BR') for the same reason the public locale
 * does: the copy, the examples and the legal documents are Brazilian. A bare
 * 'pt' or 'pt-PT' still normalizes here, because the alternative — falling back
 * to Hebrew — is the worse answer for a Portuguese value.
 *
 * French is region-less, like Spanish: 'fr', 'fr-FR', 'fr-BE' and 'fr-CA' all
 * normalize to the one content language, because what we write for a reader in
 * Quebec and for a reader in Lyon is the same French. Where the region does
 * change an answer it is a LEGAL question, not a content one, and the privacy
 * policy says so in its own words.
 *
 * Italian is region-less for the same reason: 'it', 'it-IT' and 'it-CH' all
 * normalize to the one content language.
 *
 * Japanese is region-less because the language has one market, and it is the
 * first content language written WITHOUT WORD SPACES: everything that measures a
 * Japanese text — a keyword's word count, the cannibalization word sets, the
 * internal-link overlap — goes through lib/text/segment.ts rather than a space
 * split. The legacy 'jp' is accepted beside 'ja' because it is what a WordPress
 * site and a Google Search Console property both sometimes report.
 */
export function normalizeContentLanguage(value: unknown): ContentLanguage {
  const s = String(value ?? '').toLowerCase().trim()
  if (s.startsWith('en')) return 'en'
  if (s.startsWith('es') || s.startsWith('cas')) return 'es'
  if (s.startsWith('he') || s.startsWith('iw')) return 'he'
  if (s.startsWith('pt') || s.startsWith('portugu')) return 'pt-BR'
  if (s.startsWith('fr') || s.startsWith('franc') || s.startsWith('français')) return 'fr'
  if (s.startsWith('it') || s.startsWith('ital')) return 'it'
  if (s.startsWith('ja') || s.startsWith('jp') || s.startsWith('japan') || s.startsWith('日本')) return 'ja'
  return DEFAULT_CONTENT_LANGUAGE
}

/** The language's English name — the form every model prompt asks us to write in. */
const ENGLISH_NAME: Record<ContentLanguage, string> = {
  he: 'Hebrew',
  en: 'English',
  es: 'Spanish',
  'pt-BR': 'Brazilian Portuguese',
  fr: 'French',
  it: 'Italian',
  ja: 'Japanese',
}

export function languageNameInEnglish(language: ContentLanguage): string {
  return ENGLISH_NAME[language]
}

/** Text direction of the language's own script. Only Hebrew is right-to-left. */
export function contentDirection(language: ContentLanguage): 'rtl' | 'ltr' {
  return language === 'he' ? 'rtl' : 'ltr'
}

/**
 * The script the language's own content is written in. Latin is FOREIGN to Hebrew
 * content (an unknown latin token is a model-invented brand name) and NATIVE to
 * every other content language, where the same rule would flag every ordinary
 * word.
 *
 * Japanese answers 'japanese', not 'latin': a latin token inside Japanese prose
 * is ordinary (SEO, Google, Core Web Vitals are written in latin letters even in
 * a Japanese sentence), so the invented-brand-name rule must not fire on it, and
 * the language check that asks whether an article came back in the language it
 * was ordered in has to look for kana rather than for latin letters.
 */
export function contentScript(language: ContentLanguage): 'hebrew' | 'latin' | 'japanese' {
  if (language === 'he') return 'hebrew'
  return language === 'ja' ? 'japanese' : 'latin'
}

/** Is this language written without spaces between its words? */
export function isUnspacedLanguage(language: ContentLanguage): boolean {
  return language === 'ja'
}

/**
 * Narrow to the two languages a layer that is NOT Spanish-aware yet can handle.
 *
 * The AI-visibility question templates (`lib/ai-visibility/prompt-templates.ts`)
 * and the site-fix suggestions carry Hebrew-and-English word lists only. Until
 * each gets its own Spanish data, a Spanish project reaches them as ENGLISH, not
 * Hebrew: English shares Spanish's latin script, so its heuristics (question
 * openings, latin tokens, capitalization) behave sanely instead of testing
 * Spanish prose against Hebrew regexes. Every call site is a to-do marker — a
 * `grep` for this function lists exactly what is left to translate.
 */
export function toHebrewOrEnglish(language: ContentLanguage): 'he' | 'en' {
  return language === 'he' ? 'he' : 'en'
}

/**
 * Like `normalizeContentLanguage`, but a language the content layer does not
 * know yet reads as ENGLISH rather than Hebrew.
 *
 * The keyword-research screen offers more languages than we write content in,
 * because the language only decides which keyword ideas Google returns.
 * Portuguese and French used to be the examples and are now content languages
 * of their own; German and the rest are still research-only. Rendering a latin-script
 * language's topics in Hebrew prose is worse than rendering them in English, so
 * this is the fallback for anything researched in a language we cannot write in
 * yet.
 *
 * An empty or missing value is not an unknown language, it is no language, and
 * keeps the Hebrew default every caller had before.
 */
export function contentLanguageOrEnglish(value: unknown): ContentLanguage {
  const s = String(value ?? '').toLowerCase().trim()
  if (!s) return DEFAULT_CONTENT_LANGUAGE
  const known = /^(en|es|cas|he|iw|pt|portugu|fr|franc|it|ital|ja|jp|japan|日本)/.test(s)
  return known ? normalizeContentLanguage(s) : 'en'
}
