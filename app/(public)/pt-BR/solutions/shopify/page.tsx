import { FeaturePage } from '@/components/public/FeaturePage'
import { marketingPageMetadata } from '@/lib/i18n/public/pages/marketing-page'
import { SHOPIFY_PAGE } from '@/lib/i18n/public/pages/solutions'

export const metadata = marketingPageMetadata(SHOPIFY_PAGE, 'pt-BR')

export default function ShopifySolutionPage() {
  return <FeaturePage locale="pt-BR" content={SHOPIFY_PAGE.content['pt-BR']} />
}
