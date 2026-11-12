import { authorPersonSchema } from '@/lib/articles/authors'
import { SOCIAL_PREVIEW_IMAGE } from '@/lib/seo/social-preview'
import { buildHreflangAlternates } from '@/lib/seo/hreflang'
import { marketingBreadcrumbSchema } from '@/lib/seo/page-schema'
import { ABOUT_BREADCRUMB } from '@/lib/i18n/public/pages/breadcrumb-labels'

export const metadata = {
  title: '회사 소개 - Go Top SEO',
  description: 'Go Top SEO 이야기입니다. 디지털 마케팅 11년 이상의 경험으로 만든, Google 순위와 AI 노출을 측정하는 플랫폼입니다.',
  openGraph: {
    images: [SOCIAL_PREVIEW_IMAGE],
    title: '회사 소개 - Go Top SEO',
    description: '디지털 마케팅 11년 이상의 경험으로 만든, Google 순위와 AI 노출을 측정하는 플랫폼',
    url: 'https://www.gotopseo.com/ko/about',
    type: 'website',
  },
  alternates: {
    canonical: 'https://www.gotopseo.com/ko/about',
    languages: buildHreflangAlternates('/about', '/en/about', '/es/about'),
  },
}

// The trail the PAGE prints, from the one shared label, so the markup and
// the visible trail cannot drift: each used to carry its own literal.
const breadcrumbSchema = marketingBreadcrumbSchema('ko', '/about', ABOUT_BREADCRUMB['ko'])

// The Person the articles' JSON-LD points here with `url`. Without it the
// link lands on a page that never says who the author is.
const personSchema = authorPersonSchema('אורן חכם', 'ko')

export default function KoreanAboutLayout({ children }: { children: React.ReactNode }) {
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
