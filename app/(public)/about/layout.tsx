import { authorPersonSchema } from '@/lib/articles/authors'
import { buildHreflangAlternates } from '@/lib/seo/hreflang'
import { marketingBreadcrumbSchema } from '@/lib/seo/page-schema'
import { ABOUT_BREADCRUMB } from '@/lib/i18n/public/pages/breadcrumb-labels'

export const metadata = {
  title: 'עמוד אודות - Go Top SEO',
  description: 'גלו הכל על Go Top SEO - מערכת מעקב מיקומים בגוגל ונראות ב-AI המהפכנית. עקוב אחר דירוגיך בגוגל אורגני, מפות וAI כמו ChatGPT ו-Gemini.',
  openGraph: {
    title: 'עמוד אודות - Go Top SEO',
    description: 'מערכת מעקב מיקומים בגוגל ונראות ב-AI. עקוב אחר דירוגיך בגוגל אורגני, מפות וAI',
    url: 'https://www.gotopseo.com/about',
    type: 'website',
  },
  alternates: {
    canonical: 'https://www.gotopseo.com/about',
    languages: buildHreflangAlternates('/about', '/en/about', '/es/about'),
  },
}

// The trail the PAGE prints, from the one shared label, so the markup and
// the visible trail cannot drift: each used to carry its own literal.
const breadcrumbSchema = marketingBreadcrumbSchema('he', '/about', ABOUT_BREADCRUMB['he'])

// The Person the articles' JSON-LD points here with `url`. Without it the
// link lands on a page that never says who the author is.
const personSchema = authorPersonSchema('אורן חכם', 'he')

export default function AboutLayout({ children }: { children: React.ReactNode }) {
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
