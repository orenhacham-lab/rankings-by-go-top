/**
 * The retired automation screen.
 *
 * "Topics" and "automation" are one tab now, the content strategy tab. This address
 * only forwards, to that tab's list view at its ideas section (the publishing queue
 * sits right below it), with every parameter (projectId, lang, and `section`, the
 * ideas sub-tab) carried over. See lib/content/strategy/view.ts for the rules and why
 * they can never leave the site.
 *
 * It lives OUTSIDE the (dashboard) route group on purpose, like the retired Search
 * Console screen: a redirect thrown inside that group's Suspense boundary would be
 * streamed and performed by the browser; here it is a plain HTTP 307.
 */
import { redirect } from 'next/navigation'
import { legacyAutomationRedirect } from '@/lib/content/strategy/view'

export default async function AutomationScreenPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  redirect(legacyAutomationRedirect(await searchParams))
}
