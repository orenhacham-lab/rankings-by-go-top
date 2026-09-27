/**
 * The retired topics screen.
 *
 * "Topics" and "automation" are one tab now, the content strategy tab. This address
 * only forwards, to that tab's list view at its topics section, with every parameter
 * (projectId, lang) carried over. See lib/content/strategy/view.ts for the rules and
 * why they can never leave the site.
 *
 * It lives OUTSIDE the (dashboard) route group on purpose, like the retired Search
 * Console screen: a redirect thrown inside that group's Suspense boundary would be
 * streamed and performed by the browser; here it is a plain HTTP 307.
 */
import { redirect } from 'next/navigation'
import { legacyTopicsRedirect } from '@/lib/content/strategy/view'

export default async function TopicsScreenPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  redirect(legacyTopicsRedirect(await searchParams))
}
