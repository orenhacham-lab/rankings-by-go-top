/**
 * PRE-MERGE SECURITY CONTRACTS for the AI allowance endpoint, and the proof
 * that reusing the operation name `ranking_scan` for an AI check cannot collide
 * with an actual ranking scan.
 *
 * THE ENDPOINT publishes a number derived from billing state, read with the
 * SERVICE-ROLE key — the key that bypasses RLS. Every guarantee it offers is
 * therefore the handler's own; the database will not catch a mistake here. So
 * each contract below is asserted against the REAL route module, from its real
 * answer, and each is paired with the attack it forbids rather than merely
 * describing the happy path.
 *
 * TWO CONTRACTS WERE MISSING when this suite was first written, and both were
 * found by running it rather than by reading the code:
 *
 *   * the answer carried `periodStart`, `periodEnd` and `plan` — three fields
 *     the UI never reads. Measured on the wire:
 *       {"state":"known","limit":20,"used":0,"remaining":20,
 *        "periodStart":"…","periodEnd":"…","plan":"advanced"}
 *   * an exception from any of the three database reads ESCAPED the handler
 *     entirely. There was no try/catch, so a missing service-role key produced
 *     an untyped 500 instead of the typed unavailable state the UI expects.
 *
 * THE COLLISION QUESTION. `operation_claims.claim_key` is the table's PRIMARY
 * KEY and `claim_operation` builds it as
 *     p_user_id::text || ':' || p_operation || ':' || p_scope
 * so two operations collide only if all THREE parts match. A ranking scan's
 * scope is `project:<id>:target:<id>` or `project:<id>:all`; an AI check's is
 * `project:<id>:prompt:<id>:engine:<engine>`. C3 below does not assert that
 * from the strings — it runs both operations SIMULTANEOUSLY for the same user
 * and the same project and shows both dispatch, and C5 collapses the AI scope
 * onto the scan's to show that when the keys DO match, they block. Without C5,
 * C3 would pass against a claim that never blocks anything.
 *
 * Run: npx tsx lib/ops/__qa__/allowance-endpoint-security.qa.ts
 */

/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-require-imports */
process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://qa.supabase.co'
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'qa-anon'
process.env.SUPABASE_SERVICE_ROLE_KEY = 'qa-svc'
process.env.SERPER_API_KEY = 'qa-serper'
process.env.ENABLE_AI_VISIBILITY = 'true'

const REAL_LOG = console.log, REAL_ERR = console.error
const quiet = () => { console.log = () => {}; console.error = () => {} }
const loud = () => { console.log = REAL_LOG; console.error = REAL_ERR }
const say = (...a: unknown[]) => REAL_LOG(...a)

const Module: any = require('module')
const origLoad = Module._load
let USER_CLIENT: any = null, ADMIN_CLIENT: any = null
let RUN_AI: any = null, RUN_SCAN: any = null
/** Set by the mutation control in C5 to collapse the AI scope onto the scan's. */
let COLLAPSE_AI_SCOPE = false
Module._load = function (request: string, parent: any, isMain: boolean) {
  let r = request
  try { r = String(Module._resolveFilename(request, parent, isMain)) } catch { /* virtual */ }
  if (r.endsWith('lib/supabase/server.ts')) return { createClient: async () => USER_CLIENT }
  if (r.endsWith('lib/supabase/admin.ts')) {
    return { createAdminClient: () => {
      // S7 drives a throw through the same door the real client would fail at.
      if (ADMIN_CLIENT === 'THROW') throw new Error('service role key missing')
      return ADMIN_CLIENT
    } }
  }
  if (r.endsWith('lib/ai-visibility/index.ts')) return { runAIVisibilityScan: (...a: any[]) => RUN_AI(...a) }
  if (r.endsWith('lib/scanner.ts') || r.endsWith('lib/scanner/index.ts')) return { runScan: (...a: any[]) => RUN_SCAN(...a) }
  if (r.endsWith('lib/ops/single-flight.ts')) {
    const real = origLoad.call(this, request, parent, isMain)
    return new Proxy(real, {
      get: (t: any, k: string) => {
        if (COLLAPSE_AI_SCOPE && (k === 'claimOperation' || k === 'releaseOperationClaim')) {
          // THE MUTATION CONTROL. Rewrite an AI check's scope to the shape a
          // ranking scan uses for the same project. If C3's two operations
          // still both dispatch under this, C3 proves nothing.
          return async (admin: any, args: any) => t[k](admin, {
            ...args,
            // onto the EXACT scope the racing ranking scan uses below, not
            // merely onto some other scan-shaped scope — collapsing it to
            // `:all` while the scan holds `:target:<id>` leaves the two keys
            // different and the control proves nothing. (It did, at first.)
            scope: /prompt:/.test(String(args.scope))
              ? `project:${PROJECT}:target:${TARGET_A}`
              : args.scope,
          })
        }
        return t[k]
      },
    })
  }
  if (request === 'next/cache') return { revalidatePath: () => {}, revalidateTag: () => {} }
  return origLoad.call(this, request, parent, isMain)
}

const { FakeAdmin } = require('../../__qa__/_fake-admin')
const { readFileSync } = require('fs')
const { join } = require('path')

let pass = 0, fail = 0
function check(name: string, cond: boolean, detail?: string) {
  if (cond) { pass++; say(`  ✓ ${name}`) } else { fail++; say(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`) }
}
const ROOT = join(__dirname, '..', '..', '..')
const read = (rel: string) => readFileSync(join(ROOT, rel), 'utf8')
/** Comments stripped — a source guard must not be satisfied, or defeated, by
 *  the prose explaining the rule. */
const readCode = (rel: string) => read(rel)
  .replace(/\/\*[\s\S]*?\*\//g, ' ')
  .replace(/(^|[^:])\/\/[^\n]*/g, '$1')

const USER = '674fc7c3-2048-48f4-ba25-6e2a6dff4a06'
const OTHER = '99999999-9999-9999-9999-999999999999'
const PROJECT = 'a1111111-2222-3333-4444-555555555555'
const OTHER_PROJECT = 'dddddddd-eeee-ffff-0000-111111111111'
const TARGET_A = 'b2222222-3333-4444-5555-666666666666'
const PROMPT_A = 'prompt-1'
const now = () => Date.now()

/** Two tenants in ONE database, both on Advanced, with different ledgers.
 *  Anything scoped correctly must see only its own half. */
function twoTenantTables(): Record<string, any[]> {
  const conn = (user: string, id: string) => ({
    id, user_id: user, connection_status: 'connected', archived_at: null,
    shop_domain: `${id}.myshopify.com`, shop_gid: `gid://shopify/Shop/${id}`,
    shopify_plan_handle: 'advanced', shopify_subscription_status: 'active',
    shopify_trial_ends_at: new Date(now() + 4 * 86_400_000).toISOString(),
    shopify_current_period_start: null, shopify_current_period_end: null,
    shopify_billing_verified_at: new Date(now() - 60_000).toISOString(),
    updated_at: new Date(now()).toISOString(),
  })
  const gov = (user: string) => ({ user_id: user, signup_origin: 'shopify_app_store',
    billing_authority: 'shopify', authority_reason: 'shopify_app_store_install' })
  return {
    profiles: [{ id: USER, role: 'user' }, { id: OTHER, role: 'user' }],
    billing_governance: [gov(USER), gov(OTHER)],
    shopify_connections: [conn(USER, 'conn-a'), conn(OTHER, 'conn-b')],
    shopify_billing_migrations: [], subscriptions: [],
    projects: [
      { id: PROJECT, user_id: USER, target_domain: 'a.myshopify.com', business_name: 'A',
        country: 'US', city: 'New York, NY', language: 'en', device_type: 'desktop' },
      { id: OTHER_PROJECT, user_id: OTHER, target_domain: 'b.myshopify.com', business_name: 'B',
        country: 'US', city: 'New York, NY', language: 'en', device_type: 'desktop' },
    ],
    tracking_targets: [{ id: TARGET_A, project_id: PROJECT, user_id: USER, keyword: 'shopify',
      engine_type: 'google_search', is_active: true, location_mode: 'project',
      avg_monthly_searches: null, metrics_updated_at: null }],
    ai_prompts: [{ id: PROMPT_A, project_id: PROJECT, user_id: USER, prompt: 'best shopify seo app',
      prompt_text: 'best shopify seo app', is_active: true, target_domain: null, target_brand_name: null, country: null }],
    scans: [], scan_results: [], ai_scan_runs: [], ai_scan_results: [], ai_citations: [],
    usage_reservations: [], operation_claims: [],
  }
}

/** A consumed AI check belonging to `user`, inside the period the resolver
 *  returns for a Shopify trial (its start is the trial window's start). */
function consumedCheck(user: string, periodStart: string, id: string, project: string) {
  return { id, user_id: user, project_id: project, usage_type: 'ai_check', status: 'consumed',
    reserved_amount: 1, consumed_amount: 1, released_amount: 0,
    period_start: periodStart, period_end: new Date(Date.parse(periodStart) + 7 * 86_400_000).toISOString(),
    idempotency_key: `k-${id}`, reserved_at: new Date(now() - 3_600_000).toISOString(),
    reservation_token: `tok-${id}`, related_ref: null }
}

function actAs(userId: string, t: Record<string, any[]>) {
  ADMIN_CLIENT = new FakeAdmin(t)
  USER_CLIENT = new FakeAdmin(t)
  ;(USER_CLIENT as any).auth = { getUser: async () => ({ data: { user: { id: userId } } }) }
}
const anonymous = (t: Record<string, any[]>) => {
  ADMIN_CLIENT = new FakeAdmin(t)
  USER_CLIENT = { auth: { getUser: async () => ({ data: { user: null } }) } }
}

async function main() {
  say('Allowance endpoint: security contracts, and the claim-key collision control\n')
  const { GET } = require('../../../app/api/ai-visibility/allowance/route.ts')
  const { resolveCurrentUsagePeriod } = require('../../billing/usage-period')
  const aiRoute = require('../../../app/api/ai-visibility/runs/route.ts')
  const scanRoute = require('../../../app/api/scan/route.ts')
  const routeSrc = readCode('app/api/ai-visibility/allowance/route.ts')

  // ── 1) an authenticated user is required ─────────────────────────────────
  say('\n1) it requires an authenticated user')
  {
    const t = twoTenantTables()
    anonymous(t)
    const res = await GET()
    const body = await res.json()
    check('S1a: an unauthenticated request is refused', res.status === 401, String(res.status))
    check('S1b: with no allowance in the answer',
      body.limit === undefined && body.used === undefined && body.state === undefined, JSON.stringify(body))
    check('S1c: and nothing was read from the ledger on its behalf',
      t.usage_reservations.length === 0 && t.operation_claims.length === 0)
    // The gate is the session, not a feature flag: prove the flag alone does not open it.
    check('S1d: the session is checked by the route itself, not delegated to a caller',
      /supabase\.auth\.getUser\(\)/.test(routeSrc) && /if \(!user\) return Response\.json/.test(routeSrc))
  }

  // ── 2) no caller-supplied identity is ever honoured ──────────────────────
  say('\n2) it never accepts another user id as authority')
  {
    const t = twoTenantTables()
    const period = await resolveCurrentUsagePeriod(new FakeAdmin(t), USER)
    const otherPeriod = await resolveCurrentUsagePeriod(new FakeAdmin(t), OTHER)
    // The OTHER tenant has spent 7 of their 20; this tenant has spent none.
    for (let i = 0; i < 7; i++) {
      t.usage_reservations.push(consumedCheck(OTHER, otherPeriod.start.toISOString(), `o${i}`, OTHER_PROJECT))
    }
    actAs(USER, t)

    // The signature is the guarantee: a handler that takes no request cannot
    // read a body, a query string or a header.
    check('S2a: the handler accepts no request argument at all', (GET as any).length === 0, String((GET as any).length))
    check('S2b: and its source reads no request input',
      !/\bsearchParams\b/.test(routeSrc) && !/request\./.test(routeSrc)
      && !/\.json\(\)\s*as/.test(routeSrc) && !/headers\(\)/.test(routeSrc))

    // Try anyway, through every channel an attacker actually has.
    const forged = new Request(`http://localhost/api/ai-visibility/allowance?userId=${OTHER}&projectId=${OTHER_PROJECT}&limit=999`, {
      method: 'GET', headers: { 'x-user-id': OTHER, 'x-gotop-user': OTHER, cookie: `userId=${OTHER}` },
    })
    const forgedRes = await (GET as any)(forged)
    const forgedBody = await forgedRes.json()
    check('S2c: a forged user id in the query, headers and cookie changes nothing',
      forgedBody.state === 'known' && forgedBody.used === 0 && forgedBody.limit === 20, JSON.stringify(forgedBody))
    check('S2d: it is THIS account’s ledger, not the one named in the request',
      forgedBody.used !== 7, `used=${forgedBody.used}`)
    void period
  }

  // ── 3) entitlement and usage are scoped to the session's account ─────────
  say('\n3) entitlement and usage are scoped to the authenticated account')
  {
    const t = twoTenantTables()
    const pA = (await resolveCurrentUsagePeriod(new FakeAdmin(t), USER)).start.toISOString()
    const pB = (await resolveCurrentUsagePeriod(new FakeAdmin(t), OTHER)).start.toISOString()
    for (let i = 0; i < 3; i++) t.usage_reservations.push(consumedCheck(USER, pA, `a${i}`, PROJECT))
    for (let i = 0; i < 7; i++) t.usage_reservations.push(consumedCheck(OTHER, pB, `b${i}`, OTHER_PROJECT))

    actAs(USER, t)
    const a = await (await GET()).json()
    actAs(OTHER, t)
    const b = await (await GET()).json()

    check('S3a: each account is told its own usage', a.used === 3 && b.used === 7,
      `A=${a.used} B=${b.used}`)
    check('S3b: and its own remaining', a.remaining === 17 && b.remaining === 13,
      `A=${a.remaining} B=${b.remaining}`)
    check('S3c: ten rows in one table, and neither account saw the other’s',
      t.usage_reservations.length === 10 && a.used + b.used === 10)
    // The number shown must be the number the gate uses. reserve_usage counts
    // WHERE user_id = … AND usage_type = … AND period_start = … — account-wide,
    // never per project — and this reader must use the same predicate.
    const readerSrc = readCode('lib/billing/usage-allowance.ts')
    check('S3d: the reader filters on the account, the usage type and the period',
      /\.eq\('user_id', args\.userId\)/.test(readerSrc)
      && /\.eq\('usage_type', args\.usageType\)/.test(readerSrc)
      && /\.eq\('period_start', period\.start\.toISOString\(\)\)/.test(readerSrc))
    check('S3e: and adds no project filter the enforcing RPC does not have',
      !/project_id/.test(readerSrc))
  }

  // ── 4) project ownership ─────────────────────────────────────────────────
  say('\n4) project ownership')
  {
    // The endpoint accepts NO project id, so there is no project to validate —
    // which is the strongest form of the contract. Prove the absence, then
    // prove the consequence: another tenant's project cannot steer the answer.
    check('S4a: no project id is accepted anywhere in the route',
      !/projectId/i.test(routeSrc), 'route mentions a project id')
    check('S4b: nor threaded into the ledger read',
      !/projectId/i.test(readCode('lib/billing/usage-allowance.ts')))

    const t = twoTenantTables()
    const pA = (await resolveCurrentUsagePeriod(new FakeAdmin(t), USER)).start.toISOString()
    // A row that names THIS user's period but ANOTHER user's project…
    t.usage_reservations.push(consumedCheck(USER, pA, 'own-other-project', OTHER_PROJECT))
    // …and a row on this user's own project belonging to the other tenant.
    t.usage_reservations.push(consumedCheck(OTHER, pA, 'other-own-project', PROJECT))
    actAs(USER, t)
    const a = await (await GET()).json()
    check('S4c: usage follows the ACCOUNT, exactly as reserve_usage counts it',
      a.used === 1, `used=${a.used}`)
    check('S4d: and a foreign tenant’s row on this project is not counted',
      a.used !== 2 && a.remaining === 19, JSON.stringify(a))

    // The dispatcher, which DOES take a project id, is the one that owns the
    // ownership check — and it refuses a project that is not the caller's.
    const aiSrc = readCode('app/api/ai-visibility/runs/route.ts')
    check('S4e: the dispatching route verifies project ownership before any work',
      /user_id.*!== user\.id/.test(aiSrc) && /Forbidden/.test(aiSrc))
    actAs(USER, t)
    quiet()
    const stolen = await aiRoute.POST(new Request('http://localhost/api/ai-visibility/runs', {
      method: 'POST', body: JSON.stringify({ projectId: OTHER_PROJECT, promptId: PROMPT_A, engine: 'chatgpt' }) }))
    loud()
    check('S4f: dispatching against another tenant’s project is refused',
      stolen.status === 403 || stolen.status === 404, String(stolen.status))
    check('S4g: and it reserved nothing while refusing',
      t.usage_reservations.filter((r: any) => r.id === undefined || String(r.id).startsWith('res')).length === 0)
  }

  // ── 5) no cross-tenant disclosure ────────────────────────────────────────
  say('\n5) it cannot expose another tenant’s allowance, period, reservations or identifiers')
  {
    const t = twoTenantTables()
    const pB = (await resolveCurrentUsagePeriod(new FakeAdmin(t), OTHER)).start.toISOString()
    for (let i = 0; i < 19; i++) t.usage_reservations.push(consumedCheck(OTHER, pB, `x${i}`, OTHER_PROJECT))
    t.operation_claims.push({ claim_key: `${OTHER}:ranking_scan:project:${OTHER_PROJECT}:all`,
      user_id: OTHER, operation: 'ranking_scan', scope: `project:${OTHER_PROJECT}:all`,
      holder_request_id: 'op_other_secret', claimed_at: new Date(now()).toISOString(),
      expires_at: new Date(now() + 120_000).toISOString() })

    actAs(USER, t)
    const raw = JSON.stringify(await (await GET()).json())
    const forbidden: Array<[string, string]> = [
      ['the other tenant’s user id', OTHER],
      ['the other tenant’s project id', OTHER_PROJECT],
      ['a reservation id', 'x0'],
      ['a reservation token', 'tok-x0'],
      ['an idempotency key', 'k-x0'],
      ['their in-flight request id', 'op_other_secret'],
      ['their shop domain', 'conn-b.myshopify.com'],
    ]
    for (const [what, needle] of forbidden) {
      check(`S5-${what} does not appear in the answer`, !raw.includes(needle), raw)
    }
    check('S5h: and their 19 consumed checks did not move this account’s number',
      JSON.parse(raw).used === 0 && JSON.parse(raw).remaining === 20, raw)
  }

  // ── 6) the answer is the minimum the UI renders ──────────────────────────
  say('\n6) it returns only the minimum display fields')
  {
    const t = twoTenantTables()
    actAs(USER, t)
    const known = await (await GET()).json()
    check('S6a: a known allowance carries exactly used/limit/remaining',
      JSON.stringify(Object.keys(known).sort()) === JSON.stringify(['limit', 'remaining', 'state', 'used']),
      JSON.stringify(known))
    check('S6b: not the billing period boundaries',
      known.periodStart === undefined && known.periodEnd === undefined, JSON.stringify(known))
    check('S6c: nor the plan code', known.plan === undefined, JSON.stringify(known))

    // Admin: unmetered, and nothing else.
    const adminTables = twoTenantTables()
    adminTables.profiles = [{ id: USER, role: 'admin' }]
    actAs(USER, adminTables)
    const unmetered = await (await GET()).json()
    check('S6d: an unmetered account is told only that',
      JSON.stringify(Object.keys(unmetered)) === JSON.stringify(['state']) && unmetered.state === 'unmetered',
      JSON.stringify(unmetered))

    // Unknown: the discriminator stays server-side.
    const broken = twoTenantTables()
    broken.billing_governance = []; broken.shopify_connections = []; broken.subscriptions = []
    actAs(USER, broken)
    quiet(); const unknown = await (await GET()).json(); loud()
    check('S6e: an unavailable allowance is told only that, with no internal reason',
      unknown.state === 'unknown' && unknown.reason === undefined
      && JSON.stringify(Object.keys(unknown)) === JSON.stringify(['state']), JSON.stringify(unknown))

    // And the UI genuinely reads no more than this.
    const uiSrc = readCode('components/ai-visibility/AIVisibilitySection.tsx')
    const uiUses = ['allowance.used', 'allowance.limit', 'allowance.remaining']
    check('S6f: the UI reads exactly those three numbers',
      uiUses.every((u) => uiSrc.includes(u))
      && !/allowance\.(periodStart|periodEnd|plan|reason)/.test(uiSrc))
  }

  // ── 7) it fails closed, and says so in the merchant's language ───────────
  say('\n7) it fails closed with a typed, localizable unavailable state')
  {
    // (a) entitlement cannot be resolved at all
    const t = twoTenantTables()
    t.billing_governance = []; t.shopify_connections = []; t.subscriptions = []
    actAs(USER, t)
    quiet(); const r1 = await GET(); const b1 = await r1.json(); loud()
    check('S7a: an unresolvable entitlement answers `unknown`', b1.state === 'unknown', JSON.stringify(b1))
    check('S7b: and NEVER a zero allowance',
      b1.limit === undefined && b1.used === undefined && b1.remaining === undefined, JSON.stringify(b1))

    // (b) a read THROWS — the case that used to escape the handler
    ADMIN_CLIENT = 'THROW'
    quiet()
    let escaped = false
    let b2: any = null
    try { b2 = await (await GET()).json() } catch { escaped = true }
    loud()
    check('S7c: an exception does not escape the handler', !escaped)
    check('S7d: it becomes the same typed unavailable state', b2 && b2.state === 'unknown', JSON.stringify(b2))
    check('S7e: with nothing of the underlying error published',
      b2 && !JSON.stringify(b2).toLowerCase().includes('service role')
      && !JSON.stringify(b2).toLowerCase().includes('key'), JSON.stringify(b2))
    check('S7f: and the route has a catch to make that structural',
      /catch\s*\{/.test(routeSrc) && /state: 'unknown'/.test(routeSrc))

    // (c) the typed state has copy in both languages, so "unknown" is readable
    const i18n = read('lib/ai-visibility/i18n.ts')
    const m = i18n.match(/ai_allowance_unknown:\s*\{([^}]*)\}/)
    check('S7g: the unavailable state is localized in Hebrew and English',
      !!m && /he:\s*'[^']+'/.test(m[1]) && /en:\s*'[^']+'/.test(m[1]), m ? m[1] : 'missing')
    const uiSrc = readCode('components/ai-visibility/AIVisibilitySection.tsx')
    check('S7h: and the UI renders that copy rather than implying zero',
      /allowance\.state === 'unknown' \? t\('ai_allowance_unknown'\)/.test(uiSrc))
    check('S7i: a failed fetch also lands on `unknown`, never on a number',
      /setAllowance\(\{ state: 'unknown' \}\)/.test(uiSrc))
  }

  // ── C) the claim key, and the collision that cannot happen ───────────────
  say('\nC) the persisted claim key, and a concurrent ranking scan vs AI check')
  {
    const sql = read('supabase/migrations/20260909000000_operation_claims.sql')
    check('C1a: `claim_key` is the table’s PRIMARY KEY',
      /claim_key\s+text\s+PRIMARY KEY/.test(sql))
    check('C1b: and it is built from user, operation AND scope',
      /v_key\s*:=\s*p_user_id::text\s*\|\|\s*':'\s*\|\|\s*p_operation\s*\|\|\s*':'\s*\|\|\s*p_scope/.test(sql))
    check('C1c: with the conflict resolved on that key alone',
      /ON CONFLICT \(claim_key\) DO UPDATE/.test(sql))

    const aiSrc = readCode('app/api/ai-visibility/runs/route.ts')
    const sfSrc = readCode('lib/ops/single-flight.ts')
    check('C1d: an AI check’s scope names the prompt and the engine',
      /project:\$\{projectId\}:prompt:\$\{promptId\}:engine:\$\{engine\}/.test(aiSrc))
    check('C1e: a ranking scan’s scope names the target, or "all"',
      /project:\$\{projectId\}:target:\$\{targetId\}/.test(sfSrc) && /project:\$\{projectId\}:all/.test(sfSrc))

    // C2 — the exact keys the database would hold, side by side.
    const key = (u: string, op: string, scope: string) => `${u}:${op}:${scope}`
    const scanKey = key(USER, 'ranking_scan', `project:${PROJECT}:target:${TARGET_A}`)
    const scanAllKey = key(USER, 'ranking_scan', `project:${PROJECT}:all`)
    const aiKey = key(USER, 'ranking_scan', `project:${PROJECT}:prompt:${PROMPT_A}:engine:chatgpt`)
    say(`    scan (one target) : ${scanKey}`)
    say(`    scan (all)        : ${scanAllKey}`)
    say(`    AI check          : ${aiKey}`)
    check('C2a: the AI check’s primary key differs from a single-target scan’s', aiKey !== scanKey)
    check('C2b: and from "scan all"’s', aiKey !== scanAllKey)
    check('C2c: the scope TYPE differs, not merely the id',
      aiKey.includes(':prompt:') && !scanKey.includes(':prompt:') && !scanAllKey.includes(':prompt:'))
    check('C2d: no scan scope can ever be a prefix-collision of an AI scope',
      !scanKey.startsWith(aiKey) && !aiKey.startsWith(scanKey)
      && !scanAllKey.startsWith(aiKey) && !aiKey.startsWith(scanAllKey))

    // C3 — THE NEGATIVE CONTROL, run rather than reasoned. Same user, same
    // project, same operation name, genuinely simultaneous.
    {
      const t = twoTenantTables()
      actAs(USER, t)
      let aiDispatches = 0, scanDispatches = 0
      RUN_AI = async () => { aiDispatches++; await new Promise((r) => setTimeout(r, 120))
        return { mentionedInText: true, targetCitedInSources: false, mentionedPositions: null,
          citationCount: 0, sourceCount: 0, responseText: 'x', responseSummary: null,
          rawResponse: {}, citations: [], creditsUsed: 1, error: null } }
      RUN_SCAN = async () => { scanDispatches++; await new Promise((r) => setTimeout(r, 120))
        return { found: true, position: 7, resultUrl: null, resultTitle: null,
          resultAddress: null, error: null, audit: null } }
      quiet()
      const [aiRes, scanRes] = await Promise.all([
        aiRoute.POST(new Request('http://localhost/api/ai-visibility/runs', { method: 'POST',
          body: JSON.stringify({ projectId: PROJECT, promptId: PROMPT_A, engine: 'chatgpt' }) })),
        scanRoute.POST(new Request('http://localhost/api/scan', { method: 'POST',
          body: JSON.stringify({ projectId: PROJECT, targetId: TARGET_A }) })),
      ])
      const aiBody = await aiRes.json().catch(() => null)
      const scanBody = await scanRes.json().catch(() => null)
      loud()
      check('C3a: the AI check ran — it was not told a scan was in progress',
        aiRes.status === 200 && aiBody?.errorCode !== 'AI_CHECK_IN_PROGRESS',
        `${aiRes.status} ${JSON.stringify(aiBody)?.slice(0, 120)}`)
      check('C3b: the ranking scan ran — it was not blocked by the AI check',
        scanRes.status === 200 && scanBody?.errorCode !== 'SCAN_IN_PROGRESS',
        `${scanRes.status} ${JSON.stringify(scanBody)?.slice(0, 120)}`)
      check('C3c: BOTH providers were dispatched, once each',
        aiDispatches === 1 && scanDispatches === 1, `ai=${aiDispatches} scan=${scanDispatches}`)
      check('C3d: each charged its own usage type',
        t.usage_reservations.filter((r: any) => r.usage_type === 'ai_check').length === 1
        && t.usage_reservations.filter((r: any) => r.usage_type === 'google_check').length === 1,
        JSON.stringify(t.usage_reservations.map((r: any) => r.usage_type)))
      check('C3e: and both claims were released, so neither wedged the other',
        t.operation_claims.length === 0, JSON.stringify(t.operation_claims.map((c: any) => c.claim_key)))
    }

    // C4 — the two keys really were distinct while both were live. Same race,
    // with the claims held open, so the rows can be inspected mid-flight.
    {
      const t = twoTenantTables()
      actAs(USER, t)
      const seen: string[] = []
      const hold = async () => { seen.push(...t.operation_claims.map((c: any) => String(c.claim_key)))
        await new Promise((r) => setTimeout(r, 60)) }
      RUN_AI = async () => { await hold()
        return { mentionedInText: true, targetCitedInSources: false, mentionedPositions: null,
          citationCount: 0, sourceCount: 0, responseText: 'x', responseSummary: null,
          rawResponse: {}, citations: [], creditsUsed: 1, error: null } }
      RUN_SCAN = async () => { await hold()
        return { found: true, position: 7, resultUrl: null, resultTitle: null,
          resultAddress: null, error: null, audit: null } }
      quiet()
      await Promise.all([
        aiRoute.POST(new Request('http://localhost/api/ai-visibility/runs', { method: 'POST',
          body: JSON.stringify({ projectId: PROJECT, promptId: PROMPT_A, engine: 'chatgpt' }) })),
        scanRoute.POST(new Request('http://localhost/api/scan', { method: 'POST',
          body: JSON.stringify({ projectId: PROJECT, targetId: TARGET_A }) })),
      ])
      loud()
      const distinct = [...new Set(seen)]
      check('C4a: two DISTINCT claim rows existed at once, not one shared row',
        distinct.length === 2, JSON.stringify(distinct))
      check('C4b: one keyed by the prompt and engine, one by the target',
        distinct.some((k) => k.includes(':prompt:') && k.includes(':engine:'))
        && distinct.some((k) => k.includes(':target:')), JSON.stringify(distinct))
      check('C4c: both under the same user and the same operation name',
        distinct.every((k) => k.startsWith(`${USER}:ranking_scan:`)), JSON.stringify(distinct))
    }

    // C5 — MUTATION CONTROL. Collapse the AI scope onto the scan's. If C3 is a
    // real test, the same two requests must now collide.
    {
      COLLAPSE_AI_SCOPE = true
      const t = twoTenantTables()
      actAs(USER, t)
      let aiDispatches = 0, scanDispatches = 0
      RUN_AI = async () => { aiDispatches++; await new Promise((r) => setTimeout(r, 120))
        return { mentionedInText: true, targetCitedInSources: false, mentionedPositions: null,
          citationCount: 0, sourceCount: 0, responseText: 'x', responseSummary: null,
          rawResponse: {}, citations: [], creditsUsed: 1, error: null } }
      RUN_SCAN = async () => { scanDispatches++; await new Promise((r) => setTimeout(r, 120))
        return { found: true, position: 7, resultUrl: null, resultTitle: null,
          resultAddress: null, error: null, audit: null } }
      quiet()
      const [aiRes, scanRes] = await Promise.all([
        aiRoute.POST(new Request('http://localhost/api/ai-visibility/runs', { method: 'POST',
          body: JSON.stringify({ projectId: PROJECT, promptId: PROMPT_A, engine: 'chatgpt' }) })),
        scanRoute.POST(new Request('http://localhost/api/scan', { method: 'POST',
          body: JSON.stringify({ projectId: PROJECT, targetId: TARGET_A }) })),
      ])
      const both = [await aiRes.json().catch(() => null), await scanRes.json().catch(() => null)]
      loud()
      COLLAPSE_AI_SCOPE = false
      const blocked = both.filter((b: any) => b?.errorCode === 'AI_CHECK_IN_PROGRESS' || b?.errorCode === 'SCAN_IN_PROGRESS')
      check('C5a: with the scopes collapsed, one of the two IS blocked',
        blocked.length === 1, JSON.stringify(both.map((b: any) => b?.errorCode ?? 'ok')))
      check('C5b: and only one provider is dispatched',
        aiDispatches + scanDispatches === 1, `ai=${aiDispatches} scan=${scanDispatches}`)
      check('C5c: so C3 measures the scope, not a claim that never blocks',
        blocked.length === 1 && aiDispatches + scanDispatches === 1)
    }
  }

  say(`\n${pass} passed, ${fail} failed`)
  if (fail > 0) process.exitCode = 1
}

main().catch((e) => { loud(); console.error(e); process.exitCode = 1 })
export {}
