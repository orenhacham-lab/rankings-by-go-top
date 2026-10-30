import { buildHreflangAlternates } from '@/lib/seo/hreflang'
import { marketingBreadcrumbSchema } from '@/lib/seo/page-schema'
import { getPublicDictionary } from '@/lib/i18n/getPublicDictionary'

export const metadata = {
  title: 'Prezzi - Go Top SEO',
  description: 'Piani flessibili per il monitoraggio della posizione in Google e la visibilità nelle IA. Prova gratuita di 7 giorni, senza vincoli.',
  openGraph: {
    title: 'Prezzi - Go Top SEO',
    description: 'Piani flessibili per il monitoraggio della posizione in Google e la visibilità nelle IA',
    url: 'https://www.gotopseo.com/ja/pricing',
    type: 'website',
  },
  alternates: {
    canonical: 'https://www.gotopseo.com/ja/pricing',
    languages: buildHreflangAlternates('/pricing', '/en/pricing', '/es/pricing'),
  },
}

// One source for the trail and its markup (lib/seo/page-schema.ts),
// so the two cannot drift apart.
const breadcrumbSchema = marketingBreadcrumbSchema('ja', '/pricing', getPublicDictionary('ja').nav.pricing)

export default function JapanesePricingLayout({ children }: { children: React.ReactNode }) {
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
