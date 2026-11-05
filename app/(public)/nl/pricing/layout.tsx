import { buildHreflangAlternates } from '@/lib/seo/hreflang'
import { marketingBreadcrumbSchema } from '@/lib/seo/page-schema'
import { getPublicDictionary } from '@/lib/i18n/getPublicDictionary'

export const metadata = {
  title: 'Prijzen - Go Top SEO',
  description: 'Flexibele pakketten om de posities in Google en de zichtbaarheid in AI te meten. Met zeven dagen gratis uitproberen en zonder verplichting.',
  openGraph: {
    title: 'Prijzen - Go Top SEO',
    description: 'Flexibele pakketten om de posities in Google en de zichtbaarheid in AI te meten',
    url: 'https://www.gotopseo.com/nl/pricing',
    type: 'website',
  },
  alternates: {
    canonical: 'https://www.gotopseo.com/nl/pricing',
    languages: buildHreflangAlternates('/pricing', '/en/pricing', '/es/pricing'),
  },
}

// One source for the trail and its markup (lib/seo/page-schema.ts),
// so the two cannot drift apart.
const breadcrumbSchema = marketingBreadcrumbSchema('nl', '/pricing', getPublicDictionary('nl').nav.pricing)

export default function DutchPricingLayout({ children }: { children: React.ReactNode }) {
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
