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
 * `it` joined on 23 Oct 2026 and `ja` on 31 Oct 2026, each the same way and
 * each written for its own market.
 *
 * `de` joined on 4 Nov 2026, written for GERMANY: the public tree is /de, the
 * keyword research runs on the German market (geo 2276, language 1001), and the
 * legal pages behind it are written to German and European law. German was
 * chosen over Dutch and Taiwanese Mandarin on measured Keyword Planner volume —
 * about 9,100 monthly searches on the ten core queries, against 2,460 and 280 —
 * so it is the language with the most to publish for, not the easiest to
 * translate into.
 *
 * `nl` joined on 5 Nov 2026, written for the NETHERLANDS alone: the public tree
 * is /nl, the keyword research runs on the Dutch market (geo 2528, language
 * 1010) and NOT on Belgium, and the legal pages behind it are written to Dutch
 * and European law. It is the language measured second in the comparison above,
 * and its two strongest terms were measured on their own: `backlinks checken`
 * at 4,400 a month with low competition, and `lokale seo` with `seo lokaal` at
 * 520 together.
 *
 * `pl` joined on 5 Nov 2026, written for POLAND alone: the public tree is /pl,
 * the keyword research runs on the Polish market (geo 2616, language 1030, both
 * read back from the live Google Ads API), and the legal pages behind it are
 * written to Polish and European law — RODO rather than GDPR, the fourteen-day
 * withdrawal right of art. 27 ustawy o prawach konsumenta, and the information
 * duty of that same Act, which /pl/dane-firmy answers — not the e-services act,
 * whose country-of-origin rule does not reach a provider seated outside the EU.
 *
 * THE ORDER OF THIS LIST IS LOAD-BEARING, and Polish is last on purpose.
 * lib/blog/auto/daily-window.ts writes at most one language per cron run and
 * walks this list in order, inside a six-hour window of twenty-four runs. Ten
 * languages publishing first time need ten of them; the rest is reserve for a
 * language that fails the quality gate and retries (on 17 Oct Spanish needed
 * three passes). Adding a language therefore spends reserve — with ten
 * languages the window keeps fourteen runs of it — and the language that pays
 * for a bad morning is the LAST one here. Putting Polish last is what keeps a
 * new language from ever costing an existing one its article.
 *
 * Fourteen runs of reserve for ten languages is the narrowest this has been
 * since the window was widened; an eleventh language should come with the
 * seventh hour rather than after it.
 *
 * Pure: no I/O. `localesForDay()` reads the public-language flags, which Next
 * inlines at build time, and nothing else.
 */
import { publicLocaleEnabled } from '@/lib/i18n/locales'

/** The languages this runner can write. A subset of PUBLIC_LOCALES. */
export const BLOG_AUTO_LOCALES = ['he', 'en', 'es', 'pt-BR', 'fr', 'it', 'ja', 'de', 'nl', 'pl'] as const
export type BlogAutoLocale = (typeof BLOG_AUTO_LOCALES)[number]

export function isBlogAutoLocale(value: unknown): value is BlogAutoLocale {
  return BLOG_AUTO_LOCALES.includes(value as BlogAutoLocale)
}

/**
 * The languages due today: all of them whose public tree a reader can open.
 *
 * A language is in the list above and skipped here while its flag is off, for
 * two reasons that both point the same way. Its tree answers 404 until the flag
 * flips (lib/i18n/german-site.ts for German), so an article written today would
 * be written for nobody; and `articles.locale` and `blog_plan.locale` do not
 * accept the code until its migration runs (20261030120000_locale_ja.sql for
 * Japanese, 20261104120000_locale_de.sql for German), so the write would fail in
 * the database rather than in a place anyone would look. A language therefore
 * starts publishing on the deploy that turns it on, which is the same moment its
 * pages become readable.
 */
export function localesForDay(): readonly BlogAutoLocale[] {
  return BLOG_AUTO_LOCALES.filter((l) => publicLocaleEnabled(l))
}

/** How many articles a week each language gets — the queue's refill target reads this. */
export function weeklyShare(): Record<BlogAutoLocale, number> {
  return { he: 7, en: 7, es: 7, 'pt-BR': 7, fr: 7, it: 7, ja: 7, de: 7, nl: 7, pl: 7 }
}
