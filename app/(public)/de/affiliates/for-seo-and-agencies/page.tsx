import { Metadata } from 'next'
import AffiliateGuidePage from '@/components/public/AffiliateGuidePage'
import { AFFILIATE_CLUSTER } from '@/lib/i18n/public/affiliate-cluster'
import { buildHreflangAlternates } from '@/lib/seo/hreflang'

const C = AFFILIATE_CLUSTER.de.agencies

export const metadata: Metadata = {
  title: C.metaTitle,
  description: C.metaDescription,
  alternates: {
    canonical: 'https://www.gotopseo.com/de/affiliates/for-seo-and-agencies',
    languages: buildHreflangAlternates('/affiliates/for-seo-and-agencies', '/en/affiliates/for-seo-and-agencies', '/es/affiliates/for-seo-and-agencies'),
  },
}

export default function Page() {
  return <AffiliateGuidePage locale="de" page="agencies" />
}
