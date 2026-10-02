/**
 * The real dependencies of the onboarding screens' server halves: the session,
 * the merchant's RLS-scoped client, the service role (used only for the
 * administrator check and the claim look-up, both filtered), the claim cookie
 * and the environment. The decisions themselves are in ./surfaces.ts.
 *
 * The session and the summary are read once per request (React's cache): the
 * summary route's layout decides "not found" from the same read its page then
 * renders.
 */
import { cache } from 'react'
import { cookies } from 'next/headers'
import { isAdminUser } from '@/lib/auth/admin-role'
import { isContentModuleEnabled } from '@/lib/content/api-auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { SEED_CLAIM_COOKIE } from './claim-cookie'
import { peekSeedClaim } from './claim-peek'
import {
  decideSummaryGate,
  resolveNewProjectSurface,
  resolveSummarySurface,
  type NewProjectSurface,
  type SummaryGate,
  type SummarySurface,
  type SurfaceDeps,
} from './surfaces'

const liveDeps = cache(async (): Promise<SurfaceDeps> => {
  const db = await createClient()
  const { data, error } = await db.auth.getUser()
  return {
    userId: !error && data?.user ? data.user.id : null,
    db,
    admin: () => createAdminClient(),
    isAdmin: (admin, userId) => isAdminUser(admin, userId),
    env: process.env,
    now: new Date(),
  }
})

export async function loadNewProjectSurface(): Promise<NewProjectSurface> {
  const deps = await liveDeps()
  const store = await cookies()
  return resolveNewProjectSurface({
    ...deps,
    claimCookie: store.get(SEED_CLAIM_COOKIE)?.value ?? null,
    peekClaim: (admin, token, now) => peekSeedClaim(admin, token, now),
  })
}

export const loadSummarySurface = cache(async (projectId: string): Promise<SummarySurface | null> => {
  const deps = await liveDeps()
  return resolveSummarySurface(projectId, { ...deps, contentEnabled: isContentModuleEnabled() })
})

export async function loadSummaryGate(projectId: string): Promise<SummaryGate> {
  const deps = await liveDeps()
  return decideSummaryGate(deps.userId !== null, () => loadSummarySurface(projectId))
}
