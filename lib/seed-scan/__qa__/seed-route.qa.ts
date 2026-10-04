/**
 * The seed API contract: POST/GET /api/projects/[id]/seed.
 *
 * The handlers (lib/seed-scan/http.ts) run here with the real store, the real
 * claim redemption (lib/free-check consumeClaimToken) and a FakeAdmin; only
 * the session, the entitlement answer and the after() scheduler are injected.
 * Two clients share one database: the user's RLS-scoped client and the
 * service role, each recording which tables it touched, so "the project is
 * read as its owner" is checked, not assumed.
 *
 * Every refusal must be a stable code; SECRET_PROVIDER_TEXT, planted in every
 * failure a dependency can produce, must never reach a response or a log.
 *
 * Run: npx tsx lib/seed-scan/__qa__/seed-route.qa.ts
 */
import { randomBytes } from 'crypto'
import { FakeAdmin } from '@/lib/__qa__/_fake-admin'
import { hashClaimToken } from '@/lib/free-check'
import { consumeClaimToken } from '@/lib/free-check'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { ServiceRoleClient } from '@/lib/supabase/admin'
import { DEFAULT_USER_DAILY_CAP, handleSeedGet, handleSeedPost, RESCAN_COOLDOWN_MS, userDailyCap, type SeedRouteDeps } from '../http'
import { runStageA } from '../runner'
import { restoreClaimToken } from '../claim'
import { LEASE_MS, MAX_RESUME_AGE_MS } from '../store'
import { SEED_API_ERROR_CODES, type SeedGetResponse, type SeedScope } from '../types'
import {
  captureConsole,
  claimedScan,
  claimSeed,
  clock,
  FakeNetwork,
  fakeModel,
  fakeSearch,
  HE_WP,
  HE_WP_INSIGHT,
  HE_WP_RESULTS,
  heWordPressSite,
  installFakeDns,
  makeChecker,
  NOW,
  OTHER_PROJECT,
  OTHER_USER,
  PROJECT,
  projectRow,
  SECRET,
  USER,
  world,
  type Tables,
} from './_fixtures'

const { check, finish } = makeChecker()
type Row = Record<string, unknown>

type Opts = {
  userId?: string | null
  env?: Record<string, string | undefined>
  admins?: string[]
  access?: { allowed: boolean; authority: string } | (() => Promise<{ allowed: boolean; authority: string }>)
  projects?: Row[]
  extra?: Tables
  hooks?: Record<string, unknown>
  userHooks?: Record<string, unknown>
  sessionThrows?: boolean
  isAdminThrows?: boolean
  /** The websites the account may have: the day's cap is never below it. */
  siteAllowance?: number
  siteAllowanceThrows?: boolean
}

/** Two clients over one database, each recording the tables it touched. */
function recording<T extends object>(client: T, log: string[]): T {
  const from = (client as unknown as { from: (n: string) => unknown }).from.bind(client)
  ;(client as unknown as { from: (n: string) => unknown }).from = (name: string) => {
    log.push(name)
    return from(name)
  }
  return client
}

function setup(o: Opts = {}) {
  const c = clock()
  const w = world(projectRow(), o.extra ?? {}, o.hooks ?? {}, c.now)
  if (o.projects) w.tables.projects = o.projects
  const adminLog: string[] = []
  const userLog: string[] = []
  recording(w.fake, adminLog)
  const userDb = recording(new FakeAdmin(w.tables, (o.userHooks ?? {}) as never), userLog)
  const scheduled: (() => Promise<void>)[] = []
  const runStageCalls: { admin: ServiceRoleClient; scope: SeedScope; runId: string; lease: string }[] = []
  const accessCalls: unknown[] = []
  const deps: SeedRouteDeps = {
    session: async () => {
      if (o.sessionThrows) throw new Error(`${SECRET} supabase url missing`)
      return { userId: o.userId === undefined ? USER : o.userId, db: userDb as unknown as SupabaseClient }
    },
    admin: () => w.admin,
    isAdmin: async (_admin, userId) => {
      if (o.isAdminThrows) throw new Error(SECRET)
      return (o.admins ?? []).includes(userId)
    },
    siteAllowance: async () => {
      if (o.siteAllowanceThrows) throw new Error(SECRET)
      return o.siteAllowance ?? 0
    },
    access: async (admin, userId) => {
      accessCalls.push({ admin, userId })
      const a = o.access ?? { allowed: true, authority: 'website' }
      return typeof a === 'function' ? a() : a
    },
    consumeClaim: (admin, token, now) => consumeClaimToken(token, admin, now),
    schedule: (task) => {
      scheduled.push(task)
    },
    runStage: async (args) => {
      runStageCalls.push(args)
    },
    // `continue` has its own suite (seed-continue.qa.ts); start and claim never track keywords.
    addKeywords: async (args) => ({ outcome: { requested: args.keywords.length, added: 0, code: 'no_keywords_selected' }, targetIds: [] }),
    locale: async () => 'he',
    now: c.now,
    env: { ENABLE_SEED_SCAN: 'true', ...o.env },
  }
  return { ...w, c, deps, scheduled, runStageCalls, adminLog, userLog, accessCalls }
}

const post = (body: unknown, raw?: string) =>
  new Request(`https://app.example/api/projects/${PROJECT}/seed`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: raw ?? JSON.stringify(body) })

/** Everything the handlers logged, across the whole suite. */
let allLogs = ''

async function call(res: Promise<Response> | Response) {
  const { value: r, output } = await captureConsole(async () => res)
  allLogs += `${output}\n`
  const text = await r.text()
  let json: Row = {}
  try {
    json = JSON.parse(text)
  } catch {
    json = {}
  }
  return { status: r.status, json, text, headers: r.headers }
}

/** A refusal is exactly { ok: false, code } (+ retryAfterSeconds on a 429) with a known code. */
function isStableRefusal(r: { json: Row; status: number }, code: string): boolean {
  const keys = Object.keys(r.json).sort().join(',')
  const expected = r.status === 429 ? 'code,ok,retryAfterSeconds' : 'code,ok'
  return r.json.ok === false && r.json.code === code && keys === expected && (SEED_API_ERROR_CODES as readonly string[]).includes(code)
}

function claimTables(token: string, scan: ReturnType<typeof claimedScan>, over: Row = {}): Tables {
  return {
    free_site_check_claims: [{ token_hash: hashClaimToken(token), check_id: scan.checkId, consumed_at: null, created_at: new Date(NOW.getTime() - 60_000).toISOString(), ...over }],
    free_site_checks: [{ id: scan.checkId, domain: scan.domain, url: scan.url, locale: scan.locale, result: scan.result, seed: scan.seed }],
  }
}

const doneRun = (over: Row = {}): Row => ({
  id: `run-${Math.random().toString(36).slice(2)}`,
  project_id: PROJECT,
  user_id: USER,
  trigger: 'create',
  stage: 'a',
  status: 'done',
  summary: {},
  error_code: null,
  lease_expires_at: null,
  started_at: NOW.toISOString(),
  finished_at: NOW.toISOString(),
  created_at: NOW.toISOString(),
  ...over,
})

async function main() {
  installFakeDns()

  console.log('1) Who may call it')
  {
    const s = setup({ userId: null })
    const r = await call(handleSeedPost(post({ action: 'start' }), PROJECT, s.deps))
    check('no session → 401 unauthorized', r.status === 401 && isStableRefusal(r, 'unauthorized'), r.text)
    const g = await call(handleSeedGet(PROJECT, s.deps))
    check('GET without a session → 401', g.status === 401 && isStableRefusal(g, 'unauthorized'))
    check('…and nothing was read at all', s.adminLog.length === 0 && s.userLog.length === 0)
  }
  {
    const s = setup({ projects: [projectRow({ user_id: OTHER_USER })] })
    const r = await call(handleSeedPost(post({ action: 'start' }), PROJECT, s.deps))
    check("another user's project → 404 not_found", r.status === 404 && isStableRefusal(r, 'not_found'), r.text)
    const g = await call(handleSeedGet(PROJECT, s.deps))
    check("GET another user's project → 404", g.status === 404 && isStableRefusal(g, 'not_found'))
    check('…and no run was created', s.tables.project_seed_runs.length === 0)
    const missing = await call(handleSeedPost(post({ action: 'start' }), OTHER_PROJECT, s.deps))
    const badId = await call(handleSeedPost(post({ action: 'start' }), 'not-a-uuid', s.deps))
    check('a missing project or a malformed id → the same 404', missing.status === 404 && badId.status === 404 && missing.text === r.text && badId.text === r.text)
  }
  {
    const s = setup()
    await call(handleSeedPost(post({ action: 'start' }), PROJECT, s.deps))
    check('the project is read through the user\'s own (RLS-scoped) client', s.userLog[0] === 'projects')
    check('…never through the service role', !s.adminLog.includes('projects'), s.adminLog.join(','))
  }
  for (const env of [{}, { ENABLE_SEED_SCAN: 'false' }, { ENABLE_SEED_SCAN: 'TRUE' }]) {
    const s = setup({ env: { ENABLE_SEED_SCAN: undefined, ...env } })
    const r = await call(handleSeedPost(post({ action: 'start' }), PROJECT, s.deps))
    const g = await call(handleSeedGet(PROJECT, s.deps))
    check(`flag ${JSON.stringify(env)} for a non-admin → 404, exactly like a missing project`,
      r.status === 404 && isStableRefusal(r, 'not_found') && g.status === 404 && s.tables.project_seed_runs.length === 0, r.text)
  }
  {
    const s = setup({ env: { ENABLE_SEED_SCAN: undefined }, admins: [USER] })
    const r = await call(handleSeedPost(post({ action: 'start' }), PROJECT, s.deps))
    check('flag off, but the user is an administrator → proceeds (202)', r.status === 202 && r.json.ok === true, r.text)
  }
  {
    const s = setup({ env: { ENABLE_SEED_SCAN: undefined }, isAdminThrows: true })
    const { value: r, output } = await captureConsole(() => call(handleSeedPost(post({ action: 'start' }), PROJECT, s.deps)))
    check('an unreadable admin role fails closed (404), its text nowhere', r.status === 404 && !r.text.includes(SECRET) && !output.includes(SECRET))
  }
  {
    const s = setup({ sessionThrows: true })
    const { value: r, output } = await captureConsole(() => call(handleSeedPost(post({ action: 'start' }), PROJECT, s.deps)))
    check('no Supabase configuration → 503 unavailable, its text nowhere', r.status === 503 && isStableRefusal(r, 'unavailable') && !r.text.includes(SECRET) && !output.includes(SECRET))
  }

  console.log('\n2) What may be asked')
  for (const [name, req] of [
    ['not JSON', post(null, '{nope')],
    ['an unknown action', post({ action: 'delete' })],
    ['a claim without a token', post({ action: 'claim' })],
    ['a locale that is not supported', post({ action: 'start', locale: 'fr' })],
    ['an oversized body', post({ action: 'start', pad: 'x'.repeat(5_000) })],
    ['an array', post([{ action: 'start' }])],
  ] as const) {
    const s = setup()
    const r = await call(handleSeedPost(req, PROJECT, s.deps))
    check(`${name} → 400 invalid_request`, r.status === 400 && isStableRefusal(r, 'invalid_request') && s.tables.project_seed_runs.length === 0, r.text)
  }

  console.log('\n3) Entitlement — the existing decision, unchanged')
  {
    const s = setup({ access: { allowed: false, authority: 'website' } })
    const r = await call(handleSeedPost(post({ action: 'start' }), PROJECT, s.deps))
    check('not entitled → 403 entitlement_required, nothing created', r.status === 403 && isStableRefusal(r, 'entitlement_required') && s.tables.project_seed_runs.length === 0)
    check('the decision was asked with the SERVICE-ROLE client', (s.accessCalls[0] as { admin: unknown })?.admin === s.admin)
  }
  {
    const s = setup({ access: { allowed: false, authority: 'unreadable' } })
    const r = await call(handleSeedPost(post({ action: 'start' }), PROJECT, s.deps))
    check('entitlement unreadable (outage) → 503 entitlement_unavailable', r.status === 503 && isStableRefusal(r, 'entitlement_unavailable'))
  }
  {
    const s = setup({ access: async () => { throw new Error(`${SECRET}: governance read failed`) } })
    const { value: r, output } = await captureConsole(() => call(handleSeedPost(post({ action: 'start' }), PROJECT, s.deps)))
    check('an entitlement check that throws → 500 internal, its text nowhere', r.status === 500 && isStableRefusal(r, 'internal') && !r.text.includes(SECRET) && !output.includes(SECRET))
  }

  console.log('\n4) Starting a run')
  {
    const s = setup()
    const r = await call(handleSeedPost(post({ action: 'start' }), PROJECT, s.deps))
    const run = s.tables.project_seed_runs[0]
    check('202 { ok, runId, trigger: create } for the first run', r.status === 202 && r.json.ok === true && r.json.runId === run?.id && r.json.trigger === 'create'
      && Object.keys(r.json).sort().join(',') === 'ok,runId,trigger', r.text)
    check('the run is created leased, with four pending steps, owned by the user', run?.status === 'running' && run?.user_id === USER && !!run?.lease_expires_at
      && s.tables.project_seed_steps.length === 4)
    check('the snapshot starts from the project\'s admitted address', (run?.summary as Row).domain === HE_WP.key && (run?.summary as Row).url === 'https://plumber-tlv.co.il/')
    check('the work is scheduled after the response, not done inside it', s.scheduled.length === 1 && s.runStageCalls.length === 0)
    await s.scheduled[0]()
    const job = s.runStageCalls[0]
    check('…and runs stage A with the run\'s own lease and owner scope', job?.runId === run?.id && job?.lease === run?.lease_expires_at && job?.scope.userId === USER && job?.scope.projectId === PROJECT && job?.admin === s.admin)
    check('responses are never cached', r.headers.get('cache-control') === 'no-store')

    const again = await call(handleSeedPost(post({ action: 'start' }), PROJECT, s.deps))
    check('while it is live → 409 run_in_progress', again.status === 409 && isStableRefusal(again, 'run_in_progress') && s.tables.project_seed_runs.length === 1)
    s.c.advance(LEASE_MS + 1)
    const stalled = await call(handleSeedPost(post({ action: 'start' }), PROJECT, s.deps))
    check('its worker gone, the cron may still resume it: 409 run_in_progress, the run untouched',
      stalled.status === 409 && isStableRefusal(stalled, 'run_in_progress') && s.tables.project_seed_runs.length === 1 && s.tables.project_seed_runs[0].status === 'running', stalled.text)
    s.c.advance(MAX_RESUME_AGE_MS - LEASE_MS)
    const abandoned = await call(handleSeedPost(post({ action: 'start' }), PROJECT, s.deps))
    check('once the cron has given up on it (a day after it began), a new start supersedes it (trigger rescan)', abandoned.status === 202 && abandoned.json.trigger === 'rescan'
      && s.tables.project_seed_runs.find((x) => x.id === run.id)?.error_code === 'superseded', abandoned.text)
  }
  {
    // Stage A three days ago; stage B continued an hour ago, its worker gone
    // between two steps (no lease): the keywords are chosen, the work half done.
    const between = doneRun({
      status: 'running',
      stage: 'b',
      lease_expires_at: null,
      created_at: new Date(NOW.getTime() - 72 * 3600_000).toISOString(),
      started_at: new Date(NOW.getTime() - 3600_000).toISOString(),
      finished_at: null,
    })
    const s = setup({ extra: { project_seed_runs: [between] } })
    const before = JSON.stringify(s.tables.project_seed_runs)
    const r = await call(handleSeedPost(post({ action: 'start' }), PROJECT, s.deps))
    check('a stage B between two workers → 409 run_in_progress: neither the cooldown skipped nor the run superseded',
      r.status === 409 && isStableRefusal(r, 'run_in_progress') && JSON.stringify(s.tables.project_seed_runs) === before && s.scheduled.length === 0, r.text)
  }
  {
    const s = setup({ extra: { project_seed_runs: [doneRun({ created_at: new Date(NOW.getTime() - 2 * 3600_000).toISOString() })] } })
    const r = await call(handleSeedPost(post({ action: 'start' }), PROJECT, s.deps))
    check('a finished run 2h ago → 429 rescan_too_soon', r.status === 429 && isStableRefusal(r, 'rescan_too_soon'), r.text)
    check('…with Retry-After for the remaining 22h', r.headers.get('retry-after') === String(22 * 3600) && r.json.retryAfterSeconds === 22 * 3600, String(r.headers.get('retry-after')))
    s.c.advance(RESCAN_COOLDOWN_MS - 2 * 3600_000 + 1_000)
    const later = await call(handleSeedPost(post({ action: 'start' }), PROJECT, s.deps))
    check('24h after it → 202, trigger rescan', later.status === 202 && later.json.trigger === 'rescan', later.text)
  }
  {
    const s = setup({ extra: { project_seed_runs: [doneRun({ status: 'failed', error_code: 'site_unreachable', created_at: new Date(NOW.getTime() - 3600_000).toISOString() })] } })
    const r = await call(handleSeedPost(post({ action: 'start' }), PROJECT, s.deps))
    check('a FAILED run an hour ago does not hold a retry back', r.status === 202 && r.json.trigger === 'rescan', r.text)
  }
  {
    // The day's cap counts the WHOLE account, across every project, so until
    // 4 October 2026 a flat ten meant an account could map only ten of its
    // websites on the day it added them and every further one answered "you
    // have reached today's mapping limit" although it had never been mapped.
    // The cap now never sits below the websites the account may have.
    const mine = Array.from({ length: 10 }, (_, i) => doneRun({ project_id: `p-${i}`, created_at: new Date(NOW.getTime() - (i + 1) * 60_000).toISOString() }))
    const s = setup({ extra: { project_seed_runs: [...mine] } })
    const r = await call(handleSeedPost(post({ action: 'start' }), PROJECT, s.deps))
    const midnight = Date.UTC(2026, 8, 28) - NOW.getTime()
    check('an account entitled to no website: ten runs today → 429 user_daily_cap', r.status === 429 && isStableRefusal(r, 'user_daily_cap'), r.text)
    check('…retry after UTC midnight', r.json.retryAfterSeconds === midnight / 1000, String(r.json.retryAfterSeconds))
    const s2 = setup({ extra: { project_seed_runs: mine.slice(0, 2) }, env: { SEED_SCAN_USER_DAILY_CAP: '2' } })
    const r2 = await call(handleSeedPost(post({ action: 'start' }), PROJECT, s2.deps))
    check('SEED_SCAN_USER_DAILY_CAP overrides the default', r2.status === 429 && r2.json.code === 'user_daily_cap')
    const s3 = setup({ extra: { project_seed_runs: mine.slice(0, 9) } })
    const r3 = await call(handleSeedPost(post({ action: 'start' }), PROJECT, s3.deps))
    check('…and nine is still under the default of ten', r3.status === 202, r3.text)
    const yesterday = mine.map((m) => ({ ...m, created_at: new Date(NOW.getTime() - 11 * 3600_000).toISOString() }))
    const s4 = setup({ extra: { project_seed_runs: yesterday } })
    const r4 = await call(handleSeedPost(post({ action: 'start' }), PROJECT, s4.deps))
    check('runs from before UTC midnight do not count', r4.status === 202, r4.text)

    // The bug itself: an agency account mapping its websites one after another.
    const s5 = setup({ extra: { project_seed_runs: [...mine] }, siteAllowance: 100 })
    const r5 = await call(handleSeedPost(post({ action: 'start' }), PROJECT, s5.deps))
    check('an account entitled to 100 websites maps its eleventh today → 202, not the daily limit', r5.status === 202, r5.text)
    const hundred = Array.from({ length: 100 }, (_, i) => doneRun({ project_id: `q-${i}`, created_at: new Date(NOW.getTime() - (i + 1) * 60_000).toISOString() }))
    const s6 = setup({ extra: { project_seed_runs: [...hundred] }, siteAllowance: 100 })
    const r6 = await call(handleSeedPost(post({ action: 'start' }), PROJECT, s6.deps))
    check('…and once it has mapped all 100 today, the cap binds again', r6.status === 429 && isStableRefusal(r6, 'user_daily_cap'), r6.text)
    const s7 = setup({ extra: { project_seed_runs: [...mine] }, siteAllowance: 3 })
    const r7 = await call(handleSeedPost(post({ action: 'start' }), PROJECT, s7.deps))
    check('an allowance below the configured number never lowers the cap', r7.status === 429 && isStableRefusal(r7, 'user_daily_cap'), r7.text)
    const s8 = setup({ extra: { project_seed_runs: [...mine] }, siteAllowanceThrows: true })
    const r8 = await call(handleSeedPost(post({ action: 'start' }), PROJECT, s8.deps))
    check('an unreadable allowance leaves the configured number standing', r8.status === 429 && isStableRefusal(r8, 'user_daily_cap'), r8.text)

    // An admin account is unmetered everywhere else in the product.
    const s9 = setup({ extra: { project_seed_runs: [...mine] }, admins: [USER] })
    const r9 = await call(handleSeedPost(post({ action: 'start' }), PROJECT, s9.deps))
    check('an admin account has no cap of its own', r9.status === 202, r9.text)
    const s10 = setup({ extra: { project_seed_runs: [doneRun({ created_at: new Date(NOW.getTime() - 2 * 3600_000).toISOString() })] }, admins: [USER] })
    const r10 = await call(handleSeedPost(post({ action: 'start' }), PROJECT, s10.deps))
    check('…but this project\'s own 24h cooldown still binds it', r10.status === 429 && isStableRefusal(r10, 'rescan_too_soon'), r10.text)
    const s11 = setup({
      extra: { project_seed_runs: Array.from({ length: 300 }, (_, i) => doneRun({ user_id: `u-${i}`, project_id: `g-${i}`, created_at: new Date(NOW.getTime() - 60_000).toISOString() })) },
      admins: [USER],
    })
    const r11 = await call(handleSeedPost(post({ action: 'start' }), PROJECT, s11.deps))
    check('…and so does the global daily cap', r11.status === 429 && isStableRefusal(r11, 'global_daily_cap'), r11.text)

    // The rule itself, and the control: the flat number is what used to refuse.
    check('userDailyCap: the larger of the configured number and the allowance',
      userDailyCap({ isAdmin: false, siteAllowance: 100, configured: 10 }) === 100
      && userDailyCap({ isAdmin: false, siteAllowance: 1, configured: 10 }) === 10
      && userDailyCap({ isAdmin: true, siteAllowance: 1, configured: 10 }) === 'none')
    check('userDailyCap: a nonsense allowance is read as none at all',
      userDailyCap({ isAdmin: false, siteAllowance: Number.NaN, configured: 10 }) === 10
      && userDailyCap({ isAdmin: false, siteAllowance: -5, configured: 10 }) === 10
      && userDailyCap({ isAdmin: false, siteAllowance: 7.9, configured: 0 }) === 7)
    const flat = (i: { configured: number }) => i.configured
    check('CONTROL: the flat cap is what refused the eleventh website of a hundred',
      flat({ configured: DEFAULT_USER_DAILY_CAP }) <= 10 && (userDailyCap({ isAdmin: false, siteAllowance: 100, configured: DEFAULT_USER_DAILY_CAP }) as number) > 10)
  }
  {
    const everyone = Array.from({ length: 300 }, (_, i) => doneRun({ user_id: `u-${i}`, project_id: `p-${i}`, created_at: new Date(NOW.getTime() - 60_000).toISOString() }))
    const s = setup({ extra: { project_seed_runs: everyone } })
    const r = await call(handleSeedPost(post({ action: 'start' }), PROJECT, s.deps))
    check('300 runs today across everyone → 429 global_daily_cap', r.status === 429 && isStableRefusal(r, 'global_daily_cap'), r.text)
    const s2 = setup({ extra: { project_seed_runs: everyone.slice(0, 5) }, env: { SEED_SCAN_GLOBAL_DAILY_CAP: '5' } })
    check('SEED_SCAN_GLOBAL_DAILY_CAP overrides the default', (await call(handleSeedPost(post({ action: 'start' }), PROJECT, s2.deps))).json.code === 'global_daily_cap')
    const s3 = setup({ extra: { project_seed_runs: everyone.slice(0, 5) }, env: { SEED_SCAN_GLOBAL_DAILY_CAP: 'lots' } })
    check('a malformed cap falls back to the default', (await call(handleSeedPost(post({ action: 'start' }), PROJECT, s3.deps))).status === 202)
  }
  {
    const s = setup({ hooks: { project_seed_runs: { insert: () => ({ code: 'XX000', message: SECRET }) } } })
    const { value: r, output } = await captureConsole(() => call(handleSeedPost(post({ action: 'start' }), PROJECT, s.deps)))
    check('a database failure → 500 internal, the database\'s words nowhere', r.status === 500 && isStableRefusal(r, 'internal') && !r.text.includes(SECRET) && !output.includes(SECRET))
  }
  {
    const s = setup({ userHooks: { projects: { select: () => ({ code: 'XX000', message: SECRET }) } } })
    const { value: r, output } = await captureConsole(() => call(handleSeedPost(post({ action: 'start' }), PROJECT, s.deps)))
    check('a failed project read → 500 internal, no provider text', r.status === 500 && isStableRefusal(r, 'internal') && !r.text.includes(SECRET) && !output.includes(SECRET))
  }
  {
    const s = setup()
    await call(handleSeedPost(post({ action: 'start', locale: 'en' }), PROJECT, s.deps))
    check('an explicit locale in the body sets the snapshot language', (s.tables.project_seed_runs[0].summary as Row).locale === 'en')
  }

  console.log('\n5) Claiming a free check')
  {
    const token = randomBytes(32).toString('hex')
    const scan = claimedScan({ locale: 'en' })
    const s = setup({ extra: claimTables(token, scan) })
    const r = await call(handleSeedPost(post({ action: 'claim', token }), PROJECT, s.deps))
    check('a valid claim for this site → 202, trigger claim', r.status === 202 && r.json.trigger === 'claim', r.text)
    const a1 = s.tables.project_seed_steps.find((x) => x.step === 'a1')
    check('…the scan is stored on a1 for the runner', ((a1?.detail as Row)?.claim as Row)?.checkId === scan.checkId)
    const claimSummary = s.tables.project_seed_runs[0].summary as Row
    check("…the snapshot is a claim, in the scan's language (en), not the request's (he)", claimSummary.source === 'claim' && claimSummary.locale === 'en')
    const stored = ((a1?.detail as Row)?.claim ?? {}) as Row
    check('…a row with no seed (recorded before the column) is stored as its teaser: three findings, two by count, two competitors, no links',
      stored.basis === 'teaser' && (stored.findings as unknown[] | undefined)?.length === 3 && stored.findingsOmitted === 2 && (stored.competitors as unknown[] | undefined)?.length === 2
      && Array.isArray(stored.internalLinkUrls) && (stored.internalLinkUrls as unknown[]).length === 0, JSON.stringify({ b: stored.basis, o: stored.findingsOmitted }))
    check('…and the token is spent', !!s.tables.free_site_check_claims[0].consumed_at)
    // The same token on another project of the same user and site.
    s.tables.projects.push(projectRow({ id: OTHER_PROJECT }))
    const again = await call(handleSeedPost(new Request('https://app.example/x', { method: 'POST', body: JSON.stringify({ action: 'claim', token }) }), OTHER_PROJECT, s.deps))
    check('a token is single-use: the second redemption → 400 claim_invalid', again.status === 400 && isStableRefusal(again, 'claim_invalid'), again.text)
    check('…and no second run exists', s.tables.project_seed_runs.length === 1)
  }
  {
    // A row recorded since free_site_checks.seed: redeemed through the engine,
    // which reads the column, and stored as its ungated set.
    const token = randomBytes(32).toString('hex')
    const site = `https://www.${HE_WP.key}`
    const scan = claimedScan({ seed: claimSeed({ internalLinkUrls: [`${site}/services`, 'https://evil.example.com/x', `${site}/contact#form`] }) })
    const s = setup({ extra: claimTables(token, scan) })
    const r = await call(handleSeedPost(post({ action: 'claim', token }), PROJECT, s.deps))
    const stored = ((s.tables.project_seed_steps.find((x) => x.step === 'a1')?.detail as Row)?.claim ?? {}) as Row
    check('a claim whose row kept its seed → 202, and a1 stores the seed: every finding, none withheld, every competitor',
      r.status === 202 && stored.basis === 'seed' && (stored.findings as unknown[] | undefined)?.length === 5 && stored.findingsOmitted === 0
      && (stored.competitors as string[] | undefined)?.join(',') === 'rival-plumber.co.il,pipes-pro.co.il,leak-finders.co.il', `${r.status} ${JSON.stringify({ b: stored.basis, o: stored.findingsOmitted })}`)
    check("…and of its links, only this site's pages", JSON.stringify(stored.internalLinkUrls) === JSON.stringify([`${site}/services`, `${site}/contact`]), JSON.stringify(stored.internalLinkUrls))
    check('…the token is spent, one run', !!s.tables.free_site_check_claims[0].consumed_at && s.tables.project_seed_runs.length === 1)
  }
  {
    const token = randomBytes(32).toString('hex')
    const s = setup({ extra: claimTables(token, claimedScan({ domain: 'someone-else.co.il' })) })
    const r = await call(handleSeedPost(post({ action: 'claim', token }), PROJECT, s.deps))
    const malformed = await call(handleSeedPost(post({ action: 'claim', token: 'abc' }), PROJECT, setup().deps))
    check("a scan of ANOTHER site → 400 claim_invalid, and no run", r.status === 400 && isStableRefusal(r, 'claim_invalid') && s.tables.project_seed_runs.length === 0, r.text)
    check('…indistinguishable from a malformed, unknown or spent token (never says why)', r.text === malformed.text)
  }
  {
    const token = randomBytes(32).toString('hex')
    const s = setup({ extra: claimTables(token, claimedScan({ domain: HE_WP.key, url: 'https://evil.example.com/' })) })
    const r = await call(handleSeedPost(post({ action: 'claim', token }), PROJECT, s.deps))
    check('a ledger row whose URL is another site, whatever its domain says → claim_invalid', r.status === 400 && r.json.code === 'claim_invalid')
  }
  {
    const token = randomBytes(32).toString('hex')
    const s = setup({ extra: { ...claimTables(token, claimedScan()), project_seed_runs: [doneRun({ status: 'running', lease_expires_at: new Date(NOW.getTime() + 60_000).toISOString() })] } })
    const r = await call(handleSeedPost(post({ action: 'claim', token }), PROJECT, s.deps))
    check('a claim refused by a cap (409) does NOT spend the token', r.status === 409 && s.tables.free_site_check_claims[0].consumed_at === null)
    const s2 = setup({ extra: claimTables(token, claimedScan()), access: { allowed: false, authority: 'website' } })
    await call(handleSeedPost(post({ action: 'claim', token }), PROJECT, s2.deps))
    check('…nor does an entitlement refusal', s2.tables.free_site_check_claims[0].consumed_at === null)
    const s3 = setup({ extra: claimTables(token, claimedScan()), env: { ENABLE_SEED_SCAN: undefined } })
    await call(handleSeedPost(post({ action: 'claim', token }), PROJECT, s3.deps))
    check('…nor the feature flag', s3.tables.free_site_check_claims[0].consumed_at === null)
  }
  {
    const token = randomBytes(32).toString('hex')
    const s = setup({ extra: claimTables(token, claimedScan(), { created_at: new Date(NOW.getTime() - 25 * 3600_000).toISOString() }) })
    const r = await call(handleSeedPost(post({ action: 'claim', token }), PROJECT, s.deps))
    check('an expired token → claim_invalid', r.status === 400 && r.json.code === 'claim_invalid')
  }
  {
    const token = randomBytes(32).toString('hex')
    const s = setup({ extra: claimTables(token, claimedScan()), hooks: { free_site_check_claims: { update: () => ({ code: 'XX000', message: SECRET }) } } })
    const { value: r, output } = await captureConsole(() => call(handleSeedPost(post({ action: 'claim', token }), PROJECT, s.deps)))
    check('a redemption that fails in the database → claim_invalid, no provider text', r.status === 400 && r.json.code === 'claim_invalid' && !r.text.includes(SECRET) && !output.includes(SECRET))
  }
  {
    // The token is spent, then the run cannot be created: it is given back.
    const token = randomBytes(32).toString('hex')
    const hooks: Record<string, unknown> = { project_seed_runs: { insert: () => ({ code: 'XX000', message: SECRET }) } }
    const s = setup({ extra: claimTables(token, claimedScan()), hooks })
    const { value: r, output } = await captureConsole(() => call(handleSeedPost(post({ action: 'claim', token }), PROJECT, s.deps)))
    check('the run cannot be written after the token was spent → 500 internal, and the token is claimable again',
      r.status === 500 && isStableRefusal(r, 'internal') && s.tables.free_site_check_claims[0].consumed_at === null && s.tables.project_seed_runs.length === 0 && !output.includes(SECRET), `${r.text} ${String(s.tables.free_site_check_claims[0].consumed_at)}`)
    delete hooks.project_seed_runs
    const retry = await call(handleSeedPost(post({ action: 'claim', token }), PROJECT, s.deps))
    check('…so the same token then seeds the run: 202, trigger claim, spent', retry.status === 202 && retry.json.trigger === 'claim' && !!s.tables.free_site_check_claims[0].consumed_at, retry.text)
  }
  {
    // Another start wins the project between the caps and the create.
    const token = randomBytes(32).toString('hex')
    const hooks: Record<string, unknown> = {}
    const s = setup({ extra: claimTables(token, claimedScan()), hooks })
    let raced = false
    hooks.free_site_check_claims = {
      update: () => {
        if (!raced) {
          raced = true
          s.tables.project_seed_runs.push(doneRun({ status: 'running', lease_expires_at: new Date(NOW.getTime() + 60_000).toISOString(), created_at: new Date(NOW.getTime() - 1_000).toISOString() }))
        }
        return null
      },
    }
    const r = await call(handleSeedPost(post({ action: 'claim', token }), PROJECT, s.deps))
    check('a run started by another request after the token was spent → 409 run_in_progress, and the token is given back',
      raced && r.status === 409 && isStableRefusal(r, 'run_in_progress') && s.tables.free_site_check_claims[0].consumed_at === null, `${r.text} ${String(s.tables.free_site_check_claims[0].consumed_at)}`)
  }
  {
    const token = randomBytes(32).toString('hex')
    let updates = 0
    const hooks: Record<string, unknown> = {
      project_seed_runs: { insert: () => ({ code: 'XX000', message: SECRET }) },
      // The redemption lands; the return fails.
      free_site_check_claims: { update: () => (++updates === 2 ? { code: 'XX000', message: SECRET } : null) },
    }
    const s = setup({ extra: claimTables(token, claimedScan()), hooks })
    const { value: r, output } = await captureConsole(() => call(handleSeedPost(post({ action: 'claim', token }), PROJECT, s.deps)))
    check('the return itself fails: still 500 internal, one warning with the project only, no provider text',
      r.status === 500 && updates === 2 && output.includes('[seed-scan] claim not restored') && output.includes(PROJECT) && !output.includes(SECRET) && !output.includes(token), output)
  }
  {
    // restoreClaimToken on its own: only the consumption this request made.
    const token = randomBytes(32).toString('hex')
    const spentAt = new Date(NOW.getTime() - 1_000)
    const other = new Date(NOW.getTime() - 5_000)
    const s = setup({ extra: claimTables(token, claimedScan(), { consumed_at: other.toISOString() }) })
    check('a token some other redemption spent (another instant) is never revived',
      (await restoreClaimToken(s.admin, token, spentAt)) === false && s.tables.free_site_check_claims[0].consumed_at === other.toISOString())
    const t2 = randomBytes(32).toString('hex')
    const s2 = setup({ extra: claimTables(t2, claimedScan(), { consumed_at: spentAt.toISOString() }) })
    check('…another token, spent at the same instant, is not touched', (await restoreClaimToken(s2.admin, token, spentAt)) === false && s2.tables.free_site_check_claims[0].consumed_at === spentAt.toISOString())
    check('…the row this request spent is given back', (await restoreClaimToken(s2.admin, t2, spentAt)) === true && s2.tables.free_site_check_claims[0].consumed_at === null)
  }

  console.log('\n6) Reading the latest run')
  {
    const s = setup()
    const empty = await call(handleSeedGet(PROJECT, s.deps))
    check('no run yet → 200 { ok: true, run: null }', empty.status === 200 && empty.text === '{"ok":true,"run":null}', empty.text)
    await call(handleSeedPost(post({ action: 'start' }), PROJECT, s.deps))
    const job = s.runStageCalls.length ? s.runStageCalls[0] : null
    await s.scheduled[0]()
    const pending = await call(handleSeedGet(PROJECT, s.deps))
    const run = (pending.json as SeedGetResponse & { run: Row }).run
    check('a started run: running, not stalled, four steps, the initial snapshot',
      run?.status === 'running' && run?.stalled === false && (run?.steps as Row[]).length === 4 && (run?.summary as Row)?.version === 1, pending.text.slice(0, 200))
    check('the run is read through the user\'s own client', s.userLog.filter((t) => t === 'project_seed_runs').length > 0)
    const net = new FakeNetwork(heWordPressSite())
    await captureConsole(() => runStageA({ ...(job ?? s.runStageCalls[0]), deps: { fetchImpl: net.fetch, insight: fakeModel({ ok: true, insight: HE_WP_INSIGHT }).fn, search: fakeSearch(HE_WP_RESULTS).fn, now: s.c.now } }))
    const done = await call(handleSeedGet(PROJECT, s.deps))
    const view = (done.json as { run: Row }).run
    check('after stage A: done, and the exact top-level shape',
      done.status === 200 && Object.keys(done.json).sort().join(',') === 'ok,run'
      && Object.keys(view).sort().join(',') === 'errorCode,finishedAt,id,stage,stalled,startedAt,status,steps,summary,trigger' && view.status === 'done', Object.keys(view).join(','))
    const steps = view.steps as Row[]
    check('steps: a1-a4 in order, each { step, status, itemCount, errorCode, startedAt, finishedAt } and no detail',
      steps.map((x) => x.step).join(',') === 'a1,a2,a3,a4' && steps.every((x) => Object.keys(x).sort().join(',') === 'errorCode,finishedAt,itemCount,startedAt,status,step'), JSON.stringify(steps[0]))
    check('the step detail (stored signals, page text, saved answers) never leaves the server',
      !/internalLinkUrls|robotsTxt|"attempted"|"insight"|"claim"|"results"/.test(done.text), done.text.slice(0, 200))
    const summary = view.summary as Row
    check('the snapshot has exactly the documented fields',
      Object.keys(summary).sort().join(',') === 'audiences,business,competitors,counters,domain,findings,findingsOmitted,geo,locale,scannedAt,seedKeywords,siteAccess,sitemapTruncated,sitemapUrlCount,source,storefrontLocked,topics,url,version',
      Object.keys(summary).sort().join(','))
    s.tables.project_seed_runs[0].summary = { ...(s.tables.project_seed_runs[0].summary as Row), leaked: SECRET }
    const leak = await call(handleSeedGet(PROJECT, s.deps))
    check('anything else put into the stored snapshot is not served', !leak.text.includes(SECRET))
  }
  {
    const s = setup({ extra: { project_seed_runs: [doneRun({ status: 'running', lease_expires_at: new Date(NOW.getTime() - 1_000).toISOString() })] } })
    const r = await call(handleSeedGet(PROJECT, s.deps))
    check('a running run whose lease has lapsed is shown as stalled', (r.json.run as Row)?.stalled === true && (r.json.run as Row)?.status === 'running')
  }
  {
    const s = setup({ userHooks: { project_seed_runs: { select: () => ({ code: 'XX000', message: SECRET }) } } })
    const { value: r, output } = await captureConsole(() => call(handleSeedGet(PROJECT, s.deps)))
    check('a failed read → 500 internal, no provider text', r.status === 500 && isStableRefusal(r, 'internal') && !r.text.includes(SECRET) && !output.includes(SECRET))
  }
  {
    const s = setup({ extra: { project_seed_runs: [doneRun({ user_id: OTHER_USER })] } })
    const r = await call(handleSeedGet(PROJECT, s.deps))
    check("a run row of another user under this project id is not shown", r.status === 200 && r.text === '{"ok":true,"run":null}', r.text)
  }

  check(`${SECRET} appears in no log line of the whole suite`, !allLogs.includes(SECRET) && allLogs.includes('[seed-scan] run started'))

  finish()
}

main().catch((err) => {
  console.error('suite crashed', err)
  process.exit(1)
})
export {}
