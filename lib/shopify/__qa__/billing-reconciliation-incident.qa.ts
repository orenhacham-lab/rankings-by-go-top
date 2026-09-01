/**
 * Shopify billing reconciliation — SEP 2 PRODUCTION INCIDENT QA.
 *
 * What actually happened, end to end, through the app's own Choose-a-plan
 * entry point on go-top-seo-test.myshopify.com:
 *
 *   1-3. The merchant chose Advanced; Shopify approved and ACTIVATED it.
 *   4.   Shopify returned to /api/shopify/billing/return?plan_handle=advanced&charge_id=…
 *   5.   The return rendered the external Rankings Hebrew LOGIN page inside
 *        Shopify Admin.
 *   6-7. Logging in there never completed.
 *   8.   Reopening the embedded app still showed "No active plan".
 *   9.   Shopify's own plan picker showed Advanced as Current, 7 trial days left.
 *
 * THREE INDEPENDENT DEFECTS, each proven here:
 *
 *   A. WRONG APP QUERIED. app-home renders "No active plan" only for
 *      `{ ok: true, active: false }` — a SUCCESSFUL verification reporting no
 *      subscription. `activeSubscription(appId:, shopId:)` is scoped to one app
 *      in one Partner organization, and this codebase runs two apps (public +
 *      legacy). Verification used one global app id for every shop while every
 *      connection already records its own `oauth_app_edition`. Asking the wrong
 *      app returns a clean `null`, indistinguishable from "did not pay".
 *
 *   B. WRONG RETURN DESTINATION. The return redirected every caller to the
 *      website dashboard. Inside the Admin iframe that has no Supabase session
 *      (its cookie is SameSite=Lax and is not sent third-party), so the
 *      merchant got the website login page, framed — steps 5-7 exactly.
 *
 *   C. NO COOKIE-LESS RECOVERY. Shopify frames the return, so the SameSite=Lax
 *      intent cookie never arrives and the round-trip could not complete at
 *      all; a lost return left the merchant permanently stuck.
 *
 * SCOPE NOTE: sections marked SOURCE assert what the code does, not what a
 * browser or Shopify's servers do. They do not prove Chrome's cookie handling
 * in an iframe, and they do not prove which Partner app owns the real
 * subscription — that is a deployment fact, stated in the report, not
 * something this file can execute.
 *
 * Run: npx tsx lib/shopify/__qa__/billing-reconciliation-incident.qa.ts
 */
import { readFileSync } from 'fs'
import { join } from 'path'
import type { createAdminClient } from '@/lib/supabase/admin'
import { FakeAdmin } from '../../__qa__/_fake-admin'
import { processShopifyBillingReturn } from '../billing-return-processing'
import { getActiveShopifySubscription } from '../partner-client'
import {
  createBillingIntent, hashBillingIntentNonce, consumeBillingIntent,
  isEmbeddedBillingIntent, BILLING_INTENT_ACTION_EMBEDDED, BILLING_INTENT_ACTION_WEBSITE,
} from '../billing-intent'
import { buildShopifyAdminAppUrl } from '../billing-urls'
import { verifyShopifyHmac } from '../oauth'
import crypto from 'crypto'

type Admin = ReturnType<typeof createAdminClient>

let pass = 0, fail = 0
function check(name: string, cond: boolean, detail?: string) {
  if (cond) { pass++; console.log(`  ✓ ${name}`) } else { fail++; console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`) }
}
const ROOT = join(__dirname, '..', '..', '..')
const read = (rel: string) => readFileSync(join(ROOT, rel), 'utf8')
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1')

// The real store from the incident. Public identifiers only — no credentials.
const SHOP = 'go-top-seo-test.myshopify.com'
const SHOP_GID = 'gid://shopify/Shop/77989445789'
const OTHER_SHOP = 'someone-else.myshopify.com'
const CONN = 'conn-1'
const USER = 'u1'
const PROJECT = 'p1'
const PUBLIC_APP_ID = '397648429057'
const LEGACY_APP_ID = '111111111111'
const PUBLIC_SECRET = 'test-public-secret'
const LEGACY_SECRET = 'test-legacy-secret'

process.env.SHOPIFY_APP_URL = 'https://www.example-test.com'
process.env.SHOPIFY_APP_HANDLE = 'go-top-seo-test'
process.env.SHOPIFY_PUBLIC_CLIENT_ID = 'public-client-id'
process.env.SHOPIFY_PUBLIC_CLIENT_SECRET = PUBLIC_SECRET
process.env.SHOPIFY_CLIENT_ID = 'legacy-client-id'
process.env.SHOPIFY_CLIENT_SECRET = LEGACY_SECRET
process.env.SHOPIFY_PARTNER_API_VERSION = '2026-07'
process.env.SHOPIFY_PARTNER_API_ACCESS_TOKEN = 'legacy-partner-token'
process.env.SHOPIFY_PARTNER_ORGANIZATION_ID = '4243054'
process.env.SHOPIFY_PARTNER_APP_GID = `gid://shopify/App/${LEGACY_APP_ID}`

function clearPublicPartnerEnv() {
  delete process.env.SHOPIFY_PARTNER_API_ACCESS_TOKEN_PUBLIC
  delete process.env.SHOPIFY_PARTNER_ORGANIZATION_ID_PUBLIC
  delete process.env.SHOPIFY_PARTNER_APP_GID_PUBLIC
}
function setPublicPartnerEnv() {
  process.env.SHOPIFY_PARTNER_API_ACCESS_TOKEN_PUBLIC = 'public-partner-token'
  process.env.SHOPIFY_PARTNER_ORGANIZATION_ID_PUBLIC = '163879745'
  process.env.SHOPIFY_PARTNER_APP_GID_PUBLIC = `gid://shopify/App/${PUBLIC_APP_ID}`
}

function connectionRow(over: Record<string, unknown> = {}) {
  return {
    id: CONN, project_id: PROJECT, user_id: USER, shop_domain: SHOP, shop_gid: SHOP_GID,
    connection_status: 'connected', archived_at: null, oauth_app_edition: 'public',
    shopify_plan_handle: null, shopify_subscription_status: null,
    shopify_trial_ends_at: null, shopify_current_period_end: null,
    shopify_cancel_at_end_of_cycle: false, shopify_billing_last_error: null,
    shopify_billing_verified_at: null, shopify_current_period_start: null, ...over,
  }
}
const freshAdmin = (over: Record<string, unknown> = {}) => new FakeAdmin({
  shopify_connections: [connectionRow(over)],
  shopify_billing_intents: [],
  shopify_billing_migrations: [],
  billing_governance: [{ user_id: USER, signup_origin: 'shopify_app_store', billing_authority: 'shopify' }],
})

/**
 * A stubbed Partner API. It answers with the ADVANCED subscription only when
 * asked about the app that really owns it — which is the whole point of the
 * incident — and records every (org, appId) pair it was asked about.
 */
function partnerStub(opts: { owningAppId: string; handle?: string; onCall?: (o: { org: string; appId: string }) => void }): typeof fetch {
  return (async (url: RequestInfo | URL, init?: RequestInit) => {
    const href = typeof url === 'string' ? url : (url as URL).toString()
    const org = /partners\.shopify\.com\/([^/]+)\//.exec(href)?.[1] ?? ''
    const body = JSON.parse(String(init?.body ?? '{}')) as { variables?: { appId?: string; shopId?: string } }
    const appId = /App\/(\d+)$/.exec(body.variables?.appId ?? '')?.[1] ?? ''
    opts.onCall?.({ org, appId })
    const owns = appId === opts.owningAppId
    return new Response(JSON.stringify({
      data: {
        activeSubscription: owns ? {
          shop: { id: body.variables?.shopId ?? SHOP_GID, myshopifyDomain: SHOP },
          trialEndsAt: '2026-09-09T00:00:00Z',
          cancelAtEndOfCycle: false,
          currentBillingCycle: { startTime: '2026-09-02T00:00:00Z', endTime: '2026-10-02T00:00:00Z' },
          items: [{ handle: opts.handle ?? 'advanced', price: { __typename: 'FlatRatePrice', active: true } }],
        } : null,
      },
    }), { status: 200, headers: { 'content-type': 'application/json' } })
  }) as unknown as typeof fetch
}

/** The signed callback Shopify itself produces for the billing return. */
function signedCallback(secret: string, over: Record<string, string> = {}): Record<string, string> {
  const params: Record<string, string> = {
    charge_id: '31904039069', plan_handle: 'advanced', shop: SHOP,
    timestamp: String(Math.floor(Date.now() / 1000)), ...over,
  }
  const message = Object.keys(params).sort().map((k) => `${k}=${params[k]}`).join('&')
  params.hmac = crypto.createHmac('sha256', secret).update(message).digest('hex')
  return params
}
const cacheOf = (admin: FakeAdmin) => (admin.tables.shopify_connections as Record<string, unknown>[])[0]
const intentsOf = (admin: FakeAdmin) => admin.tables.shopify_billing_intents as Record<string, unknown>[]
const mintIntent = (admin: FakeAdmin, embedded: boolean) => createBillingIntent(admin as never, {
  userId: USER, projectId: PROJECT, connectionId: CONN, shopDomain: SHOP, shopGid: SHOP_GID,
  intendedAction: embedded ? BILLING_INTENT_ACTION_EMBEDDED : BILLING_INTENT_ACTION_WEBSITE,
})

async function main() {
  console.log('Shopify billing reconciliation — Sep 2 incident\n')
  const startIntent = strip(read('app/api/shopify/billing/start-intent/route.ts'))
  const returnRoute = strip(read('app/api/shopify/billing/return/route.ts'))
  const resumeSrc = strip(read('app/api/shopify/billing/resume/route.ts'))
  const partnerSrc = strip(read('lib/shopify/partner-client.ts'))
  const appHome = strip(read('app/api/shopify/app-home/route.ts'))

  // ─────────────────────────────────────────────────────────────────────
  console.log('A) ROOT CAUSE — billing was verified against the WRONG Shopify app')
  {
    clearPublicPartnerEnv()
    const asked: { org: string; appId: string }[] = []
    // The Advanced subscription belongs to the PUBLIC app; the single global
    // config names the LEGACY one. This is the pre-fix production shape.
    const r = await getActiveShopifySubscription(SHOP_GID, partnerStub({ owningAppId: PUBLIC_APP_ID, onCall: (o) => asked.push(o) }), SHOP, 'public')
    check('A1: REPRODUCES the incident — a successful query reports NO subscription',
      r.ok === true && r.active === false && (r as { reason: string }).reason === 'no_subscription')
    check('A2: which is exactly what app-home turns into "No active plan", not "Could not verify"',
      /billing = \{ status: 'none'/.test(appHome) && /verificationError: result\.reason/.test(appHome))
    check('A3: and the wrong app was in fact the one queried', asked.length === 1 && asked[0].appId === LEGACY_APP_ID)
    check('A4: the answer now NAMES the app it asked, so this is diagnosable',
      r.queried?.appId === LEGACY_APP_ID && r.queried?.edition === 'public')

    // With the public app configured, the same shop resolves correctly.
    setPublicPartnerEnv()
    const asked2: { org: string; appId: string }[] = []
    const r2 = await getActiveShopifySubscription(SHOP_GID, partnerStub({ owningAppId: PUBLIC_APP_ID, onCall: (o) => asked2.push(o) }), SHOP, 'public')
    check('A5: FIXED — the public-edition connection is verified against the public app',
      asked2.length === 1 && asked2[0].appId === PUBLIC_APP_ID)
    check('A6: in that app’s own Partner organization', asked2[0].org === '163879745')
    check('A7: and Advanced is recovered as an active plan',
      r2.ok === true && r2.active === true && (r2 as { planHandle: string }).planHandle === 'advanced')
    check('A8: a legacy-edition connection still uses the original app — unchanged',
      (await (async () => { const a: { appId: string }[] = []; await getActiveShopifySubscription(SHOP_GID, partnerStub({ owningAppId: LEGACY_APP_ID, onCall: (o) => a.push(o) }), SHOP, 'legacy'); return a[0]?.appId })()) === LEGACY_APP_ID)
    check('A9: a NULL edition (pre-split rows) also keeps the original app',
      (await (async () => { const a: { appId: string }[] = []; await getActiveShopifySubscription(SHOP_GID, partnerStub({ owningAppId: LEGACY_APP_ID, onCall: (o) => a.push(o) }), SHOP, null); return a[0]?.appId })()) === LEGACY_APP_ID)

    // FAIL CLOSED on a half-configured override.
    clearPublicPartnerEnv()
    process.env.SHOPIFY_PARTNER_APP_GID_PUBLIC = `gid://shopify/App/${PUBLIC_APP_ID}`
    const r3 = await getActiveShopifySubscription(SHOP_GID, partnerStub({ owningAppId: PUBLIC_APP_ID }), SHOP, 'public')
    check('A10: FAIL CLOSED — a partially configured public override never falls back to the other app',
      r3.ok === false && r3.reason === 'missing_config')
    check('A11: which surfaces as "could not verify", never as "no active plan"',
      r3.ok === false)
    setPublicPartnerEnv()
    check('A12: SOURCE — the app queried is chosen by the connection’s own edition',
      /loadPartnerApiConfig\(resolvedEdition\)/.test(partnerSrc)
      && /connection\.oauth_app_edition/.test(appHome))
  }

  // ─────────────────────────────────────────────────────────────────────
  console.log('\nB) An already-active Advanced subscription is recovered on app-home load')
  {
    setPublicPartnerEnv()
    const admin = freshAdmin()
    const r = await getActiveShopifySubscription(SHOP_GID, partnerStub({ owningAppId: PUBLIC_APP_ID }), SHOP, 'public')
    check('B1: the live check finds the ACTIVE plan without any intent or cookie',
      r.ok === true && r.active === true)
    check('B2: app-home runs that live check on EVERY load when Shopify is the authority',
      /const result = await getActiveShopifySubscription\(connection\.shop_gid, fetch, shopDomain, connection\.oauth_app_edition\)/.test(appHome))
    check('B3: it writes the verified answer straight to the billing cache',
      /shopify_plan_handle: result\.planHandle, shopify_subscription_status: 'active'/.test(appHome))
    check('B4: no charge is ever created — this client has no mutation capability at all',
      !/appSubscriptionCreate|appPurchaseOneTime|subscriptionCreate/.test(partnerSrc))
    check('B5: recovery needs no merchant action — no plan re-selection is requested anywhere',
      !/selectPlan|choose_again|reselect/.test(appHome))
    void admin
  }

  // ─────────────────────────────────────────────────────────────────────
  console.log('\nC) An EMBEDDED billing return never lands on the external login page')
  {
    check('C1: the origin is stamped SERVER-SIDE from which caller minted the intent',
      /intendedAction: isApiCall \? BILLING_INTENT_ACTION_EMBEDDED : BILLING_INTENT_ACTION_WEBSITE/.test(startIntent))
    check('C2: never from request input', !/intendedAction:\s*(body|json|params|searchParams)/.test(startIntent))
    check('C3: the two markers are distinct and the website one is the pre-existing value',
      BILLING_INTENT_ACTION_EMBEDDED === 'select_plan_embedded' && BILLING_INTENT_ACTION_WEBSITE === 'select_plan')
    check('C4: an unmarked/legacy row reads as the WEBSITE flow, which is what it was',
      !isEmbeddedBillingIntent('select_plan') && !isEmbeddedBillingIntent(null) && isEmbeddedBillingIntent('select_plan_embedded'))

    setPublicPartnerEnv()
    const admin = freshAdmin()
    const nonce = await mintIntent(admin, true)
    const res = await processShopifyBillingReturn(admin as unknown as Admin, { nonce, suppliedShopRaw: SHOP }, partnerStub({ owningAppId: PUBLIC_APP_ID }))
    check('C5: an embedded round-trip succeeds', res.outcome === 'success', res.outcome)
    check('C6: and reports itself as embedded, with the connection’s own shop domain',
      res.embedded === true && res.shopDomain === SHOP)
    const dest = buildShopifyAdminAppUrl(res.shopDomain!)
    check('C7: which routes to the Shopify APP inside Admin, not to /projects',
      dest.ok && dest.url === 'https://admin.shopify.com/store/go-top-seo-test/apps/go-top-seo-test')
    check('C8: SOURCE — the route sends embedded returns there',
      /if \(result\.embedded && result\.shopDomain\)/.test(returnRoute)
      && /buildShopifyAdminAppUrl\(result\.shopDomain\)/.test(returnRoute))
    check('C9: via a TOP-LEVEL navigation, because admin.shopify.com refuses to be framed',
      /window\.top\.location\.href=\$\{jsUrl\}/.test(returnRoute) && /target="_top"/.test(returnRoute))
    check('C10: the destination is server-built, never a URL from the browser',
      !/searchParams\.get\('return|redirect_uri|returnUrl/.test(returnRoute))

    // WEBSITE origin — completely unchanged.
    const admin2 = freshAdmin()
    const nonce2 = await mintIntent(admin2, false)
    const res2 = await processShopifyBillingReturn(admin2 as unknown as Admin, { nonce: nonce2, suppliedShopRaw: SHOP }, partnerStub({ owningAppId: PUBLIC_APP_ID }))
    check('C11: a WEBSITE-origin return still succeeds and is NOT marked embedded',
      res2.outcome === 'success' && res2.embedded === false)
    check('C12: so it still routes to the website project page',
      /const destination = result\.projectId\s*\n?\s*\? projectReturnUrl\(appUrl, result\.projectId, q\)/.test(returnRoute))
  }

  // ─────────────────────────────────────────────────────────────────────
  console.log('\nD) A MISSING intent cookie authorizes nothing from charge_id / plan_handle')
  {
    setPublicPartnerEnv()
    // No cookie AND no signature — the bare Shopify query proves nothing.
    const admin = freshAdmin()
    const unsigned = { charge_id: '31904039069', plan_handle: 'advanced', shop: SHOP }
    const r = await processShopifyBillingReturn(admin as unknown as Admin, { nonce: undefined, suppliedShopRaw: SHOP, callbackParams: unsigned }, partnerStub({ owningAppId: PUBLIC_APP_ID }))
    check('D1: an UNSIGNED callback naming a real plan grants nothing', r.outcome === 'billing_intent_missing')
    check('D2: and writes NOTHING to the billing cache',
      cacheOf(admin).shopify_subscription_status === null && cacheOf(admin).shopify_plan_handle === null)

    // A forged signature.
    const admin2 = freshAdmin()
    const forged = { ...signedCallback(PUBLIC_SECRET), hmac: 'f'.repeat(64) }
    const r2 = await processShopifyBillingReturn(admin2 as unknown as Admin, { nonce: undefined, suppliedShopRaw: SHOP, callbackParams: forged }, partnerStub({ owningAppId: PUBLIC_APP_ID }))
    check('D3: a FORGED signature grants nothing', r2.outcome === 'billing_intent_missing')
    check('D4: and writes nothing', cacheOf(admin2).shopify_subscription_status === null)

    // Signed by the WRONG app for this connection.
    const admin3 = freshAdmin({ oauth_app_edition: 'public' })
    const r3 = await processShopifyBillingReturn(admin3 as unknown as Admin, { nonce: undefined, suppliedShopRaw: SHOP, callbackParams: signedCallback(LEGACY_SECRET) }, partnerStub({ owningAppId: PUBLIC_APP_ID }))
    check('D5: a signature from the OTHER app cannot speak for this connection', r3.outcome === 'shop_mismatch')
    check('D6: and writes nothing', cacheOf(admin3).shopify_subscription_status === null)

    // Signed correctly, but for a shop that is not connected.
    const admin4 = freshAdmin()
    const r4 = await processShopifyBillingReturn(admin4 as unknown as Admin, { nonce: undefined, suppliedShopRaw: null, callbackParams: signedCallback(PUBLIC_SECRET, { shop: OTHER_SHOP }) }, partnerStub({ owningAppId: PUBLIC_APP_ID }))
    check('D7: a CROSS-SHOP signed callback finds no connection and mutates nothing',
      r4.outcome === 'connection_not_found' && cacheOf(admin4).shopify_subscription_status === null)
    check('D8: SOURCE — the signature is verified against a real app secret, per edition',
      /verifyShopifyHmac\(callbackParams, config\.clientSecret\)/.test(strip(read('lib/shopify/billing-return-processing.ts'))))
    check('D9: the HMAC canonicalization itself is untouched (cbd889f remains unmerged)',
      /\.map\(\(k\) => `\$\{k\}=\$\{params\[k\]\}`\)/.test(strip(read('lib/shopify/oauth.ts'))))
    check('D10: sanity — the stub’s signatures are what verifyShopifyHmac actually accepts',
      verifyShopifyHmac(signedCallback(PUBLIC_SECRET), PUBLIC_SECRET)
      && !verifyShopifyHmac(signedCallback(PUBLIC_SECRET), LEGACY_SECRET))
  }

  // ─────────────────────────────────────────────────────────────────────
  console.log('\nE) A VERIFIED Shopify identity may trigger live reconciliation — and only that')
  {
    setPublicPartnerEnv()
    const admin = freshAdmin()
    const r = await processShopifyBillingReturn(admin as unknown as Admin, { nonce: undefined, suppliedShopRaw: SHOP, callbackParams: signedCallback(PUBLIC_SECRET) }, partnerStub({ owningAppId: PUBLIC_APP_ID }))
    check('E1: a Shopify-signed return with no cookie RECOVERS the merchant', r.outcome === 'reconciled_without_intent', r.outcome)
    check('E2: the cache records the handle advanced and an active status',
      cacheOf(admin).shopify_plan_handle === 'advanced' && cacheOf(admin).shopify_subscription_status === 'active')
    check('E3: with the trial and period Shopify itself reported',
      cacheOf(admin).shopify_trial_ends_at === '2026-09-09T00:00:00Z' && cacheOf(admin).shopify_current_period_end === '2026-10-02T00:00:00Z')
    check('E4: and it returns the merchant to the EMBEDDED app', r.embedded === true && r.shopDomain === SHOP)
    check('E5: NO intent was consumed — there was none', intentsOf(admin).length === 0)
    check('E6: no PayPal migration was advanced on this path',
      (admin.tables.shopify_billing_migrations as unknown[]).length === 0)

    // REPLAY — idempotent.
    const before = JSON.stringify(cacheOf(admin))
    const r2 = await processShopifyBillingReturn(admin as unknown as Admin, { nonce: undefined, suppliedShopRaw: SHOP, callbackParams: signedCallback(PUBLIC_SECRET) }, partnerStub({ owningAppId: PUBLIC_APP_ID }))
    check('E7: REPLAY is idempotent — same outcome', r2.outcome === 'reconciled_without_intent')
    // The two timestamps recordShopifyBillingCache legitimately refreshes on
    // every write are neutralized; every entitlement-bearing field must match.
    const stable = (row: Record<string, unknown>) => JSON.stringify({ ...row, shopify_billing_verified_at: 0, updated_at: 0 })
    check('E8: and every entitlement field is unchanged (only the write timestamps move)',
      stable(JSON.parse(before)) === stable(cacheOf(admin)))
    check('E9: still no migration transition and no second charge',
      (admin.tables.shopify_billing_migrations as unknown[]).length === 0)

    // Verified identity, but Shopify says there is no plan.
    const admin3 = freshAdmin()
    const r3 = await processShopifyBillingReturn(admin3 as unknown as Admin, { nonce: undefined, suppliedShopRaw: SHOP, callbackParams: signedCallback(PUBLIC_SECRET) }, partnerStub({ owningAppId: 'nobody' }))
    check('E10: a verified identity does NOT grant a plan Shopify does not confirm',
      r3.outcome === 'no_active_plan' && cacheOf(admin3).shopify_subscription_status === 'none')
    check('E11: and the failure NAMES the app that was asked, so it is diagnosable',
      String(cacheOf(admin3).shopify_billing_last_error).includes(`app=${PUBLIC_APP_ID}`))
  }

  // ─────────────────────────────────────────────────────────────────────
  console.log('\nF) Billing governance and the intent path are unchanged')
  {
    setPublicPartnerEnv()
    // Replay of a CONSUMED intent is still an idempotent no-op.
    const admin = freshAdmin()
    const nonce = await mintIntent(admin, true)
    await consumeBillingIntent(admin as never, hashBillingIntentNonce(nonce))
    const r = await processShopifyBillingReturn(admin as unknown as Admin, { nonce, suppliedShopRaw: SHOP }, partnerStub({ owningAppId: PUBLIC_APP_ID }))
    check('F1: a replayed intent stays an idempotent no-op', r.outcome === 'billing_intent_already_processed')
    check('F2: with no cache mutation', cacheOf(admin).shopify_subscription_status === null)
    check('F3: and it still knows it was embedded, so the merchant is still returned to the app',
      r.embedded === true && r.shopDomain === SHOP)

    check('F4: entitlement is never derived from a URL parameter — the handle comes from Shopify’s own response',
      /planHandle: recognized/.test(partnerSrc) && !/plan_handle/.test(returnRoute))
    check('F5: only SHOPIFY_SUPPORTED_PLAN_HANDLES are ever granted',
      /const recognized = handles\.find\(isSupportedShopifyPlanHandle\)/.test(partnerSrc))
    check('F6: an unrecognized handle is still refused, never upgraded to an entitlement',
      /return \{ ok: true, active: false, reason: 'unrecognized_plan_handle'/.test(partnerSrc))
    check('F7: website-billed accounts are untouched — app-home still gates on billing authority',
      /const shopifyBills = !billingStateUnavailable/.test(appHome)
      && /authority\.authority === 'shopify'/.test(appHome))
    check('F8: start-intent still refuses to mint for a non-Shopify authority',
      /'shopify_billing_not_applicable'/.test(startIntent))
    check('F9: admin accounts still bypass Shopify billing entirely',
      /'admin_not_applicable'/.test(startIntent) && /if \(isAdmin\) \{/.test(appHome))
    check('F10: the PayPal migration still advances ONLY on the intent-authorized path',
      /confirmShopifyActiveAndAdvance\(/.test(strip(read('lib/shopify/billing-return-processing.ts'))))
  }

  // ─────────────────────────────────────────────────────────────────────
  console.log('\nG) The first-party handoff from PR #46 is intact')
  {
    check('G1: embedded start-intent still sets no cookie and returns a signed handoff',
      /handoff: signBillingIntentHandoff\(nonce, config\.clientSecret\)/.test(startIntent)
      && !/redirectUrl/.test(startIntent))
    check('G2: resume is still POST-only', /export async function POST\(/.test(resumeSrc) && !/export async function GET\(/.test(resumeSrc))
    check('G3: and still establishes the scoped intent cookie first-party',
      /res\.cookies\.set\(BILLING_INTENT_COOKIE, nonce, \{/.test(resumeSrc)
      && /path: BILLING_INTENT_COOKIE_PATH/.test(resumeSrc))
    check('G4: the intent cookie was NOT weakened to SameSite=None anywhere',
      !/sameSite: 'none'/i.test(resumeSrc) && !/sameSite: 'none'/i.test(startIntent) && !/SameSite=None/i.test(returnRoute))
    check('G5: nothing sensitive is logged by the return route',
      [...returnRoute.matchAll(/console\.\w+\([^\n]*/g)].every((m) => !/hmac|charge_id|nonce|cookie|clientSecret|Bearer/i.test(m[0])))
    check('G6: the Partner token never leaves the request header',
      !/console\.\w+\([^\n]*accessToken/.test(partnerSrc))
  }

  console.log(`\n${pass} passed, ${fail} failed`)
  if (fail > 0) process.exitCode = 1
}

main()
