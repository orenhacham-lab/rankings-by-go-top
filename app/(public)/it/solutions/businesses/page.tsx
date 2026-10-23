import { FeaturePage } from '@/components/public/FeaturePage'
import { marketingPageMetadata } from '@/lib/i18n/public/pages/marketing-page'
import { BUSINESSES_PAGE } from '@/lib/i18n/public/pages/solutions'

export const metadata = marketingPageMetadata(BUSINESSES_PAGE, 'it')

export default function BusinessesSolutionPage() {
  return <FeaturePage locale="it" content={BUSINESSES_PAGE.content['it']} path="/solutions/businesses" />
}
