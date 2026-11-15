import type { Metadata } from 'next'
import { FeaturesIndexPage } from '@/components/public/FeaturesIndexPage'
import { getPublicDictionary } from '@/lib/i18n/getPublicDictionary'
import { FEATURES_INDEX_COPY } from '@/lib/i18n/public/features-index'
import { buildHreflangAlternates } from '@/lib/seo/hreflang'

/** The hub above the twelve feature pages. Its words: components/public/FeaturesIndexPage.tsx. */
export const metadata: Metadata = {
  title: `${getPublicDictionary('pl').nav.features} | Go Top SEO`,
  description: FEATURES_INDEX_COPY['pl'].metaDescription,
  alternates: {
    canonical: 'https://www.gotopseo.com/pl/features',
    languages: buildHreflangAlternates('/features', '/en/features', '/es/features'),
  },
}

export default function PlFeaturesPage() {
  return <FeaturesIndexPage locale="pl" />
}
