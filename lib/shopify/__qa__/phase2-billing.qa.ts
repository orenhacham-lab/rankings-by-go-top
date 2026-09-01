/**
 * Phase 2 (Shopify App Pricing) — behavioral QA for the Partner API client,
 * session-token verification, pricing-URL builder, the central publish
 * entitlement guard, and the PayPal→Shopify migration state machine.
 *
 * Every network-facing function under test accepts an injectable `fetchImpl`
 * — no live Partner API calls, no live PayPal calls, no live Supabase (uses
 * FakeAdmin). Run:
 *   npx tsx lib/shopify/__qa__/phase2-billing.qa.ts
 */
import crypto from 'crypto'
import type { createAdminClient } from '@/lib/supabase/admin'
import { FakeAdmin } from '../../__qa__/_fake-admin'
import { getActiveShopifySubscription } from '../partner-client'
import { verifyShopifySessionToken } from '../session-token'
import { shopHandleFromMyshopifyDomain, buildShopifyPricingUrl } from '../billing-urls'
import { checkShopifyPublishEntitlement } from '../billing-guard'
import { hasActiveShopifyConnection } from '../paypal-block'
import { initiateMigrationIfPayPalSubscriber, confirmShopifyActiveAndAdvance, getActiveMigration } from '../paypal-migration'
import type { ShopifyConnectionRow } from '../api-auth'

type Admin = ReturnType<typeof createAdminClient>

let pass = 0, fail = 0
function check(name: string, cond: boolean, detail?: string) {
  if (cond) { pass++; console.log(`  ✓ ${name}`) } else { fail++; console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`) }
}

process.env.SHOPIFY_CLIENT_ID = 'test-client-id'
process.env.SHOPIFY_CLIENT_SECRET = 'test-client-secret'
process.env.SHOPIFY_APP_URL = 'https://www.example-test.com'
process.env.SHOPIFY_APP_HANDLE = 'go-top-seo-test'
process.env.SHOPIFY_PARTNER_API_ACCESS_TOKEN = 'test-partner-token'
process.env.SHOPIFY_PARTNER_ORGANIZATION_ID = '4243054'
process.env.SHOPIFY_PARTNER_APP_GID = 'gid://shopify/App/397648429057'
process.env.SHOPIFY_PARTNER_API_VERSION = '2026-07'
process.env.PAYPAL_CLIENT_ID = 'test-paypal-client-id'
process.env.PAYPAL_SECRET = 'test-paypal-secret'

/** Fake Partner API fetch — one endpoint, no token-exchange step. */
function fakePartnerFetch(impl: () => { status: number; body: unknown }): typeof fetch {
  return (async () => {
    const r = impl()
    return { ok: r.status >= 200 && r.status < 300, status: r.status, json: async () => r.body } as Response
  }) as unknown as typeof fetch
}
/** Fake PayPal fetch (token endpoint + one other call) — mirrors lib/paypal/__qa__/paypal-billing.qa.ts's helper. */
function fakePayPalFetch(impl: () => { ok: boolean; status?: number; body: unknown }): typeof fetch {
  return (async (url: string) => {
    if (String(url).includes('/v1/oauth2/token')) {
      return { ok: true, status: 200, json: async () => ({ access_token: 'fake-token' }) } as Response
    }
    const r = impl()
    return { ok: r.ok, status: r.status ?? (r.ok ? 200 : 400), json: async () => r.body } as Response
  }) as unknown as typeof fetch
}
const DEFAULT_SHOP_GID = 'gid://shopify/Shop/1'
const DEFAULT_SHOP_DOMAIN = 'test-shop.myshopify.com'
const activeSubBody = (handle: string, shopId = DEFAULT_SHOP_GID, myshopifyDomain = DEFAULT_SHOP_DOMAIN) => ({
  data: {
    activeSubscription: {
      shop: { id: shopId, myshopifyDomain },
      trialEndsAt: null,
      cancelAtEndOfCycle: false,
      currentBillingCycle: { endTime: '2026-12-01T00:00:00Z' },
      items: [{ handle, price: { __typename: 'FlatRatePrice', active: true } }],
    },
  },
})
const noSubBody = { data: { activeSubscription: null } }

function baseConnection(overrides: Partial<ShopifyConnectionRow> = {}): ShopifyConnectionRow {
  return {
    id: 'conn-1', user_id: 'user-1', project_id: 'project-1', shop_domain: 'test-shop.myshopify.com',
    storefront_domain: null, access_token_encrypted: 'enc',
    refresh_token_encrypted: null, access_token_expires_at: null, refresh_token_expires_at: null,
    oauth_app_edition: null,
    api_version: '2026-07',
    connection_status: 'connected', last_tested_at: null, last_synced_at: null, last_error: null,
    default_blog_id: null, granted_scopes: ['read_products', 'read_content', 'write_content'], auth_method: 'oauth',
    shop_gid: DEFAULT_SHOP_GID, shopify_plan_handle: null, shopify_subscription_status: null,
    shopify_trial_ends_at: null, shopify_current_period_end: null, shopify_current_period_start: null, shopify_cancel_at_end_of_cycle: false,
    shopify_billing_verified_at: null,
    shopify_billing_last_error: null, created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z',
    ...overrides,
  }
}
function b64url(input: string) { return Buffer.from(input, 'utf8').toString('base64url') }
function signToken(payload: Record<string, unknown>, secret = 'test-client-secret', alg = 'HS256') {
  const header = b64url(JSON.stringify({ alg, typ: 'JWT' }))
  const body = b64url(JSON.stringify(payload))
  const sig = crypto.createHmac('sha256', secret).update(`${header}.${body}`).digest('base64url')
  return `${header}.${body}.${sig}`
}
const nowSec = () => Math.floor(Date.now() / 1000)

async function main() {
  console.log('Phase 2 — Shopify App Pricing billing QA\n')

  // ── Partner API client ──
  console.log('1) getActiveShopifySubscription — missing Partner API config fails closed')
  {
    const saved = process.env.SHOPIFY_PARTNER_API_ACCESS_TOKEN
    delete process.env.SHOPIFY_PARTNER_API_ACCESS_TOKEN
    const r = await getActiveShopifySubscription('gid://shopify/Shop/1')
    check('ok:false, reason missing_config (no network attempted)', r.ok === false && r.reason === 'missing_config')
    process.env.SHOPIFY_PARTNER_API_ACCESS_TOKEN = saved
  }

  console.log('\n1b) Blocker C (resolved) — SHOPIFY_PARTNER_APP_GID in the gid://partners/App/... namespace is now REJECTED (fails closed as missing_config); only gid://shopify/App/... is accepted')
  {
    const saved = process.env.SHOPIFY_PARTNER_APP_GID
    process.env.SHOPIFY_PARTNER_APP_GID = 'gid://partners/App/397648429057'
    const r = await getActiveShopifySubscription('gid://shopify/Shop/1')
    check('gid://partners/App/... -> ok:false, reason missing_config (no network attempted)', r.ok === false && r.reason === 'missing_config')
    process.env.SHOPIFY_PARTNER_APP_GID = 'gid://shopify/App/397648429057'
    const f = fakePartnerFetch(() => ({ status: 200, body: noSubBody }))
    const r2 = await getActiveShopifySubscription('gid://shopify/Shop/1', f)
    check('gid://shopify/App/... -> config accepted, live call proceeds', r2.ok === true)
    process.env.SHOPIFY_PARTNER_APP_GID = saved
  }

  console.log('\n2) getActiveShopifySubscription — malformed shopGid fails closed')
  {
    const r = await getActiveShopifySubscription('')
    check('ok:false, reason malformed_response', r.ok === false && r.reason === 'malformed_response')
  }

  console.log('\n3) getActiveShopifySubscription — HTTP 401 fails closed as invalid_token')
  {
    const f = fakePartnerFetch(() => ({ status: 401, body: {} }))
    const r = await getActiveShopifySubscription('gid://shopify/Shop/1', f)
    check('ok:false, reason invalid_token', r.ok === false && r.reason === 'invalid_token')
  }

  console.log('\n4) getActiveShopifySubscription — null activeSubscription → active:false, no_subscription')
  {
    const f = fakePartnerFetch(() => ({ status: 200, body: noSubBody }))
    const r = await getActiveShopifySubscription('gid://shopify/Shop/1', f)
    check('ok:true, active:false, reason no_subscription', r.ok === true && !r.active && r.reason === 'no_subscription')
  }

  console.log('\n5) getActiveShopifySubscription — active contract on an OBSOLETE plan handle (free-plan) is NOT entitlement')
  {
    const f = fakePartnerFetch(() => ({ status: 200, body: activeSubBody('free-plan') }))
    const r = await getActiveShopifySubscription('gid://shopify/Shop/1', f)
    check('ok:true, active:false, reason unrecognized_plan_handle', r.ok === true && !r.active && r.reason === 'unrecognized_plan_handle')
  }

  console.log('\n6) getActiveShopifySubscription — active contract on a supported handle IS entitlement')
  {
    const f = fakePartnerFetch(() => ({ status: 200, body: activeSubBody('advanced') }))
    const r = await getActiveShopifySubscription('gid://shopify/Shop/1', f)
    check('ok:true, active:true, planHandle=advanced', r.ok === true && r.active === true && r.planHandle === 'advanced')
  }

  // ── Session token verification ──
  console.log('\n7) verifyShopifySessionToken — valid token verifies')
  {
    const now = nowSec()
    const token = signToken({ aud: 'test-client-id', iss: 'https://test-shop.myshopify.com/admin', dest: 'https://test-shop.myshopify.com', exp: now + 60, nbf: now - 60, sub: 'staff-1' })
    const r = verifyShopifySessionToken(token)
    check('ok:true, shopDomain resolved from dest', r.ok === true && r.shopDomain === 'test-shop.myshopify.com')
  }
  console.log('\n8) verifyShopifySessionToken — bad signature rejected')
  {
    const now = nowSec()
    const token = signToken({ aud: 'test-client-id', iss: 'https://test-shop.myshopify.com/admin', dest: 'https://test-shop.myshopify.com', exp: now + 60, nbf: now - 60 }, 'WRONG-secret')
    const r = verifyShopifySessionToken(token)
    check('ok:false, reason bad_signature', r.ok === false && r.reason === 'bad_signature')
  }
  console.log('\n9) verifyShopifySessionToken — non-HS256 algorithm rejected (no alg-confusion)')
  {
    const now = nowSec()
    const token = signToken({ aud: 'test-client-id', iss: 'https://test-shop.myshopify.com/admin', dest: 'https://test-shop.myshopify.com', exp: now + 60, nbf: now - 60 }, 'test-client-secret', 'none')
    const r = verifyShopifySessionToken(token)
    check('ok:false, reason bad_algorithm', r.ok === false && r.reason === 'bad_algorithm')
  }
  console.log('\n10) verifyShopifySessionToken — expired token rejected')
  {
    const now = nowSec()
    const token = signToken({ aud: 'test-client-id', iss: 'https://test-shop.myshopify.com/admin', dest: 'https://test-shop.myshopify.com', exp: now - 10, nbf: now - 60 })
    const r = verifyShopifySessionToken(token)
    check('ok:false, reason expired', r.ok === false && r.reason === 'expired')
  }
  console.log('\n11) verifyShopifySessionToken — wrong audience (different app) rejected')
  {
    const now = nowSec()
    const token = signToken({ aud: 'someone-elses-client-id', iss: 'https://test-shop.myshopify.com/admin', dest: 'https://test-shop.myshopify.com', exp: now + 60, nbf: now - 60 })
    const r = verifyShopifySessionToken(token)
    check('ok:false, reason bad_audience', r.ok === false && r.reason === 'bad_audience')
  }
  console.log('\n12) verifyShopifySessionToken — iss/dest shop mismatch rejected (no cross-shop token reuse)')
  {
    const now = nowSec()
    const token = signToken({ aud: 'test-client-id', iss: 'https://attacker-shop.myshopify.com/admin', dest: 'https://victim-shop.myshopify.com', exp: now + 60, nbf: now - 60 })
    const r = verifyShopifySessionToken(token)
    check('ok:false, reason bad_shop_domain', r.ok === false && r.reason === 'bad_shop_domain')
  }
  console.log('\n13) verifyShopifySessionToken — malformed token rejected')
  {
    const r = verifyShopifySessionToken('not-a-jwt')
    check('ok:false, reason malformed', r.ok === false && r.reason === 'malformed')
  }

  // ── Pricing URL builder ──
  console.log('\n14) shopHandleFromMyshopifyDomain — pure derivation')
  {
    check('valid domain', shopHandleFromMyshopifyDomain('my-store.myshopify.com') === 'my-store')
    check('non-myshopify domain rejected', shopHandleFromMyshopifyDomain('my-store.example.com') === null)
    check('empty string rejected', shopHandleFromMyshopifyDomain('') === null)
  }
  console.log('\n15) buildShopifyPricingUrl — correct URL, and fails closed without SHOPIFY_APP_HANDLE')
  {
    const ok = buildShopifyPricingUrl('my-store.myshopify.com')
    check('builds the exact expected URL', ok.ok === true && ok.url === 'https://admin.shopify.com/store/my-store/charges/go-top-seo-test/pricing_plans')
    const savedHandle = process.env.SHOPIFY_APP_HANDLE
    delete process.env.SHOPIFY_APP_HANDLE
    const missing = buildShopifyPricingUrl('my-store.myshopify.com')
    check('fails closed when SHOPIFY_APP_HANDLE unset', missing.ok === false && missing.reason === 'missing_app_handle')
    process.env.SHOPIFY_APP_HANDLE = savedHandle
    const bad = buildShopifyPricingUrl('not-a-shop-domain')
    check('fails closed on an invalid shop domain', bad.ok === false && bad.reason === 'invalid_shop_domain')
  }

  // ── Central publish entitlement guard ──
  console.log('\n16) checkShopifyPublishEntitlement — no shop_gid fails closed')
  {
    const admin = new FakeAdmin({ shopify_connections: [], shopify_billing_migrations: [] })
    const conn = baseConnection({ shop_gid: null })
    const r = await checkShopifyPublishEntitlement(admin as unknown as Admin, conn)
    check('ok:false, reason shop_identity_unverified', r.ok === false && r.reason === 'shop_identity_unverified')
  }

  console.log('\n17) checkShopifyPublishEntitlement — in-progress PayPal migration blocks publish')
  {
    const admin = new FakeAdmin({
      shopify_connections: [],
      shopify_billing_migrations: [{ id: 'm1', user_id: 'user-1', project_id: 'project-1', status: 'pending', paypal_cancel_attempts: 0 }],
    })
    const r = await checkShopifyPublishEntitlement(admin as unknown as Admin, baseConnection())
    check('ok:false, reason paypal_migration_incomplete', r.ok === false && r.reason === 'paypal_migration_incomplete')
  }
  console.log('\n17b) checkShopifyPublishEntitlement — a FAILED PayPal-cancel migration also blocks publish (never leaves it silently unlocked)')
  {
    const admin = new FakeAdmin({
      shopify_connections: [],
      shopify_billing_migrations: [{ id: 'm1', user_id: 'user-1', project_id: 'project-1', status: 'paypal_cancel_failed', paypal_cancel_attempts: 2 }],
    })
    const r = await checkShopifyPublishEntitlement(admin as unknown as Admin, baseConnection())
    check('ok:false, reason paypal_migration_incomplete', r.ok === false && r.reason === 'paypal_migration_incomplete')
  }

  console.log('\n18) checkShopifyPublishEntitlement — Partner API unavailable fails closed (never treated as active)')
  {
    const saved = process.env.SHOPIFY_PARTNER_API_ACCESS_TOKEN
    delete process.env.SHOPIFY_PARTNER_API_ACCESS_TOKEN
    const admin = new FakeAdmin({ shopify_connections: [{ ...baseConnection() }], shopify_billing_migrations: [] })
    const r = await checkShopifyPublishEntitlement(admin as unknown as Admin, baseConnection())
    check('ok:false, reason billing_verification_unavailable', r.ok === false && r.reason === 'billing_verification_unavailable')
    process.env.SHOPIFY_PARTNER_API_ACCESS_TOKEN = saved
  }

  console.log('\n19) checkShopifyPublishEntitlement — live active plan grants entitlement AND updates the cache/audit columns')
  {
    const admin = new FakeAdmin({ shopify_connections: [{ ...baseConnection() }], shopify_billing_migrations: [] })
    const f = fakePartnerFetch(() => ({ status: 200, body: activeSubBody('premium') }))
    const r = await checkShopifyPublishEntitlement(admin as unknown as Admin, baseConnection(), f)
    check('ok:true, planHandle=premium', r.ok === true && r.planHandle === 'premium')
    const row = admin.tables.shopify_connections[0] as Record<string, unknown>
    check('cache column shopify_plan_handle updated to premium', row.shopify_plan_handle === 'premium')
    check('cache column shopify_subscription_status updated to active', row.shopify_subscription_status === 'active')
  }

  console.log('\n20) checkShopifyPublishEntitlement — STALE cache saying "active" is IGNORED when the LIVE check now says inactive')
  {
    const staleConn = baseConnection({ shopify_subscription_status: 'active', shopify_plan_handle: 'premium' })
    const admin = new FakeAdmin({ shopify_connections: [{ ...staleConn }], shopify_billing_migrations: [] })
    const f = fakePartnerFetch(() => ({ status: 200, body: noSubBody }))
    const r = await checkShopifyPublishEntitlement(admin as unknown as Admin, staleConn, f)
    check('ok:false despite a stale "active" cache — the guard never trusts the cache for the decision', r.ok === false && r.reason === 'no_active_shopify_plan')
    const row = admin.tables.shopify_connections[0] as Record<string, unknown>
    check('cache is corrected to none after the live re-check', row.shopify_subscription_status === 'none')
  }

  console.log('\n21) checkShopifyPublishEntitlement — a manually-granted "large_agency" PayPal-less entitlement does NOT bypass Shopify billing (reviewer-account scenario)')
  {
    // Mirrors the exact shopify@gotop.co.il account shape: an active, manually
    // granted subscriptions row with NO paypal_subscription_id, PLUS a
    // connected Shopify store — but the Partner API has no active plan for
    // that shop. No code path here references the reviewer's email; this
    // proves the guard denies based purely on the live Partner API answer.
    const admin = new FakeAdmin({
      subscriptions: [{ id: 'sub-1', user_id: 'user-1', plan_code: 'large_agency', status: 'active', paypal_subscription_id: null }],
      shopify_connections: [{ ...baseConnection() }],
      shopify_billing_migrations: [],
    })
    const f = fakePartnerFetch(() => ({ status: 200, body: noSubBody }))
    const r = await checkShopifyPublishEntitlement(admin as unknown as Admin, baseConnection(), f)
    check('ok:false — manually granted PayPal-less entitlement does not unlock Shopify publishing', r.ok === false && r.reason === 'no_active_shopify_plan')
  }

  // ── PayPal-checkout blocking ──
  console.log('\n22) hasActiveShopifyConnection — true only for connection_status="connected"')
  {
    const connected = new FakeAdmin({ shopify_connections: [{ id: 'c1', user_id: 'u1', connection_status: 'connected' }] })
    check('true when connected', await hasActiveShopifyConnection(connected as unknown as Admin, 'u1') === true)
    const uninstalled = new FakeAdmin({ shopify_connections: [{ id: 'c1', user_id: 'u1', connection_status: 'failed' }] })
    check('false when uninstalled (failed) — reverts to the PayPal population', await hasActiveShopifyConnection(uninstalled as unknown as Admin, 'u1') === false)
    const none = new FakeAdmin({ shopify_connections: [] })
    check('false when no connection at all', await hasActiveShopifyConnection(none as unknown as Admin, 'u1') === false)
  }

  // ── PayPal → Shopify migration state machine ──
  console.log('\n23) initiateMigrationIfPayPalSubscriber — only a REAL paid PayPal subscriber gets a migration row')
  {
    const trialOnly = new FakeAdmin({ subscriptions: [{ user_id: 'u1', status: 'trial', paypal_subscription_id: null, created_at: '2026-01-01' }], shopify_billing_migrations: [] })
    await initiateMigrationIfPayPalSubscriber(trialOnly as unknown as Admin, { userId: 'u1', projectId: 'p1', shopifyConnectionId: 'c1' })
    check('trial-only user: no migration row created', trialOnly.tables.shopify_billing_migrations.length === 0)

    const paidNoPaypalId = new FakeAdmin({ subscriptions: [{ user_id: 'u1', status: 'active', paypal_subscription_id: null, created_at: '2026-01-01' }], shopify_billing_migrations: [] })
    await initiateMigrationIfPayPalSubscriber(paidNoPaypalId as unknown as Admin, { userId: 'u1', projectId: 'p1', shopifyConnectionId: 'c1' })
    check('manually-granted active entitlement (no paypal_subscription_id): no migration row created', paidNoPaypalId.tables.shopify_billing_migrations.length === 0)

    const realPaypal = new FakeAdmin({ subscriptions: [{ user_id: 'u1', status: 'active', paypal_subscription_id: 'SUB-1', created_at: '2026-01-01' }], shopify_billing_migrations: [] })
    await initiateMigrationIfPayPalSubscriber(realPaypal as unknown as Admin, { userId: 'u1', projectId: 'p1', shopifyConnectionId: 'c1' })
    check('real PayPal subscriber: a pending migration row is created', realPaypal.tables.shopify_billing_migrations.length === 1)
    check('created row starts pending', (realPaypal.tables.shopify_billing_migrations[0] as Record<string, unknown>).status === 'pending')

    await initiateMigrationIfPayPalSubscriber(realPaypal as unknown as Admin, { userId: 'u1', projectId: 'p2', shopifyConnectionId: 'c2' })
    check('idempotent: calling again reuses the SAME row (still exactly one)', realPaypal.tables.shopify_billing_migrations.length === 1)
  }

  console.log('\n24) confirmShopifyActiveAndAdvance — pending → shopify_confirmed → completed on a successful PayPal cancel')
  {
    const admin = new FakeAdmin({
      shopify_billing_migrations: [{ id: 'm1', user_id: 'u1', project_id: 'p1', shopify_connection_id: 'c1', paypal_subscription_id: 'SUB-1', status: 'pending', paypal_cancel_attempts: 0 }],
      subscriptions: [{ user_id: 'u1', status: 'active', paypal_subscription_id: 'SUB-1' }],
    })
    const f = fakePayPalFetch(() => ({ ok: true, status: 204, body: {} }))
    const result = await confirmShopifyActiveAndAdvance(admin as unknown as Admin, 'u1', f)
    check('result status completed', result?.status === 'completed' && result.cancelFailed === false)
    check('migration row is completed', (admin.tables.shopify_billing_migrations[0] as Record<string, unknown>).status === 'completed')
    check('the local subscriptions row is marked cancelled (best-effort mirror)', (admin.tables.subscriptions[0] as Record<string, unknown>).status === 'cancelled')
    check('no longer an "active" migration for this user (idempotent going forward)', (await getActiveMigration(admin as unknown as Admin, 'u1')) === null)
  }

  console.log('\n25) confirmShopifyActiveAndAdvance — a FAILED PayPal cancel is surfaced, not hidden, and PayPal is left untouched')
  {
    const admin = new FakeAdmin({
      shopify_billing_migrations: [{ id: 'm1', user_id: 'u1', project_id: 'p1', shopify_connection_id: 'c1', paypal_subscription_id: 'SUB-1', status: 'pending', paypal_cancel_attempts: 0 }],
      subscriptions: [{ user_id: 'u1', status: 'active', paypal_subscription_id: 'SUB-1' }],
    })
    const f = fakePayPalFetch(() => ({ ok: false, status: 500, body: {} }))
    const result = await confirmShopifyActiveAndAdvance(admin as unknown as Admin, 'u1', f)
    check('result status paypal_cancel_failed (not silently completed)', result?.status === 'paypal_cancel_failed' && result.cancelFailed === true)
    check('attempt count incremented', (admin.tables.shopify_billing_migrations[0] as Record<string, unknown>).paypal_cancel_attempts === 1)
    check('last_error recorded (not hidden)', !!(admin.tables.shopify_billing_migrations[0] as Record<string, unknown>).last_error)
    check('the local PayPal subscription row is left untouched (still active — no double billing risk, no premature loss of entitlement)', (admin.tables.subscriptions[0] as Record<string, unknown>).status === 'active')

    // Retry: this time the cancel succeeds.
    const f2 = fakePayPalFetch(() => ({ ok: true, status: 204, body: {} }))
    const retryResult = await confirmShopifyActiveAndAdvance(admin as unknown as Admin, 'u1', f2)
    check('retry succeeds and reaches completed', retryResult?.status === 'completed')
  }

  console.log('\n26) confirmShopifyActiveAndAdvance — a non-migrating account is a safe no-op')
  {
    const admin = new FakeAdmin({ shopify_billing_migrations: [], subscriptions: [] })
    const result = await confirmShopifyActiveAndAdvance(admin as unknown as Admin, 'u-not-migrating')
    check('returns null (nothing to do)', result === null)
  }

  console.log(`\n${pass} passed, ${fail} failed`)
  if (fail > 0) process.exitCode = 1
}
main()
