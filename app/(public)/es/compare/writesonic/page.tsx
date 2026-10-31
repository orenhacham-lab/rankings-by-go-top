import { Metadata } from 'next'
import { ComparisonPage } from '@/components/public/ComparisonPage'
import { buildHreflangAlternates } from '@/lib/seo/hreflang'
import { WRITESONIC_COMPARE } from '@/lib/i18n/public/compare/writesonic'

const COPY = WRITESONIC_COMPARE['es']
const PATH = '/compare/writesonic'

export const metadata: Metadata = {
  title: COPY.metaTitle,
  description: COPY.metaDescription,
  alternates: {
    canonical: `https://www.gotopseo.com/es${PATH}`,
    languages: buildHreflangAlternates(PATH, `/en${PATH}`, `/es${PATH}`),
  },
}

export default function WritesonicComparePageEs() {
  return <ComparisonPage locale="es" copy={COPY} path={PATH} />
}
