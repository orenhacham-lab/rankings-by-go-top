import { Metadata } from 'next'
import AffiliateGuidePage from '@/components/public/AffiliateGuidePage'
import { AFFILIATE_CLUSTER } from '@/lib/i18n/public/affiliate-cluster'
import { buildHreflangAlternates } from '@/lib/seo/hreflang'

const C = AFFILIATE_CLUSTER.ko.marketing

export const metadata: Metadata = {
  title: C.metaTitle,
  description: C.metaDescription,
  alternates: {
    canonical: 'https://www.gotopseo.com/ko/affiliates/affiliate-marketing',
    languages: buildHreflangAlternates('/affiliates/affiliate-marketing', '/en/affiliates/affiliate-marketing', '/es/affiliates/affiliate-marketing'),
  },
}

export default function Page() {
  return <AffiliateGuidePage locale="ko" page="marketing" />
}
