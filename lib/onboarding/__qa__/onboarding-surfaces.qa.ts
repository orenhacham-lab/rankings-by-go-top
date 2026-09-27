/**
 * The two onboarding screens' server halves, and the flag that keeps them off.
 *
 *   /projects/new          flag off → today's form, untouched; on → one field
 *   /projects/[id]/summary the owner's research screen, or "not found"
 *
 * "Off" must mean today's product exactly: for every value of ENABLE_SEED_SCAN
 * other than "true", and a merchant who is not an administrator, the new-project
 * route renders the old page as it is (the layout hands its children through,
 * and the page itself is byte-for-byte the one on the build base), and the
 * summary route does not exist.
 *
 * The resolvers (lib/onboarding/surfaces.ts) run with FakeAdmin clients that
 * record every table they touch; the layout runs for real with only its
 * server loader substituted.
 *
 * Run: npx tsx lib/onboarding/__qa__/onboarding-surfaces.qa.ts
 */
/* eslint-disable @typescript-eslint/no-require-imports, @typescript-eslint/no-explicit-any */
import { createHash, randomBytes } from 'crypto'
import { readFileSync } from 'fs'
import { join } from 'path'
import type { SupabaseClient } from '@supabase/supabase-js'
import { FakeAdmin } from '@/lib/__qa__/_fake-admin'
import { hashClaimToken } from '@/lib/free-check'
import type { ServiceRoleClient } from '@/lib/supabase/admin'
import { claimedScan, HE_WP, makeChecker, NOW, OTHER_USER, PROJECT, projectRow, SECRET, USER } from '@/lib/seed-scan/__qa__/_fixtures'
import { peekSeedClaim } from '../claim-peek'
import { resolveNewProjectSurface, resolveSummarySurface, SurfaceUnavailableError, type NewProjectSurface } from '../surfaces'

const { check, finish } = makeChecker()
type Row = Record<string, unknown>
const ROOT = join(__dirname, '..', '..', '..')
const read = (rel: string) => readFileSync(join(ROOT, rel), 'utf8')
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')

/**
 * The old new-project page as it is on the build base. With the flag off this
 * is what renders, so it must not change here; a deliberate change to it
 * updates this hash in the same commit.
 */
const LEGACY_NEW_PROJECT_PAGE_SHA256 = '7d1b5d4bc3736302ecf6b13a687192cec96a5c647ccc962ef5ed7e8f172e0760'

function clients(): Row[] {
  return [
    { id: 'client-b', user_id: USER, name: 'B client', is_active: true, is_default: false },
    { id: 'client-a', user_id: USER, name: 'A client', is_active: true, is_default: true },
    { id: 'client-old', user_id: USER, name: 'Old', is_active: false, is_default: false },
    { id: 'client-theirs', user_id: OTHER_USER, name: 'Theirs', is_active: true, is_default: true },
  ]
}

type Filters = { kind: string; col: string; val: unknown }[]

function db(tables: Record<string, Row[]>, hooks: Record<string, unknown> = {}) {
  const log: string[] = []
  /** Each query as FakeAdmin holds it once its chain has run. */
  const queries: { table: string; query: { filters?: Filters } }[] = []
  const fake = new FakeAdmin(tables, hooks as never)
  const from = fake.from.bind(fake)
  ;(fake as unknown as { from: (n: string) => unknown }).from = (name: string) => {
    log.push(name)
    const query = from(name)
    queries.push({ table: name, query: query as unknown as { filters?: Filters } })
    return query
  }
  return { fake, log, queries }
}

/** The first query on `table` filters `col` to exactly `val`. */
const filtersBy = (queries: { table: string; query: { filters?: Filters } }[], table: string, col: string, val: unknown) =>
  (queries.find((q) => q.table === table)?.query.filters ?? []).some((f) => f.kind === 'eq' && f.col === col && f.val === val)

function setup(o: { userId?: string | null; env?: Record<string, string | undefined>; admins?: string[]; tables?: Record<string, Row[]>; userHooks?: Record<string, unknown>; adminHooks?: Record<string, unknown>; isAdminThrows?: boolean } = {}) {
  const tables: Record<string, Row[]> = {
    projects: [projectRow()],
    clients: clients(),
    project_seed_runs: [],
    project_seed_steps: [],
    free_site_check_claims: [],
    free_site_checks: [],
    ...o.tables,
  }
  const user = db(tables, o.userHooks)
  const admin = db(tables, o.adminHooks)
  const adminCalls: string[] = []
  const peeks: string[] = []
  const deps = {
    userId: o.userId === undefined ? USER : o.userId,
    db: user.fake as unknown as SupabaseClient,
    admin: () => admin.fake as unknown as ServiceRoleClient,
    isAdmin: async (_a: ServiceRoleClient, userId: string) => {
      adminCalls.push(userId)
      if (o.isAdminThrows) throw new Error(SECRET)
      return (o.admins ?? []).includes(userId)
    },
    env: { ENABLE_SEED_SCAN: 'true', ...o.env },
    now: NOW,
  }
  const peekClaim = (a: ServiceRoleClient, token: string, now: Date) => {
    peeks.push(token)
    return peekSeedClaim(a, token, now)
  }
  return { tables, deps, peekClaim, userLog: user.log, userQueries: user.queries, adminLog: admin.log, adminCalls, peeks }
}

const FLAG_OFF_VALUES = [undefined, '', 'false', 'TRUE', 'True', '1', 'yes', ' true']

async function main() {
  console.log('\n1) /projects/new: which screen')
  for (const flag of FLAG_OFF_VALUES) {
    const s = setup({ env: { ENABLE_SEED_SCAN: flag } })
    const surface = await resolveNewProjectSurface({ ...s.deps, claimCookie: null, peekClaim: s.peekClaim })
    check(`flag ${JSON.stringify(flag)}, not an administrator → today's form, and nothing else is read`,
      surface.kind === 'legacy' && s.userLog.length === 0 && s.peeks.length === 0, JSON.stringify(surface))
  }
  {
    const token = randomBytes(32).toString('hex')
    const scan = claimedScan()
    const s = setup({ env: { ENABLE_SEED_SCAN: undefined }, tables: claimTables(token, scan) })
    await resolveNewProjectSurface({ ...s.deps, claimCookie: token, peekClaim: s.peekClaim })
    check('…even with a claim cookie, the flag decides first: the token is not looked up', s.peeks.length === 0 && s.adminLog.length === 0)
  }
  {
    const s = setup({ userId: null })
    const surface = await resolveNewProjectSurface({ ...s.deps, claimCookie: null, peekClaim: s.peekClaim })
    check('signed out → today\'s form (the layout above redirects to sign-in anyway)', surface.kind === 'legacy' && s.adminCalls.length === 0)
  }
  {
    const s = setup({ env: { ENABLE_SEED_SCAN: undefined }, isAdminThrows: true })
    const surface = await resolveNewProjectSurface({ ...s.deps, claimCookie: null, peekClaim: s.peekClaim })
    check('an administrator check that fails counts as "not an administrator" → today\'s form', surface.kind === 'legacy')
  }
  {
    const s = setup({ env: { ENABLE_SEED_SCAN: undefined }, admins: [USER] })
    const surface = await resolveNewProjectSurface({ ...s.deps, claimCookie: null, peekClaim: s.peekClaim })
    check('flag off, an administrator → the one-field screen', surface.kind === 'flow')
  }
  {
    const s = setup()
    const surface = (await resolveNewProjectSurface({ ...s.deps, claimCookie: null, peekClaim: s.peekClaim })) as Extract<NewProjectSurface, { kind: 'flow' }>
    check('flag on → the one-field screen, with the merchant\'s ACTIVE clients only, by name, the default marked',
      surface.kind === 'flow' && JSON.stringify(surface.clients) === JSON.stringify([{ id: 'client-a', isDefault: true }, { id: 'client-b', isDefault: false }]), JSON.stringify(surface))
    check('…read through the merchant\'s own client, with no administrator lookup when the flag is on', s.userLog.includes('clients') && s.adminCalls.length === 0)
    check('…and no address filled in without a claim', surface.claimedDomain === null)
  }
  {
    const s = setup({ userHooks: { clients: { select: () => ({ code: 'XX000', message: SECRET }) } } })
    const surface = (await resolveNewProjectSurface({ ...s.deps, claimCookie: null, peekClaim: s.peekClaim })) as Extract<NewProjectSurface, { kind: 'flow' }>
    check('clients that cannot be read → null (the screen says so), never an empty list', surface.kind === 'flow' && surface.clients === null)
  }
  {
    const token = randomBytes(32).toString('hex')
    const scan = claimedScan()
    const s = setup({ tables: claimTables(token, scan) })
    const surface = (await resolveNewProjectSurface({ ...s.deps, claimCookie: token, peekClaim: s.peekClaim })) as Extract<NewProjectSurface, { kind: 'flow' }>
    check('a kept, usable claim → the address is filled in with the checked site', surface.claimedDomain === HE_WP.key, String(surface.claimedDomain))
    check('…and looking does NOT spend the token', s.tables.free_site_check_claims[0].consumed_at === null)
  }
  {
    const token = randomBytes(32).toString('hex')
    const s = setup({ tables: claimTables(token, claimedScan(), { consumed_at: NOW.toISOString() }) })
    const spent = (await resolveNewProjectSurface({ ...s.deps, claimCookie: token, peekClaim: s.peekClaim })) as Extract<NewProjectSurface, { kind: 'flow' }>
    const s2 = setup()
    const junk = (await resolveNewProjectSurface({ ...s2.deps, claimCookie: 'not-a-token', peekClaim: s2.peekClaim })) as Extract<NewProjectSurface, { kind: 'flow' }>
    check('a spent token fills nothing in', spent.claimedDomain === null)
    check('a malformed cookie is not even looked up', junk.claimedDomain === null && s2.peeks.length === 0)
  }

  console.log('\n2) /projects/[id]/summary: who sees it')
  {
    const s = setup({ tables: { project_seed_runs: [runRow()], project_seed_steps: stepRows() } })
    const surface = await resolveSummarySurface(PROJECT, { ...s.deps, contentEnabled: true })
    check('the owner, flag on → the screen, with the latest run already read', !!surface && surface.initialRun?.id === 'run-1' && surface.initialRun?.steps.length === 4, JSON.stringify(surface?.initialRun?.status))
    check('…the site as the scan keys it, the project\'s name, the content flag and the server\'s clock',
      surface?.domain === HE_WP.key && surface?.projectName === 'My site' && surface?.contentEnabled === true && surface?.serverNow === NOW.toISOString(), JSON.stringify(surface?.domain))
    check('…the project and the run are read through the merchant\'s own client, never the service role',
      ['projects', 'project_seed_runs', 'project_seed_steps'].every((t) => s.userLog.includes(t)) && !s.adminLog.includes('projects') && !s.adminLog.includes('project_seed_runs'))
    check('…the project filtered by its id AND by the signed-in owner, not left to row-level security alone',
      filtersBy(s.userQueries, 'projects', 'id', PROJECT) && filtersBy(s.userQueries, 'projects', 'user_id', USER))
  }
  {
    const s = setup()
    const surface = await resolveSummarySurface(PROJECT, { ...s.deps, contentEnabled: false })
    check('no run yet → the screen, with no run (it offers "Scan the site")', !!surface && surface.initialRun === null)
  }
  for (const [label, o, id] of [
    ['signed out', { userId: null }, PROJECT],
    ["another merchant's project", { userId: OTHER_USER }, PROJECT],
    ['an id that is not a UUID', {}, 'x'],
  ] as const) {
    const s = setup(o as never)
    const surface = await resolveSummarySurface(id, { ...s.deps, contentEnabled: true })
    check(`${label} → not found`, surface === null)
  }
  for (const flag of FLAG_OFF_VALUES) {
    const s = setup({ env: { ENABLE_SEED_SCAN: flag }, tables: { project_seed_runs: [runRow()] } })
    const surface = await resolveSummarySurface(PROJECT, { ...s.deps, contentEnabled: true })
    check(`flag ${JSON.stringify(flag)}, not an administrator → not found, and no run is read`, surface === null && !s.userLog.includes('project_seed_runs'))
  }
  {
    const s = setup({ env: { ENABLE_SEED_SCAN: undefined }, admins: [USER] })
    check('flag off, an administrator → the screen', (await resolveSummarySurface(PROJECT, { ...s.deps, contentEnabled: true })) !== null)
  }
  {
    const s = setup({ userHooks: { projects: { select: () => ({ code: 'XX000', message: SECRET }) } } })
    let thrown: unknown = null
    try {
      await resolveSummarySurface(PROJECT, { ...s.deps, contentEnabled: true })
    } catch (err) {
      thrown = err
    }
    check('a project that cannot be read is an outage, not "not found", and names no database text',
      thrown instanceof SurfaceUnavailableError && !String((thrown as Error).message).includes(SECRET))
  }

  console.log('\n3) The routes')
  {
    const hash = createHash('sha256').update(readFileSync(join(ROOT, 'app/(dashboard)/projects/new/page.tsx'))).digest('hex')
    check('the old new-project page is byte-for-byte the build base\'s (what the flag-off route renders)', hash === LEGACY_NEW_PROJECT_PAGE_SHA256, hash)
    const layout = strip(read('app/(dashboard)/projects/new/layout.tsx'))
    check('the new-project layout hands its children through untouched when the surface is legacy', /if \(surface\.kind === 'legacy'\) return children\b/.test(layout))
    check('…and otherwise renders the one-field flow with the server\'s clients and claimed site',
      /<NewProjectFlow clients=\{surface\.clients\} claimedDomain=\{surface\.claimedDomain\} \/>/.test(layout) && /await loadNewProjectSurface\(\)/.test(layout))
    const summary = strip(read('app/(dashboard)/projects/[id]/summary/page.tsx'))
    check('the summary page answers "not found" when the surface is null', /if \(!surface\) notFound\(\)/.test(summary))
    check('…and remounts its screen per project (the switcher can change it)', /<SeedRunScreen key=\{surface\.projectId\}/.test(summary))
  }
  {
    // The layout itself, run with only its server loader substituted.
    const Mod: any = require('module')
    const origLoad = Mod._load
    let next: NewProjectSurface | Error = { kind: 'legacy' }
    Mod._load = function (request: string, parent: any, isMain: boolean) {
      if (request === '@/lib/onboarding/server') return { loadNewProjectSurface: async () => {
        if (next instanceof Error) throw next
        return next
      }, loadSummarySurface: async () => null }
      return origLoad.call(this, request, parent, isMain)
    }
    try {
      const Layout = require(join(ROOT, 'app/(dashboard)/projects/new/layout.tsx')).default
      const NewProjectFlow = require(join(ROOT, 'components/onboarding/NewProjectFlow.tsx')).default
      const children = { marker: 'the old page' }
      const legacy = await Layout({ children })
      check('flag off: the layout returns the old page itself (the same object, nothing wrapped around it)', legacy === children)
      next = { kind: 'flow', clients: [{ id: 'c1', isDefault: true }], claimedDomain: 'shop.example.com' }
      const flow = await Layout({ children })
      check('flag on: the layout renders the one-field flow instead, and not the old page',
        flow?.type === NewProjectFlow && flow?.props?.claimedDomain === 'shop.example.com' && flow?.props?.children === undefined)
      next = new Error(SECRET)
      const failing = await Layout({ children }).catch((err: unknown) => err)
      check('when deciding fails (the session, the database), the old page renders as it is', failing === children)
      // A redirect is Next's own signal, thrown as an error: it must go through, not become the old page.
      const { redirect } = require('next/navigation')
      try {
        redirect('/login')
      } catch (err) {
        next = err as Error
      }
      let passedOn: unknown = null
      try {
        await Layout({ children })
      } catch (err) {
        passedOn = err
      }
      check("…while Next's own signals (a redirect, a dynamic render) pass through untouched", passedOn === next)
    } finally {
      Mod._load = origLoad
    }
  }

  finish()
}

function claimTables(token: string, scan: ReturnType<typeof claimedScan>, over: Row = {}): Record<string, Row[]> {
  return {
    free_site_check_claims: [{ token_hash: hashClaimToken(token), check_id: scan.checkId, consumed_at: null, created_at: new Date(NOW.getTime() - 60_000).toISOString(), ...over }],
    free_site_checks: [{ id: scan.checkId, domain: scan.domain, url: scan.url, locale: scan.locale, result: scan.result, seed: scan.seed }],
  }
}

function runRow(): Row {
  return {
    id: 'run-1',
    project_id: PROJECT,
    user_id: USER,
    trigger: 'create',
    stage: 'a',
    status: 'running',
    summary: null,
    error_code: null,
    lease_expires_at: new Date(NOW.getTime() + 60_000).toISOString(),
    started_at: NOW.toISOString(),
    finished_at: null,
    created_at: NOW.toISOString(),
  }
}

function stepRows(): Row[] {
  return ['a1', 'a2', 'a3', 'a4'].map((step, i) => ({
    run_id: 'run-1',
    project_id: PROJECT,
    user_id: USER,
    step,
    status: i === 0 ? 'done' : i === 1 ? 'running' : 'pending',
    item_count: null,
    error_code: null,
    started_at: null,
    finished_at: null,
    detail: {},
  }))
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})

export {}
