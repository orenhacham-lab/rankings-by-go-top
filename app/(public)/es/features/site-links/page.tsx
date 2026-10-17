import { FeaturePage } from '@/components/public/FeaturePage'
import { marketingPageMetadata } from '@/lib/i18n/public/pages/marketing-page'
import { SITE_LINKS_PAGE } from '@/lib/i18n/public/pages/site-links'

export const metadata = marketingPageMetadata(SITE_LINKS_PAGE, 'es')

export default function SiteLinksFeaturePage() {
  return <FeaturePage locale="es" content={SITE_LINKS_PAGE.content['es']} path="/features/site-links" />
}
