import { FeaturePage } from '@/components/public/FeaturePage'
import { marketingPageMetadata } from '@/lib/i18n/public/pages/marketing-page'
import { BUSINESS_PROFILE_PAGE } from '@/lib/i18n/public/pages/business-profile'

export const metadata = marketingPageMetadata(BUSINESS_PROFILE_PAGE, 'fr')

export default function BusinessProfileFeaturePage() {
  return <FeaturePage locale="fr" content={BUSINESS_PROFILE_PAGE.content['fr']} path="/features/google-business-profile" />
}
