import { FeaturePage } from '@/components/public/FeaturePage'
import { marketingPageMetadata } from '@/lib/i18n/public/pages/marketing-page'
import { WORDPRESS_PAGE } from '@/lib/i18n/public/pages/solutions'

export const metadata = marketingPageMetadata(WORDPRESS_PAGE, 'en')

export default function WordPressSolutionPage() {
  return <FeaturePage locale="en" content={WORDPRESS_PAGE.content['en']} path="/solutions/wordpress" />
}
