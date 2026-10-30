import { Metadata } from 'next'
import { ComparisonPage } from '@/components/public/ComparisonPage'
import { buildHreflangAlternates } from '@/lib/seo/hreflang'
import { YOAST_COMPARE } from '@/lib/i18n/public/compare/yoast'

const COPY = YOAST_COMPARE['pt-BR']
const PATH = '/compare/yoast'

export const metadata: Metadata = {
  title: COPY.metaTitle,
  description: COPY.metaDescription,
  alternates: {
    canonical: `https://www.gotopseo.com/pt-BR${PATH}`,
    languages: buildHreflangAlternates(PATH, `/en${PATH}`, `/es${PATH}`),
  },
}

export default function YoastComparePagePtBr() {
  return <ComparisonPage locale="pt-BR" copy={COPY} path={PATH} />
}
