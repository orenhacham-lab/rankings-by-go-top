/**
 * Shopify billing reconciliation — SEP 2 PRODUCTION INCIDENT QA.
 *
 * What happened, end to end, through the app's own Choose-a-plan entry point on
 * go-top-seo-test.myshopify.com:
 *
 *   1-3. The merchant chose Advanced; Shopify approved and ACTIVATED it.
 *   4.   Shopify returned to /api/shopify/billing/return?plan_handle=advanced&charge_id=…
 *   5.   The return rendered the external Rankings Hebrew LOGIN page inside
 *        Shopify Admin.
 *   6-7. Logging in there never completed.
 *   8.   Reopening the embedded app still showed "No active plan".
 *   9.   Shopify's plan picker showed Advanced as Current, 7 trial days left.
 *
 * ROOT CAUSE, proven by a live Partner API query in organization 4243054 for
 * app gid://shopify/App/397648429057 and shop gid://shopify/Shop/77989445789:
 *
 *   activeSubscription: {
 *     shop: { …, myshopifyDomain: "go-top-seo-test.myshopify.com" },
 *     trialEndsAt: "2026-09-08T23:28:48Z",
 *     currentBillingCycle: null,
 *     items: [{ handle: "advanced", price: { active: false } }]
 *   }
 *
 * A real, current contract — with `price.active: false`, because the merchant
 * is still inside the free trial. partner-client.ts filtered items on
 * `price.active !== false`, so the only supported item was discarded, no handle
 * survived, and a trialing merchant was cached as having no plan.
 *
 * The Partner organization and app were CORRECT. `oauth_app_edition` was not
 * involved in this incident, and nothing here selects the Partner billing app
 * by edition.
 *
 * TWO SEPARATE, ALSO-CONFIRMED DEFECTS on the return leg:
 *
 *   B. The return redirected every caller to the website dashboard. Inside the
 *      Admin iframe that has no Supabase session (its cookie is SameSite=Lax
 *      and is not sent third-party), so the merchant got the website login
 *      page, framed — steps 5-7 exactly.
 *   C. Shopify frames the return, so the SameSite=Lax intent cookie never
 *      arrives. Production shows several select_plan intents with consumed_at
 *      still NULL. Without a recovery path the round-trip could not complete.
 *
 * SCOPE NOTE: sections marked SOURCE assert what the code does, not what a
 * browser or Shopify's servers do. They do not prove Chrome's cookie handling
 * in an iframe.
 *
 * Run: npx tsx lib/shopify/__qa__/billing-reconciliation-incident.qa.ts
 */
import { readFileSync } from 'fs'
import { join } from 'path'
import type { createAdminClient } from '@/lib/supabase/admin'
import { FakeAdmin } from '../../__qa__/_fake-admin'
import { processShopifyBillingReturn } from '../billing-return-processing'
import { getActiveShopifySubscription, describeInactiveSubscription } from '../partner-client'
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
const PUBLIC_SECRET = 'test-public-secret'
const LEGACY_SECRET = 'test-legacy-secret'
/** Verbatim from the live Partner API response for the incident. */
const TRIAL_ENDS_AT = '2026-09-08T23:28:48Z'

process.env.SHOPIFY_APP_URL = 'https://www.example-test.com'
process.env.SHOPIFY_APP_HANDLE = 'go-top-seo-test'
process.env.SHOPIFY_PUBLIC_CLIENT_ID = 'public-client-id'
process.env.SHOPIFY_PUBLIC_CLIENT_SECRET = PUBLIC_SECRET
process.env.SHOPIFY_CLIENT_ID = 'legacy-client-id'
process.env.SHOPIFY_CLIENT_SECRET = LEGACY_SECRET
process.env.SHOPIFY_PARTNER_API_VERSION = '2026-07'
// The SINGLE, live-verified Partner API configuration. There is no per-edition
// variant: the live query proved this organization and app are correct.
process.env.SHOPIFY_PARTNER_API_ACCESS_TOKEN = 'partner-token'
process.env.SHOPIFY_PARTNER_ORGANIZATION_ID = '4243054'
process.env.SHOPIFY_PARTNER_APP_GID = 'gid://shopify/App/397648429057'

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
 * The EXACT activeSubscription body the live Partner API returned for this
 * incident: a real contract, in trial, with an inactive price line and no
 * billing cycle.
 */
const TRIAL_SUBSCRIPTION = {
  shop: { id: SHOP_GID, myshopifyDomain: SHOP },
  trialEndsAt: TRIAL_ENDS_AT,
  cancelAtEndOfCycle: false,
  currentBillingCycle: null,
  items: [{ handle: 'advanced', price: { __typename: 'FlatRatePrice', active: false } }],
}

/** A stubbed Partner API returning whatever `activeSubscription` shape a test needs. */
function partnerStub(subscription: unknown, onCall?: () => void): typeof fetch {
  return (async () => {
    onCall?.()
    return new Response(JSON.stringify({ data: { activeSubscription: subscription } }),
      { status: 200, headers: { 'content-type': 'application/json' } })
  }) as unknown as typeof fetch
}
const trialPartner = (onCall?: () => void) => partnerStub(TRIAL_SUBSCRIPTION, onCall)

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
  const processingSrc = strip(read('lib/shopify/billing-return-processing.ts'))

  // ─────────────────────────────────────────────────────────────────────
  console.log('A) ROOT CAUSE — a TRIALING managed-pricing subscription was classified as no plan')
  {
    // The exact live response, replayed verbatim.
    const r = await getActiveShopifySubscription(SHOP_GID, trialPartner(), SHOP)
    check('A1: FIXED — the trialing Advanced contract is recognized as active',
      r.ok === true && r.active === true, JSON.stringify(r))
    check('A2: with the supported handle taken from items[].handle',
      r.ok === true && r.active === true && r.planHandle === 'advanced')
    check('A3: trialEndsAt is preserved exactly as Shopify reported it',
      r.ok === true && r.active === true && r.trialEndsAt === TRIAL_ENDS_AT)
    check('A4: a null currentBillingCycle leaves currentPeriodStart null — not a rejection',
      r.ok === true && r.active === true && r.currentPeriodStart === null)
    check('A5: and currentPeriodEnd null',
      r.ok === true && r.active === true && r.currentPeriodEnd === null)
    check('A6: cancelAtEndOfCycle is carried through',
      r.ok === true && r.active === true && r.cancelAtEndOfCycle === false)

    check('A7: SOURCE — the price.active filter that caused this is GONE',
      !/\.filter\(\(i\) => i\?\.price\?\.active !== false\)/.test(partnerSrc)
      && !/price\?\.active/.test(partnerSrc))
    check('A8: SOURCE — the plan is identified from item handles alone',
      /const handles = items\s*\n\s*\.map\(\(i\) => i\?\.handle\)/.test(partnerSrc))
    check('A9: SOURCE — a billing cycle is never required',
      /currentPeriodEnd: sub\.currentBillingCycle\?\.endTime \?\? null/.test(partnerSrc))

    // FAIL-CLOSED GATES, all unchanged.
    const rNull = await getActiveShopifySubscription(SHOP_GID, partnerStub(null), SHOP)
    check('A10: PRESERVED — a null activeSubscription is still no_subscription',
      rNull.ok === true && rNull.active === false && rNull.reason === 'no_subscription')
    const rBad = await getActiveShopifySubscription(SHOP_GID, partnerStub({ ...TRIAL_SUBSCRIPTION, items: [{ handle: 'free-plan', price: { active: true } }] }), SHOP)
    check('A11: PRESERVED — an unsupported handle is still unrecognized_plan_handle',
      rBad.ok === true && rBad.active === false && rBad.reason === 'unrecognized_plan_handle')
    check('A12: and it reports the handle Shopify actually sent',
      rBad.ok === true && rBad.active === false && JSON.stringify(rBad.rawHandles) === JSON.stringify(['free-plan']))
    const rGid = await getActiveShopifySubscription(SHOP_GID, partnerStub({ ...TRIAL_SUBSCRIPTION, shop: { id: 'gid://shopify/Shop/999', myshopifyDomain: SHOP } }), SHOP)
    check('A13: PRESERVED — a shop GID mismatch still fails closed',
      rGid.ok === false && rGid.reason === 'shop_identity_mismatch')
    const rDom = await getActiveShopifySubscription(SHOP_GID, partnerStub({ ...TRIAL_SUBSCRIPTION, shop: { id: SHOP_GID, myshopifyDomain: OTHER_SHOP } }), SHOP)
    check('A14: PRESERVED — a shop DOMAIN mismatch still fails closed',
      rDom.ok === false && rDom.reason === 'shop_identity_mismatch')
    const rMal = await getActiveShopifySubscription(SHOP_GID, (async () => new Response('not json', { status: 200 })) as unknown as typeof fetch, SHOP)
    check('A15: PRESERVED — a malformed response still fails closed',
      rMal.ok === false && rMal.reason === 'malformed_response')

    check('A16: NOT the cause — nothing selects the Partner billing app by oauth_app_edition',
      !/oauth_app_edition/.test(partnerSrc)
      && !/getActiveShopifySubscription\([^)]*oauth_app_edition/.test(appHome))
    check('A17: the single live-verified Partner configuration is the only one read',
      /SHOPIFY_PARTNER_ORGANIZATION_ID\?/.test(partnerSrc)
      && !/_PUBLIC/.test(partnerSrc) && !/SHOPIFY_PARTNER_APP_GID_PUBLIC/.test(read('.env.local.example')))
  }

  // ─────────────────────────────────────────────────────────────────────
  console.log('\nB) app-home ALONE recovers the existing Advanced trial on the next load')
  {
    let calls = 0
    const r = await getActiveShopifySubscription(SHOP_GID, trialPartner(() => { calls++ }), SHOP)
    check('B1: the live check finds the ACTIVE trial with no intent and no cookie',
      r.ok === true && r.active === true && r.planHandle === 'advanced')
    check('B2: SOURCE — app-home runs that check on EVERY load under Shopify authority',
      /const result = await getActiveShopifySubscription\(connection\.shop_gid, fetch, shopDomain\)/.test(appHome))
    check('B3: SOURCE — and writes the verified answer straight to the cache',
      /shopify_plan_handle: result\.planHandle, shopify_subscription_status: 'active'/.test(appHome))
    check('B4: SOURCE — including the trial end date Shopify reported',
      /shopify_trial_ends_at: result\.trialEndsAt/.test(appHome))
    check('B5: NO charge can be created — the client has no mutation capability at all',
      !/appSubscriptionCreate|appPurchaseOneTime|subscriptionCreate/.test(partnerSrc))
    check('B6: recovery needs no merchant action — nothing asks for a plan re-selection',
      !/selectPlan|choose_again|reselect/.test(appHome))
    check('B7: exactly one Partner query per load', calls === 1)
  }

  // ─────────────────────────────────────────────────────────────────────
  console.log('\nC) DIAGNOSTIC EVIDENCE is preserved instead of erased')
  {
    check('C1: SOURCE — app-home no longer writes null on every inactive result',
      /shopify_billing_last_error: describeInactiveSubscription\(result\.reason, result\.rawHandles\)/.test(appHome))
    check('C2: a genuine no-subscription records exactly "no_subscription"',
      describeInactiveSubscription('no_subscription') === 'no_subscription')
    check('C3: an unrecognized handle records the sanitized handles',
      describeInactiveSubscription('unrecognized_plan_handle', ['free-plan']) === 'unrecognized_plan_handle:free-plan')
    check('C4: handles are stripped to a conservative character set',
      describeInactiveSubscription('unrecognized_plan_handle', ['a b;drop"<x>']) === 'unrecognized_plan_handle:abdropx')
    check('C5: capped in count', (describeInactiveSubscription('unrecognized_plan_handle', ['a', 'b', 'c', 'd', 'e', 'f', 'g']).match(/,/g) ?? []).length === 4)
    check('C6: capped in length — one handle can contribute at most 40 characters',
      describeInactiveSubscription('unrecognized_plan_handle', ['x'.repeat(500)])
      === `unrecognized_plan_handle:${'x'.repeat(40)}`)
    check('C7: empty/garbage handles degrade to the bare code, never to an empty suffix',
      describeInactiveSubscription('unrecognized_plan_handle', ['', '   ']) === 'unrecognized_plan_handle')
    check('C8: a RECOGNIZED trial clears the error column instead of annotating it',
      /shopify_cancel_at_end_of_cycle: result\.cancelAtEndOfCycle,\s*\n?\s*shopify_billing_last_error: null/.test(appHome))
    // The column can only ever hold one of two shapes. Anything free-form —
    // a token, an HMAC, an address, a raw callback — cannot survive the
    // character strip and the caps, so this whole-string pattern is the
    // guarantee, not a keyword blocklist.
    const NOTE_SHAPE = /^(no_subscription|unrecognized_plan_handle(:[A-Za-z0-9._-]{1,40}(,[A-Za-z0-9._-]{1,40}){0,4})?)$/
    const adversarial = [
      ['no_subscription', undefined],
      ['unrecognized_plan_handle', ['advanced']],
      ['unrecognized_plan_handle', ['shpat_deadbeef deadbeef', 'a@b.example', '<script>alert(1)</script>']],
      ['unrecognized_plan_handle', ['x'.repeat(500), 'y'.repeat(500), 'z', 'w', 'v', 'u', 't']],
      ['unrecognized_plan_handle', []],
    ] as const
    check('C9: every note — including adversarial handles — matches the closed sanitized shape',
      adversarial.every(([reason, handles]) => NOTE_SHAPE.test(describeInactiveSubscription(reason, handles as string[] | undefined))))
    check('C10: and a token-shaped handle is reduced to inert characters',
      describeInactiveSubscription('unrecognized_plan_handle', ['shpat_deadbeef deadbeef']) === 'unrecognized_plan_handle:shpat_deadbeefdeadbeef')
  }

  // ─────────────────────────────────────────────────────────────────────
  console.log('\nD) An EMBEDDED billing return never lands on the external login page')
  {
    check('D1: the origin is stamped SERVER-SIDE from which caller minted the intent',
      /intendedAction: isApiCall \? BILLING_INTENT_ACTION_EMBEDDED : BILLING_INTENT_ACTION_WEBSITE/.test(startIntent))
    check('D2: never from request input', !/intendedAction:\s*(body|json|params|searchParams)/.test(startIntent))
    check('D3: an unmarked/legacy row reads as the WEBSITE flow, which is what it was',
      !isEmbeddedBillingIntent('select_plan') && !isEmbeddedBillingIntent(null) && isEmbeddedBillingIntent('select_plan_embedded'))

    const admin = freshAdmin()
    const nonce = await mintIntent(admin, true)
    const res = await processShopifyBillingReturn(admin as unknown as Admin, { nonce, suppliedShopRaw: SHOP }, trialPartner())
    check('D4: an embedded round-trip succeeds on the trial subscription', res.outcome === 'success', res.outcome)
    check('D5: and reports itself embedded, with the connection’s own shop domain',
      res.embedded === true && res.shopDomain === SHOP)
    const dest = buildShopifyAdminAppUrl(res.shopDomain!)
    check('D6: which routes to the Shopify APP inside Admin, not to /projects',
      dest.ok && dest.url === 'https://admin.shopify.com/store/go-top-seo-test/apps/go-top-seo-test')
    check('D7: SOURCE — the route sends embedded returns there',
      /if \(result\.embedded && result\.shopDomain\)/.test(returnRoute)
      && /buildShopifyAdminAppUrl\(result\.shopDomain\)/.test(returnRoute))
    check('D8: via a TOP-LEVEL navigation, because admin.shopify.com refuses to be framed',
      /window\.top\.location\.href=\$\{jsUrl\}/.test(returnRoute) && /target="_top"/.test(returnRoute))
    check('D9: the destination is server-built, never a URL from the browser',
      !/searchParams\.get\('return|redirect_uri|returnUrl/.test(returnRoute))

    const admin2 = freshAdmin()
    const nonce2 = await mintIntent(admin2, false)
    const res2 = await processShopifyBillingReturn(admin2 as unknown as Admin, { nonce: nonce2, suppliedShopRaw: SHOP }, trialPartner())
    check('D10: a WEBSITE-origin return still succeeds and is NOT marked embedded',
      res2.outcome === 'success' && res2.embedded === false)
    check('D11: so the website flow still routes to the website project page',
      /const destination = result\.projectId\s*\n?\s*\? projectReturnUrl\(appUrl, result\.projectId, q\)/.test(returnRoute))
    check('D12: and the website cache write records the trial correctly',
      cacheOf(admin2).shopify_plan_handle === 'advanced'
      && cacheOf(admin2).shopify_subscription_status === 'active'
      && cacheOf(admin2).shopify_trial_ends_at === TRIAL_ENDS_AT)
  }

  // ─────────────────────────────────────────────────────────────────────
  console.log('\nE) A MISSING intent cookie authorizes nothing from charge_id / plan_handle')
  {
    const admin = freshAdmin()
    const unsigned = { charge_id: '31904039069', plan_handle: 'advanced', shop: SHOP }
    const r = await processShopifyBillingReturn(admin as unknown as Admin, { nonce: undefined, suppliedShopRaw: SHOP, callbackParams: unsigned }, trialPartner())
    check('E1: an UNSIGNED callback naming a real plan grants nothing', r.outcome === 'billing_intent_missing')
    check('E2: and writes NOTHING to the billing cache',
      cacheOf(admin).shopify_subscription_status === null && cacheOf(admin).shopify_plan_handle === null)

    const admin2 = freshAdmin()
    const forged = { ...signedCallback(PUBLIC_SECRET), hmac: 'f'.repeat(64) }
    const r2 = await processShopifyBillingReturn(admin2 as unknown as Admin, { nonce: undefined, suppliedShopRaw: SHOP, callbackParams: forged }, trialPartner())
    check('E3: a FORGED signature grants nothing', r2.outcome === 'billing_intent_missing')
    check('E4: and writes nothing', cacheOf(admin2).shopify_subscription_status === null)

    const admin3 = freshAdmin({ oauth_app_edition: 'public' })
    const r3 = await processShopifyBillingReturn(admin3 as unknown as Admin, { nonce: undefined, suppliedShopRaw: SHOP, callbackParams: signedCallback(LEGACY_SECRET) }, trialPartner())
    check('E5: a signature from the OTHER app cannot speak for this connection', r3.outcome === 'shop_mismatch')
    check('E6: and writes nothing', cacheOf(admin3).shopify_subscription_status === null)

    const admin4 = freshAdmin()
    const r4 = await processShopifyBillingReturn(admin4 as unknown as Admin, { nonce: undefined, suppliedShopRaw: null, callbackParams: signedCallback(PUBLIC_SECRET, { shop: OTHER_SHOP }) }, trialPartner())
    check('E7: a CROSS-SHOP signed callback finds no connection and mutates nothing',
      r4.outcome === 'connection_not_found' && cacheOf(admin4).shopify_subscription_status === null)

    const admin5 = freshAdmin()
    const r5 = await processShopifyBillingReturn(admin5 as unknown as Admin, { nonce: undefined, suppliedShopRaw: SHOP, callbackParams: signedCallback(PUBLIC_SECRET) }, partnerStub(null))
    check('E8: a NULL activeSubscription cannot grant entitlement even when signed',
      r5.outcome === 'no_active_plan' && cacheOf(admin5).shopify_subscription_status === 'none')
    check('E9: and the reason is now recorded rather than erased',
      cacheOf(admin5).shopify_billing_last_error === 'no_subscription')

    check('E10: SOURCE — oauth_app_edition is used ONLY to pick the callback-verifying secret',
      /\(connection\.oauth_app_edition \?\? 'legacy'\) !== signedBy/.test(processingSrc)
      && !/getActiveShopifySubscription\([^)]*oauth_app_edition/.test(processingSrc))
    check('E11: the HMAC canonicalization itself is untouched (cbd889f remains unmerged)',
      /\.map\(\(k\) => `\$\{k\}=\$\{params\[k\]\}`\)/.test(strip(read('lib/shopify/oauth.ts'))))
    check('E12: sanity — the stub’s signatures are what verifyShopifyHmac accepts',
      verifyShopifyHmac(signedCallback(PUBLIC_SECRET), PUBLIC_SECRET)
      && !verifyShopifyHmac(signedCallback(PUBLIC_SECRET), LEGACY_SECRET))
  }

  // ─────────────────────────────────────────────────────────────────────
  console.log('\nF) THE FULL INCIDENT, replayed end to end')
  {
    // 1) The embedded merchant starts the flow.
    const admin = freshAdmin()
    const nonce = await mintIntent(admin, true)
    check('F1: an embedded select-plan intent is created and bound to the connection',
      intentsOf(admin).length === 1 && intentsOf(admin)[0].connection_id === CONN
      && intentsOf(admin)[0].intended_action === BILLING_INTENT_ACTION_EMBEDDED)

    // 2) Shopify frames the return, so the Lax cookie never arrives — exactly
    //    what production shows (intents present, consumed_at still NULL).
    let partnerCalls = 0
    const res = await processShopifyBillingReturn(
      admin as unknown as Admin,
      { nonce: undefined, suppliedShopRaw: SHOP, callbackParams: signedCallback(PUBLIC_SECRET) },
      trialPartner(() => { partnerCalls++ }),
    )
    check('F2: the signed callback recovers the merchant without the cookie',
      res.outcome === 'reconciled_without_intent', res.outcome)
    check('F3: a fresh Partner query was what confirmed it', partnerCalls === 1)
    check('F4: the cache stores Advanced / active',
      cacheOf(admin).shopify_plan_handle === 'advanced' && cacheOf(admin).shopify_subscription_status === 'active')
    check('F5: with the trial end date from Shopify', cacheOf(admin).shopify_trial_ends_at === TRIAL_ENDS_AT)
    check('F6: and NULL period boundaries, because Shopify returned no billing cycle',
      cacheOf(admin).shopify_current_period_end === null)
    check('F7: shopify_billing_last_error is cleared on success', cacheOf(admin).shopify_billing_last_error === null)
    check('F8: the merchant is returned to the EMBEDDED Shopify app, not the website login',
      res.embedded === true && res.shopDomain === SHOP)
    check('F9: the merchant’s own untouched intent was NOT consumed by the fallback',
      intentsOf(admin).length === 1
      && intentsOf(admin)[0].nonce_hash === hashBillingIntentNonce(nonce)
      && intentsOf(admin)[0].consumed_at == null)
    check('F10: no PayPal migration was created or advanced',
      (admin.tables.shopify_billing_migrations as unknown[]).length === 0)

    // 3) Replay.
    const before = JSON.stringify(cacheOf(admin))
    const replay = await processShopifyBillingReturn(
      admin as unknown as Admin,
      { nonce: undefined, suppliedShopRaw: SHOP, callbackParams: signedCallback(PUBLIC_SECRET) },
      trialPartner(),
    )
    const stable = (row: Record<string, unknown>) => JSON.stringify({ ...row, shopify_billing_verified_at: 0, updated_at: 0 })
    check('F11: REPLAY is idempotent — same outcome', replay.outcome === 'reconciled_without_intent')
    check('F12: every entitlement field is unchanged', stable(JSON.parse(before)) === stable(cacheOf(admin)))
    check('F13: still no migration transition and no second charge',
      (admin.tables.shopify_billing_migrations as unknown[]).length === 0)

    // 4) And app-home alone would have recovered it too.
    const r = await getActiveShopifySubscription(SHOP_GID, trialPartner(), SHOP)
    check('F14: app-home’s own live check independently recovers Advanced',
      r.ok === true && r.active === true && r.planHandle === 'advanced')
  }

  // ─────────────────────────────────────────────────────────────────────
  console.log('\nG) Governance, the intent path and the PR #46 handoff are unchanged')
  {
    const admin = freshAdmin()
    const nonce = await mintIntent(admin, true)
    await consumeBillingIntent(admin as never, hashBillingIntentNonce(nonce))
    const r = await processShopifyBillingReturn(admin as unknown as Admin, { nonce, suppliedShopRaw: SHOP }, trialPartner())
    check('G1: a replayed intent stays an idempotent no-op', r.outcome === 'billing_intent_already_processed')
    check('G2: with no cache mutation', cacheOf(admin).shopify_subscription_status === null)
    check('G3: and it still knows it was embedded', r.embedded === true && r.shopDomain === SHOP)

    check('G4: entitlement never comes from a URL parameter',
      /planHandle: recognized/.test(partnerSrc) && !/plan_handle/.test(returnRoute))
    check('G5: only SHOPIFY_SUPPORTED_PLAN_HANDLES are ever granted',
      /const recognized = handles\.find\(isSupportedShopifyPlanHandle\)/.test(partnerSrc))
    check('G6: website-billed accounts are untouched — app-home still gates on authority',
      /const shopifyBills = !billingStateUnavailable/.test(appHome) && /authority\.authority === 'shopify'/.test(appHome))
    check('G7: start-intent still refuses to mint for a non-Shopify authority',
      /'shopify_billing_not_applicable'/.test(startIntent))
    check('G8: admin accounts still bypass Shopify billing entirely',
      /'admin_not_applicable'/.test(startIntent) && /if \(isAdmin\) \{/.test(appHome))
    check('G9: the PayPal migration still advances ONLY on the intent-authorized path',
      /confirmShopifyActiveAndAdvance\(/.test(processingSrc)
      && processingSrc.indexOf('confirmShopifyActiveAndAdvance(') > processingSrc.indexOf('export async function processShopifyBillingReturn('))
    check('G10: embedded start-intent still returns a signed handoff and no redirect URL',
      /handoff: signBillingIntentHandoff\(nonce, config\.clientSecret\)/.test(startIntent) && !/redirectUrl/.test(startIntent))
    check('G11: resume is still POST-only and sets the scoped cookie first-party',
      /export async function POST\(/.test(resumeSrc) && !/export async function GET\(/.test(resumeSrc)
      && /path: BILLING_INTENT_COOKIE_PATH/.test(resumeSrc))
    check('G12: the intent cookie was NOT weakened to SameSite=None anywhere',
      !/sameSite: 'none'/i.test(resumeSrc) && !/sameSite: 'none'/i.test(startIntent) && !/SameSite=None/i.test(returnRoute))
    check('G13: nothing sensitive is logged by the return route',
      [...returnRoute.matchAll(/console\.\w+\([^\n]*/g)].every((m) => !/hmac|charge_id|nonce|cookie|clientSecret|Bearer/i.test(m[0])))
  }

  console.log(`\n${pass} passed, ${fail} failed`)
  if (fail > 0) process.exitCode = 1
}

main()
