/**
 * POST { action: 'continue' } of /api/projects/[id]/seed, through the REAL
 * route module: its session, its admin client, the real entitlement decision
 * (explainAccess), the real keywords-tab server action that adds the keywords
 * (createBulkTrackingTargetsAction, with its own ownership, entitlement and
 * keyword-per-project checks), and — for the work after the answer — the real
 * content route and the real scan route, called in-process as the merchant.
 *
 * Only the edges are replaced, as in lib/ops/__qa__/keyword-scan-and-volume:
 * the two Supabase clients (FakeAdmin over one set of tables), next/cache,
 * next/server's `after` (collected, then run by hand), and the rank
 * provider's transport (lib/scanner's runScan). The site is the fake network.
 *
 * What is asserted: the gate (the same as `start`), the 409s, that only the
 * run's own seed keywords are accepted, that they are added through the tab's
 * own action (a quota refusal adds nothing, stage B runs anyway), that two
 * concurrent requests move the run once, that a move whose steps cannot be
 * written hands the run back exactly as stage A left it, that the move
 * restarts the run's clock, what b6 is told, that the work after
 * the answer reaches the content route and the scan route as the merchant —
 * the scan counted against the plan's checks — that GET shows all ten steps,
 * that every service-role query of ours names the owner, and that provider
 * text never reaches a response or a log line.
 *
 * Run: npx tsx lib/seed-scan/__qa__/seed-continue.qa.ts
 */

/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-require-imports */
process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://qa.supabase.co'
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'qa-anon'
process.env.SUPABASE_SERVICE_ROLE_KEY = 'qa-svc'
process.env.ENABLE_SEED_SCAN = 'true'
for (const k of [
  'ENABLE_CONTENT',
  'ENABLE_CONTENT_AUTOMATION',
  'ENABLE_AI_VISIBILITY',
  'GEMINI_API_KEY',
  'GOOGLE_ADS_CLIENT_ID',
  'GOOGLE_ADS_CLIENT_SECRET',
  'GOOGLE_ADS_DEVELOPER_TOKEN',
  'GOOGLE_ADS_REFRESH_TOKEN',
  'GOOGLE_ADS_CUSTOMER_ID',
  'GOOGLE_ADS_LOGIN_CUSTOMER_ID',
]) delete process.env[k]

/*
 * `require()` is deliberate: tsx runs this file as CommonJS, and the
 * Module._load hook must be installed BEFORE the modules under test load.
 */
const Module: any = require('module')
const origLoad = Module._load
let USER_CLIENT: any = null
let ADMIN_CLIENT: any = null
let RUN_SCAN: (...a: any[]) => Promise<any> = async () => {
  throw new Error('no rank check expected')
}
/** What the route handed to `after()`, in order. */
const scheduled: (() => Promise<void>)[] = []
Module._load = function (request: string, parent: any, isMain: boolean) {
  let resolved = request
  try {
    resolved = String(Module._resolveFilename(request, parent, isMain))
  } catch {
    /* virtual */
  }
  if (resolved.endsWith('lib/supabase/server.ts')) return { createClient: async () => USER_CLIENT }
  if (resolved.endsWith('lib/supabase/admin.ts')) return { createAdminClient: () => ADMIN_CLIENT }
  // Only the rank provider's transport: the scan route's auth, entitlement,
  // reservation and persistence are the real thing.
  if (resolved.endsWith('lib/scanner.ts') || resolved.endsWith('lib/scanner/index.ts')) return { runScan: (...a: any[]) => RUN_SCAN(...a) }
  if (request === 'next/cache') return { revalidatePath: () => {}, revalidateTag: () => {} }
  if (request === 'next/server') {
    const real = origLoad.call(this, request, parent, isMain)
    return { ...real, after: (task: () => Promise<void>) => void scheduled.push(task) }
  }
  return origLoad.call(this, request, parent, isMain)
}

const { FakeAdmin } = require('../../__qa__/_fake-admin')
const fx = require('./_fixtures')
const bx = require('./_stage-b-fixtures')
const { auditOwners } = require('./_owner-audit')
const route = require('../../../app/api/projects/[id]/seed/route.ts')
const { POST: recommendationsPost } = require('../../../app/api/content/automation/recommendations/route.ts')
const { POST: scanPost } = require('../../../app/api/scan/route.ts')
const { callRouteInProcess } = require('../in-process.ts')
const { contentVerdict, rankVerdict } = require('../steps-b.ts')
const { addSeedKeywords } = require('../tracking.ts')
const { createSeedRun } = require('../store.ts')
const { initialSummary } = require('../summary.ts')
const { KeywordQuotaError, buildEntitlementUnavailableError } = require('../../quota.ts')

const { check, finish } = fx.makeChecker()
const { USER, OTHER_USER, PROJECT, SECRET, HE_WP_INSIGHT } = fx
const SEEDS: string[] = HE_WP_INSIGHT.keywords
const STEP_KEYS = ['errorCode', 'finishedAt', 'itemCount', 'startedAt', 'status', 'step']

// ── The world ───────────────────────────────────────────────────────────────

type Plan = 'premium' | 'trial' | 'none' | 'admin'
const inDays = (days: number) => new Date(Date.now() + days * 86_400_000).toISOString()

/** Website billing (the governance row says so): a paid plan, a trial, nothing, or an administrator. */
function billing(plan: Plan): Record<string, any[]> {
  const subscriptions =
    plan === 'premium'
      ? [{ id: 's1', user_id: USER, status: 'active', plan_code: 'premium', paypal_subscription_id: 'I-QA', current_period_start: '2026-09-01T00:00:00Z', current_period_end: '2099-01-01T00:00:00Z', trial_ends_at: null, created_at: '2026-01-01T00:00:00Z' }]
      : plan === 'trial'
        ? [{ id: 's1', user_id: USER, status: 'trial', plan_code: null, trial_ends_at: inDays(5), current_period_start: null, current_period_end: null, created_at: '2026-09-20T00:00:00Z' }]
        : []
  return {
    profiles: [{ id: USER, role: plan === 'admin' ? 'admin' : 'user' }],
    billing_governance: [{ user_id: USER, signup_origin: 'website', billing_authority: 'website', authority_reason: null }],
    shopify_connections: [],
    shopify_billing_migrations: [],
    subscriptions,
    scans: [],
    scan_results: [],
    usage_reservations: [],
  }
}

const trackedRows = (n: number) =>
  Array.from({ length: n }, (_, i) => ({ id: `kept-${i}`, project_id: PROJECT, user_id: USER, keyword: `existing keyword ${i}`, engine_type: 'google_search', is_active: true, location_mode: 'project' }))

type Setup = {
  plan?: Plan
  tracked?: number
  /** The latest run: a finished stage A (default), one still running, a failed one, or none. */
  latest?: 'done' | 'running' | 'failed' | 'none'
  signedIn?: boolean
  adminHooks?: Record<string, unknown>
  userHooks?: Record<string, unknown>
}

async function setup(o: Setup = {}) {
  const { tables, fake, admin } = fx.world(fx.projectRow(), { ...billing(o.plan ?? 'premium'), tracking_targets: trackedRows(o.tracked ?? 0) }, o.adminHooks ?? {})
  const user = new FakeAdmin(tables, o.userHooks ?? {})
  user.auth = { getUser: async () => ({ data: { user: o.signedIn === false ? null : { id: USER } }, error: null }) }
  ADMIN_CLIENT = fake
  USER_CLIENT = user
  scheduled.length = 0
  let runId: string | null = null
  const latest = o.latest ?? 'done'
  if (latest === 'done' || latest === 'failed') {
    runId = await bx.finishedStageA(admin, new fx.FakeNetwork(bx.crawlSite()), fx.clock().now)
    if (latest === 'failed') Object.assign(tables.project_seed_runs[0], { status: 'failed', error_code: 'site_unreachable' })
  } else if (latest === 'running') {
    const created = await createSeedRun(admin, bx.SCOPE, {
      trigger: 'create',
      stage: 'a',
      summary: initialSummary({ source: 'scan', domain: fx.HE_WP.key, url: 'https://plumber-tlv.co.il/', locale: 'he' }),
      now: new Date(),
    })
    runId = created.run.id
  }
  const audit = auditOwners(fake)
  return { tables, admin, user, runId, audit }
}

async function post(body: unknown, projectId: string = PROJECT) {
  const request = new Request(`http://localhost/api/projects/${projectId}/seed`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  })
  const { value, output } = await fx.captureConsole(() => route.POST(request, { params: Promise.resolve({ id: projectId }) }))
  const text = await value.text()
  return { status: value.status as number, body: JSON.parse(text), text, log: output as string }
}

async function get(projectId: string = PROJECT) {
  const request = new Request(`http://localhost/api/projects/${projectId}/seed`)
  const { value } = await fx.captureConsole(() => route.GET(request, { params: Promise.resolve({ id: projectId }) }))
  return { status: value.status as number, body: await value.json() }
}

/** Run what the route handed to after(), the site served by the fake network. */
async function runScheduled(net: { fetch: typeof fetch }) {
  const saved = globalThis.fetch
  globalThis.fetch = net.fetch
  try {
    return await fx.captureConsole(async () => {
      for (const task of scheduled.splice(0)) await task()
    })
  } finally {
    globalThis.fetch = saved
  }
}

const runOf = (t: any) => t.project_seed_runs[0]
const stepOf = (t: any, step: string) => t.project_seed_steps.find((s: any) => s.step === step)
const bLine = (t: any) =>
  ['b1', 'b2', 'b3', 'b4', 'b5', 'b6'].map((s) => `${s}:${stepOf(t, s)?.status}${stepOf(t, s)?.error_code ? `(${stepOf(t, s).error_code})` : ''}`).join(' ')
const newTargets = (t: any) => t.tracking_targets.filter((r: any) => !String(r.id).startsWith('kept-'))
const untouched = (t: any) => runOf(t)?.stage === 'a' && !t.project_seed_steps.some((s: any) => String(s.step).startsWith('b'))

async function main() {
  fx.installFakeDns()

  // ── 1. The gate: the same as `start` ──────────────────────────────────────
  console.log('1) The gate: signed in, their project, the flag, a well-formed body, entitled')
  {
    const s = await setup({ signedIn: false })
    const r = await post({ action: 'continue', keywords: [SEEDS[0]] })
    check('not signed in: 401 unauthorized', r.status === 401 && r.body.code === 'unauthorized')
    check('…nothing moved, nothing added, nothing scheduled', untouched(s.tables) && newTargets(s.tables).length === 0 && scheduled.length === 0)
  }
  {
    const s = await setup()
    s.tables.projects[0].user_id = OTHER_USER
    const r = await post({ action: 'continue', keywords: [SEEDS[0]] })
    check("someone else's project: 404 not_found", r.status === 404 && r.body.code === 'not_found')
  }
  {
    await setup()
    delete process.env.ENABLE_SEED_SCAN
    const r = await post({ action: 'continue', keywords: [SEEDS[0]] })
    process.env.ENABLE_SEED_SCAN = 'true'
    check('the feature off (not an administrator): 404 not_found', r.status === 404 && r.body.code === 'not_found')
  }
  {
    const s = await setup({ plan: 'none' })
    const r = await post({ action: 'continue', keywords: [SEEDS[0]] })
    check('not entitled: 403 entitlement_required, nothing moved', r.status === 403 && r.body.code === 'entitlement_required' && untouched(s.tables))
  }
  {
    const s = await setup({ adminHooks: { billing_governance: { select: () => ({ code: '42501', message: SECRET }) } } })
    const r = await post({ action: 'continue', keywords: [SEEDS[0]] })
    check('the entitlement cannot be read: 503 entitlement_unavailable, its error nowhere',
      r.status === 503 && r.body.code === 'entitlement_unavailable' && untouched(s.tables) && !r.text.includes(SECRET) && !r.log.includes(SECRET))
  }
  for (const [what, body] of [
    ['keywords missing', { action: 'continue' }],
    ['keywords not a list', { action: 'continue', keywords: SEEDS[0] }],
    ['six keywords', { action: 'continue', keywords: [...SEEDS, 'x'] }],
    ['a keyword not text', { action: 'continue', keywords: [SEEDS[0], 7] }],
    ['an empty keyword', { action: 'continue', keywords: [SEEDS[0], '  '] }],
    ['the same keyword twice', { action: 'continue', keywords: [SEEDS[0], ` ${SEEDS[0]}`] }],
    ['a keyword longer than any seed', { action: 'continue', keywords: ['א'.repeat(201)] }],
  ] as const) {
    const s = await setup()
    const r = await post(body)
    check(`malformed (${what}): 400 invalid_request, nothing moved`, r.status === 400 && r.body.code === 'invalid_request' && untouched(s.tables) && scheduled.length === 0)
  }

  // ── 2. Which run may continue ─────────────────────────────────────────────
  console.log('\n2) Only a finished stage A whose stage B has not begun')
  {
    await setup({ latest: 'none' })
    const r = await post({ action: 'continue', keywords: [SEEDS[0]] })
    check('no run yet: 409 not_continuable', r.status === 409 && r.body.code === 'not_continuable')
  }
  {
    const s = await setup({ latest: 'running' })
    const r = await post({ action: 'continue', keywords: [SEEDS[0]] })
    check('stage A still running: 409 not_continuable, the run untouched', r.status === 409 && r.body.code === 'not_continuable' && runOf(s.tables).status === 'running' && runOf(s.tables).stage === 'a')
  }
  {
    const s = await setup({ latest: 'failed' })
    const r = await post({ action: 'continue', keywords: [SEEDS[0]] })
    check('stage A failed (it read nothing): 409 not_continuable', r.status === 409 && r.body.code === 'not_continuable' && untouched(s.tables))
  }
  {
    const s = await setup()
    const first = await post({ action: 'continue', keywords: [SEEDS[0]] })
    const again = await post({ action: 'continue', keywords: [SEEDS[1]] })
    check('continued once already: 409 stage_b_started, nothing more added',
      first.status === 202 && again.status === 409 && again.body.code === 'stage_b_started' && newTargets(s.tables).length === 1 && scheduled.length === 1)
  }
  {
    const s = await setup()
    const [a, b] = await Promise.all([post({ action: 'continue', keywords: [SEEDS[0]] }), post({ action: 'continue', keywords: [SEEDS[1]] })])
    const statuses = [a.status, b.status].sort().join(',')
    check('two requests at once: ONE moves the run (202), the other is refused (409)', statuses === '202,409', statuses)
    check('…only the winner added its keyword, and one stage B is scheduled', newTargets(s.tables).length === 1 && scheduled.length === 1
      && s.tables.project_seed_steps.filter((x: any) => x.step === 'b1').length === 1)
  }

  {
    let failSteps = false
    // b1-b6 are written as one ON CONFLICT DO NOTHING upsert (startSeedStageB).
    const s = await setup({ adminHooks: { project_seed_steps: { upsert: () => (failSteps ? { code: 'XX000', message: SECRET } : null) } } })
    const before = structuredClone(runOf(s.tables))
    failSteps = true
    const r = await post({ action: 'continue', keywords: [SEEDS[0]] })
    failSteps = false
    const run = runOf(s.tables)
    const moved = ['stage', 'status', 'error_code', 'started_at', 'finished_at', 'lease_expires_at', 'summary'].filter((k) => JSON.stringify(run[k]) !== JSON.stringify(before[k]))
    check('b1-b6 cannot be written: 500 internal, the provider text nowhere', r.status === 500 && r.body.code === 'internal' && !r.text.includes(SECRET) && !r.log.includes(SECRET), r.text)
    check('…the run is handed back exactly as stage A left it (stage, status, code, both times, no lease); nothing added, nothing scheduled',
      moved.length === 0 && untouched(s.tables) && newTargets(s.tables).length === 0 && scheduled.length === 0, moved.join(','))
    const again = await post({ action: 'continue', keywords: [SEEDS[0]] })
    check('…so the merchant can simply continue again: 202, stage B', again.status === 202 && runOf(s.tables).stage === 'b' && scheduled.length === 1, again.text)
  }
  {
    // The rows are written, but the answer never arrives (a dropped connection).
    const s = await setup()
    fx.loseNextAnswer(ADMIN_CLIENT, 'project_seed_steps')
    const bRows = () => s.tables.project_seed_steps.filter((x: any) => String(x.step).startsWith('b'))
    const r = await post({ action: 'continue', keywords: [SEEDS[0]] })
    check('b1-b6 written but the answer lost: 500 internal, the run handed back as stage A left it, its six rows there',
      r.status === 500 && r.body.code === 'internal' && runOf(s.tables).stage === 'a' && runOf(s.tables).lease_expires_at === null && bRows().length === 6 && scheduled.length === 0, r.text)
    const again = await post({ action: 'continue', keywords: [SEEDS[0]] })
    check('…continuing again works (no duplicate-key 500): 202, stage B, still six rows, one stage B scheduled',
      again.status === 202 && runOf(s.tables).stage === 'b' && bRows().length === 6 && scheduled.length === 1, again.text)
  }

  // ── 3. Only the run's own seed keywords ───────────────────────────────────
  console.log("\n3) Only the run's own seed keywords, through the keywords tab's own action")
  {
    const s = await setup()
    const r = await post({ action: 'continue', keywords: [SEEDS[0], 'ביטוח רכב זול'] })
    check('a keyword that is not one of the run\'s seeds: 400 invalid_request', r.status === 400 && r.body.code === 'invalid_request')
    check('…nothing added, the run not moved, nothing scheduled', newTargets(s.tables).length === 0 && untouched(s.tables) && scheduled.length === 0)
  }
  {
    const s = await setup()
    const stageAStart = runOf(s.tables).started_at
    const t0 = Date.now()
    const r = await post({ action: 'continue', keywords: [`  ${SEEDS[0]} `, SEEDS[2]] })
    check('seeds are accepted and answered 202 with the tracking outcome',
      r.status === 202 && r.body.ok === true && r.body.runId === s.runId && r.body.stage === 'b' && r.body.trigger === 'create'
      && JSON.stringify(r.body.tracking) === JSON.stringify({ requested: 2, added: 2, code: 'keywords_added' }), r.text)
    const rows = newTargets(s.tables)
    check("the keywords are tracked in the run's own spelling", JSON.stringify(rows.map((x: any) => x.keyword)) === JSON.stringify([SEEDS[0], SEEDS[2]]), JSON.stringify(rows.map((x: any) => x.keyword)))
    check("…as the keywords tab's bulk form adds them: Google search, the project's domain and location, active, the owner's",
      rows.every((x: any) => x.engine_type === 'google_search' && x.location_mode === 'project' && x.target_domain === s.tables.projects[0].target_domain
        && x.is_active === true && x.user_id === USER && x.project_id === PROJECT && x.grid_size === null && 'exact_address_input' in x), JSON.stringify(rows[0]))
    const run = runOf(s.tables)
    check('the run moved to stage B, running, its lease held', run.stage === 'b' && run.status === 'running' && new Date(run.lease_expires_at).getTime() > Date.now())
    check("…its clock restarted: started_at is the move to stage B, finished_at cleared; stage A's start stays on a1",
      run.started_at !== stageAStart && Date.parse(run.started_at) >= t0 && run.finished_at === null && stepOf(s.tables, 'a1')?.started_at === stageAStart,
      `${String(stageAStart)} -> ${String(run.started_at)}`)
    check('b1-b6 were added, pending', ['b1', 'b2', 'b3', 'b4', 'b5', 'b6'].every((x) => stepOf(s.tables, x)?.status === 'pending'))
    check('b6 is told exactly the keywords added now, and the outcome',
      JSON.stringify(stepOf(s.tables, 'b6')?.detail?.targets) === JSON.stringify(rows.map((x: any) => x.id)) && stepOf(s.tables, 'b6')?.detail?.tracking?.code === 'keywords_added')
    check('stage B is handed to after(), once', scheduled.length === 1)
    check('one log line: ids and codes', /\[seed-scan\] stage b started/.test(r.log) && r.log.includes('keywords_added'))
    const offenders = s.audit.offenders(USER)
    check("every service-role query of ours names the owner (the run, its steps, what is tracked)", offenders.length === 0, offenders.join('; '))

    const g = await get()
    const steps = g.body.run?.steps ?? []
    check('GET shows all ten steps in order: stage A as it finished, then b1-b6',
      g.status === 200 && steps.map((x: any) => x.step).join(',') === 'a1,a2,a3,a4,b1,b2,b3,b4,b5,b6' && g.body.run.stage === 'b' && g.body.run.status === 'running',
      steps.map((x: any) => `${x.step}:${x.status}`).join(','))
    check("…every step in the same shape, stage B's included", steps.every((x: any) => JSON.stringify(Object.keys(x).sort()) === JSON.stringify(STEP_KEYS)))
  }
  {
    // A seed with capitals (a brand, a model name), sent in lower case: what is
    // tracked is the run's own spelling, not the request's.
    const s = await setup()
    const summary = runOf(s.tables).summary
    summary.seedKeywords = [...summary.seedKeywords.slice(0, 4), 'Boiler Repair TLV']
    const r = await post({ action: 'continue', keywords: ['boiler repair tlv'] })
    const tracked = newTargets(s.tables).map((x: any) => x.keyword)
    check("a seed sent in another case is tracked in the run's spelling", r.status === 202 && JSON.stringify(tracked) === JSON.stringify(['Boiler Repair TLV']),
      `${r.status} ${JSON.stringify(tracked)}`)
  }
  {
    const s = await setup()
    const r = await post({ action: 'continue', keywords: [] })
    check('no keyword chosen: 202, no_keywords_selected, stage B still scheduled',
      r.status === 202 && r.body.tracking.code === 'no_keywords_selected' && newTargets(s.tables).length === 0 && scheduled.length === 1)
  }
  {
    const s = await setup()
    s.tables.tracking_targets.push({ id: 'kept-a', project_id: PROJECT, user_id: USER, keyword: SEEDS[0], engine_type: 'google_search', is_active: true })
    const r = await post({ action: 'continue', keywords: [SEEDS[0]] })
    check('already tracked: 202, keywords_already_tracked, nothing added twice',
      r.status === 202 && r.body.tracking.code === 'keywords_already_tracked' && newTargets(s.tables).length === 0 && stepOf(s.tables, 'b6').detail.targets.length === 0)
  }

  // ── 4. Refusals of the add path: stage B runs anyway ──────────────────────
  console.log('\n4) The keywords tab refuses: a code in the answer, and stage B runs anyway')
  {
    // A trial allows 30 keywords per project; 30 are tracked.
    const s = await setup({ plan: 'trial', tracked: 30 })
    const r = await post({ action: 'continue', keywords: [SEEDS[0], SEEDS[1]] })
    check('the plan\'s keyword limit: 202 with keyword_quota_exceeded, nothing added',
      r.status === 202 && JSON.stringify(r.body.tracking) === JSON.stringify({ requested: 2, added: 0, code: 'keyword_quota_exceeded' }) && newTargets(s.tables).length === 0, r.text)
    check('…the run moved on to stage B all the same, and it is scheduled', runOf(s.tables).stage === 'b' && scheduled.length === 1)
    const net = new fx.FakeNetwork(bx.crawlSite())
    await runScheduled(net)
    check('…stage B ran: every step finished; b6 skipped keyword_quota_exceeded without a rank check',
      ['b1', 'b2', 'b3', 'b4', 'b5', 'b6'].every((x) => ['done', 'skipped', 'failed'].includes(stepOf(s.tables, x)?.status)) && stepOf(s.tables, 'b6').error_code === 'keyword_quota_exceeded'
      && s.tables.scan_results.length === 0 && ['done', 'partial'].includes(runOf(s.tables).status), bLine(s.tables))
  }
  {
    const s = await setup({ plan: 'trial', tracked: 29 })
    const r = await post({ action: 'continue', keywords: [SEEDS[0], SEEDS[1]] })
    check('room for one of two: the action adds none of them (keyword_quota_exceeded)', r.body.tracking?.code === 'keyword_quota_exceeded' && newTargets(s.tables).length === 0, r.text)
  }
  {
    const s = await setup({ plan: 'admin', tracked: 30 })
    const r = await post({ action: 'continue', keywords: [SEEDS[0], SEEDS[1]] })
    check('an administrator is not held to a plan limit (the entitlement rule, unchanged)', r.body.tracking?.code === 'keywords_added' && newTargets(s.tables).length === 2, r.text)
  }
  {
    // explainAccess reads the governance row first (and passes); the action's own read fails.
    let reads = 0
    const s = await setup({ adminHooks: { billing_governance: { select: () => (++reads > 1 ? { code: '42501', message: SECRET } : null) } } })
    const r = await post({ action: 'continue', keywords: [SEEDS[0]] })
    check("the action cannot read the entitlement: keyword_entitlement_unavailable, nothing added, stage B scheduled",
      r.status === 202 && r.body.tracking?.code === 'keyword_entitlement_unavailable' && newTargets(s.tables).length === 0 && scheduled.length === 1, r.text)
    check('…the database\'s text nowhere', !r.text.includes(SECRET) && !r.log.includes(SECRET))
  }
  {
    const s = await setup({ userHooks: { tracking_targets: { insert: () => ({ code: '23514', message: SECRET }) } } })
    const r = await post({ action: 'continue', keywords: [SEEDS[0]] })
    check('the insert fails: keywords_add_failed; the provider text is in no response and no log line',
      r.status === 202 && r.body.tracking?.code === 'keywords_add_failed' && !r.text.includes(SECRET) && !r.log.includes(SECRET) && newTargets(s.tables).length === 0, r.text)
  }
  {
    // The same refusals, with the action faked: only the class or code of what it throws is read.
    const { admin } = await setup()
    const scope = bx.SCOPE
    const thrower = (err: unknown) => async () => {
      throw err
    }
    const quota = await addSeedKeywords(admin, scope, { keywords: [SEEDS[0]], targetDomain: 'x' }, thrower(new KeywordQuotaError(SECRET)))
    const quotaByCode = await addSeedKeywords(admin, scope, { keywords: [SEEDS[0]], targetDomain: 'x' }, thrower(Object.assign(new Error(SECRET), { code: 'QUOTA_KEYWORDS_PER_PROJECT' })))
    const outage = await addSeedKeywords(admin, scope, { keywords: [SEEDS[0]], targetDomain: 'x' }, thrower(new Error(buildEntitlementUnavailableError().error)))
    const other = await addSeedKeywords(admin, scope, { keywords: [SEEDS[0]], targetDomain: 'x' }, thrower(new Error(SECRET)))
    check('a fake refusal: KeywordQuotaError, or its code from another bundle → keyword_quota_exceeded, nothing added',
      quota.outcome.code === 'keyword_quota_exceeded' && quotaByCode.outcome.code === 'keyword_quota_exceeded' && quota.targetIds.length === 0)
    check('…the entitlement outage → keyword_entitlement_unavailable; anything else → keywords_add_failed; no text carried',
      outage.outcome.code === 'keyword_entitlement_unavailable' && other.outcome.code === 'keywords_add_failed' && !JSON.stringify([quota, quotaByCode, outage, other]).includes(SECRET))
  }

  // ── 5. The work after the answer, as the merchant ─────────────────────────
  console.log('\n5) The work after the answer: the routes stage B calls, in-process, as the merchant')
  {
    await setup()
    const body = { projectId: PROJECT, source: 'hybrid', clientRequestId: 'seed-qa', qualityMode: 'standard' }
    const off = await fx.captureConsole(() => callRouteInProcess(recommendationsPost, '/api/content/automation/recommendations', body))
    check('the content route, off in this deployment: 404 Not found → b4 skipped content_engine_disabled',
      off.value.status === 404 && contentVerdict(off.value).code === 'content_engine_disabled', JSON.stringify(off.value))
    process.env.ENABLE_CONTENT = 'true'
    process.env.ENABLE_CONTENT_AUTOMATION = 'true'
    USER_CLIENT.auth = { getUser: async () => ({ data: { user: null }, error: null }) }
    const anon = await fx.captureConsole(() => callRouteInProcess(recommendationsPost, '/api/content/automation/recommendations', body))
    const anonScan = await fx.captureConsole(() => callRouteInProcess(scanPost, '/api/scan', { projectId: PROJECT, targetId: 't1' }))
    delete process.env.ENABLE_CONTENT
    delete process.env.ENABLE_CONTENT_AUTOMATION
    check('with no session the content route answers 401 → content_session_required', anon.value.status === 401 && contentVerdict(anon.value).code === 'content_session_required', JSON.stringify(anon.value))
    check('with no session the scan route answers 401 → rank_check_session_required', anonScan.value.status === 401 && rankVerdict(anonScan.value) === 'rank_check_session_required', JSON.stringify(anonScan.value))
  }
  {
    const s = await setup()
    const r = await post({ action: 'continue', keywords: [SEEDS[0], SEEDS[1]] })
    const scans: { engine: string; keyword: string }[] = []
    RUN_SCAN = async (engine: string, input: any) => {
      scans.push({ engine, keyword: input?.keyword })
      return { found: true, position: 4, resultUrl: 'https://www.plumber-tlv.co.il/', resultTitle: 'אינסטלציה מהירה', resultAddress: null, error: null, audit: null }
    }
    const net = new fx.FakeNetwork(bx.crawlSite())
    const { output } = await runScheduled(net)
    RUN_SCAN = async () => {
      throw new Error('no rank check expected')
    }
    const run = runOf(s.tables)
    check('the scheduled work runs stage B to the end', r.status === 202 && run.stage === 'b' && ['done', 'partial'].includes(run.status) && run.lease_expires_at === null, `${run.status} ${bLine(s.tables)}`)
    check('b1 read the site through the network the route has', stepOf(s.tables, 'b1')?.status === 'done' && s.tables.site_crawl_index.length === 1 && net.requests.length > 0, bLine(s.tables))
    check('b2/b3: Google Ads is not configured here → keyword_ideas_unavailable', stepOf(s.tables, 'b2')?.error_code === 'keyword_ideas_unavailable', bLine(s.tables))
    check('b4 reached the real content route in-process: off here → skipped content_engine_disabled', stepOf(s.tables, 'b4')?.error_code === 'content_engine_disabled', bLine(s.tables))
    check('b6 reached the real scan route as the merchant: both added keywords checked', stepOf(s.tables, 'b6')?.status === 'done' && stepOf(s.tables, 'b6')?.item_count === 2
      && JSON.stringify(scans.map((x) => x.keyword).sort()) === JSON.stringify([SEEDS[0], SEEDS[1]].sort()), `${bLine(s.tables)} ${JSON.stringify(scans)}`)
    const consumed = s.tables.usage_reservations.reduce((n: number, x: any) => n + Number(x.consumed_amount ?? 0), 0)
    check("…each check counted against the plan's keyword checks by the scan route itself", consumed === 2 && s.tables.scan_results.length === 2,
      JSON.stringify(s.tables.usage_reservations.map((x: any) => [x.reserved_amount, x.consumed_amount, x.status])))
    check('nothing of the provider or the site in a log line of ours', !output.includes(SECRET))
  }

  finish()
}

main().catch((err) => {
  console.error('suite crashed', err)
  process.exit(1)
})
export {}
