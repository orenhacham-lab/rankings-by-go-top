import type { Metadata } from 'next'
import { FeaturesIndexPage } from '@/components/public/FeaturesIndexPage'
import { getPublicDictionary } from '@/lib/i18n/getPublicDictionary'
import { FEATURES_INDEX_COPY } from '@/lib/i18n/public/features-index'
import { buildHreflangAlternates } from '@/lib/seo/hreflang'

/** The hub above the twelve feature pages. Its words: components/public/FeaturesIndexPage.tsx. */
export const metadata: Metadata = {
  title: `${getPublicDictionary('en').nav.features} | Go Top SEO`,
  description: FEATURES_INDEX_COPY['en'].metaDescription,
  alternates: {
    canonical: 'https://www.gotopseo.com/en/features',
    languages: buildHreflangAlternates('/features', '/en/features', '/es/features'),
  },
}

export default function EnFeaturesPage() {
  return <FeaturesIndexPage locale="en" />
}
