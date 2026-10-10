import { authorPersonSchema } from '@/lib/articles/authors'
import { buildHreflangAlternates } from '@/lib/seo/hreflang'

export const metadata = {
  title: 'Sobre o Go Top SEO',
  description: 'A história do Go Top SEO: uma plataforma de acompanhamento de posições no Google e de visibilidade em IA construída sobre mais de 11 anos de experiência digital.',
  openGraph: {
    title: 'Sobre o Go Top SEO',
    description: 'Plataforma de acompanhamento de posições no Google e de visibilidade em IA, com mais de 11 anos de experiência digital por trás',
    url: 'https://www.gotopseo.com/pt-BR/about',
    type: 'website',
  },
  alternates: {
    canonical: 'https://www.gotopseo.com/pt-BR/about',
    languages: buildHreflangAlternates('/about', '/en/about', '/es/about'),
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
      name: 'Quem somos',
      item: 'https://www.gotopseo.com/pt-BR/about',
    },
  ],
}

// The Person the articles' JSON-LD points here with `url`. Without it the
// link lands on a page that never says who the author is.
const personSchema = authorPersonSchema('אורן חכם', 'pt-BR')

export default function PortugueseAboutLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbSchema) }}
      />
      {personSchema && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(personSchema) }}
        />
      )}
      {children}
    </>
  )
}
