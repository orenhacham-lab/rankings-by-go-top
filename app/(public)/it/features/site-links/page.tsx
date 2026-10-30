import { FeaturePage } from '@/components/public/FeaturePage'
import { marketingPageMetadata } from '@/lib/i18n/public/pages/marketing-page'
import { SITE_LINKS_PAGE } from '@/lib/i18n/public/pages/site-links'

export const metadata = marketingPageMetadata(SITE_LINKS_PAGE, 'it')

export default function SiteLinksFeaturePage() {
  return <FeaturePage locale="it" content={SITE_LINKS_PAGE.content['it']} path="/features/site-links" />
}
