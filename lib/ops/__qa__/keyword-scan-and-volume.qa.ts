/**
 * THE REVIEWER'S KEYWORD WORKFLOW — the manual ranking scan and the
 * search-volume update — driven through the real routes with deterministic
 * provider fixtures. No live provider is contacted and no quota is consumed.
 *
 * WHAT PRODUCTION SHOWED. The keyword `shopify` was persisted exactly once and
 * is active on the reviewer's project. Two ranking scans and one volume update
 * each waited about a minute and left position, volume and last-check empty.
 * The retained platform window held no application error at all.
 *
 * WHAT WAS ACTUALLY WRONG — measured here, before any fix, against the
 * committed modules:
 *
 *   * the SEARCH-VOLUME route never returned at all against a provider that
 *     accepts the connection and does not answer: neither its OAuth exchange
 *     nor its metrics call carried an AbortSignal, so only the platform could
 *     end the request — and a killed function throws nothing, logs nothing and
 *     writes nothing;
 *   * the RANKING SCAN route had no deadline of its own, so its duration was
 *     simply the sum of its external calls. Entitlement resolution alone was
 *     measured at 46,238 ms against an unresponsive Shopify Partner API (three
 *     attempts of 15s plus backoff), and the route inherited it exactly:
 *     46,291 ms, nothing persisted.
 *
 * The absent `periodEndsAt` was NOT the cause and is re-proved correct in
 * section A rather than asserted: a Shopify managed-pricing trial legitimately
 * reports an active subscription with no billing cycle, and the resolver
 * derives the period from the trial. It collapses neither to zero nor to
 * unlimited.
 *
 * Run: npx tsx lib/ops/__qa__/keyword-scan-and-volume.qa.ts
 */

/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-require-imports */
process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://qa.supabase.co'
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'qa-anon'
process.env.SUPABASE_SERVICE_ROLE_KEY = 'qa-svc'
process.env.SERPER_API_KEY = 'qa-serper'
for (const k of ['GOOGLE_ADS_CLIENT_ID', 'GOOGLE_ADS_CLIENT_SECRET', 'GOOGLE_ADS_DEVELOPER_TOKEN',
  'GOOGLE_ADS_REFRESH_TOKEN', 'GOOGLE_ADS_CUSTOMER_ID', 'GOOGLE_ADS_LOGIN_CUSTOMER_ID']) process.env[k] = 'qa'
process.env.SHOPIFY_PARTNER_API_ACCESS_TOKEN = 'qa'
process.env.SHOPIFY_PARTNER_ORGANIZATION_ID = '1'
process.env.SHOPIFY_PARTNER_APP_GID = 'gid://shopify/App/1'
process.env.SHOPIFY_PARTNER_API_VERSION = '2025-01'

/* The routes log heavily; only this suite's own lines should reach the report. */
const REAL_LOG = console.log, REAL_ERR = console.error
const quiet = () => { console.log = () => {}; console.error = () => {} }
const loud = () => { console.log = REAL_LOG; console.error = REAL_ERR }
const say = (...a: unknown[]) => REAL_LOG(...a)

const Module: any = require('module')
const origLoad = Module._load
let USER_CLIENT: any = null, ADMIN_CLIENT: any = null, RUN_SCAN: any = null
Module._load = function (request: string, parent: any, isMain: boolean) {
  let r = request
  try { r = String(Module._resolveFilename(request, parent, isMain)) } catch { /* virtual */ }
  if (r.endsWith('lib/supabase/server.ts')) return { createClient: async () => USER_CLIENT }
  if (r.endsWith('lib/supabase/admin.ts')) return { createAdminClient: () => ADMIN_CLIENT }
  // ONLY the provider transport is substituted. Entitlement, usage period,
  // reservation, persistence and the response shape are all the real thing.
  if (r.endsWith('lib/scanner.ts') || r.endsWith('lib/scanner/index.ts')) {
    return { runScan: (...a: any[]) => RUN_SCAN(...a) }
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
const PROJECT = 'a1111111-2222-3333-4444-555555555555'
const TARGET = 'b2222222-3333-4444-5555-666666666666'
const now = () => Date.now()

/** The reviewer's confirmed shape. Timestamps are wall-clock relative because
 *  the routes read the real clock. */
function reviewerTables(overrides: Record<string, unknown> = {}): Record<string, any[]> {
  return {
    profiles: [{ id: USER, role: 'user' }],
    billing_governance: [{ user_id: USER, signup_origin: 'shopify_app_store',
      billing_authority: 'shopify', authority_reason: 'shopify_app_store_install' }],
    shopify_connections: [{
      id: 'conn-1', user_id: USER, connection_status: 'connected', archived_at: null,
      shop_domain: 'go-top-seo-test.myshopify.com', shop_gid: 'gid://shopify/Shop/1',
      shopify_plan_handle: 'advanced', shopify_subscription_status: 'active',
      shopify_trial_ends_at: new Date(now() + 4 * 86_400_000).toISOString(),
      // periodEndsAt ABSENT — the managed-pricing trial shape.
      shopify_current_period_start: null, shopify_current_period_end: null,
      shopify_billing_verified_at: new Date(now() - 60_000).toISOString(),
      updated_at: new Date(now()).toISOString(),
      ...overrides,
    }],
    shopify_billing_migrations: [], subscriptions: [],
    projects: [{ id: PROJECT, user_id: USER, target_domain: 'go-top-seo-test.myshopify.com',
      business_name: 'Go Top Test', country: 'US', city: 'New York, NY', language: 'en', device_type: 'desktop' }],
    tracking_targets: [{ id: TARGET, project_id: PROJECT, user_id: USER, keyword: 'shopify',
      engine_type: 'google_search', is_active: true, location_mode: 'project',
      target_domain: 'go-top-seo-test.myshopify.com', avg_monthly_searches: null, metrics_updated_at: null }],
    scans: [], scan_results: [], usage_reservations: [],
  }
}
function clients(t: Record<string, any[]>) {
  ADMIN_CLIENT = new FakeAdmin(t)
  USER_CLIENT = new FakeAdmin(t)
  ;(USER_CLIENT as any).auth = { getUser: async () => ({ data: { user: { id: USER } } }) }
}
const scanReq = (targetId: string | null = TARGET) => new Request('http://localhost/api/scan', {
  method: 'POST', body: JSON.stringify(targetId ? { projectId: PROJECT, targetId } : { projectId: PROJECT }) })
const volReq = (body: Record<string, unknown> = { projectId: PROJECT, forceRefresh: true }) =>
  new Request('http://localhost/api/google-ads/keyword-metrics', { method: 'POST', body: JSON.stringify(body) })

/** A provider that accepts the connection and never answers — ended only by the
 *  caller's own AbortSignal, which is what a real fetch does. The keep-alive
 *  timer stops Node draining its event loop and exiting mid-test. */
function blackHoleFetch(match: (url: string) => boolean, realFetch: typeof fetch, count: { n: number }) {
  return (...a: any[]) => {
    const url = String(a[0])
    if (!match(url)) return (realFetch as any)(...a)
    count.n++
    const init = a[1] as { signal?: AbortSignal } | undefined
    return new Promise((_res, reject) => {
      const keepAlive = setTimeout(() => {}, 600_000)
      init?.signal?.addEventListener('abort', () => {
        clearTimeout(keepAlive)
        const e = new Error('The operation was aborted'); e.name = 'AbortError'; reject(e)
      })
    })
  }
}
const okVolumeFetch = async (url: any) => String(url).includes('oauth2')
  ? new Response(JSON.stringify({ access_token: 'tok' }), { status: 200 })
  : new Response(JSON.stringify({ results: [{ text: 'shopify', keywordMetrics: {
      avgMonthlySearches: 74000, competition: 'LOW', competitionIndex: 12,
      lowTopOfPageBidMicros: 1_000_000, highTopOfPageBidMicros: 4_000_000 } }] }), { status: 200 })

async function main() {
  say('The reviewer keyword workflow: ranking scan and search volume\n')

  // ── A) the entitlement the two operations actually run under ─────────────
  say('A) Shopify-governed Advanced on a trial with NO period end')
  {
    const { resolveCurrentUsagePeriod } = require('../../billing/usage-period.ts')
    const { getUserEntitlement } = require('../../subscription.ts')
    const t = reviewerTables(); clients(t)
    const period = await resolveCurrentUsagePeriod(ADMIN_CLIENT, USER)
    const ent = await getUserEntitlement(USER, ADMIN_CLIENT)
    check('A1: the period comes from the TRIAL, not from an absent billing cycle',
      period?.source === 'shopify_trial', String(period?.source))
    check('A2: it is a real, bounded window — neither zero-length nor unlimited',
      !!period && period.end.getTime() > period.start.getTime()
      && period.end.getTime() - period.start.getTime() === 7 * 86_400_000,
      period ? String(period.end.getTime() - period.start.getTime()) : 'null')
    check('A3: the plan is Advanced', ent.plan === 'advanced', ent.plan)
    check('A4: Google checks = 100 and AI checks = 20',
      ent.limits.maxKeywordChecksPerPeriodPerProject === 100 && ent.limits.maxAIScansPerPeriodPerProject === 20,
      JSON.stringify({ g: ent.limits.maxKeywordChecksPerPeriodPerProject, a: ent.limits.maxAIScansPerPeriodPerProject }))
    // The controls that must survive.
    const cancelled = reviewerTables({ shopify_subscription_status: 'cancelled' }); clients(cancelled)
    check('A5: a cancelled Shopify subscription still fails closed',
      (await resolveCurrentUsagePeriod(ADMIN_CLIENT, USER)) === null)
    const expired = reviewerTables({ shopify_trial_ends_at: new Date(now() - 86_400_000).toISOString() }); clients(expired)
    check('A6: an expired trial still fails closed',
      (await resolveCurrentUsagePeriod(ADMIN_CLIENT, USER)) === null)
    const website = reviewerTables(); website.billing_governance = [{ user_id: USER, signup_origin: 'website', billing_authority: 'website', authority_reason: null }]
    website.subscriptions = [{ id: 's1', user_id: USER, status: 'active', plan_code: 'premium', paypal_subscription_id: 'I-1',
      current_period_start: '2026-09-01T00:00:00Z', current_period_end: '2099-01-01T00:00:00Z', trial_ends_at: null, created_at: '2026-01-01T00:00:00Z' }]
    clients(website)
    check('A7: website-billed entitlement is unchanged',
      (await resolveCurrentUsagePeriod(ADMIN_CLIENT, USER))?.source === 'paypal')
    const outage = reviewerTables(); clients(outage)
    ADMIN_CLIENT = new FakeAdmin(outage, { billing_governance: { select: () => ({ code: '42501', message: 'permission denied' }) } })
    const unknown = await getUserEntitlement(USER, ADMIN_CLIENT)
    check('A8: a governance read failure is a typed unavailable state, not a fake quota verdict',
      unknown.plan === 'entitlement_unavailable' && unknown.limits.maxKeywordChecksPerPeriodPerProject === 0)
  }

  // ── B) the ranking scan ──────────────────────────────────────────────────
  say('\nB) the ranking scan')
  {
    const { POST } = require('../../../app/api/scan/route.ts')
    {
      const t = reviewerTables(); clients(t)
      RUN_SCAN = async () => ({ found: true, position: 7, resultUrl: 'https://go-top-seo-test.myshopify.com/',
        resultTitle: 'Go Top', resultAddress: null, error: null, audit: null })
      quiet(); const res = await POST(scanReq()); const body = await res.json(); loud()
      check('B1: a healthy scan succeeds', res.status === 200 && body.status === 'completed', `${res.status} ${body.status}`)
      check('B2: the position is persisted', t.scan_results[0]?.position === 7, JSON.stringify(t.scan_results[0]?.position))
      check('B3: the last-check time is persisted', !!t.scan_results[0]?.checked_at)
      check('B4: the response carries a finite success state the UI can refresh on',
        body.completed === 1 && body.total === 1 && typeof body.requestId === 'string')
      check('B5: exactly one check was reserved and consumed',
        t.usage_reservations.length === 1
        && Number(t.usage_reservations[0].reserved_amount) === 1
        && Number(t.usage_reservations[0].consumed_amount) === 1,
        JSON.stringify(t.usage_reservations.map((r: any) => ({ r: r.reserved_amount, c: r.consumed_amount }))))
    }
    {
      // The provider takes longer than the STEP budget allows.
      const t = reviewerTables(); clients(t)
      RUN_SCAN = () => new Promise(() => {})   // never answers
      quiet()
      const t0 = Date.now(); const res = await POST(scanReq()); const body = await res.json()
      const ms = Date.now() - t0; loud()
      check('B6: a provider that never answers is bounded, not waited on forever',
        ms < 30_000 && res.status === 504, `${ms}ms status ${res.status}`)
      check('B6b: …and it is NOT reported as a completed scan with nothing in it',
        body.status !== 'completed' && body.completed === undefined, JSON.stringify(body).slice(0, 120))
      check('B7: the merchant gets a localized, retryable message — never a raw error',
        body.errorCode === 'SCAN_TIMEOUT' && body.retryable === true
        && typeof body.error === 'string' && typeof body.errorEn === 'string'
        && !/Error:|at |deadline_exceeded|undefined/.test(String(body.error) + String(body.errorEn)),
        JSON.stringify(body).slice(0, 160))
      check('B8: nothing half-written', t.scan_results.length === 0, String(t.scan_results.length))
    }
    {
      // Two clicks in flight at once must not double-charge.
      const t = reviewerTables(); clients(t)
      RUN_SCAN = async () => ({ found: false, position: null, resultUrl: null, resultTitle: null, resultAddress: null, error: null, audit: null })
      quiet(); await POST(scanReq()); await POST(scanReq()); loud()
      const reserved = t.usage_reservations.reduce((n: number, r: any) => n + Number(r.reserved_amount ?? 0), 0)
      const consumed = t.usage_reservations.reduce((n: number, r: any) => n + Number(r.consumed_amount ?? 0), 0)
      check('B9: two dispatches reserve and consume exactly one check each — never a double charge',
        reserved === 2 && consumed === 2 && t.usage_reservations.length === 2,
        `reserved=${reserved} consumed=${consumed} rows=${t.usage_reservations.length}`)
      check('B9b: and each produced its own persisted result',
        t.scan_results.length === 2, String(t.scan_results.length))
    }
    {
      const t = reviewerTables(); clients(t)
      t.projects[0].user_id = 'someone-else'
      let dispatched = 0
      RUN_SCAN = async () => { dispatched++; return { found: false, position: null, resultUrl: null, resultTitle: null, resultAddress: null, error: null, audit: null } }
      quiet(); const res = await POST(scanReq()); loud()
      check('B10: another user’s project cannot be scanned, and no provider call is made',
        res.status >= 400 && dispatched === 0, `${res.status} dispatched=${dispatched}`)
    }
  }

  // ── C) the search-volume update ──────────────────────────────────────────
  say('\nC) the search-volume update')
  {
    const { POST } = require('../../../app/api/google-ads/keyword-metrics/route.ts')
    const realFetch = globalThis.fetch
    {
      const t = reviewerTables(); clients(t)
      ;(globalThis as any).fetch = okVolumeFetch
      quiet(); const res = await POST(volReq()); const body = await res.json(); loud()
      ;(globalThis as any).fetch = realFetch
      check('C1: a healthy update succeeds', res.status === 200 && body.success === true && body.updated === 1, JSON.stringify(body))
      check('C2: the volume is persisted', t.tracking_targets[0].avg_monthly_searches === 74000, String(t.tracking_targets[0].avg_monthly_searches))
      check('C3: and the metrics timestamp', !!t.tracking_targets[0].metrics_updated_at)
    }
    {
      const t = reviewerTables(); clients(t)
      const count = { n: 0 }
      ;(globalThis as any).fetch = blackHoleFetch(() => true, realFetch, count)
      quiet(); const t0 = Date.now(); const res = await POST(volReq()); const body = await res.json()
      const ms = Date.now() - t0; loud(); (globalThis as any).fetch = realFetch
      check('C4: a provider that never answers now ENDS — the route used to run until the platform killed it',
        ms < 30_000 && res.status === 503, `${ms}ms status ${res.status}`)
      check('C5: with a localized retryable code, not an opaque failure',
        body.errorCode === 'PROVIDER_UNAVAILABLE' && body.retryable === true && typeof body.requestId === 'string',
        JSON.stringify(body))
      check('C6: nothing was written', t.tracking_targets[0].avg_monthly_searches === null)
    }
    {
      const t = reviewerTables(); clients(t)
      ;(globalThis as any).fetch = async (url: any) => String(url).includes('oauth2')
        ? new Response(JSON.stringify({ access_token: 'tok' }), { status: 200 })
        : new Response(JSON.stringify({ results: [] }), { status: 200 })
      quiet(); const res = await POST(volReq()); const body = await res.json(); loud()
      ;(globalThis as any).fetch = realFetch
      check('C7: an empty provider answer is reported as no-data, never as a silent success with a number',
        res.status === 200 && body.updated === 0 && body.noData === 1
        && t.tracking_targets[0].avg_monthly_searches === null, JSON.stringify(body))
    }
    {
      const t = reviewerTables(); clients(t)
      ;(globalThis as any).fetch = async (url: any) => String(url).includes('oauth2')
        ? new Response(JSON.stringify({ error: 'invalid_grant', error_description: 'Token has been expired or revoked.' }), { status: 400 })
        : new Response('{}', { status: 200 })
      quiet(); const res = await POST(volReq()); const body = await res.json(); loud()
      ;(globalThis as any).fetch = realFetch
      check('C8: a credential fault is distinguished from an outage and marked NOT retryable',
        res.status === 401 && body.errorCode === 'GOOGLE_ADS_REAUTH_REQUIRED' && body.retryable === false,
        JSON.stringify(body))
      check('C9: nothing was written', t.tracking_targets[0].avg_monthly_searches === null)
    }
    {
      // One deduplicated batch, not one request per keyword.
      const t = reviewerTables(); clients(t)
      for (let i = 0; i < 4; i++) {
        t.tracking_targets.push({ id: `dup-${i}`, project_id: PROJECT, user_id: USER,
          keyword: i < 2 ? 'shopify' : `kw-${i}`, engine_type: 'google_search', is_active: true,
          location_mode: 'project', avg_monthly_searches: null, metrics_updated_at: null })
      }
      let metricCalls = 0
      ;(globalThis as any).fetch = async (url: any, init: any) => {
        if (String(url).includes('oauth2')) return new Response(JSON.stringify({ access_token: 'tok' }), { status: 200 })
        metricCalls++
        const sent = JSON.parse(String(init.body)).keywords as string[]
        return new Response(JSON.stringify({ results: sent.map((kw) => ({ text: kw, keywordMetrics: { avgMonthlySearches: 10 } })) }), { status: 200 })
      }
      quiet(); const res = await POST(volReq()); const body = await res.json(); loud()
      ;(globalThis as any).fetch = realFetch
      check('C10: five targets over three distinct keywords cost ONE provider request',
        metricCalls === 1 && res.status === 200 && body.updated === 5, `calls=${metricCalls} ${JSON.stringify(body)}`)
    }
    {
      // Idempotence: a second run has nothing left to refresh, so no provider call.
      const t = reviewerTables(); clients(t)
      ;(globalThis as any).fetch = okVolumeFetch
      quiet(); await POST(volReq()); loud()
      let calls = 0
      ;(globalThis as any).fetch = async (...a: any[]) => { calls++; return (okVolumeFetch as any)(...a) }
      quiet(); const res = await POST(volReq({ projectId: PROJECT })); const body = await res.json(); loud()
      ;(globalThis as any).fetch = realFetch
      check('C11: a repeat with no forceRefresh does no provider work at all',
        calls === 0 && res.status === 200 && body.skipped === 1, `calls=${calls} ${JSON.stringify(body)}`)
    }
  }

  // ── D) automatic volume on keyword creation ──────────────────────────────
  say('\nD) automatic search volume after a keyword is created')
  {
    const { readFileSync } = require('fs')
    const { join } = require('path')
    const ROOT = join(__dirname, '..', '..', '..')
    const page = readFileSync(join(ROOT, 'app/(dashboard)/projects/[id]/page.tsx'), 'utf8')
    check('D1: creating a keyword schedules a volume refresh',
      /onSuccess=\{\(\) => \{[\s\S]*?refreshMissingVolumes\(\)/.test(page))
    check('D2: creation never waits on it — the refresh runs after the row is shown',
      /void loadData\(\)\.then\(\(\) => refreshMissingVolumes\(\)\)/.test(page))
    check('D3: the refresh asks for the PROJECT, so one add is one request and a bulk add is one batch',
      /refreshMissingVolumes[\s\S]*?body: JSON\.stringify\(\{ projectId: id \}\)/.test(page)
      // Scoped to the refresh function: `targetIds` appears elsewhere on the
      // page for an unrelated scan_results query.
      && !/refreshMissingVolumes[\s\S]{0,600}targetIds/.test(page))
    check('D4: its failures are swallowed, so a provider fault cannot fail keyword creation',
      /refreshMissingVolumes[\s\S]*?catch \{[\s\S]*?\}[\s\S]*?finally/.test(page))
    check('D5: one in-flight guard covers both the automatic refresh and the manual button',
      (page.match(/volumeRequestInFlight\.current/g) ?? []).length >= 4)
    const table = readFileSync(join(ROOT, 'components/keywords/TrackingTargetsTable.tsx'), 'utf8')
    check('D6: a keyword awaiting its volume shows a pending state, not a bare dash',
      /volumePending \?/.test(table) && /k\.volumePending/.test(table))
    check('D7: and an empty volume offers a retry', /onRetryVolumes/.test(table) && /k\.volumeRetry/.test(table))
    for (const dict of ['he', 'en']) {
      const d = readFileSync(join(ROOT, `lib/i18n/dashboard/${dict}.ts`), 'utf8')
      check(`D8-${dict}: every new state has ${dict} copy`,
        /volumePending:/.test(d) && /volumeRetry:/.test(d) && /volumesUnavailable:/.test(d)
        && /volumesFailedToSave:/.test(d) && /scanTimeout:/.test(d) && /scanRetryable:/.test(d))
    }
  }

  // ── E) the bound that makes the minute impossible ────────────────────────
  say('\nE) the deadlines, and the diagnostics that were missing')
  {
    const { readFileSync } = require('fs'); const { join } = require('path')
    const ROOT = join(__dirname, '..', '..', '..')
    const scan = readFileSync(join(ROOT, 'app/api/scan/route.ts'), 'utf8')
    const vol = readFileSync(join(ROOT, 'app/api/google-ads/keyword-metrics/route.ts'), 'utf8')
    for (const [label, src] of [['scan', scan], ['volume', vol]] as const) {
      check(`E1-${label}: the route declares its own platform ceiling`, /export const maxDuration = 60/.test(src))
      check(`E2-${label}: and an operation budget strictly inside it`,
        /OPERATION_BUDGET_MS = 45_000/.test(src))
      check(`E3-${label}: one structured operation line is emitted from a finally`,
        /logOperation\(\{/.test(src) && /\} finally \{/.test(src))
    }
    check('E4: the volume route no longer issues an unbounded fetch',
      !/await fetch\(/.test(vol.replace(/\/\*[\s\S]*?\*\//g, '')), 'a bare await fetch( remains')
    check('E5: the Partner API retry budget is one clock, not three fresh timeouts',
      /deadline\.sliceFor\(REQUEST_TIMEOUT_MS\)/.test(readFileSync(join(ROOT, 'lib/shopify/partner-client.ts'), 'utf8')))
    check('E6: live billing verification on a request path is bounded',
      /LIVE_VERIFICATION_BUDGET_MS = 8_000/.test(readFileSync(join(ROOT, 'lib/shopify/entitlement-resolver.ts'), 'utf8')))
    // Nothing secret may appear in an operation line.
    const ops = readFileSync(join(ROOT, 'lib/ops/deadline.ts'), 'utf8')
    // SANITIZED LOGS. The scan route used to log `errorMsg` and full stacks —
    // strings that come from the provider client, from PostgREST and from this
    // route's own thrown messages, and can carry a query, a URL with a key in
    // it, a database hint or a shop identifier.
    check('E8: the scan route logs a CATEGORY, never a raw exception message or a stack',
      /function classifyFailure\(/.test(scan)
      && !/console\.error\([^)]*errorMsg/.test(scan)
      && !/console\.error\([^)]*\.stack/.test(scan)
      && !/details: \(resultError/.test(scan) && !/hint: \(resultError/.test(scan))
    check('E9: and the response body carries a category too, not the provider’s sentence',
      /error: scanOutput\.error \? classifyFailure/.test(scan) && /error: classifyFailure\(targetError\)/.test(scan))
    check('E10: both routes take a server-side single-flight claim before any work',
      /claimOperation\(admin, \{/.test(scan) && /claimOperation\(admin, \{/.test(vol)
      && /releaseOperationClaim/.test(scan) && /releaseOperationClaim/.test(vol))
    check('E11: the reservation key is the OPERATION’s identity, never the request id',
      /idempotencyKey: `manual:\$\{projectId\}:\$\{scope\}:\$\{operationKey\}`/.test(scan)
      && !/idempotencyKey: `manual:[^`]*\$\{requestId\}`/.test(scan))
    check('E7: the diagnostics type carries no credential, token or provider payload field',
      !/token|secret|credential|apiKey|password|payload:/i.test(ops.slice(ops.indexOf('export interface OperationDiagnostics'), ops.indexOf('export function logOperation'))))
  }

  // ── F) mutation controls ─────────────────────────────────────────────────
  say('\nF) mutation controls: each proof fails when the fix is reverted')
  {
    const { Deadline, fetchProvider, withDeadline, DeadlineExceededError } = require('../deadline.ts')
    // Reverting the shared budget to a per-attempt timeout restores the sum.
    // A budget is spent by ELAPSED TIME. With an injected clock the property
    // under test is exact: three 15-second attempts drawn from one 8-second
    // budget cannot sum past it, which is the whole difference between the
    // measured 46,238 ms and the measured 8,004 ms.
    let clock = 0
    const d = new Deadline(8_000, () => clock)
    const slices: number[] = []
    for (let i = 0; i < 3; i++) { const slice = d.sliceFor(15_000); slices.push(slice); clock += slice }
    check('F1: three attempts SHARE one budget — their slices sum to the budget, not to 3x the per-attempt limit',
      slices.reduce((a, b) => a + b, 0) === 8_000 && slices[2] === 0, JSON.stringify(slices))
    check('F2: an expired budget refuses to start further work',
      new Deadline(0).expired() === true)
    // A fetch with no timeout is exactly the pre-fix behaviour, and is unusable.
    const realFetch = globalThis.fetch
    const count = { n: 0 }
    ;(globalThis as any).fetch = blackHoleFetch(() => true, realFetch, count)
    const t0 = Date.now()
    const res = await fetchProvider('https://example.invalid/x', { method: 'POST' }, 500)
    const ms = Date.now() - t0
    ;(globalThis as any).fetch = realFetch
    check('F3: a bounded provider call classifies a black hole as a TIMEOUT and returns',
      res.outcome === 'timeout' && res.ok === false && ms < 3_000, `${ms}ms ${res.outcome}`)
    check('F4: a zero budget is a timeout, never an unbounded call',
      (await fetchProvider('https://example.invalid/x', {}, 0)).outcome === 'timeout')
    let threw = false
    try { await withDeadline(new Promise(() => {}), 100, 'stage') } catch (e) { threw = e instanceof DeadlineExceededError }
    check('F5: withDeadline rejects rather than hanging', threw)
  }

  say(`\n${pass} passed, ${fail} failed`)
  if (fail > 0) process.exitCode = 1
}
main().catch((e) => { loud(); console.error(e); process.exitCode = 1 })

/* Marks this a MODULE, not a global script: without it `main`, `check`, `pass`
 * and `fail` collide with every other QA suite at `next build` type-check time.
 * A plain import cannot be used — ES imports hoist above the Module._load hook. */
export {}
