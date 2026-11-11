import { Metadata } from 'next'
import { ComparisonPage } from '@/components/public/ComparisonPage'
import { buildHreflangAlternates } from '@/lib/seo/hreflang'
import { BOOSTER_COMPARE } from '@/lib/i18n/public/compare/booster'

const COPY = BOOSTER_COMPARE['ja']
const PATH = '/compare/booster'

export const metadata: Metadata = {
  title: COPY.metaTitle,
  description: COPY.metaDescription,
  alternates: {
    canonical: `https://www.gotopseo.com/ja${PATH}`,
    languages: buildHreflangAlternates(PATH, `/en${PATH}`, `/es${PATH}`),
  },
}

export default function BoosterComparePageJa() {
  return <ComparisonPage locale="ja" copy={COPY} path={PATH} />
}
