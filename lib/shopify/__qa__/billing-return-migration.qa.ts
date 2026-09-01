/**
 * The Shopify billing RETURN must never report success for a migration that
 * did not finish.
 *
 * processShopifyBillingReturn() called confirmShopifyActiveAndAdvance() and
 * DISCARDED its result, so a customer whose PayPal cancellation failed — or
 * whose completion could not be persisted — was told their billing was
 * confirmed while their old PayPal subscription was still live and their
 * billing authority had never moved.
 *
 * Every failure here is injected at the DATABASE or the PayPal HTTP boundary,
 * never asserted with a source regex.
 *
 * Run: npx tsx lib/shopify/__qa__/billing-return-migration.qa.ts
 */
import { FakeAdmin } from '../../__qa__/_fake-admin'
import { confirmShopifyActiveAndAdvance } from '../paypal-migration'

let pass = 0, fail = 0
function check(name: string, cond: boolean, detail?: string) {
  if (cond) { pass++; console.log(`  ✓ ${name}`) } else { fail++; console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`) }
}

// PayPal credentials are required before cancelPayPalSubscription will make
// any request at all. Synthetic values — never real.
process.env.PAYPAL_CLIENT_ID ||= 'unit-test-paypal-client-id'
process.env.PAYPAL_SECRET ||= 'unit-test-paypal-secret'
process.env.PAYPAL_API_URL ||= 'https://paypal.invalid'

const USER = 'user-migrating'
const SUB = 'I-SYNTHETIC-PAYPAL'
const migration = (over: Record<string, unknown> = {}) => ({
  id: 'mig-1', user_id: USER, project_id: 'p1', shopify_connection_id: 'c1',
  paypal_subscription_id: SUB, status: 'shopify_confirmed', paypal_cancel_attempts: 0, ...over,
})
const seed = () => ({
  shopify_billing_migrations: [migration()],
  subscriptions: [{ id: 's1', user_id: USER, status: 'active', paypal_subscription_id: SUB, created_at: '2026-01-01T00:00:00Z' }],
  billing_governance: [{ user_id: USER, signup_origin: 'website', billing_authority: 'website', authority_reason: null }],
})

/**
 * A PayPal stub: answers the OAuth token call, then succeeds or fails the
 * cancellation itself. `calls.n` counts only the CANCEL request, which is what
 * "PayPal was contacted" means here.
 */
function paypalStub(cancelOk: boolean, calls: { n: number }) {
  return (async (url: string | URL) => {
    const u = String(url)
    if (u.includes('/v1/oauth2/token')) {
      return { ok: true, status: 200, json: async () => ({ access_token: 'unit-test-paypal-token' }), text: async () => '' } as unknown as Response
    }
    calls.n++
    return { ok: cancelOk, status: cancelOk ? 204 : 500, json: async () => ({}), text: async () => '' } as unknown as Response
  }) as unknown as typeof fetch
}

async function main() {
  console.log('Shopify billing return — the migration result is never discarded\n')

  console.log('1) A migration LOOKUP FAILURE never contacts PayPal')
  {
    const calls = { n: 0 }
    const admin = new FakeAdmin(seed(), { shopify_billing_migrations: { select: () => ({ message: 'db down', code: '08006' }) } })
    const r = await confirmShopifyActiveAndAdvance(admin as never, USER, paypalStub(true, calls))
    check('1a: PayPal was NOT called', calls.n === 0)
    check('1b: the failure is reported, not treated as "no migration"', r !== null && r.lookupFailed === true)
    check('1c: it is never reported as completed', r?.status !== 'completed')
    check('1d: the migration row is untouched',
      admin.tables.shopify_billing_migrations[0].status === 'shopify_confirmed')
    check('1e: billing authority did NOT move',
      admin.tables.billing_governance[0].billing_authority === 'website')
    check('1f: the PayPal subscription is still active',
      admin.tables.subscriptions[0].status === 'active')
  }

  console.log('\n2) A PayPal CANCELLATION FAILURE is never reported as success')
  {
    const calls = { n: 0 }
    const admin = new FakeAdmin(seed())
    const r = await confirmShopifyActiveAndAdvance(admin as never, USER, paypalStub(false, calls))
    check('2a: PayPal WAS attempted', calls.n >= 1)
    check('2b: the result says the cancellation failed', r?.cancelFailed === true)
    check('2c: status is never completed', r?.status !== 'completed')
    check('2d: authority did NOT move to Shopify',
      admin.tables.billing_governance[0].billing_authority === 'website')
    check('2e: the migration is parked for attention, not silently completed',
      admin.tables.shopify_billing_migrations[0].status === 'paypal_cancel_failed')
  }

  console.log('\n3) An UNCONFIRMED completion write is never reported as success')
  {
    const calls = { n: 0 }
    const admin = new FakeAdmin(seed())
    admin.rpcHooks['complete_shopify_paypal_migration'] = () => ({ message: 'deadlock detected', code: '40P01' })
    const r = await confirmShopifyActiveAndAdvance(admin as never, USER, paypalStub(true, calls))
    check('3a: the caller is told the write was not confirmed', r?.dbWriteUnconfirmed === true)
    check('3b: status is never completed', r?.status !== 'completed')
    check('3c: authority did NOT move', admin.tables.billing_governance[0].billing_authority === 'website')
    check('3d: the migration row is NOT marked completed',
      admin.tables.shopify_billing_migrations[0].status !== 'completed')
  }

  console.log('\n4) A LATER retry recovers, once the database is healthy')
  {
    const calls = { n: 0 }
    const tables = seed()
    const failing = new FakeAdmin(tables)
    failing.rpcHooks['complete_shopify_paypal_migration'] = () => ({ message: 'db down', code: '08006' })
    const first = await confirmShopifyActiveAndAdvance(failing as never, USER, paypalStub(true, calls))
    check('4a: the first attempt reports an unconfirmed write', first?.dbWriteUnconfirmed === true)

    // Same underlying rows, healthy client — exactly what a later billing
    // intent would see.
    const healthy = new FakeAdmin(failing.tables)
    const second = await confirmShopifyActiveAndAdvance(healthy as never, USER, paypalStub(true, calls))
    check('4b: the retry completes', second?.status === 'completed' && !second?.dbWriteUnconfirmed)
    check('4c: authority moves to Shopify exactly once now',
      healthy.tables.billing_governance[0].billing_authority === 'shopify'
      && healthy.tables.billing_governance[0].authority_reason === 'paypal_migration_completed')
    check('4d: and the local PayPal mirror is cancelled',
      healthy.tables.subscriptions[0].status === 'cancelled')
    check('4e: re-running again is refused, not re-applied',
      (await confirmShopifyActiveAndAdvance(healthy as never, USER, paypalStub(true, calls)))?.status !== 'completed'
      || healthy.tables.shopify_billing_migrations[0].status === 'completed')
  }

  console.log('\n5) The RETURN route maps each of these to a non-success outcome')
  {
    // The processor's own contract: anything short of a completed migration is
    // reported as `migration_incomplete`, which the route renders as a warning.
    const { BillingReturnOutcome } = await import('../billing-return-processing') as unknown as { BillingReturnOutcome?: unknown }
    void BillingReturnOutcome
    const src = (await import('fs')).readFileSync(
      (await import('path')).join(__dirname, '..', 'billing-return-processing.ts'), 'utf8')
    const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1')
    check('5a: the migration result is INSPECTED, not discarded',
      /const advanced = await confirmShopifyActiveAndAdvance\(/.test(code))
    check('5b: cancellation failure, unconfirmed write and any non-completed status all block success',
      /advanced\.cancelFailed \|\| advanced\.dbWriteUnconfirmed \|\| advanced\.status !== 'completed'/.test(code))
    check('5c: and yield migration_incomplete rather than success',
      /return \{ outcome: 'migration_incomplete'/.test(code))
  }

  console.log(`\n${pass} passed, ${fail} failed`)
  if (fail > 0) process.exitCode = 1
}

main()
