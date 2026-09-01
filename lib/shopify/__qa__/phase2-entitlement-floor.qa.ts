/**
 * Phase 2 (Blocker B fix) — a Shopify-connected merchant with no VERIFIED
 * Shopify App Pricing plan must get ZERO product entitlement
 * ('shopify_billing_required', PLAN_LIMITS all zero) — never the local
 * website trial. Exercises getUserEntitlement() directly (FakeAdmin,
 * injectable fetch via the entitlement resolver). Run:
 *   npx tsx lib/shopify/__qa__/phase2-entitlement-floor.qa.ts
 */
import { readFileSync } from 'fs'
import { join } from 'path'
import type { createAdminClient } from '@/lib/supabase/admin'
import { FakeAdmin } from '../../__qa__/_fake-admin'
import { getUserEntitlement, PLAN_LIMITS } from '@/lib/subscription'
import { SHOPIFY_SUPPORTED_PLAN_HANDLES } from '../constants'

type Admin = ReturnType<typeof createAdminClient>

let pass = 0, fail = 0
function check(name: string, cond: boolean, detail?: string) {
  if (cond) { pass++; console.log(`  ✓ ${name}`) } else { fail++; console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`) }
}
const ROOT = join(__dirname, '..', '..', '..')
const read = (rel: string) => readFileSync(join(ROOT, rel), 'utf8')

process.env.SHOPIFY_CLIENT_ID = 'test-client-id'
process.env.SHOPIFY_CLIENT_SECRET = 'test-client-secret'
process.env.SHOPIFY_APP_URL = 'https://www.example-test.com'
process.env.SHOPIFY_PARTNER_API_ACCESS_TOKEN = 'test-partner-token'
process.env.SHOPIFY_PARTNER_ORGANIZATION_ID = '4243054'
process.env.SHOPIFY_PARTNER_APP_GID = 'gid://shopify/App/397648429057'
process.env.SHOPIFY_PARTNER_API_VERSION = '2026-07'

function fakePartnerFetch(impl: () => { status: number; body: unknown }): typeof fetch {
  return (async () => {
    const r = impl()
    return { ok: r.status >= 200 && r.status < 300, status: r.status, json: async () => r.body } as Response
  }) as unknown as typeof fetch
}
const SHOP_GID = 'gid://shopify/Shop/1'
const SHOP_DOMAIN = 'test-shop.myshopify.com'
const activeSubBody = (handle: string) => ({
  data: {
    activeSubscription: {
      shop: { id: SHOP_GID, myshopifyDomain: SHOP_DOMAIN },
      trialEndsAt: '2026-09-01T00:00:00Z', cancelAtEndOfCycle: false,
      currentBillingCycle: { endTime: '2026-12-01T00:00:00Z' },
      items: [{ handle, price: { __typename: 'FlatRatePrice', active: true } }],
    },
  },
})
const noSubBody = { data: { activeSubscription: null } }

function shopifyConnRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'conn-1', user_id: 'u1', project_id: 'p1', shop_domain: SHOP_DOMAIN, shop_gid: SHOP_GID,
    connection_status: 'connected', shopify_plan_handle: null, shopify_subscription_status: null,
    shopify_current_period_end: null, shopify_billing_verified_at: null,
    ...overrides,
  }
}

// getUserEntitlement's Partner API calls use the module's default `fetch`
// (no injection point on the public function) — monkey-patch global fetch
// for the duration of each Shopify-governed test, then restore it. This
// mirrors how entitlement-resolver.ts is actually invoked in production
// (no fetchImpl threading through getUserEntitlement/hasAccess).
const realFetch = global.fetch
function withFetch<T>(impl: typeof fetch, fn: () => Promise<T>): Promise<T> {
  global.fetch = impl
  return fn().finally(() => { global.fetch = realFetch })
}

async function main() {
  console.log('Phase 2 (Blocker B) — entitlement floor QA\n')

  console.log('1) website-only user with an active local trial retains its EXISTING limits (unchanged)')
  {
    const admin = new FakeAdmin({
      profiles: [], shopify_connections: [],
      subscriptions: [{ id: 's1', user_id: 'u1', status: 'trial', trial_ends_at: new Date(Date.now() + 7 * 86_400_000).toISOString(), plan_code: null }],
    })
    const e = await getUserEntitlement('u1', admin as unknown as Admin)
    check('plan is "trial"', e.plan === 'trial')
    check('trialActive true', e.trialActive === true)
    check('limits are the real (non-zero) trial limits', e.limits.maxProjects === PLAN_LIMITS.trial.maxProjects && e.limits.maxProjects > 0)
  }

  console.log('\n2) Shopify-connected merchant, activeSubscription = null -> ZERO product entitlement')
  {
    const admin = new FakeAdmin({ billing_governance: [{ user_id: 'u1', signup_origin: 'shopify_app_store', billing_authority: 'shopify' }], shopify_connections: [shopifyConnRow()], shopify_billing_migrations: [], profiles: [], subscriptions: [] })
    const e = await withFetch(fakePartnerFetch(() => ({ status: 200, body: noSubBody })), () => getUserEntitlement('u1', admin as unknown as Admin))
    check('plan is "shopify_billing_required" (never "trial")', e.plan === 'shopify_billing_required')
    check('all limits are zero', e.limits.maxProjects === 0 && e.limits.maxKeywordsPerProject === 0 && e.limits.maxKeywordChecksPerPeriodPerProject === 0 && e.limits.maxAIScansPerPeriodPerProject === 0)
    check('hasActiveSubscription false', e.hasActiveSubscription === false)
  }

  console.log('\n3) Shopify-connected merchant, Partner API OUTAGE -> ZERO product entitlement (fails closed)')
  {
    const admin = new FakeAdmin({ billing_governance: [{ user_id: 'u1', signup_origin: 'shopify_app_store', billing_authority: 'shopify' }], shopify_connections: [shopifyConnRow()], shopify_billing_migrations: [], profiles: [], subscriptions: [] })
    const e = await withFetch(fakePartnerFetch(() => ({ status: 500, body: {} })), () => getUserEntitlement('u1', admin as unknown as Admin))
    // A Partner API OUTAGE is no longer reported as "buy a plan": it is its own
    // zero-entitlement state, so a paying merchant is never told to purchase
    // because Shopify's API was briefly unreachable. The floor is unchanged.
    check('plan is "entitlement_unavailable" during an outage, never "buy a plan"', e.plan === 'entitlement_unavailable')
    check('all limits zero even during an outage', e.limits.maxProjects === 0)
  }

  console.log('\n4) Shopify-connected merchant on the obsolete "free-plan" handle -> ZERO product entitlement')
  {
    const admin = new FakeAdmin({ billing_governance: [{ user_id: 'u1', signup_origin: 'shopify_app_store', billing_authority: 'shopify' }], shopify_connections: [shopifyConnRow()], shopify_billing_migrations: [], profiles: [], subscriptions: [] })
    const e = await withFetch(fakePartnerFetch(() => ({ status: 200, body: activeSubBody('free-plan') })), () => getUserEntitlement('u1', admin as unknown as Admin))
    check('plan is "shopify_billing_required"', e.plan === 'shopify_billing_required')
    check('all limits zero', e.limits.maxProjects === 0)
  }

  console.log('\n5) manually-granted "large_agency" subscriptions row, Shopify connected but NO verified plan -> ZERO product entitlement (reviewer scenario)')
  {
    const admin = new FakeAdmin({
      billing_governance: [{ user_id: 'u1', signup_origin: 'shopify_app_store', billing_authority: 'shopify' }], shopify_connections: [shopifyConnRow()], shopify_billing_migrations: [], profiles: [],
      subscriptions: [{ id: 'sub-1', user_id: 'u1', plan_code: 'large_agency', status: 'active', paypal_subscription_id: null }],
    })
    const e = await withFetch(fakePartnerFetch(() => ({ status: 200, body: noSubBody })), () => getUserEntitlement('u1', admin as unknown as Admin))
    check('plan is "shopify_billing_required" — NOT "large_agency" despite the manually-granted row', e.plan === 'shopify_billing_required')
    check('all limits zero', e.limits.maxProjects === 0)
  }

  console.log('\n6) VERIFIED Shopify App Pricing trial on "regular" -> exact Regular limits')
  {
    const admin = new FakeAdmin({ billing_governance: [{ user_id: 'u1', signup_origin: 'shopify_app_store', billing_authority: 'shopify' }], shopify_connections: [shopifyConnRow()], shopify_billing_migrations: [], profiles: [], subscriptions: [] })
    const e = await withFetch(fakePartnerFetch(() => ({ status: 200, body: activeSubBody('regular') })), () => getUserEntitlement('u1', admin as unknown as Admin))
    check('plan is "regular"', e.plan === 'regular')
    check('hasActiveSubscription true (Shopify trial IS an active contract)', e.hasActiveSubscription === true)
    check('limits are EXACTLY PLAN_LIMITS.regular', e.limits === PLAN_LIMITS.regular)
  }

  console.log('\n7) VERIFIED Shopify App Pricing trial on EVERY other supported handle -> the corresponding plan limits')
  {
    const HANDLE_TO_CODE: Record<string, keyof typeof PLAN_LIMITS> = { advanced: 'advanced', premium: 'premium', 'large-agency': 'large_agency' }
    for (const handle of SHOPIFY_SUPPORTED_PLAN_HANDLES.filter((h) => h !== 'regular')) {
      const admin = new FakeAdmin({ billing_governance: [{ user_id: 'u1', signup_origin: 'shopify_app_store', billing_authority: 'shopify' }], shopify_connections: [shopifyConnRow()], shopify_billing_migrations: [], profiles: [], subscriptions: [] })
      const e = await withFetch(fakePartnerFetch(() => ({ status: 200, body: activeSubBody(handle) })), () => getUserEntitlement('u1', admin as unknown as Admin))
      const expected = HANDLE_TO_CODE[handle]
      check(`${handle} -> ${expected} limits`, e.plan === expected && e.limits === PLAN_LIMITS[expected])
    }
  }

  console.log('\n8) recovery/onboarding/plan-selection routes remain reachable without product entitlement (source-contract)')
  {
    const proxySrc = read('proxy.ts')
    check('proxy.ts never includes /shopify in the protected-route gate (embedded connector home always reachable)',
      !/isProtectedRoute\s*=[\s\S]{0,400}pathname\.startsWith\('\/shopify'\)/.test(proxySrc))
    check('/billing is explicitly excluded from the subscription/hasAccess wall',
      /needsSubscriptionCheck[\s\S]{0,200}!pathname\.startsWith\('\/billing'\)/.test(proxySrc))
    check('login is reachable for an unauthenticated visitor regardless of entitlement (no hasAccess check gates it)',
      !/pathname\.startsWith\('\/login'\)[\s\S]{0,100}hasAccess/.test(proxySrc))
  }

  console.log(`\n${pass} passed, ${fail} failed`)
  if (fail > 0) process.exitCode = 1
}
main()
