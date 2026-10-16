import { FeaturePage } from '@/components/public/FeaturePage'
import { marketingPageMetadata } from '@/lib/i18n/public/pages/marketing-page'
import { MAPS_POSTS_PAGE } from '@/lib/i18n/public/pages/maps-posts'

export const metadata = marketingPageMetadata(MAPS_POSTS_PAGE, 'he')

export default function MapsPostsFeaturePage() {
  return <FeaturePage locale="he" content={MAPS_POSTS_PAGE.content['he']} path="/features/google-maps-posts" />
}
