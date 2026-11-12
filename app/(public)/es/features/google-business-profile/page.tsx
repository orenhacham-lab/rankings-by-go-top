import { FeaturePage } from '@/components/public/FeaturePage'
import { marketingPageMetadata } from '@/lib/i18n/public/pages/marketing-page'
import { BUSINESS_PROFILE_PAGE } from '@/lib/i18n/public/pages/business-profile'

export const metadata = marketingPageMetadata(BUSINESS_PROFILE_PAGE, 'es')

export default function BusinessProfileFeaturePage() {
  return <FeaturePage locale="es" content={BUSINESS_PROFILE_PAGE.content['es']} path="/features/google-business-profile" />
}
