/**
 * TRUE CONCURRENCY for the two provider-calling merchant operations.
 *
 * Every case below starts its requests with `Promise.all` against the REAL
 * route modules — not a sequential approximation. That matters because the
 * failure being prevented is precisely an interleave: Node yields at every
 * `await`, so two in-flight requests genuinely take turns between the
 * entitlement read, the reservation and the provider call.
 *
 * WHAT WAS WRONG. Three claimed protections were not protections:
 *
 *   * the scan route's trial branch asserted "no concurrent-job race risk for a
 *     single trial user clicking scan from one browser session". The reviewer
 *     disproved it by clicking again while the first attempt looked stuck;
 *   * the paid branch keyed its usage reservation on the server's PER-REQUEST
 *     id, which is fresh every time — two clicks reserved twice and dispatched
 *     twice;
 *   * the search-volume guard was a React ref, which cannot see a second tab, a
 *     reload mid-flight, two direct POSTs, or the automatic refresh racing a
 *     manual one.
 *
 * The protection is now a claim the DATABASE enforces
 * (supabase/migrations/20260909000000_operation_claims.sql). This suite proves
 * the routes' behaviour around it; the atomicity itself was measured against a
 * real PostgreSQL cluster — twenty parallel backends racing one scope returned
 * exactly one `claimed`, nineteen `in_progress`, one row.
 *
 * Run: npx tsx lib/ops/__qa__/single-flight-concurrency.qa.ts
 */

/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-require-imports */
process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://qa.supabase.co'
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'qa-anon'
process.env.SUPABASE_SERVICE_ROLE_KEY = 'qa-svc'
process.env.SERPER_API_KEY = 'qa-serper'
for (const k of ['GOOGLE_ADS_CLIENT_ID', 'GOOGLE_ADS_CLIENT_SECRET', 'GOOGLE_ADS_DEVELOPER_TOKEN',
  'GOOGLE_ADS_REFRESH_TOKEN', 'GOOGLE_ADS_CUSTOMER_ID', 'GOOGLE_ADS_LOGIN_CUSTOMER_ID']) process.env[k] = 'qa'

const REAL_LOG = console.log, REAL_ERR = console.error
const quiet = () => { console.log = () => {}; console.error = () => {} }
const loud = () => { console.log = REAL_LOG; console.error = REAL_ERR }
const say = (...a: unknown[]) => REAL_LOG(...a)

const Module: any = require('module')
const origLoad = Module._load
let USER_CLIENT: any = null, ADMIN_CLIENT: any = null, RUN_SCAN: any = null
/** Set true by a mutation control to remove the claim entirely. */
let CLAIM_DISABLED = false
Module._load = function (request: string, parent: any, isMain: boolean) {
  let r = request
  try { r = String(Module._resolveFilename(request, parent, isMain)) } catch { /* virtual */ }
  if (r.endsWith('lib/supabase/server.ts')) return { createClient: async () => USER_CLIENT }
  if (r.endsWith('lib/supabase/admin.ts')) return { createAdminClient: () => ADMIN_CLIENT }
  if (r.endsWith('lib/scanner.ts') || r.endsWith('lib/scanner/index.ts')) return { runScan: (...a: any[]) => RUN_SCAN(...a) }
  if (r.endsWith('lib/ops/single-flight.ts')) {
    const real = origLoad.call(this, request, parent, isMain)
    return new Proxy(real, {
      get: (t: any, k: string) => {
        // THE MUTATION CONTROL. Removing the atomic claim — every caller wins —
        // is exactly the pre-fix world, and every concurrency assertion below
        // must fail in it. If they still pass, they are testing nothing.
        if (CLAIM_DISABLED && k === 'claimOperation') {
          return async () => ({ outcome: 'claimed', holderRequestId: null, operationKey: null, expiresAt: null })
        }
        if (CLAIM_DISABLED && k === 'releaseOperationClaim') return async () => 'released'
        return t[k]
      },
    })
  }
  if (request === 'next/cache') return { revalidatePath: () => {}, revalidateTag: () => {} }
  return origLoad.call(this, request, parent, isMain)
}

const { FakeAdmin } = require('../../__qa__/_fake-admin')

let pass = 0, fail = 0
function check(name: string, cond: boolean, detail?: string) {
  if (cond) { pass++; say(`  ✓ ${name}`) } else { fail++; say(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`) }
}

const USER = '674fc7c3-2048-48f4-ba25-6e2a6dff4a06'
const OTHER = '99999999-9999-9999-9999-999999999999'
const PROJECT = 'a1111111-2222-3333-4444-555555555555'
const TARGET_A = 'b2222222-3333-4444-5555-666666666666'
const TARGET_B = 'c3333333-4444-5555-6666-777777777777'
const now = () => Date.now()

/** `trial` uses the lifetime-count branch; `advanced` uses the reservation. */
function tables(plan: 'trial' | 'advanced'): Record<string, any[]> {
  const shopify = plan === 'advanced'
  return {
    profiles: [{ id: USER, role: 'user' }, { id: OTHER, role: 'user' }],
    billing_governance: shopify
      ? [{ user_id: USER, signup_origin: 'shopify_app_store', billing_authority: 'shopify', authority_reason: 'x' }]
      : [],
    shopify_connections: shopify ? [{
      id: 'conn-1', user_id: USER, connection_status: 'connected', archived_at: null,
      shop_domain: 'go-top-seo-test.myshopify.com', shop_gid: 'gid://shopify/Shop/1',
      shopify_plan_handle: 'advanced', shopify_subscription_status: 'active',
      shopify_trial_ends_at: new Date(now() + 4 * 86_400_000).toISOString(),
      shopify_current_period_start: null, shopify_current_period_end: null,
      shopify_billing_verified_at: new Date(now() - 60_000).toISOString(),
      updated_at: new Date(now()).toISOString(),
    }] : [],
    shopify_billing_migrations: [],
    subscriptions: shopify ? [] : [{ id: 's1', user_id: USER, status: 'trial', plan_code: null,
      trial_ends_at: new Date(now() + 3 * 86_400_000).toISOString(),
      current_period_start: null, current_period_end: null, paypal_subscription_id: null,
      created_at: new Date(now() - 86_400_000).toISOString() }],
    projects: [{ id: PROJECT, user_id: USER, target_domain: 'go-top-seo-test.myshopify.com',
      business_name: 'Go Top Test', country: 'US', city: 'New York, NY', language: 'en', device_type: 'desktop' }],
    tracking_targets: [
      { id: TARGET_A, project_id: PROJECT, user_id: USER, keyword: 'shopify', engine_type: 'google_search',
        is_active: true, location_mode: 'project', avg_monthly_searches: null, metrics_updated_at: null },
      { id: TARGET_B, project_id: PROJECT, user_id: USER, keyword: 'shopify app', engine_type: 'google_search',
        is_active: true, location_mode: 'project', avg_monthly_searches: null, metrics_updated_at: null },
    ],
    scans: [], scan_results: [], usage_reservations: [], operation_claims: [],
  }
}
function clients(t: Record<string, any[]>) {
  ADMIN_CLIENT = new FakeAdmin(t)
  USER_CLIENT = new FakeAdmin(t)
  ;(USER_CLIENT as any).auth = { getUser: async () => ({ data: { user: { id: USER } } }) }
}
const scanReq = (targetId: string | null) => new Request('http://localhost/api/scan', {
  method: 'POST', body: JSON.stringify(targetId ? { projectId: PROJECT, targetId } : { projectId: PROJECT }) })
const volReq = (body: Record<string, unknown> = { projectId: PROJECT, forceRefresh: true }) =>
  new Request('http://localhost/api/google-ads/keyword-metrics', { method: 'POST', body: JSON.stringify(body) })

/** A provider that takes real time, so two requests genuinely overlap. */
function slowScan(dispatches: { n: number }, ms = 120) {
  return async () => {
    dispatches.n++
    await new Promise((r) => setTimeout(r, ms))
    return { found: true, position: 7, resultUrl: null, resultTitle: null, resultAddress: null, error: null, audit: null }
  }
}
function slowVolumeFetch(counts: { oauth: number; metrics: number }, ms = 120) {
  return async (url: any) => {
    await new Promise((r) => setTimeout(r, ms))
    if (String(url).includes('oauth2')) {
      counts.oauth++
      return new Response(JSON.stringify({ access_token: 'tok' }), { status: 200 })
    }
    counts.metrics++
    return new Response(JSON.stringify({ results: [
      { text: 'shopify', keywordMetrics: { avgMonthlySearches: 74000 } },
      { text: 'shopify app', keywordMetrics: { avgMonthlySearches: 1200 } },
    ] }), { status: 200 })
  }
}
const bodies = async (rs: any[]) => Promise.all(rs.map(async (r) => ({ status: r.status, body: await r.json().catch(() => null) })))
const codes = (out: any[]) => out.map((o) => o.body?.errorCode ?? `ok:${o.status}`).sort()

async function main() {
  say('True concurrency: one operation, however many requests\n')
  const scanRoute = require('../../../app/api/scan/route.ts')
  const volRoute = require('../../../app/api/google-ads/keyword-metrics/route.ts')

  // ── A) ranking scan, genuinely simultaneous ──────────────────────────────
  for (const plan of ['trial', 'advanced'] as const) {
    say(`\nA-${plan}) two simultaneous scans, ${plan} account`)
    {
      const t = tables(plan); clients(t)
      const d = { n: 0 }; RUN_SCAN = slowScan(d)
      quiet()
      const out = await bodies(await Promise.all([scanRoute.POST(scanReq(TARGET_A)), scanRoute.POST(scanReq(TARGET_A))]))
      loud()
      const ok = out.filter((o) => o.status === 200)
      const busy = out.filter((o) => o.body?.errorCode === 'SCAN_IN_PROGRESS')
      check(`A1-${plan}: exactly one request runs, the other is told it is in progress`,
        ok.length === 1 && busy.length === 1, JSON.stringify(codes(out)))
      check(`A2-${plan}: exactly one provider dispatch`, d.n === 1, String(d.n))
      check(`A3-${plan}: exactly one scan row`, t.scans.length === 1, String(t.scans.length))
      check(`A4-${plan}: exactly one persisted result`, t.scan_results.length === 1, String(t.scan_results.length))
      const reserved = t.usage_reservations.reduce((n: number, r: any) => n + Number(r.reserved_amount ?? 0), 0)
      const consumed = t.usage_reservations.reduce((n: number, r: any) => n + Number(r.consumed_amount ?? 0), 0)
      check(`A5-${plan}: exactly one check reserved and consumed`,
        plan === 'trial'
          ? t.usage_reservations.length === 0     // the trial branch counts, it does not reserve
          : reserved === 1 && consumed === 1,
        `rows=${t.usage_reservations.length} reserved=${reserved} consumed=${consumed}`)
      check(`A6-${plan}: the in-progress answer names the running operation`,
        typeof busy[0]?.body?.inProgressRequestId === 'string' && busy[0].body.inProgressRequestId.length > 0,
        JSON.stringify(busy[0]?.body?.inProgressRequestId))
      check(`A7-${plan}: the claim is released, so a later scan runs`,
        t.operation_claims.length === 0, JSON.stringify(t.operation_claims))
      // …and it really does run. On a TRIAL, re-scanning the same target is
      // refused by design (buildTrialTargetAlreadyScannedError — one check per
      // target for the life of the trial), so the later scan targets the other
      // keyword; asserting otherwise would be asserting against a product rule.
      d.n = 0
      const laterTarget = plan === 'trial' ? TARGET_B : TARGET_A
      quiet(); const later = await scanRoute.POST(scanReq(laterTarget)); loud()
      check(`A8-${plan}: a legitimate later scan is allowed and dispatches`,
        later.status === 200 && d.n === 1, `${later.status} dispatches=${d.n}`)
    }
  }

  say('\nA-scope) different scopes never block each other')
  {
    const t = tables('advanced'); clients(t)
    const d = { n: 0 }; RUN_SCAN = slowScan(d)
    quiet()
    const out = await bodies(await Promise.all([scanRoute.POST(scanReq(TARGET_A)), scanRoute.POST(scanReq(TARGET_B))]))
    loud()
    check('A9: two DIFFERENT single targets both run', out.every((o) => o.status === 200) && d.n === 2,
      `${JSON.stringify(codes(out))} dispatches=${d.n}`)
    const t2 = tables('advanced'); clients(t2)
    const d2 = { n: 0 }; RUN_SCAN = slowScan(d2)
    quiet()
    const out2 = await bodies(await Promise.all([scanRoute.POST(scanReq(null)), scanRoute.POST(scanReq(null))]))
    loud()
    check('A10: two simultaneous "scan all" requests — one runs, one is in progress',
      out2.filter((o) => o.status === 200).length === 1
      && out2.filter((o) => o.body?.errorCode === 'SCAN_IN_PROGRESS').length === 1,
      JSON.stringify(codes(out2)))
    check('A11: and "scan all" dispatched both of the project’s targets, once each',
      d2.n === 2 && t2.scan_results.length === 2, `dispatches=${d2.n} results=${t2.scan_results.length}`)
    const t3 = tables('advanced'); clients(t3)
    const d3 = { n: 0 }; RUN_SCAN = slowScan(d3)
    quiet()
    const out3 = await bodies(await Promise.all([scanRoute.POST(scanReq(null)), scanRoute.POST(scanReq(TARGET_A))]))
    loud()
    check('A12: "scan all" and a single target are different scopes and both run',
      out3.every((o) => o.status === 200), JSON.stringify(codes(out3)))
  }

  say('\nA-recovery) abandoned claims, and tenant isolation')
  {
    const t = tables('advanced'); clients(t)
    const d = { n: 0 }; RUN_SCAN = slowScan(d)
    // A claim left behind by a function the platform killed.
    t.operation_claims.push({
      claim_key: `${USER}:ranking_scan:project:${PROJECT}:target:${TARGET_A}`,
      user_id: USER, operation: 'ranking_scan', scope: `project:${PROJECT}:target:${TARGET_A}`,
      holder_request_id: 'op_abandoned', claimed_at: new Date(now() - 600_000).toISOString(),
      expires_at: new Date(now() - 300_000).toISOString(),
    })
    quiet(); const res = await scanRoute.POST(scanReq(TARGET_A)); loud()
    check('A13: a claim past its expiry is taken over, so an abandoned operation recovers',
      res.status === 200 && d.n === 1, `${res.status} dispatches=${d.n}`)

    const t2 = tables('advanced'); clients(t2)
    const d2 = { n: 0 }; RUN_SCAN = slowScan(d2)
    // Another tenant holds a live claim on the SAME scope string.
    t2.operation_claims.push({
      claim_key: `${OTHER}:ranking_scan:project:${PROJECT}:target:${TARGET_A}`,
      user_id: OTHER, operation: 'ranking_scan', scope: `project:${PROJECT}:target:${TARGET_A}`,
      holder_request_id: 'op_other_tenant', claimed_at: new Date(now()).toISOString(),
      expires_at: new Date(now() + 90_000).toISOString(),
    })
    quiet(); const res2 = await scanRoute.POST(scanReq(TARGET_A)); loud()
    check('A14: another tenant’s claim is neither joined nor discoverable',
      res2.status === 200 && d2.n === 1
      && t2.operation_claims.some((c: any) => c.holder_request_id === 'op_other_tenant'),
      `${res2.status} dispatches=${d2.n}`)
    const body2 = await res2.json().catch(() => null)
    check('A15: and no cross-tenant identifier is echoed back',
      !JSON.stringify(body2 ?? {}).includes('op_other_tenant'))
  }

  // ── B) search volume, genuinely simultaneous ─────────────────────────────
  say('\nB) search volume')
  const realFetch = globalThis.fetch
  {
    const t = tables('advanced'); clients(t)
    const counts = { oauth: 0, metrics: 0 }
    ;(globalThis as any).fetch = slowVolumeFetch(counts)
    quiet()
    // The automatic refresh (no forceRefresh) and the manual one, started together.
    const out = await bodies(await Promise.all([volRoute.POST(volReq({ projectId: PROJECT })), volRoute.POST(volReq())]))
    loud(); (globalThis as any).fetch = realFetch
    check('B1: automatic and manual started together — one runs, one is told it is in progress',
      out.filter((o) => o.status === 200).length === 1
      && out.filter((o) => o.body?.errorCode === 'VOLUME_IN_PROGRESS').length === 1,
      JSON.stringify(codes(out)))
    check('B2: exactly one OAuth exchange', counts.oauth === 1, String(counts.oauth))
    check('B3: exactly one metrics request', counts.metrics === 1, String(counts.metrics))
    check('B4: one persistence pass — both keywords written once',
      t.tracking_targets.filter((x: any) => x.avg_monthly_searches != null).length === 2,
      JSON.stringify(t.tracking_targets.map((x: any) => x.avg_monthly_searches)))
    check('B5: both callers received a truthful outcome',
      out.every((o) => (o.body?.success === true && typeof o.body.updated === 'number')
        || (o.body?.errorCode === 'VOLUME_IN_PROGRESS' && o.body?.retryable === true)),
      JSON.stringify(out.map((o) => o.body)))
    check('B6: the claim is released after success', t.operation_claims.length === 0)
  }
  {
    const t = tables('advanced'); clients(t)
    const counts = { oauth: 0, metrics: 0 }
    ;(globalThis as any).fetch = slowVolumeFetch(counts)
    quiet()
    const out = await bodies(await Promise.all([volRoute.POST(volReq()), volRoute.POST(volReq())]))
    loud(); (globalThis as any).fetch = realFetch
    check('B7: two direct concurrent POSTs — one OAuth, one metrics request',
      counts.oauth === 1 && counts.metrics === 1
      && out.filter((o) => o.body?.errorCode === 'VOLUME_IN_PROGRESS').length === 1,
      `oauth=${counts.oauth} metrics=${counts.metrics} ${JSON.stringify(codes(out))}`)
    // A later legitimate refresh works once the first has finished.
    const counts2 = { oauth: 0, metrics: 0 }
    ;(globalThis as any).fetch = slowVolumeFetch(counts2)
    quiet(); const later = await volRoute.POST(volReq()); const lb = await later.json(); loud()
    ;(globalThis as any).fetch = realFetch
    check('B8: a later refresh runs normally after completion',
      later.status === 200 && lb.success === true && counts2.metrics === 1,
      `${later.status} metrics=${counts2.metrics}`)
  }
  {
    // An abandoned volume claim must expire, not wedge the project forever.
    const t = tables('advanced'); clients(t)
    t.operation_claims.push({
      claim_key: `${USER}:search_volume:project:${PROJECT}`, user_id: USER, operation: 'search_volume',
      scope: `project:${PROJECT}`, holder_request_id: 'op_abandoned',
      claimed_at: new Date(now() - 600_000).toISOString(), expires_at: new Date(now() - 300_000).toISOString(),
    })
    const counts = { oauth: 0, metrics: 0 }
    ;(globalThis as any).fetch = slowVolumeFetch(counts)
    quiet(); const res = await volRoute.POST(volReq()); loud()
    ;(globalThis as any).fetch = realFetch
    check('B9: an expired volume claim is taken over', res.status === 200 && counts.metrics === 1,
      `${res.status} metrics=${counts.metrics}`)
  }
  {
    // Ownership is checked BEFORE the claim, so a stranger cannot even take one.
    const t = tables('advanced'); clients(t)
    t.projects[0].user_id = OTHER
    const counts = { oauth: 0, metrics: 0 }
    ;(globalThis as any).fetch = slowVolumeFetch(counts)
    quiet(); const res = await volRoute.POST(volReq()); loud()
    ;(globalThis as any).fetch = realFetch
    check('B10: a project the caller does not own yields no claim and no provider call',
      res.status === 403 && counts.oauth === 0 && counts.metrics === 0 && t.operation_claims.length === 0,
      `${res.status} claims=${t.operation_claims.length}`)
  }

  // ── C) mutation controls ────────────────────────────────────────────────
  say('\nC) mutation controls: remove the atomic claim and the guarantees collapse')
  {
    CLAIM_DISABLED = true
    const t = tables('advanced'); clients(t)
    const d = { n: 0 }; RUN_SCAN = slowScan(d)
    quiet()
    const out = await bodies(await Promise.all([scanRoute.POST(scanReq(TARGET_A)), scanRoute.POST(scanReq(TARGET_A))]))
    loud()
    check('C1: without the claim, BOTH scan requests dispatch — the pre-fix behaviour',
      d.n === 2 && out.filter((o) => o.status === 200).length === 2,
      `dispatches=${d.n} ${JSON.stringify(codes(out))}`)
    check('C2: …and two scans and two results are created',
      t.scans.length === 2 && t.scan_results.length === 2,
      `scans=${t.scans.length} results=${t.scan_results.length}`)
    const reserved = t.usage_reservations.reduce((n: number, r: any) => n + Number(r.reserved_amount ?? 0), 0)
    check('C3: …and the account is charged twice', reserved === 2, String(reserved))

    const t2 = tables('advanced'); clients(t2)
    const counts = { oauth: 0, metrics: 0 }
    ;(globalThis as any).fetch = slowVolumeFetch(counts)
    quiet(); await Promise.all([volRoute.POST(volReq()), volRoute.POST(volReq())]); loud()
    ;(globalThis as any).fetch = realFetch
    check('C4: without the claim, the provider is called twice',
      counts.oauth === 2 && counts.metrics === 2, `oauth=${counts.oauth} metrics=${counts.metrics}`)
    CLAIM_DISABLED = false
  }
  {
    // And with the claim restored, the same case is single-flighted again — so
    // C1–C4 are controls, not a permanently broken configuration.
    const t = tables('advanced'); clients(t)
    const d = { n: 0 }; RUN_SCAN = slowScan(d)
    quiet(); await Promise.all([scanRoute.POST(scanReq(TARGET_A)), scanRoute.POST(scanReq(TARGET_A))]); loud()
    check('C5: with the claim restored, the identical case dispatches once', d.n === 1, String(d.n))
  }

  say(`\n${pass} passed, ${fail} failed`)
  if (fail > 0) process.exitCode = 1
}
main().catch((e) => { loud(); console.error(e); process.exitCode = 1 })

/* Marks this a MODULE, not a global script — otherwise `main`, `check`, `pass`
 * and `fail` collide with every other QA suite at `next build` type-check time.
 * A plain import cannot be used: ES imports hoist above the Module._load hook. */
export {}
