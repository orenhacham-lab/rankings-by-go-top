import { authorPersonSchema } from '@/lib/articles/authors'
import { buildHreflangAlternates } from '@/lib/seo/hreflang'
import { marketingBreadcrumbSchema } from '@/lib/seo/page-schema'
import { ABOUT_BREADCRUMB } from '@/lib/i18n/public/pages/breadcrumb-labels'

export const metadata = {
  title: 'Chi siamo - Go Top SEO',
  description: 'La storia di Go Top SEO: una piattaforma per il monitoraggio della posizione in Google e della visibilità nelle IA, costruita su oltre 11 anni di esperienza nel digitale.',
  openGraph: {
    title: 'Chi siamo - Go Top SEO',
    description: 'Piattaforma per il monitoraggio della posizione in Google e della visibilità nelle IA, con oltre 11 anni di esperienza nel digitale alle spalle',
    url: 'https://www.gotopseo.com/ja/about',
    type: 'website',
  },
  alternates: {
    canonical: 'https://www.gotopseo.com/ja/about',
    languages: buildHreflangAlternates('/about', '/en/about', '/es/about'),
  },
}

// The trail the PAGE prints, from the one shared label, so the markup and
// the visible trail cannot drift: each used to carry its own literal.
const breadcrumbSchema = marketingBreadcrumbSchema('ja', '/about', ABOUT_BREADCRUMB['ja'])

// The Person the articles' JSON-LD points here with `url`. Without it the
// link lands on a page that never says who the author is.
const personSchema = authorPersonSchema('אורן חכם', 'ja')

export default function JapaneseAboutLayout({ children }: { children: React.ReactNode }) {
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
