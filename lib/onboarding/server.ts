/**
 * The real dependencies of the onboarding screens' server halves: the session,
 * the merchant's RLS-scoped client, the service role (used only for the
 * administrator check and the claim look-up, both filtered), the claim cookie
 * and the environment. The decisions themselves are in ./surfaces.ts.
 */
import { cookies } from 'next/headers'
import { isAdminUser } from '@/lib/auth/admin-role'
import { isContentModuleEnabled } from '@/lib/content/api-auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { SEED_CLAIM_COOKIE } from './claim-cookie'
import { peekSeedClaim } from './claim-peek'
import {
  resolveNewProjectSurface,
  resolveSummarySurface,
  type NewProjectSurface,
  type SummarySurface,
  type SurfaceDeps,
} from './surfaces'

async function liveDeps(): Promise<SurfaceDeps> {
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
}

export async function loadNewProjectSurface(): Promise<NewProjectSurface> {
  const deps = await liveDeps()
  const store = await cookies()
  return resolveNewProjectSurface({
    ...deps,
    claimCookie: store.get(SEED_CLAIM_COOKIE)?.value ?? null,
    peekClaim: (admin, token, now) => peekSeedClaim(admin, token, now),
  })
}

export async function loadSummarySurface(projectId: string): Promise<SummarySurface | null> {
  const deps = await liveDeps()
  return resolveSummarySurface(projectId, { ...deps, contentEnabled: isContentModuleEnabled() })
}
