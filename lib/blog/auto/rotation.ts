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
 * `fr` joined on 21 Oct 2026 the same way, written for FRANCE: the public tree
 * is /fr, the keyword research runs on the French market, and the legal pages
 * behind it are written to French and European law.
 *
 * THE ORDER OF THIS LIST IS LOAD-BEARING, and French is last on purpose.
 * lib/blog/auto/daily-window.ts writes at most one language per cron run and
 * walks this list in order, inside a four-hour window of sixteen runs. Five
 * languages publishing first time need five of them; the rest is reserve for a
 * language that fails the quality gate and retries (on 17 Oct Spanish needed
 * three passes). Adding a language therefore spends reserve, and the language
 * that pays for a bad morning is the LAST one here. Putting French last is what
 * keeps a new language from ever costing an existing one its article.
 *
 * Pure: no I/O. `localesForDay()` reads the public-language flags, which Next
 * inlines at build time, and nothing else.
 */
import { publicLocaleEnabled } from '@/lib/i18n/locales'

/** The languages this runner can write. A subset of PUBLIC_LOCALES. */
export const BLOG_AUTO_LOCALES = ['he', 'en', 'es', 'pt-BR', 'fr', 'it', 'ja'] as const
export type BlogAutoLocale = (typeof BLOG_AUTO_LOCALES)[number]

export function isBlogAutoLocale(value: unknown): value is BlogAutoLocale {
  return BLOG_AUTO_LOCALES.includes(value as BlogAutoLocale)
}

/**
 * The languages due today: all of them whose public tree a reader can open.
 *
 * Japanese is in the list above and is skipped here while its flag is off, for
 * two reasons that both point the same way. The `/ja` tree answers 404 until the
 * flag flips (lib/i18n/japanese-site.ts), so an article written today would be
 * written for nobody; and `articles.locale` and `blog_plan.locale` do not accept
 * 'ja' until 20261030120000_locale_ja.sql runs, so the write would fail in the
 * database rather than in a place anyone would look. The language therefore
 * starts publishing on the deploy that turns it on, which is the same moment its
 * pages become readable.
 */
export function localesForDay(): readonly BlogAutoLocale[] {
  return BLOG_AUTO_LOCALES.filter((l) => publicLocaleEnabled(l))
}

/** How many articles a week each language gets — the queue's refill target reads this. */
export function weeklyShare(): Record<BlogAutoLocale, number> {
  return { he: 7, en: 7, es: 7, 'pt-BR': 7, fr: 7, it: 7, ja: 7 }
}
