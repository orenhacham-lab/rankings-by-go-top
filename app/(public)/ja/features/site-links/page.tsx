import { FeaturePage } from '@/components/public/FeaturePage'
import { marketingPageMetadata } from '@/lib/i18n/public/pages/marketing-page'
import { SITE_LINKS_PAGE } from '@/lib/i18n/public/pages/site-links'

export const metadata = marketingPageMetadata(SITE_LINKS_PAGE, 'ja')

export default function SiteLinksFeaturePage() {
  return <FeaturePage locale="ja" content={SITE_LINKS_PAGE.content['ja']} path="/features/site-links" />
}
