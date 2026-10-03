import { buildHreflangAlternates } from '@/lib/seo/hreflang'

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

const breadcrumbSchema = {
  '@context': 'https://schema.org',
  '@type': 'BreadcrumbList',
  itemListElement: [
    {
      '@type': 'ListItem',
      position: 1,
      name: 'Inicio',
      item: 'https://www.gotopseo.com/es',
    },
    {
      '@type': 'ListItem',
      position: 2,
      name: 'Precios',
      item: 'https://www.gotopseo.com/es/pricing',
    },
  ],
}

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
