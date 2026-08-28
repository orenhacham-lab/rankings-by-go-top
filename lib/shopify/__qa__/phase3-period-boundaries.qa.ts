/**
 * Phase 3 — Shopify authoritative billing-period boundaries: always whatever
 * the Partner API currently reports, including after a plan change resets
 * the cycle (no hardcoded "never resets" logic). Run:
 *   npx tsx lib/shopify/__qa__/phase3-period-boundaries.qa.ts
 */
import type { createAdminClient } from '@/lib/supabase/admin'
import { FakeAdmin } from '../../__qa__/_fake-admin'
import { resolveShopifyGovernedEntitlement } from '../entitlement-resolver'

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

const SHOP_GID = 'gid://shopify/Shop/1'
const SHOP_DOMAIN = 'test-shop.myshopify.com'
function fakePartnerFetch(impl: () => { status: number; body: unknown }): typeof fetch {
  return (async () => {
    const r = impl()
    return { ok: r.status >= 200 && r.status < 300, status: r.status, json: async () => r.body } as Response
  }) as unknown as typeof fetch
}
const realFetch = global.fetch
function withFetch<T>(impl: typeof fetch, fn: () => Promise<T>): Promise<T> {
  global.fetch = impl
  return fn().finally(() => { global.fetch = realFetch })
}
function connRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'conn-1', user_id: 'u1', project_id: 'p1', shop_domain: SHOP_DOMAIN, shop_gid: SHOP_GID,
    connection_status: 'connected', shopify_plan_handle: null, shopify_subscription_status: null,
    shopify_current_period_end: null, shopify_current_period_start: null, shopify_billing_verified_at: null,
    ...overrides,
  }
}

async function main() {
  console.log('Phase 3 — Shopify authoritative period boundaries QA\n')

  console.log('1) Live check caches BOTH currentBillingCycle.startTime AND endTime from the Partner API')
  {
    const admin = new FakeAdmin({ shopify_connections: [connRow()], shopify_billing_migrations: [] })
    const f = fakePartnerFetch(() => ({
      status: 200,
      body: { data: { activeSubscription: { shop: { id: SHOP_GID, myshopifyDomain: SHOP_DOMAIN }, trialEndsAt: null, cancelAtEndOfCycle: false, currentBillingCycle: { startTime: '2026-08-01T00:00:00Z', endTime: '2026-09-01T00:00:00Z' }, items: [{ handle: 'premium', price: { __typename: 'FlatRatePrice', active: true } }] } } },
    }))
    await withFetch(f, () => resolveShopifyGovernedEntitlement(admin as unknown as Admin, 'u1'))
    const row = admin.tables.shopify_connections[0] as Record<string, unknown>
    check('shopify_current_period_start cached', row.shopify_current_period_start === '2026-08-01T00:00:00Z')
    check('shopify_current_period_end cached', row.shopify_current_period_end === '2026-09-01T00:00:00Z')
  }

  console.log('\n2) Plan-change scenario — an upgrade that resets the billing cycle boundaries is reflected exactly, no "never resets" special-casing')
  {
    // Cache from BEFORE the upgrade — an old cycle.
    const admin = new FakeAdmin({
      shopify_connections: [connRow({ shopify_plan_handle: 'regular', shopify_subscription_status: 'active', shopify_current_period_start: '2026-07-01T00:00:00Z', shopify_current_period_end: '2026-08-01T00:00:00Z', shopify_billing_verified_at: '2026-07-15T00:00:00Z' })],
      shopify_billing_migrations: [],
    })
    // Live check (cache is stale by construction of the test — 6+ min old
    // per Phase 2's 5-minute TTL) now reflects the NEW plan's NEW cycle,
    // which Shopify reports as starting TODAY (the upgrade moment) — a
    // later start date than the old cached one, proving no logic assumes
    // periods can only move forward monotonically from the old value.
    const f = fakePartnerFetch(() => ({
      status: 200,
      body: { data: { activeSubscription: { shop: { id: SHOP_GID, myshopifyDomain: SHOP_DOMAIN }, trialEndsAt: null, cancelAtEndOfCycle: false, currentBillingCycle: { startTime: '2026-08-20T00:00:00Z', endTime: '2026-09-20T00:00:00Z' }, items: [{ handle: 'premium', price: { __typename: 'FlatRatePrice', active: true } }] } } },
    }))
    const result = await withFetch(f, () => resolveShopifyGovernedEntitlement(admin as unknown as Admin, 'u1'))
    check('the NEW plan is granted (premium, upgraded from regular)', result?.planCode === 'premium')
    const row = admin.tables.shopify_connections[0] as Record<string, unknown>
    check('the cache reflects the NEW cycle start (Aug 20), overwriting the old one (Jul 1)', row.shopify_current_period_start === '2026-08-20T00:00:00Z')
    check('the cache reflects the NEW cycle end (Sep 20), overwriting the old one (Aug 1)', row.shopify_current_period_end === '2026-09-20T00:00:00Z')
  }

  console.log('\n3) Inactive subscription clears both period fields (no stale boundaries survive a cancellation)')
  {
    const admin = new FakeAdmin({
      shopify_connections: [connRow({ shopify_plan_handle: 'regular', shopify_subscription_status: 'active', shopify_current_period_start: '2026-07-01T00:00:00Z', shopify_current_period_end: '2026-08-01T00:00:00Z', shopify_billing_verified_at: '2026-07-15T00:00:00Z' })],
      shopify_billing_migrations: [],
    })
    const f = fakePartnerFetch(() => ({ status: 200, body: { data: { activeSubscription: null } } }))
    await withFetch(f, () => resolveShopifyGovernedEntitlement(admin as unknown as Admin, 'u1'))
    const row = admin.tables.shopify_connections[0] as Record<string, unknown>
    check('period start cleared', row.shopify_current_period_start === null)
    check('period end cleared', row.shopify_current_period_end === null)
  }

  console.log(`\n${pass} passed, ${fail} failed`)
  if (fail > 0) process.exitCode = 1
}
main()
