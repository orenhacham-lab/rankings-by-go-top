/**
 * The seeding scan's first run for a store that was just installed: stage A
 * with trigger 'shopify_install', and no address to type — a merchant who
 * installed the app is already connected.
 *
 * WHERE. Four routes call scheduleShopifySeedScan right before they answer,
 * and it hands the work to next/server's `after()`, so no install or sync
 * response is slower by anything but that call:
 *
 *   app/api/shopify/link/complete    an App Store install, linked to a project
 *   app/api/shopify/oauth/callback   a store connected from the website
 *   app/api/shopify/app-home         the embedded app of a connected store —
 *                                    for an App Store merchant, the first load
 *                                    after choosing a plan is when the account
 *                                    becomes entitled
 *   app/api/shopify/sync             products and collections have just landed
 *                                    in shopify_entities
 *
 * WHETHER. Gated exactly like POST /api/projects/[id]/seed: the feature on
 * (ENABLE_SEED_SCAN=true) or an administrator; the account entitled
 * (explainAccess — admin first, then Shopify governance, then a trial or a
 * subscription); the route's caps (checkSeedCaps: a live run, the rescan
 * cooldown, this user's and everyone's runs today). And one automatic run per
 * new project: only a project that never had a seed run of any kind, whose
 * store was connected within INSTALL_WINDOW_MS. A reinstall, a re-auth, a
 * second sync or the hundredth load of the embedded app finds the project's run
 * and stops there; two calls at once meet in createSeedRun's single flight.
 *
 * With the feature off for this merchant nothing happens: the embedded app's
 * route already knows the role and schedules nothing; the other three read the
 * role once, after their response, and stop.
 *
 * WHAT. The run is created with its lease held. Then the store is made
 * readable: when none of its products or collections was synced yet, the
 * store's own sync runs once — the same one as the Sync button, with the
 * scopes the app already has; nothing is written to Shopify — and the shop's
 * name is noted. Then stage A is worked (shopify-steps.ts) inside the route's
 * work window; what does not fit is left to the cron, like any run. Stage B
 * starts only from the merchant's `continue`, as for any project.
 *
 * The copy of every run started here is English: the language the Shopify
 * surface is declared in (lib/i18n/request-locale.ts routeContentLocale).
 *
 * Every query names the owner — the user the shop is linked to. A log line
 * carries ids and stable codes only.
 */
import { isAdminUser } from '@/lib/auth/admin-role'
import { normalizeCheckUrl } from '@/lib/free-check'
import { routeContentLocale } from '@/lib/i18n/request-locale'
import type { Locale } from '@/lib/i18n/locales'
import { loadShopifyConnection } from '@/lib/shopify/api-auth'
import { testShopifyConnection } from '@/lib/shopify/client'
import { runShopifySync } from '@/lib/shopify/sync'
import type { ShopifyCredentials } from '@/lib/shopify/types'
import { explainAccess } from '@/lib/subscription'
import type { ServiceRoleClient } from '@/lib/supabase/admin'
import { projectSiteKey } from './claim'
import { checkSeedCaps } from './http'
import { runStageA, type SeedRunResult } from './runner'
import { storefrontTarget, type ShopInfo } from './shopify-steps'
import { countProjectSeedRuns, createSeedRun, renewSeedLease, STAGE_B_LEASE_MS, updateSeedStep } from './store'
import { initialSummary } from './summary'
import type { SeedScope } from './types'

/** A store counts as newly installed for this long after it was connected. */
export const INSTALL_WINDOW_MS = 7 * 24 * 60 * 60 * 1000
/**
 * The hook's routes declare maxDuration 300, which covers the request and its
 * after() work together; the work stops starting steps that could not end
 * before this, counted from the request's start — the seed route's own window
 * (app/api/projects/[id]/seed WORK_WINDOW_MS).
 */
export const SHOPIFY_WORK_WINDOW_MS = 275_000
/**
 * The lease held while the store is made readable, a sync included: longer
 * than the route's whole life, so the cron never takes the run over midway.
 * The runner renews it to the stage's own lease before every step.
 */
export const PREPARE_LEASE_MS = STAGE_B_LEASE_MS

export type ShopifySeedSource = 'link' | 'oauth' | 'app_home' | 'sync'

export type ShopifySeedInput = {
  /** The route's service-role client. Every query below names the owner. */
  admin: ServiceRoleClient
  source: ShopifySeedSource
  /** The user the shop is linked to. */
  userId: string
  projectId: string
  /** The connection the caller acted on; another live row means the call is stale. */
  connectionId?: string | null
  /** The role, when the caller already read it (the embedded app's route). */
  isAdmin?: boolean
  /** The shop's name, when the caller already has it (the OAuth callback's own test). */
  shopName?: string | null
  /** When the request began (Date.now() at the top of its handler): the work window counts from it. */
  startedAt?: number
}

type LoadedConnection = Awaited<ReturnType<typeof loadShopifyConnection>>

export type ShopifySeedDeps = {
  isAdmin: (admin: ServiceRoleClient, userId: string) => Promise<boolean>
  /** The existing entitlement decision (lib/subscription.ts explainAccess). */
  access: (admin: ServiceRoleClient, userId: string) => Promise<{ allowed: boolean; authority: string }>
  /** The connection's credentials (lib/shopify/api-auth.ts): the one place tokens are resolved. */
  loadConnection: (admin: ServiceRoleClient, projectId: string) => Promise<LoadedConnection>
  /** The store's existing sync (lib/shopify/sync.ts), as the Sync button runs it. */
  sync: (admin: ServiceRoleClient, loaded: Extract<LoadedConnection, { creds: unknown }>) => Promise<{ ok: boolean }>
  /** The shop's own name, or null. */
  shopName: (creds: ShopifyCredentials) => Promise<string | null>
  runStage: (args: { admin: ServiceRoleClient; scope: SeedScope; runId: string; lease: string; deadlineAt: number }) => Promise<SeedRunResult>
  now: () => Date
  env: Record<string, string | undefined>
}

export function shopifySeedDeps(overrides: Partial<ShopifySeedDeps> = {}): ShopifySeedDeps {
  return {
    isAdmin: (admin, userId) => isAdminUser(admin, userId),
    access: (admin, userId) => explainAccess(userId, admin),
    loadConnection: (admin, projectId) => loadShopifyConnection(admin, projectId),
    sync: (admin, loaded) => runShopifySync(admin, loaded.connection, loaded.creds),
    shopName: async (creds) => (await testShopifyConnection(creds)).shopName ?? null,
    runStage: (args) => runStageA(args),
    now: () => new Date(),
    env: process.env,
    ...overrides,
  }
}

export type ShopifySeedSkip =
  | 'already_seeded'
  | 'no_project'
  | 'no_connection'
  | 'not_connected'
  | 'not_new'
  | 'not_entitled'
  | 'entitlement_unavailable'
  | 'run_in_progress'
  | 'rescan_too_soon'
  | 'user_daily_cap'
  | 'global_daily_cap'

export type ShopifySeedOutcome =
  | { state: 'off' }
  | { state: 'skipped'; reason: ShopifySeedSkip }
  | { state: 'failed'; reason: 'internal' }
  | { state: 'started'; runId: string; synced: boolean; result: SeedRunResult }

const OFF: ShopifySeedOutcome = { state: 'off' }
const FAILED: ShopifySeedOutcome = { state: 'failed', reason: 'internal' }
const skip = (reason: ShopifySeedSkip): ShopifySeedOutcome => ({ state: 'skipped', reason })
const CAP_SKIPS: readonly ShopifySeedSkip[] = ['run_in_progress', 'rescan_too_soon', 'user_daily_cap', 'global_daily_cap']

const cleanName = (v: unknown): string | null => {
  if (typeof v !== 'string') return null
  const s = v.replace(/\s+/g, ' ').trim().slice(0, 120)
  return s || null
}

type OwnProject = { id: string; user_id: string; target_domain: string | null }
type OwnConnection = {
  id: string
  user_id: string
  project_id: string
  shop_domain: string
  storefront_domain: string | null
  connection_status: string
  created_at: string
}

async function readProject(admin: ServiceRoleClient, scope: SeedScope): Promise<OwnProject | null | 'error'> {
  const { data, error } = await admin
    .from('projects')
    .select('id, user_id, target_domain')
    .eq('id', scope.projectId)
    .eq('user_id', scope.userId)
    .maybeSingle()
  if (error) return 'error'
  return (data as OwnProject | null) ?? null
}

/** The project's live store connection, the owner's. */
async function readConnection(admin: ServiceRoleClient, scope: SeedScope): Promise<OwnConnection | null | 'error'> {
  const { data, error } = await admin
    .from('shopify_connections')
    .select('id, user_id, project_id, shop_domain, storefront_domain, connection_status, created_at')
    .eq('project_id', scope.projectId)
    .eq('user_id', scope.userId)
    .is('archived_at', null)
    .maybeSingle()
  if (error) return 'error'
  return (data as OwnConnection | null) ?? null
}

/** Whether any active product or collection of this store was synced; an unreadable count reads as none. */
async function hasCatalog(admin: ServiceRoleClient, scope: SeedScope, connectionId: string): Promise<boolean> {
  const { count, error } = await admin
    .from('shopify_entities')
    .select('id', { count: 'exact', head: true })
    .eq('project_id', scope.projectId)
    .eq('user_id', scope.userId)
    .eq('connection_id', connectionId)
    .eq('is_active', true)
    .in('entity_type', ['product', 'collection'])
  return !error && (count ?? 0) > 0
}

/**
 * Make the store readable: its catalog synced once if nothing of it was yet
 * (never from the sync route, which just did), and its name. Best effort —
 * a1 reads whatever is there.
 */
async function prepareStore(
  input: ShopifySeedInput,
  scope: SeedScope,
  shop: ShopInfo,
  deps: ShopifySeedDeps,
): Promise<{ shop: ShopInfo; synced: boolean }> {
  const needSync = input.source !== 'sync' && !(await hasCatalog(input.admin, scope, shop.connectionId ?? ''))
  if (!needSync && shop.name) return { shop, synced: false }
  let loaded: LoadedConnection
  try {
    loaded = await deps.loadConnection(input.admin, scope.projectId)
  } catch {
    return { shop, synced: false }
  }
  // The same store and the same owner the run was created for, or nothing.
  if ('error' in loaded || loaded.connection.id !== shop.connectionId || loaded.connection.user_id !== scope.userId) return { shop, synced: false }
  let synced = false
  if (needSync) {
    try {
      synced = (await deps.sync(input.admin, loaded)).ok === true
    } catch {
      synced = false
    }
  }
  let name = shop.name
  if (!name) {
    try {
      name = cleanName(await deps.shopName(loaded.creds))
    } catch {
      name = null
    }
  }
  return { shop: { ...shop, name }, synced }
}

/** The whole decision and the run, after the route's response. */
export async function startShopifySeedScan(input: ShopifySeedInput, deps: ShopifySeedDeps, deadlineAt: number): Promise<ShopifySeedOutcome> {
  const { admin, userId } = input
  const scope: SeedScope = { projectId: input.projectId, userId }

  // 1. On for this merchant: the flag, or an administrator — the seed route's rule.
  if (deps.env.ENABLE_SEED_SCAN !== 'true') {
    let isAdmin = input.isAdmin === true
    if (input.isAdmin === undefined) {
      try {
        isAdmin = await deps.isAdmin(admin, userId)
      } catch {
        isAdmin = false
      }
    }
    if (!isAdmin) return OFF
  }

  // 2. One automatic run per project, ever: any run at all and this is done.
  const prior = await countProjectSeedRuns(admin, scope)
  if (prior === 'error') return FAILED
  if (prior > 0) return skip('already_seeded')

  // 3. The owner's project and its live store connection, connected.
  const project = await readProject(admin, scope)
  if (project === 'error') return FAILED
  if (!project) return skip('no_project')
  const connection = await readConnection(admin, scope)
  if (connection === 'error') return FAILED
  if (!connection || (input.connectionId && connection.id !== input.connectionId)) return skip('no_connection')
  if (connection.connection_status !== 'connected') return skip('not_connected')

  // 4. A new install: the store was connected within the window.
  const now = deps.now()
  const connectedAt = Date.parse(connection.created_at)
  if (!Number.isFinite(connectedAt) || connectedAt < now.getTime() - INSTALL_WINDOW_MS) return skip('not_new')

  // 5. Entitled, by the existing decision: admin first, then Shopify, then a plan.
  const access = await deps.access(admin, userId)
  if (access.authority === 'unreadable') return skip('entitlement_unavailable')
  if (!access.allowed) return skip('not_entitled')

  // 6. The seed route's caps.
  const caps = await checkSeedCaps(admin, scope, now, deps.env)
  if (!caps.ok) {
    const code = CAP_SKIPS.find((c) => c === caps.code)
    return code ? skip(code) : FAILED
  }
  if (caps.priorRuns > 0) return skip('already_seeded')

  // 7. The run, its lease held; of two calls at once, one gets it.
  const shop: ShopInfo = {
    connectionId: connection.id,
    name: cleanName(input.shopName),
    shopDomain: connection.shop_domain,
    storefrontDomain: connection.storefront_domain,
  }
  const target = storefrontTarget(project.target_domain, shop)
  const admitted = normalizeCheckUrl(target)
  const locale: Locale = routeContentLocale('/shopify/app') ?? 'en'
  const summary = initialSummary({
    source: 'scan',
    domain: projectSiteKey(target) ?? target.slice(0, 253),
    url: admitted.ok ? admitted.url.toString() : target.slice(0, 2_000),
    locale,
  })
  const created = await createSeedRun(admin, scope, { trigger: 'shopify_install', stage: 'a', summary, stepDetail: { a1: { mode: 'shopify', shop } }, now })
  if (!created.ok) return created.reason === 'in_progress' ? skip('run_in_progress') : FAILED
  const runId = created.run.id
  const lease = (await renewSeedLease(admin, scope, runId, created.lease, deps.now(), PREPARE_LEASE_MS)) ?? created.lease

  // 8. The store made readable, and what a1 needs to know about it.
  const prepared = await prepareStore(input, scope, shop, deps)
  if (prepared.shop.name !== shop.name || prepared.synced) {
    await updateSeedStep(admin, scope, runId, 'a1', { status: 'pending', detail: { mode: 'shopify', shop: prepared.shop, synced: prepared.synced } })
  }

  // 9. Stage A, inside the work window; the cron continues whatever is left.
  const result = await deps.runStage({ admin, scope, runId, lease, deadlineAt })
  return { state: 'started', runId, synced: prepared.synced, result }
}

const errorName = (err: unknown) => (err instanceof Error ? err.name : typeof err)

/** Nothing is said about the steady states (off, already seeded, an old store). */
const QUIET: readonly string[] = ['off', 'already_seeded', 'not_new']

/**
 * Called by the four routes right before they answer. Hands the work to
 * `schedule` — next/server's `after` — and returns whether it did. Off, for a
 * caller that already knows this is not an administrator, it schedules nothing.
 * It never throws: whatever happens here, the route answers as it would have.
 */
export function scheduleShopifySeedScan(
  schedule: (task: () => Promise<void>) => void,
  input: ShopifySeedInput,
  overrides: Partial<ShopifySeedDeps> = {},
): boolean {
  try {
    const deps = shopifySeedDeps(overrides)
    if (deps.env.ENABLE_SEED_SCAN !== 'true' && input.isAdmin === false) return false
    // From the request's start; a missing or future start reads as now.
    const handOver = deps.now().getTime()
    const startedAt = typeof input.startedAt === 'number' && Number.isFinite(input.startedAt) && input.startedAt <= handOver ? input.startedAt : handOver
    const deadlineAt = startedAt + SHOPIFY_WORK_WINDOW_MS
    schedule(async () => {
      try {
        const outcome = await startShopifySeedScan(input, deps, deadlineAt)
        const code = outcome.state === 'skipped' || outcome.state === 'failed' ? outcome.reason : outcome.state
        if (outcome.state === 'started') {
          console.log('[seed-shopify] run started', { runId: outcome.runId, projectId: input.projectId, source: input.source, synced: outcome.synced })
        } else if (!QUIET.includes(code)) {
          console.log('[seed-shopify] not started', { projectId: input.projectId, source: input.source, state: outcome.state, code })
        }
      } catch (err) {
        console.error('[seed-shopify] crashed', { projectId: input.projectId, source: input.source, error: errorName(err) })
      }
    })
    return true
  } catch (err) {
    console.error('[seed-shopify] not scheduled', { projectId: input.projectId, source: input.source, error: errorName(err) })
    return false
  }
}
