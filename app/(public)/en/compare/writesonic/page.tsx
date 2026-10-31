import { Metadata } from 'next'
import { ComparisonPage } from '@/components/public/ComparisonPage'
import { buildHreflangAlternates } from '@/lib/seo/hreflang'
import { WRITESONIC_COMPARE } from '@/lib/i18n/public/compare/writesonic'

const COPY = WRITESONIC_COMPARE['en']
const PATH = '/compare/writesonic'

export const metadata: Metadata = {
  title: COPY.metaTitle,
  description: COPY.metaDescription,
  alternates: {
    canonical: `https://www.gotopseo.com/en${PATH}`,
    languages: buildHreflangAlternates(PATH, `/en${PATH}`, `/es${PATH}`),
  },
}

export default function WritesonicComparePageEn() {
  return <ComparisonPage locale="en" copy={COPY} path={PATH} />
}
