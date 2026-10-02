/**
 * The retired project page.
 *
 * Its sections are workspace tabs now (keywords, AI visibility, settings), and the
 * address only forwards to the right one. It stays an address because the Shopify
 * app home's "Open dashboard" link, the Shopify and Search Console connection
 * flows and merchants' bookmarks all point here. See
 * lib/active-project/project-page-redirect.ts for where each link lands and why
 * that can never leave the site.
 *
 * It lives OUTSIDE the (dashboard) route group on purpose. That group's layout
 * wraps every page in a Suspense boundary, and a redirect thrown inside one is
 * streamed and performed by the browser after the shell has rendered. Here the
 * redirect is a plain HTTP 307, before anything renders. Sign-in and the
 * subscription gate still run first, in proxy.ts, as for every /projects path.
 */
import { redirect } from 'next/navigation'
import { projectPageRedirect } from '@/lib/active-project/project-page-redirect'

export default async function ProjectPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const { id } = await params
  redirect(projectPageRedirect(id, await searchParams))
}
