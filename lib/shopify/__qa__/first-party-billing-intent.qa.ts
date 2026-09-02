/**
 * Shopify embedded billing — FIRST-PARTY INTENT HANDOFF QA.
 *
 * Production regression this covers, confirmed in Chrome end to end:
 *
 *   Embedded app → "Choose a plan"           → Shopify hosted pricing opened
 *   Merchant selected and APPROVED the plan  → Shopify returned to
 *   /shopify/app?charge_id=…&plan_handle=…   → app still showed "No active plan"
 *   …and NO request ever reached /api/shopify/billing/return.
 *
 * The intent cookie had never been stored. /api/shopify/billing/start-intent is
 * called by fetch() from inside the Shopify Admin iframe — a THIRD-PARTY
 * context for gotopseo.com — and it set `shopify_billing_intent`
 * (SameSite=Lax) on that response, which modern Chrome drops. Identical in
 * shape to the pending-link cookie regression already fixed, in the billing
 * flow this time.
 *
 * The fix moves the cookie to a first-party top-level POST
 * (/api/shopify/billing/resume). What is proven here: the behaviour of the
 * resume route against a real Supabase client over a stubbed PostgREST (real
 * HMAC verification, real expiry/consumption/ownership semantics), the
 * completion authority still living entirely in /api/shopify/billing/return,
 * the supported-plan-handle set, and source contracts for the two halves only a
 * browser can execute.
 *
 * SCOPE NOTE, stated explicitly: the source-contract sections assert what the
 * code does, NOT what a browser does with it. They do not prove Chrome's cookie
 * behaviour in an iframe; that is the documented reason for the design,
 * observed in Production, not something this file can execute.
 *
 * Run: npx tsx lib/shopify/__qa__/first-party-billing-intent.qa.ts
 */
import { readFileSync } from 'fs'
import { join } from 'path'
import type { createAdminClient } from '@/lib/supabase/admin'
import { FakeAdmin } from '../../__qa__/_fake-admin'
import {
  createBillingIntent, hashBillingIntentNonce, consumeBillingIntent,
  signBillingIntentHandoff, verifyBillingIntentHandoff,
  BILLING_INTENT_COOKIE, BILLING_INTENT_COOKIE_PATH, BILLING_INTENT_TTL_MS, BILLING_INTENT_RESUME_PATH,
} from '../billing-intent'
import { signPendingLinkCookieValue } from '../pending-link'
import { processShopifyBillingReturn } from '../billing-return-processing'
import { SHOPIFY_SUPPORTED_PLAN_HANDLES, isSupportedShopifyPlanHandle } from '../constants'
import { PLAN_CATALOG } from '@/lib/plans/catalog'

type Admin = ReturnType<typeof createAdminClient>

let pass = 0, fail = 0
function check(name: string, cond: boolean, detail?: string) {
  if (cond) { pass++; console.log(`  ✓ ${name}`) } else { fail++; console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`) }
}

const ROOT = join(__dirname, '..', '..', '..')
const read = (rel: string) => readFileSync(join(ROOT, rel), 'utf8')
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1')

const APP_URL = 'https://www.example-test.com'
const SECRET = 'test-public-client-secret'
const APP_HANDLE = 'go-top-seo-test'
process.env.SHOPIFY_APP_URL = APP_URL
process.env.SHOPIFY_APP_HANDLE = APP_HANDLE
process.env.SHOPIFY_PUBLIC_CLIENT_ID = 'test-public-client-id'
process.env.SHOPIFY_PUBLIC_CLIENT_SECRET = SECRET
process.env.SHOPIFY_CLIENT_ID = 'test-legacy-client-id'
process.env.SHOPIFY_CLIENT_SECRET = 'test-legacy-client-secret'
process.env.ENABLE_CONTENT = 'true'
// Synthetic Supabase credentials: the resume route calls the REAL
// createAdminClient(), so a real supabase-js client is built and its PostgREST
// requests are served by the stub below. Nothing reaches a network — the stub
// throws on any table the route is not allowed to touch, which is itself part
// of what is asserted.
process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://qa-stub.supabase.invalid'
process.env.SUPABASE_SERVICE_ROLE_KEY = 'qa-service-role-key'

const SHOP = 'billing-test.myshopify.com'
const SHOP_GID = 'gid://shopify/Shop/1'
const OTHER_SHOP = 'other-store.myshopify.com'
const CONNECTION_ID = 'conn-1'
const USER_ID = 'u1'
const PRICING_URL = `https://admin.shopify.com/store/billing-test/charges/${APP_HANDLE}/pricing_plans`

/** The two tables the resume route's REAL Supabase client will see. */
const intents: Record<string, unknown>[] = []
const connections: Record<string, unknown>[] = []
const fakeAdmin = new FakeAdmin({ shopify_billing_intents: intents, shopify_connections: connections })
/** Every PostgREST path the route caused, so the queries themselves can be asserted. */
const restCalls: string[] = []

function liveConnection(over: Record<string, unknown> = {}) {
  return {
    id: CONNECTION_ID, user_id: USER_ID, project_id: 'p1', shop_domain: SHOP, shop_gid: SHOP_GID,
    connection_status: 'connected', archived_at: null, ...over,
  }
}
/** Mint a fresh intent bound to the live connection above, as start-intent does. */
const newIntent = () => createBillingIntent(fakeAdmin as never, {
  userId: USER_ID, projectId: 'p1', connectionId: CONNECTION_ID, shopDomain: SHOP, shopGid: SHOP_GID,
})

/**
 * A minimal PostgREST emulator for the two tables this route may read. Any
 * other table is a failure, not a silent pass.
 */
function installRestStub(): () => void {
  const real = globalThis.fetch
  const TABLES: Record<string, Record<string, unknown>[]> = {
    shopify_billing_intents: intents,
    shopify_connections: connections,
  }
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const raw = typeof input === 'string' ? input : input instanceof URL ? input.toString() : (input as Request).url
    const u = new URL(raw)
    const table = u.pathname.replace('/rest/v1/', '')
    const rows = TABLES[table]
    if (!rows) throw new Error(`unexpected table: ${raw}`)
    restCalls.push(`${table}${u.search}`)
    let matched = rows.slice()
    u.searchParams.forEach((value, key) => {
      if (key === 'select' || key === 'order' || key === 'limit') return
      if (value.startsWith('eq.')) matched = matched.filter((r) => String(r[key]) === value.slice(3))
      else if (value === 'is.null') matched = matched.filter((r) => r[key] == null)
    })
    if (matched.length === 0) {
      return new Response(
        JSON.stringify({ code: 'PGRST116', details: 'The result contains 0 rows', hint: null, message: 'JSON object requested, multiple (or no) rows returned' }),
        { status: 406, headers: { 'content-type': 'application/json' } },
      )
    }
    return new Response(JSON.stringify(matched[0]), { status: 200, headers: { 'content-type': 'application/json' } })
  }) as typeof fetch
  return () => { globalThis.fetch = real }
}

/** A urlencoded POST to the resume route, exactly as the client's form sends it. */
function resumeRequest(fields: Record<string, string>, init: { contentType?: string | null; rawBody?: string } = {}) {
  const headers: Record<string, string> = {}
  const ct = 'contentType' in init ? init.contentType : 'application/x-www-form-urlencoded'
  if (ct) headers['content-type'] = ct
  return new Request(`${APP_URL}${BILLING_INTENT_RESUME_PATH}`, {
    method: 'POST', headers, body: init.rawBody ?? new URLSearchParams(fields).toString(),
  })
}

/** The Set-Cookie value for the billing-intent cookie on this response, or null. */
function intentCookieHeader(res: Response): string | null {
  const all = typeof (res.headers as unknown as { getSetCookie?: () => string[] }).getSetCookie === 'function'
    ? (res.headers as unknown as { getSetCookie: () => string[] }).getSetCookie()
    : [res.headers.get('set-cookie') ?? '']
  return all.find((c) => c && c.startsWith(`${BILLING_INTENT_COOKIE}=`)) ?? null
}

async function main() {
  console.log('Shopify embedded billing — first-party intent handoff\n')

  const { POST: resumePOST } = await import('../../../app/api/shopify/billing/resume/route')
  const startIntent = strip(read('app/api/shopify/billing/start-intent/route.ts'))
  const resumeSrc = strip(read('app/api/shopify/billing/resume/route.ts'))
  const client = strip(read('app/shopify/app/ConnectorHomeClient.tsx'))
  const returnRoute = strip(read('app/api/shopify/billing/return/route.ts'))
  const restoreFetch = installRestStub()
  connections.push(liveConnection())

  // ────────────────────────────────────────────────────────────────────────
  console.log('1) The embedded start-intent response no longer depends on a cookie the iframe may reject')
  {
    const apiBranch = startIntent.slice(startIntent.indexOf('if (isApiCall) {\n    const config'))
    check('1a: the embedded branch sets NO cookie',
      apiBranch.indexOf('cookies.set') === -1 || apiBranch.indexOf('cookies.set') > apiBranch.indexOf('EXTERNAL DASHBOARD') || !/isApiCall[\s\S]{0,400}cookies\.set/.test(apiBranch))
    check('1b: it returns the FIXED server-chosen resume path',
      /resumePath: BILLING_INTENT_RESUME_PATH/.test(startIntent))
    check('1c: and a signed opaque handoff over the app secret',
      /handoff: signBillingIntentHandoff\(nonce, config\.clientSecret\)/.test(startIntent))
    check('1d: NO caller-controlled redirect URL is returned to the embedded caller',
      !/redirectUrl/.test(startIntent))
    check('1e: REGRESSION CONTRACT — the embedded response is not expected to establish the cookie',
      !/setIntentCookie\(NextResponse\.json/.test(startIntent))
    check('1f: the resume path constant is exactly the first-party billing endpoint',
      BILLING_INTENT_RESUME_PATH === '/api/shopify/billing/resume')
    check('1g: every gate BEFORE the split is untouched — session token, admin, connection, authority, shop_gid',
      /const verified = verifyShopifySessionToken\(bearerToken\)/.test(startIntent)
      && /'admin_not_applicable'/.test(startIntent)
      && /'no_shopify_connection'/.test(startIntent)
      && /authority\.authority !== 'shopify' && !migration\.migration/.test(startIntent)
      && /'shop_identity_unverified'/.test(startIntent))
    check('1h: the intent itself is still minted by this route, unchanged',
      /const nonce = await createBillingIntent\(admin, \{/.test(startIntent))
    check('1i: SCOPE — source behaviour only; this section does not execute a browser', true)
  }

  // ────────────────────────────────────────────────────────────────────────
  console.log('\n2) The external website-dashboard flow is PRESERVED (already first-party)')
  {
    check('2a: the non-API branch still sets the intent cookie itself',
      /const res = NextResponse\.redirect\(pricing\.url\)\s*\n\s*res\.cookies\.set\(BILLING_INTENT_COOKIE, nonce, \{/.test(startIntent))
    check('2b: with the same scoped path and TTL',
      /path: BILLING_INTENT_COOKIE_PATH/.test(startIntent) && /maxAge: BILLING_INTENT_TTL_MS \/ 1000/.test(startIntent))
    check('2c: httpOnly, secure in Production, SameSite=Lax — unchanged',
      /httpOnly: true/.test(startIntent) && /secure: process\.env\.NODE_ENV === 'production'/.test(startIntent) && /sameSite: 'lax'/.test(startIntent))
    check('2d: and still redirects STRAIGHT to Shopify, with no extra hop',
      /NextResponse\.redirect\(pricing\.url\)/.test(startIntent))
    check('2e: the dashboard entry point is still a plain top-level GET link',
      /href="\/api\/shopify\/billing\/start-intent"/.test(read('app/(dashboard)/billing/BillingView.tsx')))
    check('2f: it sends no Authorization header, so it takes the unchanged branch',
      !/Authorization/.test(strip(read('app/(dashboard)/billing/BillingView.tsx'))))
  }

  // ────────────────────────────────────────────────────────────────────────
  console.log('\n3) The embedded client submits the billing handoff as a top-level form POST')
  {
    check('3a: it no longer navigates to a server-supplied redirect URL',
      !/json\.redirectUrl/.test(client) && !/redirectUrl/.test(client))
    check('3b: it knows exactly one billing resume path',
      /const BILLING_RESUME_PATH = '\/api\/shopify\/billing\/resume'/.test(client))
    check('3c: and checks the server’s copy matches it before submitting',
      /json\.resumePath === BILLING_RESUME_PATH && json\.handoff/.test(client))
    check('3d: it posts its OWN constant, so a tampered path can never be the action',
      /submitHandoffTopLevel\(data\?\.appUrl \?\? '', BILLING_RESUME_PATH, json\.handoff\)/.test(client))
    check('3e: through the shared top-level form helper — POST, target _top, hidden "handoff"',
      /form\.method = 'POST'/.test(client) && /form\.target = '_top'/.test(client)
      && /form\.action = `\$\{appUrl\}\$\{resumePath\}`/.test(client)
      && /field\.name = 'handoff'/.test(client))
    check('3f: never in a query param, fragment, localStorage or sessionStorage',
      !/handoff=/.test(client) && !/localStorage|sessionStorage|document\.cookie/.test(client))
    check('3g: the handoff is never logged by the client', !/console\.\w+\([^\n]*handoff/.test(client))
    check('3h: SCOPE — a source contract on the form; it does not prove a browser accepts the cookie', true)
  }

  // ────────────────────────────────────────────────────────────────────────
  console.log('\n4) Resume — a VALID handoff sets the scoped cookie and 303s to the server-built Shopify pricing URL')
  {
    const nonce = await newIntent()
    const handoff = signBillingIntentHandoff(nonce, SECRET)
    const res = await resumePOST(resumeRequest({ handoff }))

    check('4a: 303 — a POST result must not be re-POSTed on follow', res.status === 303)
    check('4b: to the Shopify hosted pricing page for THIS store',
      res.headers.get('location') === PRICING_URL, res.headers.get('location') ?? 'null')
    check('4c: built server-side from the intent’s own canonical shop domain, via the shared builder',
      /buildShopifyPricingUrl\(intent\.shop_domain\)/.test(resumeSrc))
    const cookie = intentCookieHeader(res)
    check('4d: it sets the billing-intent cookie', cookie !== null)
    check('4e: to the raw nonce, which is what /billing/return reads',
      !!cookie && cookie.startsWith(`${BILLING_INTENT_COOKIE}=${nonce}`))
    check('4f: httpOnly', !!cookie && /HttpOnly/i.test(cookie))
    check('4g: SameSite=Lax — NOT weakened to None',
      !!cookie && /SameSite=Lax/i.test(cookie) && !/SameSite=None/i.test(cookie!))
    check('4h: the EXISTING scoped cookie path, not "/"',
      !!cookie && new RegExp(`Path=${BILLING_INTENT_COOKIE_PATH}`, 'i').test(cookie) && BILLING_INTENT_COOKIE_PATH === '/api/shopify/billing')
    check('4i: the existing 15-minute TTL',
      !!cookie && new RegExp(`Max-Age=${BILLING_INTENT_TTL_MS / 1000}\\b`, 'i').test(cookie) && BILLING_INTENT_TTL_MS === 15 * 60_000)
    check('4j: the intent was looked up by the HASH of the nonce, never the raw value',
      restCalls.some((c) => c.startsWith('shopify_billing_intents') && c.includes(`nonce_hash=eq.${hashBillingIntentNonce(nonce)}`))
      && !restCalls.some((c) => c.includes(nonce)))
    check('4k: and the connection was re-resolved server-side from the intent’s own connection_id',
      restCalls.some((c) => c.startsWith('shopify_connections') && c.includes(`id=eq.${CONNECTION_ID}`)
        && c.includes('archived_at=is.null') && c.includes('connection_status=eq.connected')))
    check('4l: resume CONSUMES NOTHING — the intent is still unconsumed afterwards',
      intents.find((r) => r.nonce_hash === hashBillingIntentNonce(nonce))?.consumed_at == null)
  }

  // ────────────────────────────────────────────────────────────────────────
  console.log('\n5) Resume — every invalid handoff is refused WITHOUT setting a cookie')
  {
    const liveNonce = await newIntent()
    const live = signBillingIntentHandoff(liveNonce, SECRET)
    const cases: { name: string; req: Request }[] = [
      { name: '5a: MISSING — no handoff field', req: resumeRequest({}) },
      { name: '5b: EMPTY — present but blank', req: resumeRequest({ handoff: '' }) },
      { name: '5c: MALFORMED — no signature separator', req: resumeRequest({ handoff: liveNonce }) },
      { name: '5d: MALFORMED — junk', req: resumeRequest({ handoff: 'not-a-handoff' }) },
      { name: '5e: TAMPERED — right nonce, forged signature', req: resumeRequest({ handoff: `${liveNonce}.${'0'.repeat(64)}` }) },
      { name: '5f: TAMPERED — signed with a DIFFERENT secret', req: resumeRequest({ handoff: signBillingIntentHandoff(liveNonce, 'other-secret') }) },
      { name: '5g: CROSS-CREDENTIAL — a valid PENDING-LINK handoff is not a billing handoff', req: resumeRequest({ handoff: signPendingLinkCookieValue(liveNonce, SECRET) }) },
      { name: '5h: OVERSIZED handoff', req: resumeRequest({ handoff: `${liveNonce}.${'a'.repeat(4000)}` }) },
      { name: '5i: OVERSIZED body', req: resumeRequest({}, { rawBody: `handoff=${'b'.repeat(9000)}` }) },
      { name: '5j: WRONG CONTENT TYPE — JSON is not accepted', req: resumeRequest({}, { contentType: 'application/json', rawBody: JSON.stringify({ handoff: live }) }) },
      { name: '5k: NO CONTENT TYPE', req: resumeRequest({}, { contentType: null, rawBody: `handoff=${live}` }) },
      { name: '5l: NONEXISTENT — validly signed nonce with no intent row', req: resumeRequest({ handoff: signBillingIntentHandoff('f'.repeat(64), SECRET) }) },
    ]
    for (const c of cases) {
      const res = await resumePOST(c.req)
      check(`${c.name} → 303 to the first-party billing error page, no cookie`,
        res.status === 303 && intentCookieHeader(res) === null
        && (res.headers.get('location') ?? '').startsWith(`${APP_URL}/billing?shopify=error&reason=`))
    }

    // CONSUMED — an intent that already completed a billing round-trip.
    {
      const n = await newIntent()
      check('5m: pre-condition — valid before consumption',
        intentCookieHeader(await resumePOST(resumeRequest({ handoff: signBillingIntentHandoff(n, SECRET) }))) !== null)
      await consumeBillingIntent(fakeAdmin as never, hashBillingIntentNonce(n))
      const res = await resumePOST(resumeRequest({ handoff: signBillingIntentHandoff(n, SECRET) }))
      check('5n: CONSUMED — cannot be re-armed into a second cookie',
        res.status === 303 && intentCookieHeader(res) === null)
    }
    // EXPIRED
    {
      const n = await newIntent()
      intents.find((r) => r.nonce_hash === hashBillingIntentNonce(n))!.expires_at = new Date(Date.now() - 1000).toISOString()
      const res = await resumePOST(resumeRequest({ handoff: signBillingIntentHandoff(n, SECRET) }))
      check('5o: EXPIRED — past its 15-minute TTL, no cookie',
        res.status === 303 && intentCookieHeader(res) === null
        && (res.headers.get('location') ?? '').includes('billing_intent_expired'))
    }
  }

  // ────────────────────────────────────────────────────────────────────────
  console.log('\n6) Resume — MISMATCHED ownership is refused, and there is no open redirect')
  {
    const n = await newIntent()
    const h = signBillingIntentHandoff(n, SECRET)
    const conn = connections[0]

    const mismatches: { name: string; mutate: () => void }[] = [
      { name: '6a: the connection was ARCHIVED since the intent was minted', mutate: () => { conn.archived_at = '2026-01-01T00:00:00Z' } },
      { name: '6b: the connection is no longer CONNECTED', mutate: () => { conn.connection_status = 'failed' } },
      { name: '6c: the connection now belongs to a DIFFERENT user', mutate: () => { conn.user_id = 'someone-else' } },
      { name: '6d: the connection now points at a DIFFERENT shop', mutate: () => { conn.shop_domain = OTHER_SHOP } },
      { name: '6e: the connection’s verified shop identity no longer matches', mutate: () => { conn.shop_gid = 'gid://shopify/Shop/999' } },
      { name: '6f: the connection lost its shop_gid entirely', mutate: () => { conn.shop_gid = null } },
    ]
    for (const m of mismatches) {
      Object.assign(conn, liveConnection())
      m.mutate()
      const res = await resumePOST(resumeRequest({ handoff: h }))
      check(`${m.name} → refused, no cookie`,
        res.status === 303 && intentCookieHeader(res) === null && !(res.headers.get('location') ?? '').includes('admin.shopify.com'))
    }
    Object.assign(conn, liveConnection())

    for (const attempt of [
      { name: 'a next= parameter', url: `${APP_URL}${BILLING_INTENT_RESUME_PATH}?next=https://evil.example.com` },
      { name: 'a redirect_uri parameter', url: `${APP_URL}${BILLING_INTENT_RESUME_PATH}?redirect_uri=https://evil.example.com` },
    ]) {
      const res = await resumePOST(new Request(attempt.url, {
        method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ handoff: h, next: 'https://evil.example.com', redirect_uri: 'https://evil.example.com' }).toString(),
      }))
      check(`6: NO OPEN REDIRECT — ${attempt.name} is ignored`, res.headers.get('location') === PRICING_URL)
    }
    check('6i: the route never reads searchParams at all', !/searchParams/.test(resumeSrc))
    check('6j: and the only destinations in it are the shared builder and the fixed error page',
      !/admin\.shopify\.com/.test(resumeSrc) && /\$\{config\.appUrl\}\/billing\?shopify=error/.test(resumeSrc))
  }

  restoreFetch()

  // ────────────────────────────────────────────────────────────────────────
  console.log('\n7) /api/shopify/billing/return remains the ONLY completion authority')
  {
    check('7a: resume consumes nothing, verifies nothing, writes nothing',
      !/consumeBillingIntent|recordShopifyBillingCache|confirmShopifyActiveAndAdvance|getActiveShopifySubscription|billing_governance/.test(resumeSrc))
    check('7b: the return route is still the one that delegates to the processor',
      /processShopifyBillingReturn\(admin, \{ nonce, suppliedShopRaw, callbackParams \}\)/.test(strip(read('app/api/shopify/billing/return/route.ts'))))
    check('7c: it still reads its authorization from the intent COOKIE only',
      /cookieStore\.get\(BILLING_INTENT_COOKIE\)\?\.value/.test(returnRoute))
    check('7d: charge_id and plan_handle are never read as authorization anywhere',
      !/charge_id/.test(returnRoute) && !/plan_handle/.test(returnRoute)
      && !/charge_id/.test(strip(read('lib/shopify/billing-return-processing.ts'))))
    check('7d2: the full query is passed ONLY so Shopify’s own HMAC over it can be verified',
      /callbackParams\[k\] = v/.test(returnRoute)
      && /verifyShopifyHmac\(callbackParams, config\.clientSecret\)/.test(strip(read('lib/shopify/billing-return-processing.ts'))))
    check('7e: the `shop` query parameter is only an equality CHECK, never a lookup key',
      /searchParams\.get\('shop'\)/.test(returnRoute) && /suppliedShopRaw/.test(returnRoute))

    function conn() {
      return { id: CONNECTION_ID, project_id: 'p1', user_id: USER_ID, shop_domain: SHOP, shop_gid: SHOP_GID, archived_at: null, connection_status: 'connected' }
    }
    // MISSING
    {
      const admin = new FakeAdmin({ shopify_billing_intents: [], shopify_connections: [conn()] })
      const r = await processShopifyBillingReturn(admin as unknown as Admin, { nonce: undefined, suppliedShopRaw: SHOP })
      check('7f: a MISSING intent is rejected — a bare `shop` authorizes nothing', r.outcome === 'billing_intent_missing')
    }
    // FORGED
    {
      const admin = new FakeAdmin({ shopify_billing_intents: [], shopify_connections: [conn()] })
      const r = await processShopifyBillingReturn(admin as unknown as Admin, { nonce: 'f'.repeat(64), suppliedShopRaw: SHOP })
      check('7g: a FORGED nonce is rejected', r.outcome === 'billing_intent_invalid')
    }
    // REPLAYED
    {
      const admin = new FakeAdmin({ shopify_billing_intents: [], shopify_connections: [conn()] })
      const n = await createBillingIntent(admin as never, { userId: USER_ID, projectId: 'p1', connectionId: CONNECTION_ID, shopDomain: SHOP, shopGid: SHOP_GID })
      await consumeBillingIntent(admin as never, hashBillingIntentNonce(n))
      const r = await processShopifyBillingReturn(admin as unknown as Admin, { nonce: n, suppliedShopRaw: SHOP })
      check('7h: a REPLAYED (already consumed) intent is an idempotent no-op, never a re-grant',
        r.outcome === 'billing_intent_already_processed')
    }
    // CROSS-SHOP
    {
      const admin = new FakeAdmin({ shopify_billing_intents: [], shopify_connections: [conn()] })
      const n = await createBillingIntent(admin as never, { userId: USER_ID, projectId: 'p1', connectionId: CONNECTION_ID, shopDomain: SHOP, shopGid: SHOP_GID })
      const r = await processShopifyBillingReturn(admin as unknown as Admin, { nonce: n, suppliedShopRaw: OTHER_SHOP })
      check('7i: a CROSS-SHOP `shop` parameter is rejected', r.outcome === 'shop_mismatch')
    }
    // EXPIRED
    {
      const admin = new FakeAdmin({ shopify_billing_intents: [], shopify_connections: [conn()] })
      const n = await createBillingIntent(admin as never, { userId: USER_ID, projectId: 'p1', connectionId: CONNECTION_ID, shopDomain: SHOP, shopGid: SHOP_GID })
      const t = admin.tables.shopify_billing_intents as Record<string, unknown>[]
      t[0].expires_at = new Date(Date.now() - 1000).toISOString()
      const r = await processShopifyBillingReturn(admin as unknown as Admin, { nonce: n, suppliedShopRaw: SHOP })
      check('7j: an EXPIRED intent is rejected', r.outcome === 'billing_intent_expired')
    }
  }

  // ────────────────────────────────────────────────────────────────────────
  console.log('\n8) Supported plan handles — free-plan stays unsupported, all four paid handles stay recognized')
  {
    check('8a: exactly four supported handles', SHOPIFY_SUPPORTED_PLAN_HANDLES.length === 4)
    check('8b: and they are regular, advanced, premium, large-agency',
      JSON.stringify([...SHOPIFY_SUPPORTED_PLAN_HANDLES]) === JSON.stringify(['regular', 'advanced', 'premium', 'large-agency']))
    for (const h of SHOPIFY_SUPPORTED_PLAN_HANDLES) {
      check(`8c: '${h}' is recognized`, isSupportedShopifyPlanHandle(h))
    }
    for (const bad of ['free-plan', 'free_plan', 'free', 'Free-Plan', 'large_agency', '', 'basic']) {
      check(`8d: '${bad}' is NOT a supported entitlement handle`, !isSupportedShopifyPlanHandle(bad))
    }
    check('8e: free-plan appears in no EXECUTABLE line of the Shopify billing source',
      !/free-plan|free_plan/i.test(strip(read('lib/shopify/constants.ts')))
      && !/free-plan|free_plan/i.test(strip(read('lib/shopify/billing-return-processing.ts')))
      && !/free-plan|free_plan/i.test(strip(read('lib/plans/catalog.ts'))))
    check('8e2: and its exclusion stays DOCUMENTED, so it is a decision rather than an omission',
      /`free-plan`[\s\S]{0,80}deliberately NOT included/.test(read('lib/shopify/constants.ts')))
    check('8f: the catalog’s Shopify handles match the supported set exactly',
      JSON.stringify(Object.values(PLAN_CATALOG).map((p) => p.shopifyHandle).sort())
      === JSON.stringify([...SHOPIFY_SUPPORTED_PLAN_HANDLES].sort()))
    check('8g: every plan is a 7-day trial', Object.values(PLAN_CATALOG).every((p) => p.trialDays === 7))
    check('8h: USD prices are 79 / 179 / 329 / 649',
      PLAN_CATALOG.regular.priceUSD === 79 && PLAN_CATALOG.advanced.priceUSD === 179
      && PLAN_CATALOG.premium.priceUSD === 329 && PLAN_CATALOG.large_agency.priceUSD === 649)
    check('8i: an unrecognized handle is a WARNING outcome, never an entitlement',
      /unrecognized_plan/.test(strip(read('lib/shopify/billing-return-processing.ts'))))
  }

  // ────────────────────────────────────────────────────────────────────────
  console.log('\n9) Nothing sensitive is logged, returned or stored on this path')
  {
    check('9a: the resume route logs NOTHING at all',
      [...resumeSrc.matchAll(/console\.\w+\([^\n]*/g)].length === 0)
    check('9b: it never echoes the handoff, nonce or cookie into a response body',
      !/NextResponse\.json\([^\n]*handoff/.test(resumeSrc) && !/json\(\{ *nonce/.test(resumeSrc))
    check('9c: no nonce, handoff or cookie ever reaches a URL it builds',
      !/handoff=/.test(resumeSrc) && !/nonce=/.test(resumeSrc))
    check('9d: no Shopify access token, session token or Partner credential is touched here',
      !/accessToken|access_token|sessionToken|Bearer|Partner/i.test(resumeSrc))
    check('9e: the client secret is used ONLY as the HMAC verification key',
      (resumeSrc.match(/clientSecret/g) || []).length === 1
      && /verifyBillingIntentHandoff\(handoff, config\.clientSecret\)/.test(resumeSrc))
    check('9f: start-intent logs no nonce, handoff or secret',
      [...startIntent.matchAll(/console\.\w+\([^\n]*/g)].every((m) => !/nonce|handoff|clientSecret|Bearer/i.test(m[0])))
    check('9g: only the SHA-256 hash of the nonce is ever stored',
      /nonce_hash: hashBillingIntentNonce\(nonce\)/.test(strip(read('lib/shopify/billing-intent.ts'))))
    check('9h: the two handoff credentials are domain-separated, so neither can be replayed as the other',
      verifyBillingIntentHandoff(signPendingLinkCookieValue('abc', SECRET), SECRET) === null
      && verifyBillingIntentHandoff(signBillingIntentHandoff('abc', SECRET), SECRET) === 'abc')
  }

  console.log(`\n${pass} passed, ${fail} failed`)
  if (fail > 0) process.exitCode = 1
}

main()
