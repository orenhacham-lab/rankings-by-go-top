/**
 * Website vs Shopify billing authority — including the FAIL-CLOSED rules.
 *
 * PRODUCTION BUG. Billing authority was inferred from the existence of a live
 * `shopify_connections` row, so a website customer connecting Shopify purely as
 * a publishing destination was switched onto Shopify billing and dropped to a
 * zero-entitlement state.
 *
 * REVIEW BLOCKERS this file now also covers:
 *   1. governance reads used to FAIL OPEN — a missing row, a query error and a
 *      malformed record all returned "website". A database failure could
 *      therefore hand a Shopify-governed merchant a website trial, or tell a
 *      paying customer to buy a plan. They are now four distinct outcomes.
 *   2. the generic ownership helper used to start a PayPal migration for ANY
 *      account with an active PayPal subscription, including a website customer
 *      merely connecting a store.
 *   3. the billing transitions ignored write errors and were not atomic.
 *   4. signup provenance was rewritten by a later App Store install, and the
 *      backfill invented 'website' for accounts whose origin was unknown.
 *
 * Every failure here is injected at the DATABASE level (FakeAdmin error hooks),
 * not asserted with a source regex.
 *
 * Run: npx tsx lib/billing/__qa__/billing-authority.qa.ts
 */
import { readFileSync } from 'fs'
import { join } from 'path'
import { FakeAdmin } from '../../__qa__/_fake-admin'
import { loadBillingGovernance, resolveBillingAuthority } from '../governance'
import { resolveShopifyGovernedEntitlement, isShopifyGovernedAndActive } from '../../shopify/entitlement-resolver'
import { assertContentGenerationAllowedForUser } from '../../content/entitlement-guard'
import { claimShopForProject } from '../../shopify/connection-ownership'
import { completeShopifyAppStoreLink } from '../../shopify/app-store-link'

let pass = 0, fail = 0
function check(name: string, cond: boolean, detail?: string) {
  if (cond) { pass++; console.log(`  ✓ ${name}`) } else { fail++; console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`) }
}
const ROOT = join(__dirname, '..', '..', '..')
const read = (rel: string) => readFileSync(join(ROOT, rel), 'utf8')
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1')

const SHOP = 'publishing-store.myshopify.com'
const fresh = () => new Date().toISOString()
const dbDown = () => ({ message: 'connection refused', code: '08006' })

const connection = (userId: string, over: Record<string, unknown> = {}) => ({
  id: `conn-${userId}`, user_id: userId, project_id: `proj-${userId}`, shop_domain: SHOP,
  connection_status: 'connected', archived_at: null,
  granted_scopes: ['read_products', 'read_content', 'write_content'],
  shop_gid: 'gid://shopify/Shop/1', oauth_app_edition: 'public',
  shopify_plan_handle: null, shopify_subscription_status: null,
  shopify_current_period_end: null, shopify_current_period_start: null,
  shopify_billing_verified_at: null, updated_at: fresh(), ...over,
})
const governance = (userId: string, authority: string, origin = 'website') => ({
  user_id: userId, signup_origin: origin, billing_authority: authority,
  authority_reason: null, authority_changed_at: null,
})
const pendingInstall = (over: Record<string, unknown> = {}) => ({
  token: 'pending-token', shop_domain: SHOP, shop_gid: 'gid://shopify/Shop/1',
  access_token_encrypted: 'enc(access)', refresh_token_encrypted: 'enc(refresh)',
  access_token_expires_at: new Date(Date.now() + 86400_000).toISOString(),
  refresh_token_expires_at: new Date(Date.now() + 30 * 86400_000).toISOString(),
  oauth_app_edition: 'public', install_origin: 'shopify_app_store',
  api_version: '2026-07', granted_scopes: ['read_products', 'read_content', 'write_content'],
  storefront_domain: null, consumed_at: null,
  expires_at: new Date(Date.now() + 1800_000).toISOString(), ...over,
})

async function main() {
  console.log('Billing authority — website vs Shopify, and failing closed\n')

  console.log('1) BLOCKER 1 — governance reads distinguish four outcomes')
  {
    const loaded = new FakeAdmin({ billing_governance: [governance('u', 'shopify', 'shopify_app_store')] })
    check('1a: a well-formed row is "loaded"', (await loadBillingGovernance(loaded as never, 'u')).status === 'loaded')

    const empty = new FakeAdmin({ billing_governance: [] })
    check('1b: a CONFIRMED absent row is "missing", not an error', (await loadBillingGovernance(empty as never, 'u')).status === 'missing')

    const broken = new FakeAdmin({ billing_governance: [] }, { billing_governance: { select: dbDown } })
    const brokenResult = await loadBillingGovernance(broken as never, 'u')
    check('1c: a QUERY FAILURE is "unavailable", never "missing"', brokenResult.status === 'unavailable')
    check('1d: with a short non-sensitive reason',
      brokenResult.status === 'unavailable' && brokenResult.reason.length > 0 && brokenResult.reason.length <= 120)

    for (const [label, row] of [
      ['an unrecognised billing_authority', { user_id: 'u', signup_origin: 'website', billing_authority: 'paypal' }],
      ['an unrecognised signup_origin', { user_id: 'u', signup_origin: 'facebook', billing_authority: 'website' }],
      ['a null authority', { user_id: 'u', signup_origin: 'website', billing_authority: null }],
    ] as [string, Record<string, unknown>][]) {
      const bad = new FakeAdmin({ billing_governance: [row] })
      check(`1: ${label} is "invalid", never silently read as website`,
        (await loadBillingGovernance(bad as never, 'u')).status === 'invalid')
    }

    const missingDecision = await resolveBillingAuthority(empty as never, 'u')
    check('1h: a confirmed-missing row resolves to the documented website default',
      missingDecision.ok === true && missingDecision.authority === 'website' && missingDecision.governance === null)
    const brokenDecision = await resolveBillingAuthority(broken as never, 'u')
    check('1j: a query failure REFUSES to decide', brokenDecision.ok === false && brokenDecision.reason === 'governance_unavailable')
  }

  console.log('\n2) BLOCKER 1 — a DB failure never falls through to website entitlement')
  {
    // A genuinely Shopify-governed account whose governance row cannot be read.
    const broken = new FakeAdmin(
      { billing_governance: [governance('shop-1', 'shopify', 'shopify_app_store')], shopify_connections: [connection('shop-1')],
        profiles: [{ id: 'shop-1', role: 'user' }], subscriptions: [], shopify_billing_migrations: [] },
      { billing_governance: { select: dbDown } },
    )
    const res = await resolveShopifyGovernedEntitlement(broken as never, 'shop-1')
    check('2a: the resolver reports "unavailable", never "not_governed"', res.kind === 'unavailable')
    const gate = await assertContentGenerationAllowedForUser(broken as never, 'shop-1')
    check('2b: content generation is refused', gate.allowed === false)
    check('2c: with entitlement_unavailable — NOT billing_required',
      gate.allowed === false && gate.reason === 'entitlement_unavailable')
    const hot = await isShopifyGovernedAndActive(broken as never, 'shop-1')
    check('2d: the middleware hot path says governed-but-inactive, never governed:false',
      hot.governed === true && hot.active === false && hot.unavailable === true)

    // An INVALID record fails closed the same way.
    const invalid = new FakeAdmin({
      billing_governance: [{ user_id: 'x-1', signup_origin: 'website', billing_authority: 'nonsense' }],
      shopify_connections: [connection('x-1')], profiles: [{ id: 'x-1', role: 'user' }],
      subscriptions: [], shopify_billing_migrations: [],
    })
    const invalidGate = await assertContentGenerationAllowedForUser(invalid as never, 'x-1')
    check('2e: an invalid governance record also yields entitlement_unavailable',
      invalidGate.allowed === false && invalidGate.reason === 'entitlement_unavailable')

    // The CONNECTION lookup failing must not silently mean "no connection".
    const connBroken = new FakeAdmin(
      { billing_governance: [governance('shop-2', 'shopify', 'shopify_app_store')], shopify_connections: [connection('shop-2')],
        profiles: [{ id: 'shop-2', role: 'user' }], subscriptions: [], shopify_billing_migrations: [] },
      { shopify_connections: { select: dbDown } },
    )
    check('2f: a connection-query failure does not fall back to website',
      (await resolveShopifyGovernedEntitlement(connBroken as never, 'shop-2')).kind === 'unavailable')

    // The MIGRATION lookup failing must not read as "no migration".
    const migBroken = new FakeAdmin(
      { billing_governance: [governance('shop-3', 'shopify', 'shopify_app_store')],
        shopify_connections: [connection('shop-3', { shopify_plan_handle: 'premium', shopify_subscription_status: 'active', shopify_billing_verified_at: fresh() })],
        profiles: [{ id: 'shop-3', role: 'user' }], subscriptions: [], shopify_billing_migrations: [] },
      { shopify_billing_migrations: { select: dbDown } },
    )
    const migRes = await resolveShopifyGovernedEntitlement(migBroken as never, 'shop-3')
    check('2g: a migration-query failure cannot grant Shopify entitlement', migRes.kind === 'unavailable')

    // ADMIN still wins, before any of this.
    const adminBroken = new FakeAdmin(
      { billing_governance: [], shopify_connections: [connection('admin-1')],
        profiles: [{ id: 'admin-1', role: 'admin' }], subscriptions: [], shopify_billing_migrations: [] },
      { billing_governance: { select: dbDown }, shopify_connections: { select: dbDown } },
    )
    check('2h: an ADMIN is still allowed through, before governance is consulted',
      (await assertContentGenerationAllowedForUser(adminBroken as never, 'admin-1')).allowed === true)
  }

  console.log('\n3) A Shopify-authority account with no usable connection stays governed')
  {
    for (const [label, connections] of [
      ['no connection row at all', []],
      ['a failed connection', [connection('shop-4', { connection_status: 'failed', last_error: 'invalid_token' })]],
      ['an uninstall tombstone', [connection('shop-4', { connection_status: 'failed', last_error: 'app_uninstalled', granted_scopes: [] })]],
      ['an archived row', [connection('shop-4', { archived_at: fresh() })]],
    ] as [string, Record<string, unknown>[]][]) {
      const admin = new FakeAdmin({
        billing_governance: [governance('shop-4', 'shopify', 'shopify_app_store')],
        shopify_connections: connections, profiles: [{ id: 'shop-4', role: 'user' }],
        subscriptions: [], shopify_billing_migrations: [],
      })
      const r = await resolveShopifyGovernedEntitlement(admin as never, 'shop-4')
      check(`3: ${label} — still Shopify-governed with zero entitlement`,
        r.kind === 'governed' && r.entitlement.planCode === null)
      const hot = await isShopifyGovernedAndActive(admin as never, 'shop-4')
      check(`3: ${label} — the hot path returns governed:true, active:false`,
        hot.governed === true && hot.active === false)
      const gate = await assertContentGenerationAllowedForUser(admin as never, 'shop-4')
      check(`3: ${label} — no website trial is handed back`,
        gate.allowed === false && gate.reason === 'shopify_billing_required')
    }
  }

  console.log('\n4) BLOCKER 2 — the generic ownership claim never starts a migration')
  {
    for (const [label, subscriptions] of [
      ['an ACTIVE PayPal subscriber', [{ id: 's1', user_id: 'web-1', status: 'active', paypal_subscription_id: 'I-PAYPAL', created_at: fresh() }]],
      ['a website TRIAL user', [{ id: 's2', user_id: 'web-1', status: 'trial', paypal_subscription_id: null, created_at: fresh() }]],
    ] as [string, Record<string, unknown>[]][]) {
      const admin = new FakeAdmin({
        billing_governance: [governance('web-1', 'website')], shopify_connections: [],
        shopify_billing_migrations: [], subscriptions, projects: [],
      })
      const claim = await claimShopForProject(admin as never, {
        userId: 'web-1', projectId: 'p1', shopDomain: SHOP, shopGid: 'gid://shopify/Shop/1',
        accessTokenEncrypted: 'enc(a)', refreshTokenEncrypted: 'enc(r)',
        accessTokenExpiresAt: fresh(), refreshTokenExpiresAt: fresh(),
        apiVersion: '2026-07', grantedScopes: ['read_products'], storefrontDomain: null,
        connectionStatus: 'connected', lastError: null, proof: 'oauth_callback_verified',
      })
      check(`4: the website connector links for ${label}`, claim.ok === true)
      check(`4: ${label} → NO migration row is created`, admin.tables.shopify_billing_migrations.length === 0)
      const decision = await resolveBillingAuthority(admin as never, 'web-1')
      check(`4: ${label} → website authority is retained`,
        decision.ok === true && decision.authority === 'website')
      check(`4: ${label} → the governance row is untouched`,
        admin.tables.billing_governance.length === 1 && admin.tables.billing_governance[0].authority_reason === null)
    }
    const ownership = strip(read('lib/shopify/connection-ownership.ts'))
    check('4i: the ownership helper no longer imports the migration initiator at all',
      !/initiateMigrationIfPayPalSubscriber/.test(ownership))
  }

  console.log('\n5) BLOCKER 2/3 — only a trusted App Store install moves billing, atomically')
  {
    // (a) App Store install, no PayPal → Shopify authority.
    const a = new FakeAdmin({
      billing_governance: [], shopify_connections: [], shopify_billing_migrations: [],
      subscriptions: [], shopify_pending_installs: [pendingInstall()], projects: [],
    })
    const ra = await completeShopifyAppStoreLink(a as never, {
      pendingToken: 'pending-token', userId: 'u-app', projectId: 'p-app', connectionStatus: 'connected', lastError: null,
    })
    check('5a: the link commits', ra.ok === true)
    check('5b: authority becomes shopify', ra.ok && ra.billingAuthority === 'shopify')
    check('5c: no migration for a non-PayPal account', ra.ok && ra.migrationCreated === false)
    check('5d: the one-time pending install was consumed', a.tables.shopify_pending_installs[0].consumed_at !== null)
    check('5e: replaying the same token does nothing',
      (await completeShopifyAppStoreLink(a as never, { pendingToken: 'pending-token', userId: 'u-app', projectId: 'p-app', connectionStatus: 'connected', lastError: null })).ok === false)

    // (b) App Store install by an EXISTING PayPal subscriber → deferred.
    const b = new FakeAdmin({
      billing_governance: [governance('u-pp', 'website')], shopify_connections: [], shopify_billing_migrations: [],
      subscriptions: [{ id: 's', user_id: 'u-pp', status: 'active', paypal_subscription_id: 'I-PP', created_at: fresh() }],
      shopify_pending_installs: [pendingInstall({ shop_domain: 'pp.myshopify.com', shop_gid: 'gid://shopify/Shop/2' })], projects: [],
    })
    const rb = await completeShopifyAppStoreLink(b as never, {
      pendingToken: 'pending-token', userId: 'u-pp', projectId: 'p-pp', connectionStatus: 'connected', lastError: null,
    })
    check('5f: authority STAYS website until the migration completes', rb.ok && rb.billingAuthority === 'website')
    check('5g: a migration row IS created for the App Store path', rb.ok && rb.migrationCreated === true)
    check('5h: exactly one, in status pending',
      b.tables.shopify_billing_migrations.filter((m) => m.status === 'pending').length === 1)

    // (c) website-connector provenance → billing untouched.
    const c = new FakeAdmin({
      billing_governance: [], shopify_connections: [], shopify_billing_migrations: [], subscriptions: [],
      shopify_pending_installs: [pendingInstall({ install_origin: 'website_connector', shop_domain: 'conn.myshopify.com', shop_gid: 'gid://shopify/Shop/3' })],
      projects: [],
    })
    const rc = await completeShopifyAppStoreLink(c as never, {
      pendingToken: 'pending-token', userId: 'u-conn', projectId: 'p-conn', connectionStatus: 'connected', lastError: null,
    })
    check('5i: website-connector provenance links without touching billing', rc.ok && rc.billingAuthority === null)
    check('5j: and writes no governance row', c.tables.billing_governance.length === 0)

    // (d) ATOMICITY: an RPC failure must report failure, never success.
    const d = new FakeAdmin({
      billing_governance: [], shopify_connections: [], shopify_billing_migrations: [], subscriptions: [],
      shopify_pending_installs: [pendingInstall()], projects: [],
    })
    d.rpcHooks['complete_shopify_app_store_link'] = () => ({ message: 'deadlock detected', code: '40P01' })
    const rd = await completeShopifyAppStoreLink(d as never, {
      pendingToken: 'pending-token', userId: 'u-x', projectId: 'p-x', connectionStatus: 'connected', lastError: null,
    })
    check('5k: a transaction failure is reported, never reported as success', rd.ok === false && rd.reason === 'save_failed')
    check('5l: and nothing was written — the token is still unconsumed',
      d.tables.shopify_pending_installs[0].consumed_at === null
      && d.tables.billing_governance.length === 0 && d.tables.shopify_connections.length === 0)

    // (e) a blocked ownership claim rolls the whole thing back.
    const e = new FakeAdmin({
      billing_governance: [], shopify_billing_migrations: [], subscriptions: [], projects: [],
      shopify_connections: [connection('someone-else', { shop_domain: 'taken.myshopify.com', project_id: 'other-project', shop_gid: 'gid://shopify/Shop/9' })],
      shopify_pending_installs: [pendingInstall({ shop_domain: 'taken.myshopify.com', shop_gid: 'gid://shopify/Shop/9' })],
    })
    const re_ = await completeShopifyAppStoreLink(e as never, {
      pendingToken: 'pending-token', userId: 'u-thief', projectId: 'p-thief', connectionStatus: 'connected', lastError: null,
    })
    check('5m: another project’s CONNECTED shop cannot be taken', re_.ok === false && re_.reason === 'shop_already_connected')
    check('5n: and the one-time token was NOT consumed (all-or-none)',
      e.tables.shopify_pending_installs[0].consumed_at === null)
    check('5o: nor was any governance written', e.tables.billing_governance.length === 0)
  }

  console.log('\n6) BLOCKER 4 — provenance is preserved, never rewritten or invented')
  {
    const admin = new FakeAdmin({
      billing_governance: [governance('u-web', 'website')], shopify_connections: [], shopify_billing_migrations: [],
      subscriptions: [], shopify_pending_installs: [pendingInstall()], projects: [],
    })
    const r = await completeShopifyAppStoreLink(admin as never, {
      pendingToken: 'pending-token', userId: 'u-web', projectId: 'p-web', connectionStatus: 'connected', lastError: null,
    })
    check('6a: an existing WEBSITE account keeps signup_origin website after an App Store install',
      admin.tables.billing_governance[0].signup_origin === 'website')
    check('6b: while its billing authority DOES become shopify', r.ok && r.billingAuthority === 'shopify')

    const unknown = new FakeAdmin({
      billing_governance: [], shopify_connections: [], shopify_billing_migrations: [], subscriptions: [],
      shopify_pending_installs: [pendingInstall({ shop_domain: 'u2.myshopify.com', shop_gid: 'gid://shopify/Shop/4' })], projects: [],
    })
    await completeShopifyAppStoreLink(unknown as never, {
      pendingToken: 'pending-token', userId: 'u-unknown', projectId: 'p-unknown', connectionStatus: 'connected', lastError: null,
    })
    check('6c: when the server cannot PROVE how the account began, origin is unknown — never guessed',
      unknown.tables.billing_governance[0].signup_origin === 'unknown')
    const unknownOrigin = await resolveBillingAuthority(
      new FakeAdmin({ billing_governance: [governance('x', 'website', 'unknown')] }) as never, 'x')
    check('6d: an unknown origin does NOT by itself imply Shopify authority',
      unknownOrigin.ok === true && unknownOrigin.authority === 'website')

    const migration = strip(read('supabase/migrations/20260901000000_billing_governance.sql'))
    check('6e: the backfill stores unknown provenance, not an invented "website"',
      /-- recorded how they began\. 'unknown' says exactly that/.test(read('supabase/migrations/20260901000000_billing_governance.sql'))
      && /CHECK \(signup_origin IN \('website', 'shopify_app_store', 'unknown'\)\)/.test(migration))
    const link = read('supabase/migrations/20260901020000_shopify_atomic_billing_transitions.sql')
    check('6f: the atomic link never updates signup_origin on conflict',
      /-- signup_origin deliberately NOT updated: provenance is immutable\./.test(link))
  }

  console.log('\n7) Source contracts — authority is never inferred or client-supplied')
  {
    const resolver = strip(read('lib/shopify/entitlement-resolver.ts'))
    const authIdx = resolver.indexOf('resolveBillingAuthority(admin, userId)')
    const connIdx = resolver.indexOf(".from('shopify_connections')")
    check('7a: authority is resolved BEFORE any connection lookup', authIdx !== -1 && connIdx !== -1 && authIdx < connIdx)
    check('7b: both resolver entry points are gated',
      (resolver.match(/resolveBillingAuthority\(admin, userId\)/g) || []).length === 2)
    const gov = strip(read('lib/billing/governance.ts'))
    check('7c: the governance module reads nothing from a request',
      !/request|headers|searchParams|cookie|body/i.test(gov))
    check('7d: it no longer contains a fire-and-forget write at all',
      !/\.upsert\(/.test(gov) && !/\.update\(/.test(gov))
    const complete = strip(read('app/api/shopify/link/complete/route.ts'))
    check('7e: link/complete performs ONE atomic transition',
      /completeShopifyAppStoreLink\(admin, \{/.test(complete)
      && !/claimShopForProject/.test(complete) && !/consumePendingInstall/.test(complete))
    check('7f: and returns an error whenever it did not commit',
      /if \(!linked\.ok\) \{[\s\S]{0,400}return clearCookie\(NextResponse\.json\(\{ error: linked\.reason \}/.test(complete))
    check('7g: the request body still supplies only projectId',
      /body\?\.projectId/.test(complete) && !/body\?\.(shop|origin|authority|install)/i.test(complete))
    const cleanup = strip(read('lib/shopify/shop-cleanup.ts'))
    check('7h: webhook cleanup never touches billing governance',
      !/billing_governance|complete_shopify_app_store_link/.test(cleanup))
  }

  console.log(`\n${pass} passed, ${fail} failed`)
  if (fail > 0) process.exitCode = 1
}

main()
