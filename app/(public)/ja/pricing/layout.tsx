import { buildHreflangAlternates } from '@/lib/seo/hreflang'
import { marketingBreadcrumbSchema } from '@/lib/seo/page-schema'
import { getPublicDictionary } from '@/lib/i18n/getPublicDictionary'

export const metadata = {
  title: '料金 - Go Top SEO',
  description: 'Googleでの検索順位とAIでの可視性を計測するための、柔軟なプランです。7日間の無料トライアルがあり、継続の縛りはありません。',
  openGraph: {
    title: '料金 - Go Top SEO',
    description: 'Googleでの検索順位とAIでの可視性を計測するための、柔軟なプランです',
    url: 'https://www.gotopseo.com/ja/pricing',
    type: 'website',
  },
  alternates: {
    canonical: 'https://www.gotopseo.com/ja/pricing',
    languages: buildHreflangAlternates('/pricing', '/en/pricing', '/es/pricing'),
  },
}

// One source for the trail and its markup (lib/seo/page-schema.ts),
// so the two cannot drift apart.
const breadcrumbSchema = marketingBreadcrumbSchema('ja', '/pricing', getPublicDictionary('ja').nav.pricing)

export default function JapanesePricingLayout({ children }: { children: React.ReactNode }) {
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
