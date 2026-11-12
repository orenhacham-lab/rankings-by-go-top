import { FeaturePage } from '@/components/public/FeaturePage'
import { marketingPageMetadata } from '@/lib/i18n/public/pages/marketing-page'
import { BUSINESS_PROFILE_PAGE } from '@/lib/i18n/public/pages/business-profile'

export const metadata = marketingPageMetadata(BUSINESS_PROFILE_PAGE, 'de')

export default function BusinessProfileFeaturePage() {
  return <FeaturePage locale="de" content={BUSINESS_PROFILE_PAGE.content['de']} path="/features/google-business-profile" />
}
