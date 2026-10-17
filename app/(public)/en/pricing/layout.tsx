import { buildHreflangAlternates } from '@/lib/seo/hreflang'
import { marketingBreadcrumbSchema } from '@/lib/seo/page-schema'
import { getPublicDictionary } from '@/lib/i18n/getPublicDictionary'

export const metadata = {
  title: 'Pricing - Go Top SEO',
  description: 'Flexible pricing plans for Google rank tracking and AI visibility. Free 7-day trial, no commitment. Plans starting from $79/month.',
  openGraph: {
    title: 'Pricing - Go Top SEO',
    description: 'Flexible pricing plans for Google rank tracking and AI visibility monitoring',
    url: 'https://www.gotopseo.com/en/pricing',
    type: 'website',
  },
  alternates: {
    canonical: 'https://www.gotopseo.com/en/pricing',
    languages: buildHreflangAlternates('/pricing', '/en/pricing', '/es/pricing'),
  },
}

// One source for the trail and its markup (lib/seo/page-schema.ts),
// so the two cannot drift apart.
const breadcrumbSchema = marketingBreadcrumbSchema('en', '/pricing', getPublicDictionary('en').nav.pricing)

export default function EnglishPricingLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbSchema) }}
      />
      {children}
    </>
  )
}
