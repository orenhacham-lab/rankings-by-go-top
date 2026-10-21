import { FeaturePage } from '@/components/public/FeaturePage'
import { marketingPageMetadata } from '@/lib/i18n/public/pages/marketing-page'
import { AGENCIES_PAGE } from '@/lib/i18n/public/pages/solutions'

export const metadata = marketingPageMetadata(AGENCIES_PAGE, 'fr')

export default function AgenciesSolutionPage() {
  return <FeaturePage locale="fr" content={AGENCIES_PAGE.content['fr']} path="/solutions/agencies" />
}
