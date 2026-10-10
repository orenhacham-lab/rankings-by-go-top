import { authorPersonSchema } from '@/lib/articles/authors'
import { buildHreflangAlternates } from '@/lib/seo/hreflang'
import { marketingBreadcrumbSchema } from '@/lib/seo/page-schema'
import { ABOUT_BREADCRUMB } from '@/lib/i18n/public/pages/breadcrumb-labels'

export const metadata = {
  title: 'About Go Top SEO',
  description: 'Discover the story of Go Top SEO - a Google rank tracking and AI visibility platform built on 11+ years of digital experience. Professional, transparent, results-focused.',
  openGraph: {
    title: 'About Go Top SEO',
    description: 'Google rank tracking and AI visibility platform built with 11+ years of digital expertise',
    url: 'https://www.gotopseo.com/en/about',
    type: 'website',
  },
  alternates: {
    canonical: 'https://www.gotopseo.com/en/about',
    languages: buildHreflangAlternates('/about', '/en/about', '/es/about'),
  },
}

// The trail the PAGE prints, from the one shared label, so the markup and
// the visible trail cannot drift: each used to carry its own literal.
const breadcrumbSchema = marketingBreadcrumbSchema('en', '/about', ABOUT_BREADCRUMB['en'])

// The Person the articles' JSON-LD points here with `url`. Without it the
// link lands on a page that never says who the author is.
const personSchema = authorPersonSchema('אורן חכם', 'en')

export default function EnglishAboutLayout({ children }: { children: React.ReactNode }) {
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
