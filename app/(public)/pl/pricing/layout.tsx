import { buildHreflangAlternates } from '@/lib/seo/hreflang'
import { marketingBreadcrumbSchema } from '@/lib/seo/page-schema'
import { getPublicDictionary } from '@/lib/i18n/getPublicDictionary'

export const metadata = {
  title: 'Cennik - Go Top SEO',
  description: 'Elastyczne pakiety do mierzenia pozycji w Google i widoczności w AI. Z siedmioma dniami darmowego okresu próbnego i bez zobowiązań.',
  openGraph: {
    title: 'Cennik - Go Top SEO',
    description: 'Elastyczne pakiety do mierzenia pozycji w Google i widoczności w AI',
    url: 'https://www.gotopseo.com/pl/pricing',
    type: 'website',
  },
  alternates: {
    canonical: 'https://www.gotopseo.com/pl/pricing',
    languages: buildHreflangAlternates('/pricing', '/en/pricing', '/es/pricing'),
  },
}

// One source for the trail and its markup (lib/seo/page-schema.ts),
// so the two cannot drift apart.
const breadcrumbSchema = marketingBreadcrumbSchema('pl', '/pricing', getPublicDictionary('pl').nav.pricing)

export default function PolishPricingLayout({ children }: { children: React.ReactNode }) {
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
