import { buildHreflangAlternates } from '@/lib/seo/hreflang'
import { marketingBreadcrumbSchema } from '@/lib/seo/page-schema'
import { getPublicDictionary } from '@/lib/i18n/getPublicDictionary'

export const metadata = {
  title: 'Preise - Go Top SEO',
  description: 'Flexible Tarife, um die Positionen bei Google und die Sichtbarkeit in der KI zu messen. Mit sieben Tagen kostenloser Testphase und ohne Bindung.',
  openGraph: {
    title: 'Preise - Go Top SEO',
    description: 'Flexible Tarife, um die Positionen bei Google und die Sichtbarkeit in der KI zu messen',
    url: 'https://www.gotopseo.com/de/pricing',
    type: 'website',
  },
  alternates: {
    canonical: 'https://www.gotopseo.com/de/pricing',
    languages: buildHreflangAlternates('/pricing', '/en/pricing', '/es/pricing'),
  },
}

// One source for the trail and its markup (lib/seo/page-schema.ts),
// so the two cannot drift apart.
const breadcrumbSchema = marketingBreadcrumbSchema('de', '/pricing', getPublicDictionary('de').nav.pricing)

export default function GermanPricingLayout({ children }: { children: React.ReactNode }) {
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
