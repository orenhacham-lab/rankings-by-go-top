import { buildHreflangAlternates } from '@/lib/seo/hreflang'
import { marketingBreadcrumbSchema } from '@/lib/seo/page-schema'
import { getPublicDictionary } from '@/lib/i18n/getPublicDictionary'

export const metadata = {
  title: 'Preços - Go Top SEO',
  description: 'Planos flexíveis para o acompanhamento de posições no Google e a visibilidade em IA. Teste gratuito de 7 dias, sem compromisso.',
  openGraph: {
    title: 'Preços - Go Top SEO',
    description: 'Planos flexíveis para o acompanhamento de posições no Google e a visibilidade em IA',
    url: 'https://www.gotopseo.com/pt-BR/pricing',
    type: 'website',
  },
  alternates: {
    canonical: 'https://www.gotopseo.com/pt-BR/pricing',
    languages: buildHreflangAlternates('/pricing', '/en/pricing', '/es/pricing'),
  },
}

// One source for the trail and its markup (lib/seo/page-schema.ts),
// so the two cannot drift apart.
const breadcrumbSchema = marketingBreadcrumbSchema('pt-BR', '/pricing', getPublicDictionary('pt-BR').nav.pricing)

export default function PortuguesePricingLayout({ children }: { children: React.ReactNode }) {
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
