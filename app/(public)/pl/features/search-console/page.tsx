import { FeaturePage } from '@/components/public/FeaturePage'
import { marketingPageMetadata } from '@/lib/i18n/public/pages/marketing-page'
import { SEARCH_CONSOLE_PAGE } from '@/lib/i18n/public/pages/results'

export const metadata = marketingPageMetadata(SEARCH_CONSOLE_PAGE, 'pl')

export default function SearchConsoleFeaturePage() {
  return <FeaturePage locale="pl" content={SEARCH_CONSOLE_PAGE.content['pl']} path="/features/search-console" />
}
