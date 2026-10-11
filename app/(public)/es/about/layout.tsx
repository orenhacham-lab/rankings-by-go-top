import { authorPersonSchema } from '@/lib/articles/authors'
import { buildHreflangAlternates } from '@/lib/seo/hreflang'
import { marketingBreadcrumbSchema } from '@/lib/seo/page-schema'
import { ABOUT_BREADCRUMB } from '@/lib/i18n/public/pages/breadcrumb-labels'

export const metadata = {
  title: 'Sobre Go Top SEO',
  description: 'La historia de Go Top SEO: una plataforma de seguimiento de posiciones en Google y de visibilidad en IA construida sobre más de 11 años de experiencia digital.',
  openGraph: {
    title: 'Sobre Go Top SEO',
    description: 'Plataforma de seguimiento de posiciones en Google y de visibilidad en IA, con más de 11 años de experiencia digital detrás',
    url: 'https://www.gotopseo.com/es/about',
    type: 'website',
  },
  alternates: {
    canonical: 'https://www.gotopseo.com/es/about',
    languages: buildHreflangAlternates('/about', '/en/about', '/es/about'),
  },
}

// The trail the PAGE prints, from the one shared label, so the markup and
// the visible trail cannot drift: each used to carry its own literal.
const breadcrumbSchema = marketingBreadcrumbSchema('es', '/about', ABOUT_BREADCRUMB['es'])

// The Person the articles' JSON-LD points here with `url`. Without it the
// link lands on a page that never says who the author is.
const personSchema = authorPersonSchema('אורן חכם', 'es')

export default function SpanishAboutLayout({ children }: { children: React.ReactNode }) {
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
