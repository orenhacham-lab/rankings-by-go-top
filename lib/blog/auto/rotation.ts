/**
 * WHICH LANGUAGES THE BLOG PUBLISHES IN, EVERY DAY.
 *
 * Until 11 Oct 2026 this was a weekday rotation — one article a day, Hebrew
 * four days, English two, Spanish one — because the number of keywords with
 * real monthly searches in Hebrew, in this niche and this country, does not
 * hold 365 articles a year. Oren asked for an article a day in EVERY language
 * instead, so the rotation is gone: every language runs every day, and the
 * queue is what limits it. A language whose queue has nothing worth writing
 * skips that day (`queue_empty`) rather than publishing a keyword nobody
 * searches or a second article on a query we already rank for — the
 * cannibalisation check in lib/blog/auto/keyword-plan.ts still holds.
 *
 * `pt-BR` joined on 17 Oct 2026, once the content layer learnt a fourth
 * language: ContentLanguage (lib/content/language.ts) now carries 'pt-BR', and
 * every word list, prompt line and audit table behind it has Brazilian
 * Portuguese data of its own. The language is written for BRAZIL — the public
 * tree is /pt-BR, the keyword research runs on the Brazilian market, and the
 * copy is Brazilian, not European, Portuguese.
 *
 * Pure: no I/O.
 */

/** The languages this runner can write. A subset of PUBLIC_LOCALES. */
export const BLOG_AUTO_LOCALES = ['he', 'en', 'es', 'pt-BR'] as const
export type BlogAutoLocale = (typeof BLOG_AUTO_LOCALES)[number]

export function isBlogAutoLocale(value: unknown): value is BlogAutoLocale {
  return BLOG_AUTO_LOCALES.includes(value as BlogAutoLocale)
}

/** The languages due today: all of them. */
export function localesForDay(): readonly BlogAutoLocale[] {
  return BLOG_AUTO_LOCALES
}

/** How many articles a week each language gets — the queue's refill target reads this. */
export function weeklyShare(): Record<BlogAutoLocale, number> {
  return { he: 7, en: 7, es: 7, 'pt-BR': 7 }
}
