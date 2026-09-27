/**
 * The retired Search Console screen.
 *
 * Search Console is not a screen any more: its data feeds the screens that already
 * exist and its connection is a section of the project's settings. The address only
 * forwards: a connection result to that settings section, anything else to keyword
 * research, with every parameter (projectId, lang) carried over. See
 * lib/active-project/project-page-redirect.ts for the rules and why they can never
 * leave the site.
 *
 * It lives OUTSIDE the (dashboard) route group on purpose, like the retired project
 * page. That group's layout wraps every page in a Suspense boundary, and a redirect
 * thrown inside one is streamed and performed by the browser after the shell has
 * rendered. Here the redirect is a plain HTTP 307, before anything renders.
 */
import { redirect } from 'next/navigation'
import { searchConsoleScreenRedirect } from '@/lib/active-project/project-page-redirect'

export default async function SearchConsoleScreenPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  redirect(searchConsoleScreenRedirect(await searchParams))
}
