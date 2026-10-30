import { Metadata } from 'next'
import { ComparisonPage } from '@/components/public/ComparisonPage'
import { buildHreflangAlternates } from '@/lib/seo/hreflang'
import { RANKMATH_COMPARE } from '@/lib/i18n/public/compare/rankmath'

const COPY = RANKMATH_COMPARE['es']
const PATH = '/compare/rankmath'

export const metadata: Metadata = {
  title: COPY.metaTitle,
  description: COPY.metaDescription,
  alternates: {
    canonical: `https://www.gotopseo.com/es${PATH}`,
    languages: buildHreflangAlternates(PATH, `/en${PATH}`, `/es${PATH}`),
  },
}

export default function RankMathComparePageEs() {
  return <ComparisonPage locale="es" copy={COPY} path={PATH} />
}
