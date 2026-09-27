/**
 * POST /api/projects/[id]/onboarding/start: the new project's first research,
 * seeded from the merchant's free check when the project is that site.
 *
 * The handler (lib/onboarding/start.ts) runs here against the REAL seed route
 * handler (lib/seed-scan/http.ts handleSeedPost), the real claim look-up
 * (lib/onboarding/claim-peek.ts) and the real claim redemption
 * (lib/free-check consumeClaimToken), over one FakeAdmin database. Only the
 * session, the entitlement answer and the after() scheduler are injected. So
 * "a mismatched site never spends the token" and "a claim refused by a cap
 * keeps the cookie" are checked against the code that decides them.
 *
 * Also here, for the lead's request: a project created from its address alone
 * ends up with its placeholders owned by the scan. The REAL create route
 * (app/api/projects/create/route.ts, with only its session, service role,
 * entitlement and cache substituted) is called with exactly the form the
 * new-project screen sends, the start route runs on the project it made, and
 * the pipeline's own settings writer (lib/seed-scan/settings.ts) then applies
 * what the scan read. The start route marks nothing itself: marking twice is
 * checked against.
 *
 * Run: npx tsx lib/onboarding/__qa__/onboarding-start.qa.ts
 */
/* eslint-disable @typescript-eslint/no-require-imports, @typescript-eslint/no-explicit-any */
import { randomBytes } from 'crypto'
import { readdirSync, readFileSync, statSync } from 'fs'
import { join } from 'path'
import type { SupabaseClient } from '@supabase/supabase-js'
import { FakeAdmin } from '@/lib/__qa__/_fake-admin'
import { consumeClaimToken, hashClaimToken } from '@/lib/free-check'
import { handleSeedPost, type SeedRouteDeps } from '@/lib/seed-scan/http'
import { applyBusinessToSettings, type SeedProject } from '@/lib/seed-scan/settings'
import type { SeedBusiness } from '@/lib/seed-scan/types'
import {
  captureConsole,
  claimedScan,
  HE_WP,
  makeChecker,
  NOW,
  OTHER_USER,
  PROJECT,
  projectRow,
  SECRET,
  USER,
  world,
  type Tables,
} from '@/lib/seed-scan/__qa__/_fixtures'
import { peekSeedClaim } from '../claim-peek'
import { SEED_CLAIM_COOKIE } from '../claim-cookie'
import { handleOnboardingStart, type OnboardingStartDeps } from '../start'

const { check, finish } = makeChecker()
type Row = Record<string, unknown>
const ROOT = join(__dirname, '..', '..', '..')

/** A project exactly as /api/projects/create writes one from the address alone. */
const URL_PROJECT = projectRow({ business_name: null, country: 'IL', language: 'he', city: null })

type Opts = {
  userId?: string | null
  env?: Record<string, string | undefined>
  admins?: string[]
  project?: Row
  extra?: Tables
  hooks?: Record<string, unknown>
  userHooks?: Record<string, unknown>
  sessionThrows?: boolean
}

/** A service-role query as FakeAdmin holds it once the chain has run: its filters, and a write's payload. */
type AdminQuery = { table: string; query: { filters?: { kind: string; col: string; val: unknown }[]; mutation?: { type: string; payload?: Row | Row[] } | null } }

/** Every service-role query on `table` names this project AND its owner: filtered by both, or (an insert) carrying both. */
function ownerScoped(queries: AdminQuery[], table: string): boolean {
  const onTable = queries.filter((q) => q.table === table)
  return onTable.length > 0 && onTable.every(({ query }) => {
    if (query.mutation?.type === 'insert') {
      const rows = ([] as Row[]).concat(query.mutation.payload ?? [])
      return rows.length > 0 && rows.every((row) => row.project_id === PROJECT && row.user_id === USER)
    }
    const eq = (col: string, val: unknown) => (query.filters ?? []).some((f) => f.kind === 'eq' && f.col === col && f.val === val)
    return eq('project_id', PROJECT) && eq('user_id', USER)
  })
}

function setup(o: Opts = {}) {
  const w = world(o.project ?? URL_PROJECT, o.extra ?? {}, o.hooks ?? {})
  const adminQueries: AdminQuery[] = []
  const adminFrom = w.admin.from.bind(w.admin)
  ;(w.admin as unknown as { from: (n: string) => unknown }).from = (name: string) => {
    const query = adminFrom(name)
    adminQueries.push({ table: name, query: query as unknown as AdminQuery['query'] })
    return query
  }
  const userLog: string[] = []
  const userQueries: AdminQuery[] = []
  const userDb = new FakeAdmin(w.tables, (o.userHooks ?? {}) as never)
  const userFrom = userDb.from.bind(userDb)
  ;(userDb as unknown as { from: (n: string) => unknown }).from = (name: string) => {
    userLog.push(name)
    const query = userFrom(name)
    userQueries.push({ table: name, query: query as unknown as AdminQuery['query'] })
    return query
  }
  const env = { ENABLE_SEED_SCAN: 'true', ...o.env }
  const session = async () => {
    if (o.sessionThrows) throw new Error(`${SECRET} supabase url missing`)
    return { userId: o.userId === undefined ? USER : o.userId, db: userDb as unknown as SupabaseClient }
  }
  const isAdmin = async (_admin: unknown, userId: string) => (o.admins ?? []).includes(userId)
  const seedDeps: SeedRouteDeps = {
    session,
    admin: () => w.admin,
    isAdmin,
    access: async () => ({ allowed: true, authority: 'website' }),
    consumeClaim: (admin, token, now) => consumeClaimToken(token, admin, now),
    schedule: () => {},
    runStage: async () => {},
    addKeywords: async (args) => ({ outcome: { requested: args.keywords.length, added: 0, code: 'no_keywords_selected' }, targetIds: [] }),
    locale: async () => 'he',
    now: () => NOW,
    env,
  }
  const seedCalls: Row[] = []
  /** What project_profiles held at the moment the seed route was called. */
  const profilesAtSeed: Row[][] = []
  const deps: OnboardingStartDeps = {
    session,
    admin: () => w.admin,
    isAdmin,
    peekClaim: (admin, token, now) => peekSeedClaim(admin, token, now),
    seed: (body) => {
      seedCalls.push(body)
      profilesAtSeed.push(w.tables.project_profiles.map((r) => JSON.parse(JSON.stringify(r)) as Row))
      return handleSeedPost(
        new Request(`http://seed.internal/api/projects/${PROJECT}/seed`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }),
        PROJECT,
        seedDeps,
      )
    },
    now: () => NOW,
    env,
  }
  return { ...w, deps, seedCalls, profilesAtSeed, userLog, userQueries, adminQueries }
}

function claimTables(token: string, scan: ReturnType<typeof claimedScan>, over: Row = {}): Tables {
  return {
    free_site_check_claims: [{ token_hash: hashClaimToken(token), check_id: scan.checkId, consumed_at: null, created_at: new Date(NOW.getTime() - 60_000).toISOString(), ...over }],
    free_site_checks: [{ id: scan.checkId, domain: scan.domain, url: scan.url, locale: scan.locale, result: scan.result, seed: scan.seed }],
  }
}

const liveRun = (): Row => ({
  id: 'run-live',
  project_id: PROJECT,
  user_id: USER,
  trigger: 'create',
  stage: 'a',
  status: 'running',
  summary: {},
  error_code: null,
  lease_expires_at: new Date(NOW.getTime() + 60_000).toISOString(),
  started_at: NOW.toISOString(),
  finished_at: null,
  created_at: NOW.toISOString(),
})

function request(body: unknown, o: { cookie?: string; url?: string; forwardedProto?: string; raw?: string } = {}) {
  const headers: Record<string, string> = { 'content-type': 'application/json' }
  if (o.cookie !== undefined) headers.cookie = o.cookie
  if (o.forwardedProto) headers['x-forwarded-proto'] = o.forwardedProto
  return new Request(o.url ?? `https://app.example/api/projects/${PROJECT}/onboarding/start`, {
    method: 'POST',
    headers,
    body: o.raw ?? (body === undefined ? '' : JSON.stringify(body)),
  })
}

const cookieFor = (token: string) => `other=1; ${SEED_CLAIM_COOKIE}=${token}; theme=dark`

let allOutput = ''
const tokensSeen: string[] = []

async function call(res: Promise<Response>) {
  const { value: r, output } = await captureConsole(() => res)
  allOutput += `${output}\n`
  const text = await r.text()
  let json: Row = {}
  try {
    json = JSON.parse(text)
  } catch {
    json = {}
  }
  const headerDump = [...r.headers.entries()].map(([k, v]) => `${k}: ${v}`).join('\n')
  allOutput += `${headerDump}\n${text}\n`
  return { status: r.status, json, text, headers: r.headers, setCookie: r.headers.get('set-cookie'), output }
}

const CLEARED = `${SEED_CLAIM_COOKIE}=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax`

/** Exactly the form components/onboarding/NewProjectFlow.tsx sends to /api/projects/create. */
const FLOW_FORM: Record<string, string> = { name: HE_WP.key, target_domain: HE_WP.key, client_id: 'client-a' }

/** What the scan's stage A reads off the site. */
const READ_OFF_SITE: SeedBusiness = {
  companyName: 'Tel Aviv Plumbing',
  description: 'A plumber in Tel Aviv.',
  commerceType: 'service',
  niche: 'plumbing',
  isLocal: true,
  platform: null,
  language: 'en',
  country: 'US',
}

/** What the create route's session and service role are, for the call being made. */
let createCtx: { userDb: FakeAdmin; admin: unknown } | null = null

/**
 * The create route's surroundings, substituted: its session (a signed-in
 * merchant, reading and writing through a FakeAdmin), its service role (the
 * suite's), the entitlement answer (a plan with room) and the cache
 * revalidation. The route's own code and the real markScanOwnedFields run.
 */
function installCreateRouteSurroundings(): () => void {
  const Mod: any = require('module')
  const origLoad = Mod._load
  Mod._load = function (request: string, parent: any, isMain: boolean) {
    if (request === '@/lib/supabase/server') {
      return {
        createClient: async () => ({
          auth: { getUser: async () => ({ data: { user: { id: USER } }, error: null }) },
          from: (name: string) => createCtx!.userDb.from(name),
        }),
      }
    }
    if (request === '@/lib/supabase/admin') return { createAdminClient: () => createCtx!.admin }
    if (request === 'next/cache') return { revalidatePath: () => {} }
    if (request === '@/lib/subscription') {
      return { getUserEntitlement: async () => ({ plan: 'pro', isAdmin: false }), PLAN_LIMITS: { pro: { maxProjects: 10 } } }
    }
    return origLoad.call(this, request, parent, isMain)
  }
  return () => {
    Mod._load = origLoad
  }
}

/** POST /api/projects/create as the merchant, the new row taking the suite's project id. */
async function createProject(s: ReturnType<typeof setup>, form: Record<string, string>): Promise<{ status: number }> {
  // The project does not exist until the route makes it.
  s.tables.projects.splice(0, s.tables.projects.length)
  const userDb = new FakeAdmin(s.tables)
  const from = userDb.from.bind(userDb)
  ;(userDb as unknown as { from: (n: string) => unknown }).from = (name: string) => {
    const query = from(name) as unknown as { insert: (payload: Row) => unknown }
    if (name === 'projects') {
      const insert = query.insert.bind(query)
      query.insert = (payload: Row) => insert({ id: PROJECT, ...payload })
    }
    return query
  }
  createCtx = { userDb, admin: s.admin }
  const { POST } = require(join(ROOT, 'app/api/projects/create/route.ts'))
  const body = new FormData()
  for (const [k, v] of Object.entries(form)) body.set(k, v)
  const { value: res } = await captureConsole(() => POST(new Request('https://app.example/api/projects/create', { method: 'POST', body })) as Promise<Response>)
  return { status: res.status }
}

/** The .ts and .tsx files under `dir` (relative to the repository), tests left out. */
function sourceFiles(dir: string): string[] {
  const abs = join(ROOT, dir)
  return readdirSync(abs).flatMap((name) => {
    const rel = `${dir}/${name}`
    if (statSync(join(ROOT, rel)).isDirectory()) return name === '__qa__' ? [] : sourceFiles(rel)
    return /\.tsx?$/.test(name) ? [rel] : []
  })
}

async function main() {
  console.log('\n1) Who may start, in order')
  {
    const s = setup({ sessionThrows: true })
    const r = await call(handleOnboardingStart(request({}), PROJECT, s.deps))
    check('a session that cannot be read → 503 unavailable, no provider text', r.status === 503 && r.json.code === 'unavailable' && !r.text.includes(SECRET) && !r.output.includes(SECRET), r.text)
  }
  {
    const s = setup({ userId: null })
    const r = await call(handleOnboardingStart(request({}), PROJECT, s.deps))
    check('signed out → 401 unauthorized, and nothing started', r.status === 401 && r.json.code === 'unauthorized' && s.seedCalls.length === 0)
  }
  {
    const s = setup()
    const r = await call(handleOnboardingStart(request({}), 'not-a-uuid', s.deps))
    check('an id that is not a UUID → 404 not_found', r.status === 404 && r.json.code === 'not_found' && s.seedCalls.length === 0)
  }
  {
    const s = setup({ userId: OTHER_USER })
    const r = await call(handleOnboardingStart(request({}), PROJECT, s.deps))
    check("another merchant's project → 404 not_found, and nothing started", r.status === 404 && r.json.code === 'not_found' && s.seedCalls.length === 0)
    check('…the project was read through the merchant\'s own client', s.userLog.includes('projects'))
    check('…filtered by its id AND by the signed-in owner, not left to row-level security alone',
      (() => {
        const read = s.userQueries.find((q) => q.table === 'projects')?.query.filters ?? []
        return read.some((f) => f.kind === 'eq' && f.col === 'id' && f.val === PROJECT) && read.some((f) => f.kind === 'eq' && f.col === 'user_id' && f.val === OTHER_USER)
      })())
  }
  {
    const s = setup({ userHooks: { projects: { select: () => ({ code: 'XX000', message: SECRET }) } } })
    const r = await call(handleOnboardingStart(request({}), PROJECT, s.deps))
    check('a failed project read → 500 internal, the database\'s words nowhere', r.status === 500 && r.json.code === 'internal' && !r.text.includes(SECRET) && !r.output.includes(SECRET))
  }
  for (const flag of [undefined, '', 'false', 'TRUE', '1', 'yes']) {
    const token = randomBytes(32).toString('hex')
    const s = setup({ env: { ENABLE_SEED_SCAN: flag }, extra: claimTables(token, claimedScan()) })
    const r = await call(handleOnboardingStart(request({}), PROJECT, s.deps))
    const r2 = await call(handleOnboardingStart(request({}, { cookie: cookieFor(token) }), PROJECT, s.deps))
    check(`flag ${JSON.stringify(flag)}, not an administrator → 404 not_found; no run, no marks, no cookie change, the token unspent`,
      r.status === 404 && r.json.code === 'not_found' && r2.status === 404 && s.seedCalls.length === 0 && s.tables.project_seed_runs.length === 0
      && s.tables.project_profiles.length === 0 && r2.setCookie === null && s.tables.free_site_check_claims[0].consumed_at === null, `${r.status} ${r2.setCookie}`)
  }
  {
    const s = setup({ env: { ENABLE_SEED_SCAN: undefined }, admins: [USER] })
    const r = await call(handleOnboardingStart(request({}), PROJECT, s.deps))
    check('flag off, an administrator → 202 (administrators see the scan before everyone)', r.status === 202 && r.json.ok === true, r.text)
  }
  for (const [label, raw] of [
    ['a locale we do not have', JSON.stringify({ locale: 'fr' })],
    ['an array', '[]'],
    ['a locale that is not a string', JSON.stringify({ locale: 5 })],
    ['not JSON', '{'],
    ['a body over 1024 characters', JSON.stringify({ locale: 'he', pad: 'x'.repeat(1100) })],
  ] as const) {
    const s = setup()
    const r = await call(handleOnboardingStart(request(undefined, { raw }), PROJECT, s.deps))
    check(`${label} → 400 invalid_request, nothing started`, r.status === 400 && r.json.code === 'invalid_request' && s.seedCalls.length === 0, r.text)
  }

  console.log('\n2) A plain scan')
  {
    const s = setup()
    const r = await call(handleOnboardingStart(request(undefined), PROJECT, s.deps))
    check('an empty body, no cookie → the seed route\'s start: 202 { ok, runId, trigger: create }', r.status === 202 && r.json.ok === true && r.json.trigger === 'create' && typeof r.json.runId === 'string', r.text)
    check('…asked for exactly { action: start }', JSON.stringify(s.seedCalls) === JSON.stringify([{ action: 'start' }]))
    check('…passed back uncached, as JSON, with no cookie', r.headers.get('cache-control') === 'no-store' && (r.headers.get('content-type') ?? '').includes('application/json') && r.setCookie === null)
  }
  {
    const s = setup()
    await call(handleOnboardingStart(request({ locale: 'en' }), PROJECT, s.deps))
    check('the locale is passed on: the snapshot is in English', (s.tables.project_seed_runs[0]?.summary as Row)?.locale === 'en')
  }
  {
    const s = setup({ env: { SEED_SCAN_USER_DAILY_CAP: '0' } })
    const r = await call(handleOnboardingStart(request({}), PROJECT, s.deps))
    check("a daily cap is passed back as the seed route said it: 429 user_daily_cap, Retry-After and retryAfterSeconds",
      r.status === 429 && r.json.code === 'user_daily_cap' && Number(r.headers.get('retry-after')) > 0 && typeof r.json.retryAfterSeconds === 'number', `${r.status} ${r.text} ${r.headers.get('retry-after')}`)
  }
  {
    const s = setup({ extra: { project_seed_runs: [liveRun()] } })
    const r = await call(handleOnboardingStart(request({}), PROJECT, s.deps))
    check('a run already under way → 409 run_in_progress, passed back', r.status === 409 && r.json.code === 'run_in_progress')
  }

  console.log('\n3) Claiming the free check')
  {
    const token = randomBytes(32).toString('hex')
    tokensSeen.push(token)
    const s = setup({ extra: claimTables(token, claimedScan()) })
    const r = await call(handleOnboardingStart(request({}, { cookie: cookieFor(token) }), PROJECT, s.deps))
    check('a kept token for THIS site → 202, trigger claim', r.status === 202 && r.json.trigger === 'claim', r.text)
    check('…asked for a claim with the token, and nothing else', s.seedCalls.length === 1 && s.seedCalls[0].action === 'claim' && s.seedCalls[0].token === token)
    check('…the token is spent', !!s.tables.free_site_check_claims[0].consumed_at)
    check('…and the cookie is cleared, with the attributes it was set with (Secure over HTTPS)', r.setCookie === `${CLEARED}; Secure`, String(r.setCookie))
  }
  {
    const token = randomBytes(32).toString('hex')
    tokensSeen.push(token)
    const s = setup({ extra: claimTables(token, claimedScan()) })
    const r = await call(handleOnboardingStart(request({}, { cookie: cookieFor(token), url: `http://localhost:3000/api/projects/${PROJECT}/onboarding/start` }), PROJECT, s.deps))
    check('over plain HTTP (a local server) the clearing cookie is not Secure', r.status === 202 && r.setCookie === CLEARED, String(r.setCookie))
    const t2 = randomBytes(32).toString('hex')
    tokensSeen.push(t2)
    const s2 = setup({ extra: claimTables(t2, claimedScan()) })
    const r2 = await call(handleOnboardingStart(request({}, { cookie: cookieFor(t2), url: `http://internal/api/projects/${PROJECT}/onboarding/start`, forwardedProto: 'https' }), PROJECT, s2.deps))
    check('…and behind the proxy, the forwarded scheme decides (https → Secure)', r2.setCookie === `${CLEARED}; Secure`, String(r2.setCookie))
  }
  {
    const token = randomBytes(32).toString('hex')
    tokensSeen.push(token)
    const s = setup({ extra: claimTables(token, claimedScan({ domain: 'someone-else.co.il' })) })
    const r = await call(handleOnboardingStart(request({}, { cookie: cookieFor(token) }), PROJECT, s.deps))
    check("a token for ANOTHER site → a plain scan (trigger create)", r.status === 202 && r.json.trigger === 'create', r.text)
    check('…the claim was never attempted, so the token is NOT spent', s.seedCalls.every((b) => b.action !== 'claim') && s.tables.free_site_check_claims[0].consumed_at === null)
    check('…and the cookie is kept for the project that is that site', r.setCookie === null)
  }
  for (const [label, over, rows] of [
    ['a spent token', { consumed_at: new Date(NOW.getTime() - 1000).toISOString() }, true],
    ['an expired token (25 hours old)', { created_at: new Date(NOW.getTime() - 25 * 3600_000).toISOString() }, true],
    ['an unknown token', {}, false],
  ] as const) {
    const token = randomBytes(32).toString('hex')
    tokensSeen.push(token)
    const s = setup({ extra: rows ? claimTables(token, claimedScan(), over) : {} })
    const r = await call(handleOnboardingStart(request({}, { cookie: cookieFor(token) }), PROJECT, s.deps))
    check(`${label} → a plain scan, and the worthless cookie is cleared`, r.status === 202 && r.json.trigger === 'create' && r.setCookie === `${CLEARED}; Secure` && s.seedCalls.every((b) => b.action !== 'claim'), `${r.status} ${r.setCookie}`)
  }
  {
    const s = setup()
    const r = await call(handleOnboardingStart(request({}, { cookie: `${SEED_CLAIM_COOKIE}=not-a-token` }), PROJECT, s.deps))
    const r2 = await call(handleOnboardingStart(request({}, { cookie: `${SEED_CLAIM_COOKIE}=%E0%A4%A` }), PROJECT, setup().deps))
    check('a malformed cookie → a plain scan, the cookie cleared, nothing looked up', r.status === 202 && r.setCookie === `${CLEARED}; Secure` && s.seedCalls.length === 1 && s.seedCalls[0].action === 'start')
    check('…and one that is not even decodable, the same', r2.status === 202 && r2.setCookie === `${CLEARED}; Secure`)
  }
  {
    const token = randomBytes(32).toString('hex')
    tokensSeen.push(token)
    const s = setup({ extra: { ...claimTables(token, claimedScan()), project_seed_runs: [liveRun()] } })
    const r = await call(handleOnboardingStart(request({}, { cookie: cookieFor(token) }), PROJECT, s.deps))
    check('a claim refused by a cap (a live run, 409) → passed back as it is', r.status === 409 && r.json.code === 'run_in_progress')
    check('…the token is NOT spent and the cookie is kept, for a retry', s.tables.free_site_check_claims[0].consumed_at === null && r.setCookie === null)
    check('…and no plain scan was started in its place', s.seedCalls.length === 1)
  }
  {
    // The look says usable, the redemption fails: the seed route answers claim_invalid.
    const token = randomBytes(32).toString('hex')
    tokensSeen.push(token)
    const s = setup({ extra: claimTables(token, claimedScan()), hooks: { free_site_check_claims: { update: () => ({ code: 'XX000', message: SECRET }) } } })
    const r = await call(handleOnboardingStart(request({}, { cookie: cookieFor(token) }), PROJECT, s.deps))
    check('a claim that fails between the look and the use → a plain scan instead (202, trigger create)', r.status === 202 && r.json.trigger === 'create' && s.seedCalls.map((b) => b.action).join(',') === 'claim,start', r.text)
    check('…the cookie is cleared, and the database\'s words are nowhere', r.setCookie === `${CLEARED}; Secure` && !r.text.includes(SECRET) && !r.output.includes(SECRET))
  }
  {
    const token = randomBytes(32).toString('hex')
    tokensSeen.push(token)
    const s = setup({ extra: claimTables(token, claimedScan()), hooks: { free_site_check_claims: { select: () => ({ code: 'XX000', message: SECRET }) } } })
    const r = await call(handleOnboardingStart(request({}, { cookie: cookieFor(token) }), PROJECT, s.deps))
    check('a claim that cannot be looked up (database) → a plain scan, the cookie kept', r.status === 202 && r.json.trigger === 'create' && r.setCookie === null && s.tables.free_site_check_claims[0].consumed_at === null, `${r.status} ${r.setCookie}`)
  }
  {
    const token = randomBytes(32).toString('hex')
    tokensSeen.push(token)
    const s = setup({ project: projectRow({ target_domain: `https://www.${HE_WP.key}/`, country: 'IL', language: 'he' }), extra: claimTables(token, claimedScan()) })
    const r = await call(handleOnboardingStart(request({}, { cookie: cookieFor(token) }), PROJECT, s.deps))
    check('the project\'s address written with a scheme and www still matches the checked site → claim', r.status === 202 && r.json.trigger === 'claim', r.text)
  }
  check('no token appears in any answer, header or log line of this suite', tokensSeen.length > 0 && tokensSeen.every((t) => !allOutput.includes(t)))

  console.log('\n4) A project created from its address: the create route marks its placeholders, once')
  const strip = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')
  {
    const flow = strip(readFileSync(join(ROOT, 'components/onboarding/NewProjectFlow.tsx'), 'utf8'))
    const sets = [...flow.matchAll(/form\.set\('([a-z_]+)'/g)].map((m) => m[1])
    check('the new-project screen creates its project through /api/projects/create with a name, the address and the client only (no country, language, city or business name)',
      sets.join(',') === 'name,target_domain,client_id' && /fetch\('\/api\/projects\/create', \{ method: 'POST', body: form \}\)/.test(flow), sets.join(','))
  }
  const restore = installCreateRouteSurroundings()
  try {
    {
      const s = setup()
      const created = await createProject(s, FLOW_FORM)
      const row = s.tables.projects.find((p) => p.id === PROJECT)
      const profile = s.tables.project_profiles[0]
      const sources = (profile?.field_sources ?? {}) as Row
      check('the real create route, given that form → 201, and the project holds its placeholders (IL, he) with no business name or city',
        created.status === 201 && row?.country === 'IL' && row?.language === 'he' && row?.business_name === null && row?.city === null, `${created.status} ${JSON.stringify(row)}`)
      check('…it marked exactly the placeholders it defaulted, country and language, "scan"',
        JSON.stringify(sources) === JSON.stringify({ country: 'scan', language: 'scan' }), JSON.stringify(sources))
      check('…on a profile row of this project and its owner, every service-role query on project_profiles naming both',
        profile?.project_id === PROJECT && profile?.user_id === USER && ownerScoped(s.adminQueries, 'project_profiles'))

      const before = JSON.stringify(s.tables.project_profiles)
      const r = await call(handleOnboardingStart(request({ locale: 'he' }), PROJECT, s.deps))
      check('the start route on that project → 202, and it marks nothing again: the profile is exactly as the create route left it when the run starts',
        r.status === 202 && s.profilesAtSeed.length === 1 && JSON.stringify(s.profilesAtSeed[0]) === before, `${r.status} ${JSON.stringify(s.profilesAtSeed[0])}`)

      const project = s.tables.projects.find((p) => p.id === PROJECT) as unknown as SeedProject
      const applied = await applyBusinessToSettings(s.admin, { projectId: PROJECT, userId: USER }, { project, business: READ_OFF_SITE, audiences: [], now: NOW })
      const after = s.tables.projects.find((p) => p.id === PROJECT) ?? {}
      const owned = (s.tables.project_profiles[0]?.field_sources ?? {}) as Row
      check('the first scan then replaces the placeholders with what it read off the site, and they end up "scan" (country, language, business name)',
        applied.ok && after.country === 'US' && after.language === 'en' && after.business_name === 'Tel Aviv Plumbing'
        && owned.country === 'scan' && owned.language === 'scan' && owned.business_name === 'scan', JSON.stringify({ after, owned }))
    }
    {
      // Control: the old form, where the merchant chose the country and the language.
      const s = setup()
      const created = await createProject(s, { ...FLOW_FORM, country: 'IL', language: 'he' })
      const marks = s.tables.project_profiles.length
      const project = s.tables.projects.find((p) => p.id === PROJECT) as unknown as SeedProject
      await applyBusinessToSettings(s.admin, { projectId: PROJECT, userId: USER }, { project, business: READ_OFF_SITE, audiences: [], now: NOW })
      const after = s.tables.projects.find((p) => p.id === PROJECT) ?? {}
      check('control: a country and language the merchant chose are not marked, and the scan leaves them as they are',
        created.status === 201 && marks === 0 && after.country === 'IL' && after.language === 'he', JSON.stringify(after))
    }
  } finally {
    restore()
  }
  {
    const offenders = ['lib/onboarding', 'components/onboarding', 'app/api/projects/[id]/onboarding', 'app/(onboarding)']
      .flatMap((dir) => sourceFiles(dir))
      .filter((f) => /\bmarkScanOwnedFields\b|\bfield_sources\b|['"]project_profiles['"]/.test(strip(readFileSync(join(ROOT, f), 'utf8'))))
    check('no onboarding code marks fields itself: the create route is the one place a new project\'s placeholders are marked', offenders.length === 0, offenders.join(', '))
  }

  console.log('\n5) The route file only wires the handler in')
  {
    const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')
    const route = strip(readFileSync(join(ROOT, 'app/api/projects/[id]/onboarding/start/route.ts'), 'utf8'))
    check('it answers POST through handleOnboardingStart', /export async function POST\([\s\S]*?handleOnboardingStart\(request, id, liveDeps\(id\)\)/.test(route))
    check('…starts runs with the seed route\'s own POST, in-process', /import \{ POST as seedPost \} from '@\/app\/api\/projects\/\[id\]\/seed\/route'/.test(route) && /seedPost\(/.test(route) && !/fetch\(/.test(route))
    check('…on the Node runtime, with the seed route\'s time budget', /export const runtime = 'nodejs'/.test(route) && /export const maxDuration = 300/.test(route))
    check('…and exports nothing else a request could reach', (route.match(/export async function (GET|PUT|PATCH|DELETE)/g) ?? []).length === 0)
  }

  finish()
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})

export {}
