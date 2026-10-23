import { FeaturePage } from '@/components/public/FeaturePage'
import { marketingPageMetadata } from '@/lib/i18n/public/pages/marketing-page'
import { AGENCIES_PAGE } from '@/lib/i18n/public/pages/solutions'

export const metadata = marketingPageMetadata(AGENCIES_PAGE, 'it')

export default function AgenciesSolutionPage() {
  return <FeaturePage locale="it" content={AGENCIES_PAGE.content['it']} path="/solutions/agencies" />
}
