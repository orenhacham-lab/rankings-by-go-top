import { FeaturePage } from '@/components/public/FeaturePage'
import { marketingPageMetadata } from '@/lib/i18n/public/pages/marketing-page'
import { COMPETITORS_PAGE } from '@/lib/i18n/public/pages/results'

export const metadata = marketingPageMetadata(COMPETITORS_PAGE, 'en')

export default function CompetitorsFeaturePage() {
  return <FeaturePage locale="en" content={COMPETITORS_PAGE.content['en']} path="/features/competitor-tracking" />
}
