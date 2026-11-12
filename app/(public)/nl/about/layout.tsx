import { authorPersonSchema } from '@/lib/articles/authors'
import { buildHreflangAlternates } from '@/lib/seo/hreflang'
import { marketingBreadcrumbSchema } from '@/lib/seo/page-schema'
import { ABOUT_BREADCRUMB } from '@/lib/i18n/public/pages/breadcrumb-labels'
import { SOCIAL_PREVIEW_IMAGE } from '@/lib/seo/social-preview'

export const metadata = {
  title: 'Over ons - Go Top SEO',
  description: 'Het verhaal van Go Top SEO. Een platform dat de posities in Google en de zichtbaarheid in AI meet, gebouwd op meer dan elf jaar werk in digitale marketing.',
  openGraph: {
    images: [SOCIAL_PREVIEW_IMAGE],
    title: 'Over ons - Go Top SEO',
    description: 'Een platform dat de posities in Google en de zichtbaarheid in AI meet, met meer dan elf jaar werk in digitale marketing',
    url: 'https://www.gotopseo.com/nl/about',
    type: 'website',
  },
  alternates: {
    canonical: 'https://www.gotopseo.com/nl/about',
    languages: buildHreflangAlternates('/about', '/en/about', '/es/about'),
  },
}

// The trail the PAGE prints, from the one shared label, so the markup and
// the visible trail cannot drift: each used to carry its own literal.
const breadcrumbSchema = marketingBreadcrumbSchema('nl', '/about', ABOUT_BREADCRUMB['nl'])

// The Person the articles' JSON-LD points here with `url`. Without it the
// link lands on a page that never says who the author is.
const personSchema = authorPersonSchema('אורן חכם', 'nl')

export default function DutchAboutLayout({ children }: { children: React.ReactNode }) {
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
