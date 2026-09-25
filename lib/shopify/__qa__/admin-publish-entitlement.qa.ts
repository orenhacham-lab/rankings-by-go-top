/**
 * Administrators may publish to Shopify without a Shopify plan — the same rule
 * every other entitlement gate already applies.
 *
 * THE INCIDENT (25 Sep 2026). The operator installed the LIVE app from the
 * Shopify App Store on a store they manage and linked it to their admin
 * account. complete_shopify_app_store_link moved that account to
 * billing_authority='shopify' (by design for App Store installs), the store
 * had no Shopify plan, and every publish was stored as
 *   shopify_billing_no_active_shopify_plan: no_subscription
 * while the connector home told the same user "Admin account — full access …
 * does not require a billing plan". checkShopifyPublishEntitlement was the one
 * gate that never asked whether the user is an administrator (PR #62 fixed the
 * identical omission in lib/content/entitlement-guard.ts).
 *
 * Run: npx tsx lib/shopify/__qa__/admin-publish-entitlement.qa.ts
 */
import { FakeAdmin } from '../../__qa__/_fake-admin'
import { checkShopifyPublishEntitlement } from '../billing-guard'
import type { ShopifyConnectionRow } from '../api-auth'
import type { createAdminClient } from '@/lib/supabase/admin'

type Admin = ReturnType<typeof createAdminClient>
let pass = 0
let fail = 0
function check(name: string, cond: boolean, detail?: string) {
  if (cond) { pass++; console.log(`  ✓ ${name}`) } else { fail++; console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`) }
}

process.env.SHOPIFY_PARTNER_API_ACCESS_TOKEN = 'test-partner-token'
process.env.SHOPIFY_PARTNER_ORGANIZATION_ID = '4243054'
process.env.SHOPIFY_PARTNER_APP_GID = 'gid://shopify/App/397648429057'
process.env.SHOPIFY_PARTNER_API_VERSION = '2026-07'

const SHOP_GID = 'gid://shopify/Shop/1'
function connection(): ShopifyConnectionRow {
  return {
    id: 'conn-1', user_id: 'user-1', project_id: 'project-1', shop_domain: 'test-shop.myshopify.com',
    storefront_domain: null, access_token_encrypted: 'enc',
    refresh_token_encrypted: null, access_token_expires_at: null, refresh_token_expires_at: null,
    oauth_app_edition: null, api_version: '2026-07',
    connection_status: 'connected', last_tested_at: null, last_synced_at: null, last_error: null,
    default_blog_id: null, granted_scopes: ['read_products', 'read_content', 'write_content'], auth_method: 'oauth',
    shop_gid: SHOP_GID, shopify_plan_handle: null, shopify_subscription_status: 'none',
    shopify_trial_ends_at: null, shopify_current_period_end: null, shopify_current_period_start: null, shopify_cancel_at_end_of_cycle: false,
    shopify_billing_verified_at: null, shopify_billing_last_error: null,
    created_at: '2026-09-24T14:21:27Z', updated_at: '2026-09-24T14:26:46Z',
  }
}
/** The incident's governance row, verbatim in shape. */
const GOVERNANCE = [{ user_id: 'user-1', signup_origin: 'unknown', billing_authority: 'shopify', authority_reason: 'shopify_app_store_install' }]

/** Partner API that answers "no subscription" and counts its calls. */
function partner() {
  let calls = 0
  const f = (async () => {
    calls++
    return { ok: true, status: 200, json: async () => ({ data: { activeSubscription: null } }) } as Response
  }) as unknown as typeof fetch
  return { f, calls: () => calls }
}

function db(role: string | null) {
  return new FakeAdmin({
    profiles: role === null ? [] : [{ id: 'user-1', role }],
    billing_governance: GOVERNANCE,
    shopify_connections: [connection()],
    shopify_billing_migrations: [],
  })
}

async function main() {
  console.log('1) the incident: admin, Shopify-governed, no Shopify plan')
  {
    const admin = db('admin')
    const p = partner()
    const r = await checkShopifyPublishEntitlement(admin as unknown as Admin, connection(), p.f)
    check('publishing is allowed', r.ok === true, JSON.stringify(r))
    check('…as an administrator, not as a Shopify plan', r.ok === true && r.governedBy === 'admin', JSON.stringify(r))
    check('…with NO Partner API call (same as app-home)', p.calls() === 0, `calls=${p.calls()}`)
    const row = admin.tables.shopify_connections[0] as Record<string, unknown>
    check('…and no billing-cache write', row.shopify_billing_last_error === null && row.shopify_subscription_status === 'none')
  }

  console.log('2) CONTROL: the same account shape without the admin role is still refused')
  {
    const p = partner()
    const r = await checkShopifyPublishEntitlement(db('user') as unknown as Admin, connection(), p.f)
    check('a merchant with no Shopify plan is refused with no_active_shopify_plan',
      r.ok === false && r.reason === 'no_active_shopify_plan' && r.detail === 'no_subscription', JSON.stringify(r))
    check('…after a live Partner API check', p.calls() === 1)
  }

  console.log('3) fails closed: an absent profile is NOT an admin')
  {
    const p = partner()
    const r = await checkShopifyPublishEntitlement(db(null) as unknown as Admin, connection(), p.f)
    check('no profile row → refused like any merchant', r.ok === false && r.reason === 'no_active_shopify_plan', JSON.stringify(r))
  }

  console.log(`\n${pass} passed, ${fail} failed`)
  if (fail > 0) process.exit(1)
}
main()
export {}
