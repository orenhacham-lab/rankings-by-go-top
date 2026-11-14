import { Metadata } from 'next'
import AffiliateGuidePage from '@/components/public/AffiliateGuidePage'
import { AFFILIATE_CLUSTER } from '@/lib/i18n/public/affiliate-cluster'
import { buildHreflangAlternates } from '@/lib/seo/hreflang'

const C = AFFILIATE_CLUSTER.es.choosing

export const metadata: Metadata = {
  title: C.metaTitle,
  description: C.metaDescription,
  alternates: {
    canonical: 'https://www.gotopseo.com/es/affiliates/choosing-a-program',
    languages: buildHreflangAlternates('/affiliates/choosing-a-program', '/en/affiliates/choosing-a-program', '/es/affiliates/choosing-a-program'),
  },
}

export default function Page() {
  return <AffiliateGuidePage locale="es" page="choosing" />
}
