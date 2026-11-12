import { FeaturePage } from '@/components/public/FeaturePage'
import { marketingPageMetadata } from '@/lib/i18n/public/pages/marketing-page'
import { BUSINESS_PROFILE_PAGE } from '@/lib/i18n/public/pages/business-profile'

export const metadata = marketingPageMetadata(BUSINESS_PROFILE_PAGE, 'pt-BR')

export default function BusinessProfileFeaturePage() {
  return <FeaturePage locale="pt-BR" content={BUSINESS_PROFILE_PAGE.content['pt-BR']} path="/features/google-business-profile" />
}
