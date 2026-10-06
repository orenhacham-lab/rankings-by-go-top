/**
 * A public page written once for all four languages: its path (the same under
 * every language prefix), its title and description per language, and its
 * FeaturePage content per language. Each route file is then a few lines that
 * pick its language, so a page can never exist in one tree with copy that
 * drifted from the others.
 */
import type { Metadata } from 'next'
import type { FeaturePageContent } from '@/components/public/FeaturePage'
import { LOCALE_PREFIX, type PublicLocale } from '@/lib/i18n/locales'
import { buildHreflangAlternates } from '@/lib/seo/hreflang'

const SITE_URL = 'https://www.gotopseo.com'

export type MarketingPage = {
  /** The path after the language prefix, e.g. `/solutions/agencies`. */
  path: string
  meta: Record<PublicLocale, { title: string; description: string }>
  content: Record<PublicLocale, FeaturePageContent>
}

export function marketingPageMetadata(page: MarketingPage, locale: PublicLocale): Metadata {
  return {
    title: page.meta[locale].title,
    description: page.meta[locale].description,
    alternates: {
      canonical: `${SITE_URL}${LOCALE_PREFIX[locale]}${page.path}`,
      languages: buildHreflangAlternates(page.path, `/en${page.path}`, `/es${page.path}`),
    },
  }
}
