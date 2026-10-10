/**
 * JSON-LD for the MARKETING pages — the ones that sell the software.
 *
 * The articles already had their Article, FAQPage, BreadcrumbList and Person
 * markup (lib/articles/server.ts). The forty-odd feature, solution and landing
 * pages had nothing of their own: only the site-wide Organization and
 * SoftwareApplication from app/layout.tsx, which say the same thing on every
 * URL. So the pages that carry the software keywords were the only ones a
 * crawler could not place in the site, and the questions they answer in plain
 * sight were invisible as questions.
 *
 * Everything here is built from copy that is ALREADY ON THE PAGE. Nothing is
 * invented, nothing is served to a crawler that a reader cannot see — markup
 * for some user agents only is cloaking, and we never build it.
 */
import { LOCALE_CONFIG, LOCALE_PREFIX, localeHomeHref, type PublicLocale } from '@/lib/i18n/locales'
import { getPublicDictionary } from '@/lib/i18n/getPublicDictionary'

export const SITE_URL = 'https://www.gotopseo.com'

const absolute = (path: string) => (path === '/' ? SITE_URL : `${SITE_URL}${path}`)

/**
 * The questions a page shows, as questions.
 *
 * Google retired FAQ rich results in May 2026, so this buys nothing there and
 * is not meant to; Bing and the AI engines still read FAQPage, and these are
 * the answers we would want quoted. The answer text is the visible answer.
 * Returns null for a page with no FAQ, so no page carries an empty FAQPage.
 */
export function faqPageSchema(items: readonly { q: string; a: string }[]) {
  if (items.length === 0) return null
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: items.map((item) => ({
      '@type': 'Question',
      name: item.q,
      acceptedAnswer: { '@type': 'Answer', text: item.a },
    })),
  }
}

/**
 * Where a marketing page sits: home, then the page itself.
 *
 * Two levels, not three: there is no `/features` index page, and a breadcrumb
 * may only name pages that exist. `path` is the path after the language prefix
 * (`/features/keyword-research`), the same shape `MarketingPage.path` uses, so
 * one page file states it once and the locale decides the URL.
 */
export function marketingBreadcrumbSchema(locale: PublicLocale, path: string, name: string) {
  const dict = getPublicDictionary(locale)
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: dict.nav.home, item: absolute(localeHomeHref(locale)) },
      { '@type': 'ListItem', position: 2, name, item: absolute(`${LOCALE_PREFIX[locale]}${path}`) },
    ],
  }
}

/**
 * The site itself, as an entity, tied to the Organization that publishes it.
 *
 * No `potentialAction`/SearchAction: the sitelinks search box it fed is gone
 * from Google's results, so it would be markup for a feature that no longer
 * exists. What this does is give the four language trees one named WebSite with
 * a publisher, which is how an engine (and an AI crawler reading the graph)
 * learns that Go Top SEO is published by GO TOP rather than guessing.
 */
export function websiteSchema(locale: PublicLocale, description: string) {
  return {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    '@id': `${SITE_URL}/#website`,
    name: 'Go Top SEO',
    alternateName: ['Rankings by Go Top'],
    url: absolute(localeHomeHref(locale)),
    description,
    inLanguage: LOCALE_CONFIG[locale].lang,
    publisher: { '@id': `${SITE_URL}/#organization` },
  }
}
