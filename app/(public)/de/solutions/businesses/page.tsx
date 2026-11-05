import { FeaturePage } from '@/components/public/FeaturePage'
import { marketingPageMetadata } from '@/lib/i18n/public/pages/marketing-page'
import { BUSINESSES_PAGE } from '@/lib/i18n/public/pages/solutions'

export const metadata = marketingPageMetadata(BUSINESSES_PAGE, 'de')

export default function BusinessesSolutionPage() {
  return <FeaturePage locale="de" content={BUSINESSES_PAGE.content['de']} path="/solutions/businesses" />
}
