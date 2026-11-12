import { FeaturePage } from '@/components/public/FeaturePage'
import { marketingPageMetadata } from '@/lib/i18n/public/pages/marketing-page'
import { WORDPRESS_PAGE } from '@/lib/i18n/public/pages/solutions'

export const metadata = marketingPageMetadata(WORDPRESS_PAGE, 'ko')

export default function WordPressSolutionPage() {
  return <FeaturePage locale="ko" content={WORDPRESS_PAGE.content['ko']} path="/solutions/wordpress" />
}
