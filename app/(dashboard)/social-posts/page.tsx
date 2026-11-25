/**
 * Posts on Facebook and Instagram: connect Facebook, pick the Page, write or
 * draft a post, approve it, publish or schedule it.
 *
 * Hidden: without META_POSTS_ENABLED this route is a 404, whatever the
 * build-time mirror says (lib/meta-posts/config.ts).
 */
import { notFound } from 'next/navigation'
import { isMetaPostsEnabled } from '@/lib/meta-posts/config'
import MetaPostsView from '@/components/meta-posts/MetaPostsView'

export const dynamic = 'force-dynamic'

export default function SocialPostsPage() {
  if (!isMetaPostsEnabled()) notFound()
  return <MetaPostsView />
}
