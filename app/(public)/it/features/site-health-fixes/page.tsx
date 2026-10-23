import { FeaturePage } from '@/components/public/FeaturePage'
import { marketingPageMetadata } from '@/lib/i18n/public/pages/marketing-page'
import { SITE_FIXES_PAGE } from '@/lib/i18n/public/pages/site-fixes'

export const metadata = marketingPageMetadata(SITE_FIXES_PAGE, 'it')

export default function SiteFixesFeaturePage() {
  return <FeaturePage locale="it" content={SITE_FIXES_PAGE.content['it']} path="/features/site-health-fixes" />
}
