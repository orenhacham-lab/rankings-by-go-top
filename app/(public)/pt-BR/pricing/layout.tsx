import { buildHreflangAlternates } from '@/lib/seo/hreflang'

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

const breadcrumbSchema = {
  '@context': 'https://schema.org',
  '@type': 'BreadcrumbList',
  itemListElement: [
    {
      '@type': 'ListItem',
      position: 1,
      name: 'Início',
      item: 'https://www.gotopseo.com/pt-BR',
    },
    {
      '@type': 'ListItem',
      position: 2,
      name: 'Preços',
      item: 'https://www.gotopseo.com/pt-BR/pricing',
    },
  ],
}

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
