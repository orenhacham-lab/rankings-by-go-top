/**
 * Website vs Shopify billing authority.
 *
 * PRODUCTION BUG. lib/shopify/entitlement-resolver.ts decided who bills an
 * account by looking for a live `shopify_connections` row with
 * connection_status='connected'. A connection row is an INTEGRATION record —
 * a website customer who connects Shopify purely as a publishing destination
 * gets one too. Those users were switched onto Shopify billing by the act of
 * connecting a store and, having no Shopify App Pricing subscription, dropped
 * to the zero-entitlement `shopify_billing_required` state. This product is
 * website-first: almost every customer registers and pays on the website.
 *
 * FIX. Authority comes from the durable, server-controlled
 * `billing_governance` record (lib/billing/governance.ts), which changes ONLY
 * through a trusted transition:
 *   * a verified DIRECT Shopify App Store install, once linked to an account;
 *   * a CONFIRMED completed PayPal→Shopify migration.
 * Creating, disconnecting, revoking, refreshing or failing a connection never
 * changes it, and neither does anything a request can say.
 *
 * Run: npx tsx lib/billing/__qa__/billing-authority.qa.ts
 */
import { readFileSync } from 'fs'
import { join } from 'path'
import { FakeAdmin } from '../../__qa__/_fake-admin'
import {
  getBillingGovernance, isShopifyBillingAuthority,
  markShopifyAppStoreInstall, markMigrationCompleted, ensureWebsiteGovernance,
} from '../governance'
import { resolveShopifyGovernedEntitlement, isShopifyGovernedAndActive } from '../../shopify/entitlement-resolver'
import { assertContentGenerationAllowedForUser } from '../../content/entitlement-guard'

let pass = 0, fail = 0
function check(name: string, cond: boolean, detail?: string) {
  if (cond) { pass++; console.log(`  ✓ ${name}`) } else { fail++; console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`) }
}
const ROOT = join(__dirname, '..', '..', '..')
const read = (rel: string) => readFileSync(join(ROOT, rel), 'utf8')
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1')

const SHOP = 'publishing-store.myshopify.com'
const fresh = () => new Date().toISOString()

/** A perfectly healthy connected store used purely for publishing. */
const connection = (userId: string, over: Record<string, unknown> = {}) => ({
  id: `conn-${userId}`, user_id: userId, project_id: `proj-${userId}`, shop_domain: SHOP,
  connection_status: 'connected', archived_at: null,
  granted_scopes: ['read_products', 'read_content', 'write_content'],
  shop_gid: 'gid://shopify/Shop/1',
  shopify_plan_handle: null, shopify_subscription_status: null,
  shopify_current_period_end: null, shopify_current_period_start: null,
  shopify_billing_verified_at: null, updated_at: fresh(), ...over,
})

const governance = (userId: string, authority: string, origin = 'website') => ({
  user_id: userId, signup_origin: origin, billing_authority: authority,
  authority_reason: null, authority_changed_at: null,
})

async function main() {
  console.log('Billing authority — website vs Shopify\n')

  console.log('1) A website user who connects Shopify for PUBLISHING keeps website billing')
  {
    // Exactly the production shape: connected store, no Shopify plan, and the
    // account registered on the website.
    const admin = new FakeAdmin({
      profiles: [{ id: 'web-1', role: 'user' }],
      billing_governance: [governance('web-1', 'website')],
      shopify_connections: [connection('web-1')],
      shopify_billing_migrations: [], subscriptions: [],
    })
    check('1a: NEGATIVE CONTROL — the pre-fix rule called this account Shopify-governed', (() => {
      const rows = admin.tables.shopify_connections
      const preFix = rows.some((r) => r.user_id === 'web-1' && r.connection_status === 'connected' && !r.archived_at)
      return preFix === true
    })())
    check('1b: authority is website', (await getBillingGovernance(admin as never, 'web-1')).billingAuthority === 'website')
    check('1c: the Shopify resolver declines to govern the account',
      await resolveShopifyGovernedEntitlement(admin as never, 'web-1') === null)
    check('1d: so content generation is NOT blocked by Shopify billing',
      (await assertContentGenerationAllowedForUser(admin as never, 'web-1')).allowed === true)
    check('1e: the middleware hot path agrees',
      JSON.stringify(await isShopifyGovernedAndActive(admin as never, 'web-1')) === JSON.stringify({ governed: false, active: false }))
  }

  console.log('\n2) An ACTIVE PayPal customer who connects Shopify keeps PayPal billing')
  {
    const admin = new FakeAdmin({
      profiles: [{ id: 'pp-1', role: 'user' }],
      billing_governance: [governance('pp-1', 'website')],
      shopify_connections: [connection('pp-1')],
      subscriptions: [{ id: 's1', user_id: 'pp-1', status: 'active', plan_code: 'advanced', paypal_subscription_id: 'I-PAYPAL', created_at: fresh() }],
      shopify_billing_migrations: [],
    })
    check('2a: still website authority', (await isShopifyBillingAuthority(admin as never, 'pp-1')) === false)
    check('2b: Shopify never governs the account', await resolveShopifyGovernedEntitlement(admin as never, 'pp-1') === null)
    check('2c: generation is allowed', (await assertContentGenerationAllowedForUser(admin as never, 'pp-1')).allowed === true)
  }

  console.log('\n3) Inserting a connected Shopify row does NOT change authority')
  {
    const admin = new FakeAdmin({
      profiles: [{ id: 'web-2', role: 'user' }],
      billing_governance: [governance('web-2', 'website')],
      shopify_connections: [], shopify_billing_migrations: [], subscriptions: [],
    })
    const before = await getBillingGovernance(admin as never, 'web-2')
    admin.tables.shopify_connections.push(connection('web-2'))
    const after = await getBillingGovernance(admin as never, 'web-2')
    check('3a: authority is unchanged by the insert',
      before.billingAuthority === 'website' && after.billingAuthority === 'website')
    check('3b: and the governance row itself was not written',
      admin.tables.billing_governance.length === 1 && admin.tables.billing_governance[0].authority_reason === null)
  }

  console.log('\n4) A DIRECT Shopify App Store install becomes Shopify-governed')
  {
    const admin = new FakeAdmin({
      profiles: [{ id: 'shop-1', role: 'user' }],
      billing_governance: [], shopify_connections: [], shopify_billing_migrations: [], subscriptions: [],
    })
    await markShopifyAppStoreInstall(admin as never, 'shop-1')
    const g = await getBillingGovernance(admin as never, 'shop-1')
    check('4a: authority is shopify', g.billingAuthority === 'shopify')
    check('4b: provenance records the App Store origin', g.signupOrigin === 'shopify_app_store')
    check('4c: with a stable non-sensitive reason', g.authorityReason === 'shopify_app_store_install')

    // No plan yet → billing_required, which is the App-Store-review behaviour.
    admin.tables.shopify_connections.push(connection('shop-1'))
    const gate = await assertContentGenerationAllowedForUser(admin as never, 'shop-1')
    check('4d: with NO Shopify plan the account gets shopify_billing_required',
      gate.allowed === false && gate.reason === 'shopify_billing_required')

    // An ACTIVE Shopify trial/subscription is accepted (verified cache).
    for (const [label, handle] of [['trial/subscription on "regular"', 'regular'], ['subscription on "premium"', 'premium']] as [string, string][]) {
      const active = new FakeAdmin({
        profiles: [{ id: 'shop-2', role: 'user' }],
        billing_governance: [governance('shop-2', 'shopify', 'shopify_app_store')],
        shopify_connections: [connection('shop-2', {
          shopify_plan_handle: handle, shopify_subscription_status: 'active',
          shopify_billing_verified_at: fresh(), shopify_current_period_end: '2026-12-01T00:00:00Z',
        })],
        shopify_billing_migrations: [], subscriptions: [],
      })
      const r = await resolveShopifyGovernedEntitlement(active as never, 'shop-2')
      check(`4: an active Shopify ${label} is accepted`, r?.hasActiveSubscription === true && r?.planCode !== null)
      check(`4: and generation is allowed for it`,
        (await assertContentGenerationAllowedForUser(active as never, 'shop-2')).allowed === true)
    }
  }

  console.log('\n5) An App Store install by an existing PayPal customer defers to the migration')
  {
    const admin = new FakeAdmin({
      profiles: [{ id: 'pp-2', role: 'user' }],
      billing_governance: [governance('pp-2', 'website')],
      shopify_connections: [], shopify_billing_migrations: [],
      subscriptions: [{ id: 's2', user_id: 'pp-2', status: 'active', paypal_subscription_id: 'I-PAYPAL', created_at: fresh() }],
    })
    await markShopifyAppStoreInstall(admin as never, 'pp-2', { deferForPayPalMigration: true })
    const g = await getBillingGovernance(admin as never, 'pp-2')
    check('5a: authority stays website until the explicit migration completes', g.billingAuthority === 'website')
    check('5b: but the App Store provenance IS recorded', g.signupOrigin === 'shopify_app_store')
  }

  console.log('\n6) Only a COMPLETED migration switches authority')
  {
    for (const status of ['pending', 'shopify_confirmed', 'paypal_cancel_failed']) {
      const admin = new FakeAdmin({
        profiles: [{ id: 'mig-1', role: 'user' }],
        billing_governance: [governance('mig-1', 'website')],
        shopify_connections: [connection('mig-1')],
        shopify_billing_migrations: [{ id: 'm1', user_id: 'mig-1', status, paypal_subscription_id: 'I-PP' }],
        subscriptions: [],
      })
      check(`6: a '${status}' migration does NOT switch authority`,
        (await isShopifyBillingAuthority(admin as never, 'mig-1')) === false)
    }
    const done = new FakeAdmin({
      profiles: [{ id: 'mig-2', role: 'user' }],
      billing_governance: [governance('mig-2', 'website')],
      shopify_connections: [connection('mig-2', {
        shopify_plan_handle: 'advanced', shopify_subscription_status: 'active', shopify_billing_verified_at: fresh(),
      })],
      shopify_billing_migrations: [], subscriptions: [],
    })
    await markMigrationCompleted(done as never, 'mig-2')
    const g = await getBillingGovernance(done as never, 'mig-2')
    check('6d: a completed migration switches authority to shopify', g.billingAuthority === 'shopify')
    check('6e: with a stable reason', g.authorityReason === 'paypal_migration_completed')
    check('6f: and the website signup provenance is preserved', g.signupOrigin === 'website')
    check('6g: Shopify now governs the entitlement',
      (await resolveShopifyGovernedEntitlement(done as never, 'mig-2'))?.planCode === 'advanced')
  }

  console.log('\n7) Connection failure, disconnect and uninstall never move authority')
  {
    const start = governance('shop-3', 'shopify', 'shopify_app_store')
    for (const [label, over] of [
      ['a failed connection', { connection_status: 'failed', last_error: 'invalid_token' }],
      ['an app_uninstalled tombstone', { connection_status: 'failed', last_error: 'app_uninstalled', granted_scopes: [] }],
      ['an archived (superseded) row', { archived_at: fresh() }],
      ['a refresh-token failure', { connection_status: 'failed', last_error: 'refresh_token_invalid' }],
    ] as [string, Record<string, unknown>][]) {
      const admin = new FakeAdmin({
        profiles: [{ id: 'shop-3', role: 'user' }],
        billing_governance: [{ ...start }],
        shopify_connections: [connection('shop-3', over)],
        shopify_billing_migrations: [], subscriptions: [],
      })
      const g = await getBillingGovernance(admin as never, 'shop-3')
      check(`7: ${label} leaves authority on shopify`, g.billingAuthority === 'shopify')
      const gate = await assertContentGenerationAllowedForUser(admin as never, 'shop-3')
      check(`7: ${label} does NOT hand back a website trial`, gate.allowed === false)
    }
    // Disconnecting entirely (no row at all) also leaves authority alone.
    const gone = new FakeAdmin({
      profiles: [{ id: 'shop-3', role: 'user' }],
      billing_governance: [{ ...start }],
      shopify_connections: [], shopify_billing_migrations: [], subscriptions: [],
    })
    check('7e: a fully disconnected store leaves authority on shopify',
      (await getBillingGovernance(gone as never, 'shop-3')).billingAuthority === 'shopify')
  }

  console.log('\n8) Defaults and hardening')
  {
    const empty = new FakeAdmin({ billing_governance: [], profiles: [], shopify_connections: [], shopify_billing_migrations: [] })
    const g = await getBillingGovernance(empty as never, 'unknown-user')
    check('8a: an account with NO governance row reads as website (safe default)',
      g.billingAuthority === 'website' && g.signupOrigin === 'website')
    check('8b: an empty user id reads as website', (await getBillingGovernance(empty as never, '')).billingAuthority === 'website')
    const junk = new FakeAdmin({ billing_governance: [{ user_id: 'x', billing_authority: 'SHOPIFY', signup_origin: 'nonsense' }] })
    const gj = await getBillingGovernance(junk as never, 'x')
    check('8c: an unrecognised authority value reads as website, never shopify',
      gj.billingAuthority === 'website' && gj.signupOrigin === 'website')
    await ensureWebsiteGovernance(empty as never, 'new-user')
    check('8d: ensureWebsiteGovernance creates a website record', empty.tables.billing_governance.length === 1)
    const shopAcct = new FakeAdmin({ billing_governance: [governance('s', 'shopify', 'shopify_app_store')] })
    await ensureWebsiteGovernance(shopAcct as never, 's')
    check('8e: and NEVER downgrades a Shopify-governed account',
      shopAcct.tables.billing_governance[0].billing_authority === 'shopify')
  }

  console.log('\n9) Admin bypass and ownership are unchanged')
  {
    const admin = new FakeAdmin({
      profiles: [{ id: 'admin-1', role: 'admin' }],
      billing_governance: [governance('admin-1', 'shopify', 'shopify_app_store')],
      shopify_connections: [connection('admin-1')],
      shopify_billing_migrations: [], subscriptions: [],
    })
    check('9a: a Shopify-governed ADMIN is still allowed through',
      (await assertContentGenerationAllowedForUser(admin as never, 'admin-1')).allowed === true)
    const user = new FakeAdmin({
      profiles: [{ id: 'u-1', role: 'user' }],
      billing_governance: [governance('u-1', 'shopify', 'shopify_app_store')],
      shopify_connections: [connection('u-1')],
      shopify_billing_migrations: [], subscriptions: [],
    })
    check('9b: a non-admin on the same data is still denied',
      (await assertContentGenerationAllowedForUser(user as never, 'u-1')).allowed === false)
    const guard = strip(read('lib/content/entitlement-guard.ts'))
    check('9c: the gate still takes its user id from the caller, not from a request',
      /assertContentGenerationAllowedForUser\(admin: Admin, userId: string\)/.test(guard))
    const complete = strip(read('app/api/shopify/link/complete/route.ts'))
    check('9d: link/complete still verifies project ownership before anything is written',
      /project as \{ user_id: string \}\)\.user_id !== user\.id/.test(complete)
      // The CALL SITE, not the import at the top of the file.
      && complete.indexOf('forbidden') < complete.indexOf('claimShopForProject(admin, {'))
  }

  console.log('\n10) Source contracts — authority is never inferred or client-supplied')
  {
    const resolver = strip(read('lib/shopify/entitlement-resolver.ts'))
    const authIdx = resolver.indexOf('isShopifyBillingAuthority(admin, userId)')
    const connIdx = resolver.indexOf(".from('shopify_connections')")
    check('10a: authority is resolved BEFORE any connection lookup',
      authIdx !== -1 && connIdx !== -1 && authIdx < connIdx)
    check('10b: both resolver entry points are gated',
      (resolver.match(/isShopifyBillingAuthority\(admin, userId\)/g) || []).length === 2)
    const gov = strip(read('lib/billing/governance.ts'))
    check('10c: the governance module reads nothing from a request',
      !/request|headers|searchParams|cookie|body/i.test(gov))
    check('10d: only two functions can move authority to shopify',
      (gov.match(/billing_authority: 'shopify'/g) || []).length === 1
      && /nextAuthority: BillingAuthority = defer \? current\.billingAuthority : 'shopify'/.test(gov))
    const complete = strip(read('app/api/shopify/link/complete/route.ts'))
    check('10e: link/complete switches authority ONLY on server-stamped provenance',
      /pending\.install_origin === 'shopify_app_store'/.test(complete)
      && !/body\?\.\w*origin/i.test(complete))
    check('10f: the request body still supplies only projectId',
      /body\?\.projectId/.test(complete) && !/body\?\.(shop|origin|authority|install)/i.test(complete))
    const install = strip(read('app/api/shopify/embedded-install/route.ts'))
    check('10g: embedded-install stamps the provenance itself, from the verified flow',
      /install_origin: 'shopify_app_store'/.test(install) && !/install_origin[^\n]*request/i.test(install))
    const migration = strip(read('lib/shopify/paypal-migration.ts'))
    const confirmedIdx = migration.indexOf('if (!confirmed) {')
    const markIdx = migration.indexOf('markMigrationCompleted(admin, userId)')
    check('10h: authority moves only AFTER the completed write is confirmed',
      confirmedIdx !== -1 && markIdx !== -1 && confirmedIdx < markIdx)
    const cleanup = strip(read('lib/shopify/shop-cleanup.ts'))
    check('10i: webhook cleanup never touches billing governance',
      !/billing_governance|markShopifyAppStoreInstall|markMigrationCompleted/.test(cleanup))
    const ownership = strip(read('lib/shopify/connection-ownership.ts'))
    check('10j: the ownership RPC path never touches billing governance either',
      !/billing_governance/.test(ownership))
  }

  console.log(`\n${pass} passed, ${fail} failed`)
  if (fail > 0) process.exitCode = 1
}

main()
