import { FeaturePage } from '@/components/public/FeaturePage'
import { marketingPageMetadata } from '@/lib/i18n/public/pages/marketing-page'
import { SITE_FIXES_PAGE } from '@/lib/i18n/public/pages/site-fixes'

export const metadata = marketingPageMetadata(SITE_FIXES_PAGE, 'nl')

export default function SiteFixesFeaturePage() {
  return <FeaturePage locale="nl" content={SITE_FIXES_PAGE.content['nl']} path="/features/site-health-fixes" />
}
