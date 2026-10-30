import { FeaturePage } from '@/components/public/FeaturePage'
import { marketingPageMetadata } from '@/lib/i18n/public/pages/marketing-page'
import { COMPETITORS_PAGE } from '@/lib/i18n/public/pages/results'

export const metadata = marketingPageMetadata(COMPETITORS_PAGE, 'it')

export default function CompetitorsFeaturePage() {
  return <FeaturePage locale="it" content={COMPETITORS_PAGE.content['it']} path="/features/competitor-tracking" />
}
