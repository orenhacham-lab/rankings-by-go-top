import { FeaturePage } from '@/components/public/FeaturePage'
import { marketingPageMetadata } from '@/lib/i18n/public/pages/marketing-page'
import { SHOPIFY_PAGE } from '@/lib/i18n/public/pages/solutions'

export const metadata = marketingPageMetadata(SHOPIFY_PAGE, 'fr')

export default function ShopifySolutionPage() {
  return <FeaturePage locale="fr" content={SHOPIFY_PAGE.content['fr']} path="/solutions/shopify" />
}
