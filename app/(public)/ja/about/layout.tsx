import { authorPersonSchema } from '@/lib/articles/authors'
import { buildHreflangAlternates } from '@/lib/seo/hreflang'
import { marketingBreadcrumbSchema } from '@/lib/seo/page-schema'
import { ABOUT_BREADCRUMB } from '@/lib/i18n/public/pages/breadcrumb-labels'

export const metadata = {
  title: '会社情報 - Go Top SEO',
  description: 'Go Top SEOのこれまで。Googleでの検索順位とAIでの可視性を計測するプラットフォームで、デジタル領域での11年以上の実務の上に作られています。',
  openGraph: {
    title: '会社情報 - Go Top SEO',
    description: 'Googleでの検索順位とAIでの可視性を計測するプラットフォームです。デジタル領域での11年以上の実務があります',
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
