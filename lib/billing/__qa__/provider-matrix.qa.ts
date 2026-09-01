/**
 * THE billing-provider matrix, evaluated with the real server-side decision
 * functions for each acceptance scenario A–F.
 *
 * Nothing here hard-codes an expected answer into the subject: each scenario
 * seeds rows, then calls the ACTUAL production functions —
 * resolveBillingAuthority, getActiveMigrationResult,
 * isShopifyBillingRequiredForUser (the PayPal gate),
 * assertContentGenerationAllowedForUser (the article-creation gate) and the
 * start-intent authority rule — and checks the answers against the matrix.
 *
 * It also writes /tmp/e2e/props.json: the exact props the billing UI receives
 * for each scenario, which the Chromium run then renders. That way the browser
 * screenshots show what THESE functions decided, not a hand-written mock.
 *
 * Run: npx tsx lib/billing/__qa__/provider-matrix.qa.ts
 */
import { mkdirSync, writeFileSync } from 'fs'
import { FakeAdmin } from '../../__qa__/_fake-admin'
import { resolveBillingAuthority } from '../governance'
import { getActiveMigrationResult } from '../../shopify/paypal-migration'
import { isShopifyBillingRequiredForUser } from '../../shopify/paypal-block'
import { assertContentGenerationAllowedForUser } from '../../content/entitlement-guard'

let pass = 0, fail = 0
function check(name: string, cond: boolean, detail?: string) {
  if (cond) { pass++; console.log(`  ✓ ${name}`) } else { fail++; console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`) }
}

const SHOP = 'acceptance-store.myshopify.com'
const fresh = () => new Date().toISOString()
const dbDown = () => ({ message: 'connection refused', code: '08006' })

type Scenario = {
  id: string
  title: string
  userId: string
  tables: Record<string, Record<string, unknown>[]>
  hooks?: Record<string, { select?: () => { message: string; code?: string } | null }>
}

const connection = (userId: string, over: Record<string, unknown> = {}) => ({
  id: `conn-${userId}`, user_id: userId, project_id: `proj-${userId}`, shop_domain: SHOP,
  connection_status: 'connected', archived_at: null, oauth_app_edition: 'public',
  granted_scopes: ['read_products', 'read_content', 'write_content'], shop_gid: 'gid://shopify/Shop/1',
  shopify_plan_handle: null, shopify_subscription_status: 'none',
  shopify_current_period_end: null, shopify_current_period_start: null,
  shopify_billing_verified_at: fresh(), updated_at: fresh(), ...over,
})
const gov = (userId: string, authority: string, origin: string) => ({
  user_id: userId, signup_origin: origin, billing_authority: authority, authority_reason: null, authority_changed_at: null,
})

/** Synthetic ids only — no production identifiers anywhere. */
const SCENARIOS: Scenario[] = [
  {
    id: 'A', title: 'Administrator', userId: 'acc-admin',
    tables: { profiles: [{ id: 'acc-admin', role: 'admin' }], billing_governance: [], shopify_connections: [], shopify_billing_migrations: [], subscriptions: [] },
  },
  {
    id: 'B', title: 'Website user, no Shopify connection', userId: 'acc-web',
    tables: { profiles: [{ id: 'acc-web', role: 'user' }], billing_governance: [gov('acc-web', 'website', 'website')], shopify_connections: [], shopify_billing_migrations: [], subscriptions: [{ id: 's', user_id: 'acc-web', status: 'trial', plan_code: null, created_at: fresh() }] },
  },
  {
    id: 'C', title: 'Website user WITH a Shopify publishing connection', userId: 'acc-web-shop',
    tables: { profiles: [{ id: 'acc-web-shop', role: 'user' }], billing_governance: [gov('acc-web-shop', 'website', 'website')], shopify_connections: [connection('acc-web-shop')], shopify_billing_migrations: [], subscriptions: [{ id: 's', user_id: 'acc-web-shop', status: 'trial', plan_code: null, created_at: fresh() }] },
  },
  {
    id: 'D', title: 'Direct App Store install, NO Shopify plan', userId: 'acc-app-noplan',
    tables: { profiles: [{ id: 'acc-app-noplan', role: 'user' }], billing_governance: [gov('acc-app-noplan', 'shopify', 'shopify_app_store')], shopify_connections: [connection('acc-app-noplan')], shopify_billing_migrations: [], subscriptions: [] },
  },
  {
    id: 'E', title: 'Direct App Store install, ACTIVE Shopify plan', userId: 'acc-app-plan',
    tables: { profiles: [{ id: 'acc-app-plan', role: 'user' }], billing_governance: [gov('acc-app-plan', 'shopify', 'shopify_app_store')], shopify_connections: [connection('acc-app-plan', { shopify_plan_handle: 'advanced', shopify_subscription_status: 'active', shopify_current_period_end: '2026-12-01T00:00:00Z' })], shopify_billing_migrations: [], subscriptions: [] },
  },
  {
    id: 'F', title: 'Website PayPal user in an ACTIVE PayPal→Shopify migration', userId: 'acc-migrating',
    tables: { profiles: [{ id: 'acc-migrating', role: 'user' }], billing_governance: [gov('acc-migrating', 'website', 'website')], shopify_connections: [connection('acc-migrating')], shopify_billing_migrations: [{ id: 'mig', user_id: 'acc-migrating', status: 'pending', paypal_subscription_id: 'I-SYNTHETIC' }], subscriptions: [{ id: 's', user_id: 'acc-migrating', status: 'active', plan_code: 'advanced', paypal_subscription_id: 'I-SYNTHETIC', created_at: fresh() }] },
  },
]

/** The start-intent authority rule, exactly as the route applies it. */
async function startIntentVerdict(admin: FakeAdmin, userId: string): Promise<string> {
  const authority = await resolveBillingAuthority(admin as never, userId)
  const migration = await getActiveMigrationResult(admin as never, userId)
  if (!authority.ok || !migration.ok) return 'entitlement_unavailable'
  if (authority.authority !== 'shopify' && !migration.migration) return 'shopify_billing_not_applicable'
  return 'allowed'
}

async function main() {
  console.log('Billing-provider matrix — real decisions per acceptance scenario\n')
  const props: Record<string, unknown> = {}

  for (const sc of SCENARIOS) {
    const admin = new FakeAdmin(JSON.parse(JSON.stringify(sc.tables)), sc.hooks ?? {})
    const authority = await resolveBillingAuthority(admin as never, sc.userId)
    const migration = await getActiveMigrationResult(admin as never, sc.userId)
    const paypalBlocked = await isShopifyBillingRequiredForUser(admin as never, sc.userId)
    const gate = await assertContentGenerationAllowedForUser(admin as never, sc.userId)
    const intent = await startIntentVerdict(admin, sc.userId)
    const isAdmin = (sc.tables.profiles?.[0] as { role?: string } | undefined)?.role === 'admin'
    const unavailable = !authority.ok || !migration.ok
    const shopifyBills = !unavailable && ((authority.ok && authority.authority === 'shopify') || !!migration.migration)

    console.log(`\n${sc.id}) ${sc.title}`)
    console.log(`   authority=${authority.ok ? authority.authority : 'UNAVAILABLE'} paypalBlocked=${paypalBlocked} startIntent=${intent} articleGate=${gate.allowed ? 'allowed' : gate.reason}`)

    props[sc.id] = {
      title: sc.title,
      billingProvider: unavailable ? 'unavailable' : (shopifyBills ? 'shopify' : 'website'),
      shopifyConnected: shopifyBills,
      billingStateUnavailable: unavailable,
      isAdmin,
      migrationStatus: migration.ok ? (migration.migration?.status ?? null) : null,
      paypalBlocked,
      startIntent: intent,
      articleGate: gate.allowed ? 'allowed' : gate.reason,
    }

    switch (sc.id) {
      case 'A':
        check('A: article creation is ALLOWED for an admin', gate.allowed === true)
        check('A: no billing_required is produced', !(gate.allowed === false && gate.reason === 'shopify_billing_required'))
        break
      case 'B':
        check('B: website authority', authority.ok && authority.authority === 'website')
        check('B: PayPal controls are NOT blocked', paypalBlocked === false)
        check('B: Shopify pricing is not applicable', intent === 'shopify_billing_not_applicable')
        check('B: article creation follows website entitlement (not Shopify-blocked)', gate.allowed === true)
        break
      case 'C':
        check('C: a connected store does NOT change authority', authority.ok && authority.authority === 'website')
        check('C: PayPal/website billing stays available', paypalBlocked === false)
        check('C: a direct start-intent request is DENIED', intent === 'shopify_billing_not_applicable')
        check('C: article creation is not blocked by Shopify billing', gate.allowed === true)
        check('C: the UI is told the website bills this account', (props.C as { billingProvider: string }).billingProvider === 'website')
        break
      case 'D':
        check('D: Shopify authority', authority.ok && authority.authority === 'shopify')
        check('D: PayPal controls are hidden/blocked', paypalBlocked === true)
        check('D: Shopify pricing is available', intent === 'allowed')
        check('D: article creation is denied with the Shopify billing reason',
          gate.allowed === false && gate.reason === 'shopify_billing_required')
        break
      case 'E':
        check('E: Shopify authority', authority.ok && authority.authority === 'shopify')
        check('E: PayPal is hidden/blocked', paypalBlocked === true)
        check('E: article creation succeeds', gate.allowed === true)
        check('E: the active plan is shown to the UI', (props.E as { billingProvider: string }).billingProvider === 'shopify')
        break
      case 'F':
        check('F: Shopify pricing can be opened during the migration', intent === 'allowed')
        check('F: a new PayPal checkout/change is BLOCKED', paypalBlocked === true)
        check('F: authority has NOT moved yet', authority.ok && authority.authority === 'website')
        check('F: the migration state is surfaced', (props.F as { migrationStatus: string | null }).migrationStatus === 'pending')
        break
    }
  }

  console.log('\nG) Governance UNAVAILABLE — mutations denied for BOTH providers')
  {
    const admin = new FakeAdmin(
      { profiles: [{ id: 'acc-broken', role: 'user' }], billing_governance: [gov('acc-broken', 'website', 'website')], shopify_connections: [], shopify_billing_migrations: [], subscriptions: [] },
      { billing_governance: { select: dbDown } },
    )
    const paypalBlocked = await isShopifyBillingRequiredForUser(admin as never, 'acc-broken')
    const intent = await startIntentVerdict(admin, 'acc-broken')
    const gate = await assertContentGenerationAllowedForUser(admin as never, 'acc-broken')
    check('G: PayPal mutations are denied', paypalBlocked === true)
    check('G: Shopify pricing is denied too', intent === 'entitlement_unavailable')
    check('G: the article gate reports entitlement_unavailable, never billing_required',
      gate.allowed === false && gate.reason === 'entitlement_unavailable')
    props.G = { title: 'Governance unavailable', billingProvider: 'unavailable', shopifyConnected: false, billingStateUnavailable: true, isAdmin: false, migrationStatus: null, paypalBlocked, startIntent: intent, articleGate: gate.allowed ? 'allowed' : gate.reason }
  }

  mkdirSync('/tmp/e2e', { recursive: true })
  writeFileSync('/tmp/e2e/props.json', JSON.stringify(props, null, 2))
  console.log('\nwrote /tmp/e2e/props.json for the Chromium run')

  console.log(`\n${pass} passed, ${fail} failed`)
  if (fail > 0) process.exitCode = 1
}

main()
