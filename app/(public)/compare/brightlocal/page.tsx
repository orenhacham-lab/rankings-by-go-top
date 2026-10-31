import { Metadata } from 'next'
import { ComparisonPage } from '@/components/public/ComparisonPage'
import { buildHreflangAlternates } from '@/lib/seo/hreflang'
import { BRIGHTLOCAL_COMPARE } from '@/lib/i18n/public/compare/brightlocal'

const COPY = BRIGHTLOCAL_COMPARE['he']
const PATH = '/compare/brightlocal'

export const metadata: Metadata = {
  title: COPY.metaTitle,
  description: COPY.metaDescription,
  alternates: {
    canonical: `https://www.gotopseo.com${PATH}`,
    languages: buildHreflangAlternates(PATH, `/en${PATH}`, `/es${PATH}`),
  },
}

export default function BrightlocalComparePageHe() {
  return <ComparisonPage locale="he" copy={COPY} path={PATH} />
}
