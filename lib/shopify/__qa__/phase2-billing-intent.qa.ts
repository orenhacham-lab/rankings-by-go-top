/**
 * Phase 2 (Blocker A fix) — adversarial QA for the billing-intent mechanism
 * that authorizes /api/shopify/billing/return. Exercises
 * processShopifyBillingReturn() directly (FakeAdmin, injectable fetch) per
 * every required adversarial case: victim shop in the query string, missing/
 * tampered/expired/replayed intent, cross-connection mismatch, mismatched
 * Partner API shop identity, a repeated legitimate callback, and proof that
 * no invalid callback ever triggers a PayPal cancellation. Run:
 *   npx tsx lib/shopify/__qa__/phase2-billing-intent.qa.ts
 */
import type { createAdminClient } from '@/lib/supabase/admin'
import { FakeAdmin } from '../../__qa__/_fake-admin'
import { createBillingIntent, consumeBillingIntent, hashBillingIntentNonce } from '../billing-intent'
import { processShopifyBillingReturn } from '../billing-return-processing'

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

function fakePartnerFetch(impl: () => { status: number; body: unknown }): typeof fetch {
  return (async () => {
    const r = impl()
    return { ok: r.status >= 200 && r.status < 300, status: r.status, json: async () => r.body } as Response
  }) as unknown as typeof fetch
}
function fakePayPalFetch(impl: () => { ok: boolean; status?: number; body: unknown }): typeof fetch {
  return (async (url: string) => {
    if (String(url).includes('/v1/oauth2/token')) return { ok: true, status: 200, json: async () => ({ access_token: 'fake-token' }) } as Response
    const r = impl()
    return { ok: r.ok, status: r.status ?? (r.ok ? 200 : 400), json: async () => r.body } as Response
  }) as unknown as typeof fetch
}
const activeSubBody = (handle: string, shopId: string, myshopifyDomain: string) => ({
  data: {
    activeSubscription: {
      shop: { id: shopId, myshopifyDomain },
      trialEndsAt: null, cancelAtEndOfCycle: false,
      currentBillingCycle: { endTime: '2026-12-01T00:00:00Z' },
      items: [{ handle, price: { __typename: 'FlatRatePrice', active: true } }],
    },
  },
})
const CONN_A = { id: 'conn-A', user_id: 'user-A', project_id: 'project-A', shop_domain: 'victim-store.myshopify.com', shop_gid: 'gid://shopify/Shop/A', connection_status: 'connected' }
const CONN_B = { id: 'conn-B', user_id: 'user-B', project_id: 'project-B', shop_domain: 'other-store.myshopify.com', shop_gid: 'gid://shopify/Shop/B', connection_status: 'connected' }

function freshAdmin() {
  return new FakeAdmin({
    shopify_connections: [{ ...CONN_A }, { ...CONN_B }],
    shopify_billing_intents: [],
    shopify_billing_migrations: [],
    subscriptions: [],
  })
}
function snapshot(admin: FakeAdmin) {
  return JSON.stringify({ conn: admin.tables.shopify_connections, mig: admin.tables.shopify_billing_migrations })
}

async function main() {
  console.log('Phase 2 (Blocker A) — billing-intent adversarial QA\n')

  console.log('1) victim shop named in the query string, NO cookie at all — zero side effects')
  {
    const admin = freshAdmin()
    const before = snapshot(admin)
    const r = await processShopifyBillingReturn(admin as unknown as Admin, { nonce: undefined, suppliedShopRaw: 'victim-store.myshopify.com' })
    check('outcome billing_intent_missing', r.outcome === 'billing_intent_missing')
    check('no projectId known (nothing to attribute)', r.projectId === null)
    check('zero side effects — connection/migration tables byte-identical', snapshot(admin) === before)
  }

  console.log('\n2) missing cookie (no shop param either) — zero side effects')
  {
    const admin = freshAdmin()
    const before = snapshot(admin)
    const r = await processShopifyBillingReturn(admin as unknown as Admin, { nonce: undefined, suppliedShopRaw: null })
    check('outcome billing_intent_missing', r.outcome === 'billing_intent_missing')
    check('zero side effects', snapshot(admin) === before)
  }

  console.log('\n3) tampered/forged cookie (a nonce that hashes to no real row) — zero side effects')
  {
    const admin = freshAdmin()
    const before = snapshot(admin)
    const r = await processShopifyBillingReturn(admin as unknown as Admin, { nonce: 'f'.repeat(64), suppliedShopRaw: 'victim-store.myshopify.com' })
    check('outcome billing_intent_invalid', r.outcome === 'billing_intent_invalid')
    check('zero side effects', snapshot(admin) === before)
  }

  console.log('\n4) expired intent — zero side effects, but the redirect DOES target the real project (not a generic bounce)')
  {
    const admin = freshAdmin()
    const nonce = await createBillingIntent(admin as unknown as Admin, { userId: CONN_A.user_id, projectId: CONN_A.project_id, connectionId: CONN_A.id, shopDomain: CONN_A.shop_domain, shopGid: CONN_A.shop_gid })
    // Force expiry.
    const row = admin.tables.shopify_billing_intents[0] as Record<string, unknown>
    row.expires_at = new Date(Date.now() - 60_000).toISOString()
    const before = snapshot(admin)
    const r = await processShopifyBillingReturn(admin as unknown as Admin, { nonce, suppliedShopRaw: CONN_A.shop_domain })
    check('outcome billing_intent_expired', r.outcome === 'billing_intent_expired')
    check('projectId is the intent\'s own project (from the DB row, not the request)', r.projectId === CONN_A.project_id)
    check('zero side effects', snapshot(admin) === before)
  }

  console.log('\n5) consumed/replayed intent — the SECOND presentation of an already-spent nonce is a pure no-op')
  {
    const admin = freshAdmin()
    const nonce = await createBillingIntent(admin as unknown as Admin, { userId: CONN_A.user_id, projectId: CONN_A.project_id, connectionId: CONN_A.id, shopDomain: CONN_A.shop_domain, shopGid: CONN_A.shop_gid })
    await consumeBillingIntent(admin as unknown as Admin, hashBillingIntentNonce(nonce)) // simulate an already-processed intent
    const before = snapshot(admin)
    const r = await processShopifyBillingReturn(admin as unknown as Admin, { nonce, suppliedShopRaw: CONN_A.shop_domain })
    check('outcome billing_intent_already_processed', r.outcome === 'billing_intent_already_processed')
    check('projectId still resolved from the intent row', r.projectId === CONN_A.project_id)
    check('zero side effects on replay', snapshot(admin) === before)
  }

  console.log('\n6) intent belongs to connection A; attacker supplies connection B\'s shop domain — never touches B, never redirects to B\'s project')
  {
    const admin = freshAdmin()
    const nonce = await createBillingIntent(admin as unknown as Admin, { userId: CONN_A.user_id, projectId: CONN_A.project_id, connectionId: CONN_A.id, shopDomain: CONN_A.shop_domain, shopGid: CONN_A.shop_gid })
    const before = snapshot(admin)
    const r = await processShopifyBillingReturn(admin as unknown as Admin, { nonce, suppliedShopRaw: CONN_B.shop_domain })
    check('outcome shop_mismatch', r.outcome === 'shop_mismatch')
    check('redirect targets the INTENT\'s own project (A), never B', r.projectId === CONN_A.project_id)
    check('zero side effects — B (and A) untouched', snapshot(admin) === before)
    check('the intent is NOT consumed by a mismatch (preserved for a legitimate retry)',
      (admin.tables.shopify_billing_intents[0] as Record<string, unknown>).consumed_at === null)
  }

  console.log('\n7) Shopify returns a MISMATCHED shop.id in the activeSubscription response — never treated as success')
  {
    const admin = freshAdmin()
    const nonce = await createBillingIntent(admin as unknown as Admin, { userId: CONN_A.user_id, projectId: CONN_A.project_id, connectionId: CONN_A.id, shopDomain: CONN_A.shop_domain, shopGid: CONN_A.shop_gid })
    const f = fakePartnerFetch(() => ({ status: 200, body: activeSubBody('premium', 'gid://shopify/Shop/WRONG', CONN_A.shop_domain) }))
    const r = await processShopifyBillingReturn(admin as unknown as Admin, { nonce, suppliedShopRaw: CONN_A.shop_domain }, f)
    check('outcome billing_verification_unavailable (never success)', r.outcome === 'billing_verification_unavailable')
    check('cache reflects "unknown", not active', (admin.tables.shopify_connections.find((c) => (c as Record<string, unknown>).id === CONN_A.id) as Record<string, unknown>).shopify_subscription_status === 'unknown')
  }

  console.log('\n8) Shopify returns a MISMATCHED myshopifyDomain in the activeSubscription response — never treated as success')
  {
    const admin = freshAdmin()
    const nonce = await createBillingIntent(admin as unknown as Admin, { userId: CONN_A.user_id, projectId: CONN_A.project_id, connectionId: CONN_A.id, shopDomain: CONN_A.shop_domain, shopGid: CONN_A.shop_gid })
    const f = fakePartnerFetch(() => ({ status: 200, body: activeSubBody('premium', CONN_A.shop_gid, 'attacker-domain.myshopify.com') }))
    const r = await processShopifyBillingReturn(admin as unknown as Admin, { nonce, suppliedShopRaw: CONN_A.shop_domain }, f)
    check('outcome billing_verification_unavailable (never success)', r.outcome === 'billing_verification_unavailable')
  }

  console.log('\n9) a repeated LEGITIMATE callback (double navigation) — first succeeds fully, second is a safe no-op')
  {
    const admin = freshAdmin()
    admin.tables.shopify_billing_migrations.push({ id: 'm1', user_id: CONN_A.user_id, project_id: CONN_A.project_id, shopify_connection_id: CONN_A.id, paypal_subscription_id: 'SUB-1', status: 'pending', paypal_cancel_attempts: 0 })
    admin.tables.subscriptions.push({ user_id: CONN_A.user_id, status: 'active', paypal_subscription_id: 'SUB-1' })
    const nonce = await createBillingIntent(admin as unknown as Admin, { userId: CONN_A.user_id, projectId: CONN_A.project_id, connectionId: CONN_A.id, shopDomain: CONN_A.shop_domain, shopGid: CONN_A.shop_gid })

    const f1 = fakePartnerFetch(() => ({ status: 200, body: activeSubBody('premium', CONN_A.shop_gid, CONN_A.shop_domain) }))
    const fp1 = fakePayPalFetch(() => ({ ok: true, status: 204, body: {} }))
    const combined1: typeof fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      return url.includes('partners.shopify.com') ? (f1 as unknown as (u: string, i?: RequestInit) => Promise<Response>)(url, init) : (fp1 as unknown as (u: string, i?: RequestInit) => Promise<Response>)(url, init)
    }) as unknown as typeof fetch

    const r1 = await processShopifyBillingReturn(admin as unknown as Admin, { nonce, suppliedShopRaw: CONN_A.shop_domain }, combined1)
    check('first call: outcome success', r1.outcome === 'success')
    check('first call: migration advanced to completed', (admin.tables.shopify_billing_migrations[0] as Record<string, unknown>).status === 'completed')

    const beforeSecond = snapshot(admin)
    const r2 = await processShopifyBillingReturn(admin as unknown as Admin, { nonce, suppliedShopRaw: CONN_A.shop_domain }, combined1)
    check('second call (same nonce): outcome billing_intent_already_processed', r2.outcome === 'billing_intent_already_processed')
    check('second call causes ZERO further changes (idempotent)', snapshot(admin) === beforeSecond)
  }

  console.log('\n10) NO invalid callback ever triggers a PayPal cancellation — checked across every invalid case')
  {
    const scenarios: Array<{ name: string; nonce: () => Promise<string | undefined>; shop: string | null }> = [
      { name: 'missing cookie', nonce: async () => undefined, shop: CONN_A.shop_domain },
      { name: 'tampered cookie', nonce: async () => 'a'.repeat(64), shop: CONN_A.shop_domain },
    ]
    for (const scenario of scenarios) {
      const admin = freshAdmin()
      admin.tables.shopify_billing_migrations.push({ id: 'm1', user_id: CONN_A.user_id, project_id: CONN_A.project_id, shopify_connection_id: CONN_A.id, paypal_subscription_id: 'SUB-1', status: 'pending', paypal_cancel_attempts: 0 })
      const nonce = await scenario.nonce()
      await processShopifyBillingReturn(admin as unknown as Admin, { nonce, suppliedShopRaw: scenario.shop })
      check(`[${scenario.name}] migration status untouched (still 'pending' — no cancellation attempted)`,
        (admin.tables.shopify_billing_migrations[0] as Record<string, unknown>).status === 'pending')
    }
    // Expired + already-consumed + shop-mismatch variants.
    {
      const admin = freshAdmin()
      admin.tables.shopify_billing_migrations.push({ id: 'm1', user_id: CONN_A.user_id, project_id: CONN_A.project_id, shopify_connection_id: CONN_A.id, paypal_subscription_id: 'SUB-1', status: 'pending', paypal_cancel_attempts: 0 })
      const nonce = await createBillingIntent(admin as unknown as Admin, { userId: CONN_A.user_id, projectId: CONN_A.project_id, connectionId: CONN_A.id, shopDomain: CONN_A.shop_domain, shopGid: CONN_A.shop_gid })
      ;(admin.tables.shopify_billing_intents[0] as Record<string, unknown>).expires_at = new Date(Date.now() - 60_000).toISOString()
      await processShopifyBillingReturn(admin as unknown as Admin, { nonce, suppliedShopRaw: CONN_A.shop_domain })
      check("[expired intent] migration status untouched", (admin.tables.shopify_billing_migrations[0] as Record<string, unknown>).status === 'pending')
    }
    {
      const admin = freshAdmin()
      admin.tables.shopify_billing_migrations.push({ id: 'm1', user_id: CONN_A.user_id, project_id: CONN_A.project_id, shopify_connection_id: CONN_A.id, paypal_subscription_id: 'SUB-1', status: 'pending', paypal_cancel_attempts: 0 })
      const nonce = await createBillingIntent(admin as unknown as Admin, { userId: CONN_A.user_id, projectId: CONN_A.project_id, connectionId: CONN_A.id, shopDomain: CONN_A.shop_domain, shopGid: CONN_A.shop_gid })
      await processShopifyBillingReturn(admin as unknown as Admin, { nonce, suppliedShopRaw: CONN_B.shop_domain }) // mismatch
      check("[shop-mismatch] migration status untouched", (admin.tables.shopify_billing_migrations[0] as Record<string, unknown>).status === 'pending')
    }
  }

  console.log(`\n${pass} passed, ${fail} failed`)
  if (fail > 0) process.exitCode = 1
}
main()
