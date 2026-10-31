import { Metadata } from 'next'
import { ComparisonPage } from '@/components/public/ComparisonPage'
import { buildHreflangAlternates } from '@/lib/seo/hreflang'
import { SURFER_COMPARE } from '@/lib/i18n/public/compare/surfer'

const COPY = SURFER_COMPARE['it']
const PATH = '/compare/surfer'

export const metadata: Metadata = {
  title: COPY.metaTitle,
  description: COPY.metaDescription,
  alternates: {
    canonical: `https://www.gotopseo.com/it${PATH}`,
    languages: buildHreflangAlternates(PATH, `/en${PATH}`, `/es${PATH}`),
  },
}

export default function SurferComparePageIt() {
  return <ComparisonPage locale="it" copy={COPY} path={PATH} />
}
