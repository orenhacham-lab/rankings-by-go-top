import { buildHreflangAlternates } from '@/lib/seo/hreflang'
import { marketingBreadcrumbSchema } from '@/lib/seo/page-schema'
import { getPublicDictionary } from '@/lib/i18n/getPublicDictionary'

export const metadata = {
  title: 'Tarifs - Go Top SEO',
  description: "Des formules souples pour le suivi de position dans Google et la visibilité dans les IA. Essai gratuit de 7 jours, sans engagement.",
  openGraph: {
    title: 'Tarifs - Go Top SEO',
    description: 'Des formules souples pour le suivi de position dans Google et la visibilité dans les IA',
    url: 'https://www.gotopseo.com/fr/pricing',
    type: 'website',
  },
  alternates: {
    canonical: 'https://www.gotopseo.com/fr/pricing',
    languages: buildHreflangAlternates('/pricing', '/en/pricing', '/es/pricing'),
  },
}

// One source for the trail and its markup (lib/seo/page-schema.ts),
// so the two cannot drift apart.
const breadcrumbSchema = marketingBreadcrumbSchema('fr', '/pricing', getPublicDictionary('fr').nav.pricing)

export default function FrenchPricingLayout({ children }: { children: React.ReactNode }) {
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
