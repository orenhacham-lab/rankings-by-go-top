import { FeaturePage } from '@/components/public/FeaturePage'
import { marketingPageMetadata } from '@/lib/i18n/public/pages/marketing-page'
import { COMPETITORS_PAGE } from '@/lib/i18n/public/pages/results'

export const metadata = marketingPageMetadata(COMPETITORS_PAGE, 'ko')

export default function CompetitorsFeaturePage() {
  return <FeaturePage locale="ko" content={COMPETITORS_PAGE.content['ko']} path="/features/competitor-tracking" />
}
