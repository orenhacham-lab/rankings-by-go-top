/**
 * What the two onboarding screens need from the server before they render,
 * framework-free so the decisions run under test with fakes
 * (lib/onboarding/__qa__/onboarding-surfaces.qa.ts). lib/onboarding/server.ts
 * wires the real session, clients and cookie in.
 *
 * /projects/new   — flag off: 'legacy', and the route renders today's form,
 *                   untouched. Flag on: 'flow', the one-field screen, with the
 *                   merchant's clients (the project needs one) and the site
 *                   their kept free-check token scanned, if any.
 * /projects/[id]/summary — the project's research screen, for its owner only
 *                   and only with the flag on; null means "not found". The
 *                   latest run is read here as well, through the owner's own
 *                   RLS-scoped client, so the first paint is already the right
 *                   state and a refresh never flashes an empty screen.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import type { ServiceRoleClient } from '@/lib/supabase/admin'
import { projectSiteKey } from '@/lib/seed-scan/claim'
import { seedRunView } from '@/lib/seed-scan/http'
import { getLatestSeedRun, listSeedSteps } from '@/lib/seed-scan/store'
import type { SeedRunView } from '@/lib/seed-scan/types'
import { seedScanAvailable } from './availability'
import { readClaimToken } from './claim-cookie'
import type { ClaimPeek } from './claim-peek'
import { readSiteInput } from './site-input'

export type SurfaceDeps = {
  userId: string | null
  /** The signed-in merchant's own RLS-scoped client. */
  db: SupabaseClient
  admin: () => ServiceRoleClient
  isAdmin: (admin: ServiceRoleClient, userId: string) => Promise<boolean>
  env: Record<string, string | undefined>
  now: Date
}

export type ClientChoice = { id: string; isDefault: boolean }

export type NewProjectSurface =
  | { kind: 'legacy' }
  | {
      kind: 'flow'
      /** Active clients the project may belong to; null when they could not be read. */
      clients: ClientChoice[] | null
      /** The site the kept free-check token scanned, to fill the address in; null without one. */
      claimedDomain: string | null
    }

function available(deps: SurfaceDeps, userId: string, admin: () => ServiceRoleClient): Promise<boolean> {
  return seedScanAvailable({ env: deps.env, isAdmin: () => deps.isAdmin(admin(), userId) })
}

export async function resolveNewProjectSurface(
  deps: SurfaceDeps & {
    /** The raw value of the claim cookie, if the request carried one. */
    claimCookie: string | null
    peekClaim: (admin: ServiceRoleClient, token: string, now: Date) => Promise<ClaimPeek>
  },
): Promise<NewProjectSurface> {
  const userId = deps.userId
  if (!userId) return { kind: 'legacy' }
  let adminClient: ServiceRoleClient | null = null
  const admin = () => (adminClient ??= deps.admin())
  if (!(await available(deps, userId, admin))) return { kind: 'legacy' }

  const read = await deps.db.from('clients').select('*').eq('user_id', userId).eq('is_active', true).order('name')
  const rows = read.error ? null : ((read.data as { id: unknown; is_default?: unknown }[] | null) ?? [])
  const clients = rows
    ? rows.filter((r): r is { id: string; is_default?: unknown } => typeof r.id === 'string').map((r) => ({ id: r.id, isDefault: r.is_default === true }))
    : null

  let claimedDomain: string | null = null
  const token = readClaimToken(deps.claimCookie)
  if (token) {
    const peek = await deps.peekClaim(admin(), token, deps.now)
    if (peek.state === 'usable') {
      const site = readSiteInput(peek.domain)
      claimedDomain = site.ok ? site.domain : null
    }
  }
  return { kind: 'flow', clients, claimedDomain }
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export type SummarySurface = {
  projectId: string
  /** The site, as the scan keys it (no scheme, no www). */
  domain: string
  projectName: string
  /** The content module is on, so "Write the first article" can be offered. */
  contentEnabled: boolean
  initialRun: SeedRunView | null
  /** When the server read the run, so "scanned just now" is measured from the same clock. */
  serverNow: string
}

/** Thrown when the project cannot be read at all: an outage is not a "not found". */
export class SurfaceUnavailableError extends Error {
  constructor() {
    super('onboarding_surface_unavailable')
    this.name = 'SurfaceUnavailableError'
  }
}

export async function resolveSummarySurface(
  projectId: string,
  deps: SurfaceDeps & { contentEnabled: boolean },
): Promise<SummarySurface | null> {
  const userId = deps.userId
  if (!userId || !UUID.test(projectId)) return null
  const read = await deps.db
    .from('projects')
    .select('id, user_id, name, target_domain')
    .eq('id', projectId)
    .eq('user_id', userId)
    .maybeSingle()
  if (read.error) throw new SurfaceUnavailableError()
  const project = read.data as { id: string; user_id: string; name: string | null; target_domain: string | null } | null
  if (!project || project.user_id !== userId) return null

  let adminClient: ServiceRoleClient | null = null
  const admin = () => (adminClient ??= deps.admin())
  if (!(await available(deps, userId, admin))) return null

  const scope = { projectId: project.id, userId }
  let initialRun: SeedRunView | null = null
  const run = await getLatestSeedRun(deps.db, scope)
  if (run && run !== 'error') {
    const steps = await listSeedSteps(deps.db, scope, run.id)
    if (steps !== 'error') initialRun = seedRunView(run, steps, deps.now)
  }
  const target = project.target_domain ?? ''
  return {
    projectId: project.id,
    domain: projectSiteKey(target) ?? target.slice(0, 253),
    projectName: project.name ?? '',
    contentEnabled: deps.contentEnabled,
    initialRun,
    serverNow: deps.now.toISOString(),
  }
}

/**
 * Whether /projects/[id]/summary exists for this request. It is decided in the
 * route's own layout, above the dashboard shell and its Suspense boundary, so
 * "not found" is a real 404 and not a 404 page streamed with a 200.
 *
 *   signed out        render: the dashboard shell sends them to sign in
 *   no surface        not_found: not their project, or the scan is off for them
 *   an outage         render: the page says so itself, with a refresh
 */
export type SummaryGate = 'render' | 'not_found'

export async function decideSummaryGate(signedIn: boolean, load: () => Promise<SummarySurface | null>): Promise<SummaryGate> {
  if (!signedIn) return 'render'
  try {
    return (await load()) ? 'render' : 'not_found'
  } catch (err) {
    if (err instanceof SurfaceUnavailableError) return 'render'
    throw err
  }
}
