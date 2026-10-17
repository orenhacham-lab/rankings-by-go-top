import { FeaturePage } from '@/components/public/FeaturePage'
import { marketingPageMetadata } from '@/lib/i18n/public/pages/marketing-page'
import { COMPETITORS_PAGE } from '@/lib/i18n/public/pages/results'

export const metadata = marketingPageMetadata(COMPETITORS_PAGE, 'he')

export default function CompetitorsFeaturePage() {
  return <FeaturePage locale="he" content={COMPETITORS_PAGE.content['he']} path="/features/competitor-tracking" />
}
