import { FeaturePage } from '@/components/public/FeaturePage'
import { marketingPageMetadata } from '@/lib/i18n/public/pages/marketing-page'
import { BUSINESS_PROFILE_PAGE } from '@/lib/i18n/public/pages/business-profile'

export const metadata = marketingPageMetadata(BUSINESS_PROFILE_PAGE, 'it')

export default function BusinessProfileFeaturePage() {
  return <FeaturePage locale="it" content={BUSINESS_PROFILE_PAGE.content['it']} path="/features/google-business-profile" />
}
