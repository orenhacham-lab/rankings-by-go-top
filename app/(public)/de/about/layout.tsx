import { authorPersonSchema } from '@/lib/articles/authors'
import { buildHreflangAlternates } from '@/lib/seo/hreflang'
import { marketingBreadcrumbSchema } from '@/lib/seo/page-schema'
import { ABOUT_BREADCRUMB } from '@/lib/i18n/public/pages/breadcrumb-labels'

export const metadata = {
  title: 'Über uns - Go Top SEO',
  description: 'Die Geschichte von Go Top SEO. Eine Plattform, die die Positionen bei Google und die Sichtbarkeit in der KI misst, gebaut auf mehr als elf Jahren Arbeit im Digitalen.',
  openGraph: {
    title: 'Über uns - Go Top SEO',
    description: 'Eine Plattform, die die Positionen bei Google und die Sichtbarkeit in der KI misst, mit mehr als elf Jahren Arbeit im Digitalen',
    url: 'https://www.gotopseo.com/de/about',
    type: 'website',
  },
  alternates: {
    canonical: 'https://www.gotopseo.com/de/about',
    languages: buildHreflangAlternates('/about', '/en/about', '/es/about'),
  },
}

// The trail the PAGE prints, from the one shared label, so the markup and
// the visible trail cannot drift: each used to carry its own literal.
const breadcrumbSchema = marketingBreadcrumbSchema('de', '/about', ABOUT_BREADCRUMB['de'])

// The Person the articles' JSON-LD points here with `url`. Without it the
// link lands on a page that never says who the author is.
const personSchema = authorPersonSchema('אורן חכם', 'de')

export default function GermanAboutLayout({ children }: { children: React.ReactNode }) {
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
