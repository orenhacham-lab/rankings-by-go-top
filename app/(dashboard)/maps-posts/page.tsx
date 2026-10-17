/**
 * Posts on Google Maps: connect the Google business profile, pick the location,
 * write (or draft with AI) a post with a photo and a button, publish or schedule.
 *
 * Hidden: without GBP_POSTS_ENABLED this route is a 404, whatever the build-time
 * mirror says. The server flag is the only one that counts (lib/gbp/config.ts).
 */
import { notFound } from 'next/navigation'
import { isGbpPostsEnabled } from '@/lib/gbp/config'
import MapsPostsView from '@/components/maps-posts/MapsPostsView'

export const dynamic = 'force-dynamic'

export default function MapsPostsPage() {
  if (!isGbpPostsEnabled()) notFound()
  return <MapsPostsView />
}
