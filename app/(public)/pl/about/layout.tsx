import { authorPersonSchema } from '@/lib/articles/authors'
import { buildHreflangAlternates } from '@/lib/seo/hreflang'
import { marketingBreadcrumbSchema } from '@/lib/seo/page-schema'
import { ABOUT_BREADCRUMB } from '@/lib/i18n/public/pages/breadcrumb-labels'
import { SOCIAL_PREVIEW_IMAGE } from '@/lib/seo/social-preview'

export const metadata = {
  title: 'O nas - Go Top SEO',
  description: 'Historia Go Top SEO. Platforma, która mierzy pozycje w Google i widoczność w AI, zbudowana na ponad jedenastu latach pracy w marketingu cyfrowym.',
  openGraph: {
    images: [SOCIAL_PREVIEW_IMAGE],
    title: 'O nas - Go Top SEO',
    description: 'Platforma, która mierzy pozycje w Google i widoczność w AI, z ponad jedenastoma latami pracy w marketingu cyfrowym',
    url: 'https://www.gotopseo.com/pl/about',
    type: 'website',
  },
  alternates: {
    canonical: 'https://www.gotopseo.com/pl/about',
    languages: buildHreflangAlternates('/about', '/en/about', '/es/about'),
  },
}

// The trail the PAGE prints, from the one shared label, so the markup and
// the visible trail cannot drift: each used to carry its own literal.
const breadcrumbSchema = marketingBreadcrumbSchema('pl', '/about', ABOUT_BREADCRUMB['pl'])

// The Person the articles' JSON-LD points here with `url`. Without it the
// link lands on a page that never says who the author is.
const personSchema = authorPersonSchema('אורן חכם', 'pl')

export default function PolishAboutLayout({ children }: { children: React.ReactNode }) {
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
