import { authorPersonSchema } from '@/lib/articles/authors'
import { buildHreflangAlternates } from '@/lib/seo/hreflang'
import { marketingBreadcrumbSchema } from '@/lib/seo/page-schema'
import { ABOUT_BREADCRUMB } from '@/lib/i18n/public/pages/breadcrumb-labels'

export const metadata = {
  title: 'À propos de Go Top SEO',
  description: "L’histoire de Go Top SEO : une plateforme de suivi de position dans Google et de visibilité dans les IA, construite sur plus de 11 ans d’expérience du digital.",
  openGraph: {
    title: 'À propos de Go Top SEO',
    description: "Plateforme de suivi de position dans Google et de visibilité dans les IA, avec plus de 11 ans d’expérience du digital derrière elle",
    url: 'https://www.gotopseo.com/fr/about',
    type: 'website',
  },
  alternates: {
    canonical: 'https://www.gotopseo.com/fr/about',
    languages: buildHreflangAlternates('/about', '/en/about', '/es/about'),
  },
}

// The trail the PAGE prints, from the one shared label, so the markup and
// the visible trail cannot drift: each used to carry its own literal.
const breadcrumbSchema = marketingBreadcrumbSchema('fr', '/about', ABOUT_BREADCRUMB['fr'])

// The Person the articles' JSON-LD points here with `url`. Without it the
// link lands on a page that never says who the author is.
const personSchema = authorPersonSchema('אורן חכם', 'fr')

export default function FrenchAboutLayout({ children }: { children: React.ReactNode }) {
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
