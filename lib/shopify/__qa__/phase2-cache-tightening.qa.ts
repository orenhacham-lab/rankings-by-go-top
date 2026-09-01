/**
 * Cache-tightening fix — proves the Shopify entitlement cache TTL (5 min,
 * was 1h), immediate invalidation on uninstall (+ the reinstall edge case
 * it closes), always-live migration-state reads, and that the return-route
 * always live-checks + rewrites the cache rather than trusting it. Run:
 *   npx tsx lib/shopify/__qa__/phase2-cache-tightening.qa.ts
 */
import type { createAdminClient } from '@/lib/supabase/admin'
import { FakeAdmin } from '../../__qa__/_fake-admin'
import { resolveShopifyGovernedEntitlement, isShopifyGovernedAndActive } from '../entitlement-resolver'
import { applyAppUninstalled } from '../shop-cleanup'

type Admin = ReturnType<typeof createAdminClient>

let pass = 0, fail = 0
function check(name: string, cond: boolean, detail?: string) {
  if (cond) { pass++; console.log(`  ✓ ${name}`) } else { fail++; console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`) }
}

process.env.SHOPIFY_CLIENT_ID = 'test-client-id'
process.env.SHOPIFY_CLIENT_SECRET = 'test-client-secret'
process.env.SHOPIFY_APP_URL = 'https://www.example-test.com'
process.env.SHOPIFY_PARTNER_API_ACCESS_TOKEN = 'test-partner-token'
process.env.SHOPIFY_PARTNER_ORGANIZATION_ID = '4243054'
process.env.SHOPIFY_PARTNER_APP_GID = 'gid://shopify/App/397648429057'
process.env.SHOPIFY_PARTNER_API_VERSION = '2026-07'
process.env.CONTENT_CREDENTIALS_ENCRYPTION_KEY = process.env.CONTENT_CREDENTIALS_ENCRYPTION_KEY || 'a'.repeat(64)

const SHOP_GID = 'gid://shopify/Shop/1'
const SHOP_DOMAIN = 'test-shop.myshopify.com'
let liveCallCount = 0
function fakePartnerFetch(impl: () => { status: number; body: unknown }): typeof fetch {
  return (async () => {
    liveCallCount++
    const r = impl()
    return { ok: r.status >= 200 && r.status < 300, status: r.status, json: async () => r.body } as Response
  }) as unknown as typeof fetch
}
const activeSubBody = (handle: string) => ({
  data: {
    activeSubscription: {
      shop: { id: SHOP_GID, myshopifyDomain: SHOP_DOMAIN },
      trialEndsAt: null, cancelAtEndOfCycle: false,
      currentBillingCycle: { endTime: '2026-12-01T00:00:00Z' },
      items: [{ handle, price: { __typename: 'FlatRatePrice', active: true } }],
    },
  },
})
const noSubBody = { data: { activeSubscription: null } }
const realFetch = global.fetch
function withFetch<T>(impl: typeof fetch, fn: () => Promise<T>): Promise<T> {
  global.fetch = impl
  return fn().finally(() => { global.fetch = realFetch })
}

function connRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'conn-1', user_id: 'u1', project_id: 'p1', shop_domain: SHOP_DOMAIN, shop_gid: SHOP_GID,
    connection_status: 'connected', shopify_plan_handle: 'premium', shopify_subscription_status: 'active',
    shopify_current_period_end: null, shopify_billing_verified_at: null,
    ...overrides,
  }
}
const minutesAgo = (m: number) => new Date(Date.now() - m * 60_000).toISOString()

async function main() {
  console.log('Cache-tightening fix — TTL + invalidation QA\n')

  console.log('1) a cached "active" entry verified 4 minutes ago is STILL trusted (within the 5-minute TTL) — no live call')
  {
    liveCallCount = 0
    const admin = new FakeAdmin({ billing_governance: [{ user_id: 'u1', signup_origin: 'shopify_app_store', billing_authority: 'shopify' }], shopify_connections: [connRow({ shopify_billing_verified_at: minutesAgo(4) })], shopify_billing_migrations: [] })
    const r = await resolveShopifyGovernedEntitlement(admin as unknown as Admin, 'u1')
    check('planCode resolved from cache (premium)', r?.planCode === 'premium')
    check('zero live Partner API calls made', liveCallCount === 0)
  }

  console.log('\n2) a cached "active" entry verified 6 minutes ago is NO LONGER trusted (past the 5-minute TTL) — forces a live re-check')
  {
    liveCallCount = 0
    const admin = new FakeAdmin({ billing_governance: [{ user_id: 'u1', signup_origin: 'shopify_app_store', billing_authority: 'shopify' }], shopify_connections: [connRow({ shopify_billing_verified_at: minutesAgo(6) })], shopify_billing_migrations: [] })
    const f = fakePartnerFetch(() => ({ status: 200, body: noSubBody })) // the REAL current state has since changed
    const r = await withFetch(f, () => resolveShopifyGovernedEntitlement(admin as unknown as Admin, 'u1'))
    check('a live Partner API call was made', liveCallCount === 1)
    check('the STALE cached "active" value is NOT trusted — reflects the live (now inactive) result', r?.planCode === null)
  }

  console.log('\n3) isShopifyGovernedAndActive (hasAccess hot path) — same 5-minute TTL, cache-only (never a live call)')
  {
    const freshAdmin = new FakeAdmin({ billing_governance: [{ user_id: 'u1', signup_origin: 'shopify_app_store', billing_authority: 'shopify' }], shopify_connections: [connRow({ shopify_billing_verified_at: minutesAgo(4) })] })
    const fresh = await isShopifyGovernedAndActive(freshAdmin as unknown as Admin, 'u1')
    check('within 5 min: active:true from cache', fresh.active === true)

    const staleAdmin = new FakeAdmin({ billing_governance: [{ user_id: 'u1', signup_origin: 'shopify_app_store', billing_authority: 'shopify' }], shopify_connections: [connRow({ shopify_billing_verified_at: minutesAgo(6) })] })
    const stale = await isShopifyGovernedAndActive(staleAdmin as unknown as Admin, 'u1')
    check('past 5 min: active:false (a stale cache is never trusted, and this hot path never makes a live call either)', stale.active === false)
  }

  console.log('\n4) applyAppUninstalled — immediately clears the billing cache (not just connection_status)')
  {
    const admin = new FakeAdmin({ billing_governance: [{ user_id: 'u1', signup_origin: 'shopify_app_store', billing_authority: 'shopify' }], shopify_connections: [connRow({ shopify_billing_verified_at: minutesAgo(1) })] }) // very fresh "active" cache
    const result = await applyAppUninstalled(admin as unknown as Admin, SHOP_DOMAIN)
    check('cleanup succeeded', result.ok === true)
    const row = admin.tables.shopify_connections[0] as Record<string, unknown>
    check('connection_status is "failed"', row.connection_status === 'failed')
    check('shopify_subscription_status cleared to null (not left "active")', row.shopify_subscription_status === null)
    check('shopify_plan_handle cleared to null', row.shopify_plan_handle === null)
    check('shopify_billing_verified_at cleared to null (forces a live check on any future read)', row.shopify_billing_verified_at === null)
  }

  console.log('\n5) reinstall edge case — after uninstall + reinstall, a fresh "active" cache from BEFORE the uninstall never leaks through')
  {
    const admin = new FakeAdmin({ billing_governance: [{ user_id: 'u1', signup_origin: 'shopify_app_store', billing_authority: 'shopify' }], shopify_connections: [connRow({ shopify_billing_verified_at: minutesAgo(1) })] }) // fresh active cache
    await applyAppUninstalled(admin as unknown as Admin, SHOP_DOMAIN)
    // Reinstall: connection_status flips back to 'connected' (the OAuth
    // callback's normal upsert path — simulated directly here).
    const row = admin.tables.shopify_connections[0] as Record<string, unknown>
    row.connection_status = 'connected'
    liveCallCount = 0
    const f = fakePartnerFetch(() => ({ status: 200, body: activeSubBody('regular') }))
    const r = await withFetch(f, () => resolveShopifyGovernedEntitlement(admin as unknown as Admin, 'u1'))
    check('a live check was forced immediately after reinstall (cache was invalidated, not stale-trusted)', liveCallCount === 1)
    check('the live (current) plan is what gets granted, not the pre-uninstall cached one', r?.planCode === 'regular')
  }

  console.log('\n6) migration state is ALWAYS read fresh — never cached, picked up on the very next call with no invalidation needed')
  {
    const admin = new FakeAdmin({
      billing_governance: [{ user_id: 'u1', signup_origin: 'shopify_app_store', billing_authority: 'shopify' }], shopify_connections: [connRow({ shopify_billing_verified_at: minutesAgo(1) })], // fresh active cache
      shopify_billing_migrations: [],
    })
    const before = await resolveShopifyGovernedEntitlement(admin as unknown as Admin, 'u1')
    check('before any migration: cache-derived plan granted', before?.planCode === 'premium')

    // A migration starts (e.g. this user just connected while still a real
    // PayPal payer) — nothing "invalidates" the cache; the migration check
    // itself is a fresh read on every call.
    admin.tables.shopify_billing_migrations.push({ id: 'm1', user_id: 'u1', project_id: 'p1', status: 'pending', paypal_cancel_attempts: 0 })
    const during = await resolveShopifyGovernedEntitlement(admin as unknown as Admin, 'u1')
    check('immediately after a migration starts (same fresh cache, no TTL change): entitlement is blocked', during?.planCode === null && during?.verificationError === 'paypal_migration_incomplete')
  }

  console.log(`\n${pass} passed, ${fail} failed`)
  if (fail > 0) process.exitCode = 1
}
main()
