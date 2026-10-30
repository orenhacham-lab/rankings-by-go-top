import { FeaturePage } from '@/components/public/FeaturePage'
import { marketingPageMetadata } from '@/lib/i18n/public/pages/marketing-page'
import { WORDPRESS_PAGE } from '@/lib/i18n/public/pages/solutions'

export const metadata = marketingPageMetadata(WORDPRESS_PAGE, 'it')

export default function WordPressSolutionPage() {
  return <FeaturePage locale="it" content={WORDPRESS_PAGE.content['it']} path="/solutions/wordpress" />
}
