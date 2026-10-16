import { FeaturePage } from '@/components/public/FeaturePage'
import { marketingPageMetadata } from '@/lib/i18n/public/pages/marketing-page'
import { MAPS_POSTS_PAGE } from '@/lib/i18n/public/pages/maps-posts'

export const metadata = marketingPageMetadata(MAPS_POSTS_PAGE, 'en')

export default function MapsPostsFeaturePage() {
  return <FeaturePage locale="en" content={MAPS_POSTS_PAGE.content['en']} path="/features/google-maps-posts" />
}
