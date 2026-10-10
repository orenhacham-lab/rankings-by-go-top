/**
 * WHICH LANGUAGE TODAY'S ARTICLE IS WRITTEN IN.
 *
 * One article a day, but not one language a day. The number of keywords with
 * real monthly searches in Hebrew, in this niche and this country, does not hold
 * 365 articles a year: past a few dozen, new articles would be competing with
 * our own older ones for the same query. Rotating languages keeps every
 * published article on a keyword somebody actually searches, and multiplies the
 * pool by the number of languages the blog has.
 *
 * Hebrew gets four days because Israel is the market that pays. English two,
 * Spanish one.
 *
 * `pt-BR` is deliberately NOT in the rotation: the article generator's
 * ContentLanguage (lib/content/language.ts) is he | en | es, so there is no way
 * to generate Portuguese without teaching the whole customer content layer a
 * fourth language. The blog's Portuguese tree keeps the articles written by
 * hand until that is done.
 *
 * Pure: no I/O.
 */

import { localWeekday, DEFAULT_TIMEZONE } from '@/lib/content/automation/schedule'

/** The languages this runner can write. A subset of PUBLIC_LOCALES. */
export const BLOG_AUTO_LOCALES = ['he', 'en', 'es'] as const
export type BlogAutoLocale = (typeof BLOG_AUTO_LOCALES)[number]

/** Sunday = 0 … Saturday = 6, in Israel's week. */
export const LOCALE_BY_WEEKDAY: readonly BlogAutoLocale[] = [
  'he', // Sunday
  'en', // Monday
  'he', // Tuesday
  'en', // Wednesday
  'he', // Thursday
  'es', // Friday
  'he', // Saturday
]

export function isBlogAutoLocale(value: unknown): value is BlogAutoLocale {
  return BLOG_AUTO_LOCALES.includes(value as BlogAutoLocale)
}

/** The language of the article due on the day `instant` falls on. */
export function localeForDay(instant: number = Date.now(), timeZone: string = DEFAULT_TIMEZONE): BlogAutoLocale {
  return LOCALE_BY_WEEKDAY[localWeekday(instant, timeZone)]
}

/** How many articles a week each language gets — the queue's refill target reads this. */
export function weeklyShare(): Record<BlogAutoLocale, number> {
  const share = { he: 0, en: 0, es: 0 }
  for (const locale of LOCALE_BY_WEEKDAY) share[locale] += 1
  return share
}
