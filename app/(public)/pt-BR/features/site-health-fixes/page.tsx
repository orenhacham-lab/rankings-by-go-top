import { FeaturePage } from '@/components/public/FeaturePage'
import { marketingPageMetadata } from '@/lib/i18n/public/pages/marketing-page'
import { SITE_FIXES_PAGE } from '@/lib/i18n/public/pages/site-fixes'

export const metadata = marketingPageMetadata(SITE_FIXES_PAGE, 'pt-BR')

export default function SiteFixesFeaturePage() {
  return <FeaturePage locale="pt-BR" content={SITE_FIXES_PAGE.content['pt-BR']} />
}
