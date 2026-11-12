import { FeaturePage } from '@/components/public/FeaturePage'
import { marketingPageMetadata } from '@/lib/i18n/public/pages/marketing-page'
import { MAPS_POSTS_PAGE } from '@/lib/i18n/public/pages/maps-posts'

export const metadata = marketingPageMetadata(MAPS_POSTS_PAGE, 'ko')

export default function MapsPostsFeaturePage() {
  return <FeaturePage locale="ko" content={MAPS_POSTS_PAGE.content['ko']} path="/features/google-maps-posts" />
}
