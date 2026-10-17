import { FeaturePage } from '@/components/public/FeaturePage'
import { marketingPageMetadata } from '@/lib/i18n/public/pages/marketing-page'
import { BUSINESSES_PAGE } from '@/lib/i18n/public/pages/solutions'

export const metadata = marketingPageMetadata(BUSINESSES_PAGE, 'es')

export default function BusinessesSolutionPage() {
  return <FeaturePage locale="es" content={BUSINESSES_PAGE.content['es']} path="/solutions/businesses" />
}
