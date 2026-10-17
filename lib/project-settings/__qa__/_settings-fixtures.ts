/**
 * Shared fixtures for the settings-screen suites: a project the REAL stage A
 * of the seeding scan has already read (lib/seed-scan/runner.ts over the
 * seed-scan suites' fake network, fake model and fake search), so the profile,
 * the audiences, the a1 signals and the a4 competitors are exactly what
 * production stores; and the dependency sets of the settings data layer and of
 * the redetect route over that database.
 *
 * Two clients share one database, as in production: the owner's (RLS-scoped
 * there, filtered by owner in the code) and the service role's, each recording
 * the tables it touched.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import { FakeAdmin } from '@/lib/__qa__/_fake-admin'
import type { BusinessInsight, InsightResult } from '@/lib/free-check'
import type { ServiceRoleClient } from '@/lib/supabase/admin'
import { runStageA } from '@/lib/seed-scan/runner'
import { createSeedRun } from '@/lib/seed-scan/store'
import { initialSummary } from '@/lib/seed-scan/summary'
import type { SeedRunTrigger, SeedScope } from '@/lib/seed-scan/types'
import {
  captureConsole,
  FakeNetwork,
  fakeModel,
  fakeSearch,
  HE_WP,
  HE_WP_INSIGHT,
  HE_WP_RESULTS,
  heWordPressSite,
  installFakeDns,
  NOW,
  PROJECT,
  projectRow,
  SECRET,
  USER,
  world,
  type Tables,
} from '@/lib/seed-scan/__qa__/_fixtures'
import type { SettingsDeps } from '../data'
import type { RedetectDeps } from '../redetect'

export { HE_WP, HE_WP_INSIGHT, NOW, PROJECT, SECRET, USER }
export { captureConsole, makeChecker, OTHER_PROJECT, OTHER_USER, projectRow, EN_SHOP_INSIGHT } from '@/lib/seed-scan/__qa__/_fixtures'
export type { Tables }

export const SCOPE: SeedScope = { projectId: PROJECT, userId: USER }
export const HOUR = 60 * 60 * 1000
type Row = Record<string, unknown>

/**
 * A service-role FakeAdmin over `tables` at `at`, with the one column default
 * the seed store relies on: project_seed_runs.created_at is now() of the
 * insert (as the seed-scan suites' `world()` simulates it).
 */
export function seedAdmin(tables: Tables, at: Date): ServiceRoleClient {
  const fake = new FakeAdmin(tables, {}, () => at.getTime())
  const from = fake.from.bind(fake)
  ;(fake as unknown as { from: (name: string) => unknown }).from = (name: string) => {
    const query = from(name) as unknown as { insert: (payload: unknown) => unknown }
    if (name === 'project_seed_runs') {
      const insert = query.insert.bind(query)
      query.insert = (payload: unknown) => {
        const withDefault = (row: Row) => (row.created_at !== undefined ? row : { ...row, created_at: at.toISOString() })
        return insert(Array.isArray(payload) ? payload.map(withDefault) : withDefault(payload as Row))
      }
    }
    return query
  }
  return fake as unknown as ServiceRoleClient
}

/**
 * Run the real stage A of one scan over `tables` (the Hebrew WordPress site),
 * answering the model with `insight`. Returns the run's id.
 */
export async function scan(
  tables: Tables,
  opts: { trigger?: SeedRunTrigger; at?: Date; insight?: BusinessInsight | InsightResult } = {},
): Promise<string> {
  installFakeDns()
  const at = opts.at ?? NOW
  const admin = seedAdmin(tables, at)
  const answer: InsightResult =
    opts.insight && 'ok' in opts.insight ? opts.insight : { ok: true, insight: (opts.insight as BusinessInsight | undefined) ?? HE_WP_INSIGHT }
  const created = await createSeedRun(admin, SCOPE, {
    trigger: opts.trigger ?? 'create',
    stage: 'a',
    summary: initialSummary({ source: 'scan', domain: HE_WP.key, url: 'https://plumber-tlv.co.il/', locale: 'he' }),
    now: at,
  })
  if (!created.ok) throw new Error(`createSeedRun: ${created.reason}`)
  const net = new FakeNetwork(heWordPressSite())
  await captureConsole(() =>
    runStageA({
      admin,
      scope: SCOPE,
      runId: created.run.id,
      lease: created.lease,
      deps: { fetchImpl: net.fetch, insight: fakeModel(answer).fn, search: fakeSearch(HE_WP_RESULTS).fn, now: () => at },
    }),
  )
  return created.run.id
}

let scanned: Tables | null = null

/** A fresh copy of a project the real scan has read once (a 'create' run, done). */
export async function scannedTables(): Promise<Tables> {
  if (!scanned) {
    const { tables } = world(projectRow())
    await scan(tables)
    scanned = tables
  }
  return structuredClone(scanned)
}

/** A client that records every table it touched. */
export function recording<T extends object>(client: T, log: string[]): T {
  const from = (client as unknown as { from: (n: string) => unknown }).from.bind(client)
  ;(client as unknown as { from: (n: string) => unknown }).from = (name: string) => {
    log.push(name)
    return from(name)
  }
  return client
}

export type Hooks = Record<string, unknown>

/** The settings data layer's dependencies over `tables`, as the owner (or `userId`). */
export function settingsDeps(
  tables: Tables,
  o: {
    userId?: string | null
    env?: Record<string, string | undefined>
    admins?: string[]
    isAdminThrows?: boolean
    sessionThrows?: boolean
    hooks?: Hooks
    now?: Date
  } = {},
) {
  const log: string[] = []
  const db = recording(new FakeAdmin(tables, (o.hooks ?? {}) as never, () => (o.now ?? NOW).getTime()), log)
  const deps: SettingsDeps = {
    session: async () => {
      if (o.sessionThrows) throw new Error(`${SECRET} no session`)
      return { userId: o.userId === undefined ? USER : o.userId, db: db as unknown as SupabaseClient }
    },
    isAdmin: async (userId) => {
      if (o.isAdminThrows) throw new Error(SECRET)
      return (o.admins ?? []).includes(userId)
    },
    env: { ENABLE_SEED_SCAN: 'true', ...o.env },
    now: () => o.now ?? NOW,
  }
  return { deps, db, log }
}

/** A model that answers `answer` after `delayMs`, counting its calls. */
export function slowModel(answer: InsightResult | (() => Promise<InsightResult>), delayMs = 0) {
  const inner = fakeModel(async () => {
    if (delayMs) await new Promise((r) => setTimeout(r, delayMs))
    return typeof answer === 'function' ? answer() : answer
  })
  return inner
}

/** The redetect route's dependencies over `tables`. */
export function redetectDeps(
  tables: Tables,
  o: {
    userId?: string | null
    env?: Record<string, string | undefined>
    admins?: string[]
    access?: { allowed: boolean; authority: string } | (() => Promise<{ allowed: boolean; authority: string }>)
    answer?: InsightResult | (() => Promise<InsightResult>)
    delayMs?: number
    modelMs?: number
    sessionThrows?: boolean
    adminThrows?: boolean
    hooks?: Hooks
    userHooks?: Hooks
    rpcHooks?: FakeAdmin['rpcHooks']
    now?: Date
  } = {},
) {
  const now = o.now ?? NOW
  const adminLog: string[] = []
  const userLog: string[] = []
  const fakeAdmin = new FakeAdmin(tables, (o.hooks ?? {}) as never, () => now.getTime())
  if (o.rpcHooks) fakeAdmin.rpcHooks = o.rpcHooks
  const admin = recording(fakeAdmin, adminLog)
  const db = recording(new FakeAdmin(tables, (o.userHooks ?? {}) as never, () => now.getTime()), userLog)
  const model = slowModel(o.answer ?? { ok: true, insight: HE_WP_INSIGHT }, o.delayMs ?? 0)
  let request = 0
  const deps: RedetectDeps = {
    session: async () => {
      if (o.sessionThrows) throw new Error(`${SECRET} no session`)
      return { userId: o.userId === undefined ? USER : o.userId, db: db as unknown as SupabaseClient }
    },
    admin: () => {
      if (o.adminThrows) throw new Error(`${SECRET} no service key`)
      return admin as unknown as ServiceRoleClient
    },
    isAdmin: async (_admin, userId) => (o.admins ?? []).includes(userId),
    access: async () => {
      const a = o.access ?? { allowed: true, authority: 'website' }
      return typeof a === 'function' ? a() : a
    },
    insight: model.fn,
    requestId: () => `req-${++request}`,
    now: () => now,
    env: { ENABLE_SEED_SCAN: 'true', ...o.env },
    modelMs: o.modelMs,
  }
  return { deps, model, adminLog, userLog, admin: fakeAdmin }
}

export const post = (body: unknown, raw?: string) =>
  new Request(`https://app.example/api/projects/${PROJECT}/redetect`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: raw ?? JSON.stringify(body),
  })

/** A response as the suites read it, with everything logged while it ran. */
export async function call(work: () => Promise<Response>) {
  const { value: res, output } = await captureConsole(work)
  const text = await res.clone().text()
  let json: Row = {}
  try {
    json = JSON.parse(text)
  } catch {
    json = {}
  }
  return { status: res.status, json, text, headers: res.headers, logs: output }
}

export const profileRow = (t: Tables) => t.project_profiles.find((r) => r.project_id === PROJECT) as Row | undefined
export const audienceRows = (t: Tables) =>
  t.project_audiences.filter((r) => r.project_id === PROJECT).sort((a, b) => Number(a.position) - Number(b.position))
