import { Metadata } from 'next'
import AffiliatesPage from '@/components/public/AffiliatesPage'
import { AFFILIATES_COPY } from '@/lib/i18n/public/affiliates'
import { buildHreflangAlternates } from '@/lib/seo/hreflang'

const C = AFFILIATES_COPY['ja']

export const metadata: Metadata = {
  title: C.metaTitle,
  description: C.metaDescription,
  alternates: {
    canonical: 'https://www.gotopseo.com/ja/affiliates',
    languages: buildHreflangAlternates('/affiliates', '/en/affiliates', '/es/affiliates'),
  },
}

export default function Page() {
  return <AffiliatesPage locale="ja" />
}
