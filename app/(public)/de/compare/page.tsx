import { Metadata } from 'next'
import { ComparisonIndexPage, COMPARE_INDEX_PATH } from '@/components/public/ComparisonIndexPage'
import { buildHreflangAlternates } from '@/lib/seo/hreflang'
import { COMPARE_INDEX } from '@/lib/i18n/public/compare-index'

const COPY = COMPARE_INDEX['de']
const PATH = COMPARE_INDEX_PATH

export const metadata: Metadata = {
  title: COPY.metaTitle,
  description: COPY.metaDescription,
  alternates: {
    canonical: `https://www.gotopseo.com/de${PATH}`,
    languages: buildHreflangAlternates(PATH, `/en${PATH}`, `/es${PATH}`),
  },
}

export default function ComparisonsIndexPageDe() {
  return <ComparisonIndexPage locale="de" />
}
