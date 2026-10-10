import { buildHreflangAlternates } from '@/lib/seo/hreflang'
import { marketingBreadcrumbSchema } from '@/lib/seo/page-schema'
import { getPublicDictionary } from '@/lib/i18n/getPublicDictionary'

export const metadata = {
  title: 'Precios - Go Top SEO',
  description: 'Planes flexibles para el seguimiento de posiciones en Google y la visibilidad en IA. Prueba gratuita de 7 días, sin compromiso.',
  openGraph: {
    title: 'Precios - Go Top SEO',
    description: 'Planes flexibles para el seguimiento de posiciones en Google y la visibilidad en IA',
    url: 'https://www.gotopseo.com/es/pricing',
    type: 'website',
  },
  alternates: {
    canonical: 'https://www.gotopseo.com/es/pricing',
    languages: buildHreflangAlternates('/pricing', '/en/pricing', '/es/pricing'),
  },
}

// One source for the trail and its markup (lib/seo/page-schema.ts),
// so the two cannot drift apart.
const breadcrumbSchema = marketingBreadcrumbSchema('es', '/pricing', getPublicDictionary('es').nav.pricing)

export default function SpanishPricingLayout({ children }: { children: React.ReactNode }) {
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
