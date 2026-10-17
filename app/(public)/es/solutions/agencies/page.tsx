import { FeaturePage } from '@/components/public/FeaturePage'
import { marketingPageMetadata } from '@/lib/i18n/public/pages/marketing-page'
import { AGENCIES_PAGE } from '@/lib/i18n/public/pages/solutions'

export const metadata = marketingPageMetadata(AGENCIES_PAGE, 'es')

export default function AgenciesSolutionPage() {
  return <FeaturePage locale="es" content={AGENCIES_PAGE.content['es']} path="/solutions/agencies" />
}
