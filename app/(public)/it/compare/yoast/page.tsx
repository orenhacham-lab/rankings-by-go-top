import { Metadata } from 'next'
import { ComparisonPage } from '@/components/public/ComparisonPage'
import { buildHreflangAlternates } from '@/lib/seo/hreflang'
import { YOAST_COMPARE } from '@/lib/i18n/public/compare/yoast'

const COPY = YOAST_COMPARE['it']
const PATH = '/compare/yoast'

export const metadata: Metadata = {
  title: COPY.metaTitle,
  description: COPY.metaDescription,
  alternates: {
    canonical: `https://www.gotopseo.com/it${PATH}`,
    languages: buildHreflangAlternates(PATH, `/en${PATH}`, `/es${PATH}`),
  },
}

export default function YoastComparePageIt() {
  return <ComparisonPage locale="it" copy={COPY} path={PATH} />
}
