import { FeaturePage } from '@/components/public/FeaturePage'
import { marketingPageMetadata } from '@/lib/i18n/public/pages/marketing-page'
import { SHOPIFY_PAGE } from '@/lib/i18n/public/pages/solutions'

export const metadata = marketingPageMetadata(SHOPIFY_PAGE, 'en')

export default function ShopifySolutionPage() {
  return <FeaturePage locale="en" content={SHOPIFY_PAGE.content['en']} />
}
