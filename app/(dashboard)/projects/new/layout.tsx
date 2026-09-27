/**
 * /projects/new with the seeding scan on: a new project from one field, the
 * site's address (components/onboarding/NewProjectFlow.tsx).
 *
 * The page beside this layout is today's form, and it is not touched. With the
 * scan off (ENABLE_SEED_SCAN is not exactly "true" and the user is not an
 * administrator) this layout renders that page as it is; with it on, the new
 * flow takes its place. lib/onboarding/surfaces.ts makes the decision, under
 * test in lib/onboarding/__qa__/onboarding-surfaces.qa.ts. If deciding fails
 * for any reason, the merchant still gets today's form; Next's own signals
 * (a redirect, a dynamic render) are passed on untouched.
 */
import type { ReactNode } from 'react'
import { unstable_rethrow } from 'next/navigation'
import NewProjectFlow from '@/components/onboarding/NewProjectFlow'
import { loadNewProjectSurface } from '@/lib/onboarding/server'
import type { NewProjectSurface } from '@/lib/onboarding/surfaces'

export default async function NewProjectLayout({ children }: { children: ReactNode }) {
  let surface: NewProjectSurface
  try {
    surface = await loadNewProjectSurface()
  } catch (err) {
    unstable_rethrow(err)
    return children
  }
  if (surface.kind === 'legacy') return children
  return <NewProjectFlow clients={surface.clients} claimedDomain={surface.claimedDomain} />
}
