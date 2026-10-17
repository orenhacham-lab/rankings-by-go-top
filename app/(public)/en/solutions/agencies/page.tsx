import { FeaturePage } from '@/components/public/FeaturePage'
import { marketingPageMetadata } from '@/lib/i18n/public/pages/marketing-page'
import { AGENCIES_PAGE } from '@/lib/i18n/public/pages/solutions'

export const metadata = marketingPageMetadata(AGENCIES_PAGE, 'en')

export default function AgenciesSolutionPage() {
  return <FeaturePage locale="en" content={AGENCIES_PAGE.content['en']} path="/solutions/agencies" />
}
