import { buildHreflangAlternates } from '@/lib/seo/hreflang'
import { marketingBreadcrumbSchema } from '@/lib/seo/page-schema'
import { getPublicDictionary } from '@/lib/i18n/getPublicDictionary'

export const metadata = {
  title: '가격 - Go Top SEO',
  description: 'Google 순위와 AI 노출을 측정하는 유연한 요금제입니다. 7일 무료 체험, 약정 없음.',
  openGraph: {
    title: '가격 - Go Top SEO',
    description: 'Google 순위와 AI 노출을 측정하는 유연한 요금제',
    url: 'https://www.gotopseo.com/ko/pricing',
    type: 'website',
  },
  alternates: {
    canonical: 'https://www.gotopseo.com/ko/pricing',
    languages: buildHreflangAlternates('/pricing', '/en/pricing', '/es/pricing'),
  },
}

// One source for the trail and its markup (lib/seo/page-schema.ts),
// so the two cannot drift apart.
const breadcrumbSchema = marketingBreadcrumbSchema('ko', '/pricing', getPublicDictionary('ko').nav.pricing)

export default function KoreanPricingLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbSchema) }}
      />
      {children}
    </>
  )
}
