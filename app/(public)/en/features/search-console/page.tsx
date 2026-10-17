import { FeaturePage } from '@/components/public/FeaturePage'
import { marketingPageMetadata } from '@/lib/i18n/public/pages/marketing-page'
import { SEARCH_CONSOLE_PAGE } from '@/lib/i18n/public/pages/results'

export const metadata = marketingPageMetadata(SEARCH_CONSOLE_PAGE, 'en')

export default function SearchConsoleFeaturePage() {
  return <FeaturePage locale="en" content={SEARCH_CONSOLE_PAGE.content['en']} path="/features/search-console" />
}
