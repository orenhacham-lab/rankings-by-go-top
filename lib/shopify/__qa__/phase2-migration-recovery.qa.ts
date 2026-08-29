/**
 * Phase 2 (billing-intent failure recovery fix) — proves what happens when
 * the DB write that records a completed PayPal→Shopify migration fails
 * AFTER the real-world PayPal cancellation has already succeeded: the
 * migration row is never falsely left/reported 'completed' unless the write
 * is actually confirmed, a retry (bounded, in-call) can recover it, a later
 * call (simulating "create a new billing intent and try again") can also
 * recover it, and once truly completed, further calls are a safe no-op —
 * never a double-cancel, never a double-transition. Run:
 *   npx tsx lib/shopify/__qa__/phase2-migration-recovery.qa.ts
 */
import type { createAdminClient } from '@/lib/supabase/admin'
import { FakeAdmin, type ErrorHooks } from '../../__qa__/_fake-admin'
import { confirmShopifyActiveAndAdvance } from '../paypal-migration'

type Admin = ReturnType<typeof createAdminClient>

let pass = 0, fail = 0
function check(name: string, cond: boolean, detail?: string) {
  if (cond) { pass++; console.log(`  ✓ ${name}`) } else { fail++; console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`) }
}

process.env.PAYPAL_CLIENT_ID = 'test-paypal-client-id'
process.env.PAYPAL_SECRET = 'test-paypal-secret'

let cancelCallCount = 0
function fakePayPalFetch(): typeof fetch {
  return (async (url: string) => {
    if (String(url).includes('/v1/oauth2/token')) return { ok: true, status: 200, json: async () => ({ access_token: 'fake-token' }) } as Response
    cancelCallCount++
    return { ok: true, status: 204, json: async () => ({}) } as Response
  }) as unknown as typeof fetch
}

function baseMigration(overrides: Record<string, unknown> = {}) {
  return { id: 'm1', user_id: 'u1', project_id: 'p1', shopify_connection_id: 'c1', paypal_subscription_id: 'SUB-1', status: 'pending', paypal_cancel_attempts: 0, ...overrides }
}

async function main() {
  console.log('Phase 2 — billing-intent/migration failure-recovery QA\n')
  cancelCallCount = 0

  console.log('1) PayPal cancel succeeds, but the "completed" DB write fails EVERY retry attempt — never falsely recorded as completed')
  {
    let updateAttempts = 0
    const hooks: Record<string, ErrorHooks> = {
      shopify_billing_migrations: { update: () => { updateAttempts++; return { code: '500', message: 'connection reset' } } },
    }
    const admin = new FakeAdmin({ shopify_billing_migrations: [baseMigration({ status: 'shopify_confirmed' })], subscriptions: [{ user_id: 'u1', status: 'active', paypal_subscription_id: 'SUB-1' }] }, hooks)
    const result = await confirmShopifyActiveAndAdvance(admin as unknown as Admin, 'u1', fakePayPalFetch())
    check('result reports dbWriteUnconfirmed:true', result?.dbWriteUnconfirmed === true)
    check('result reports cancelFailed:false (PayPal itself DID succeed)', result?.cancelFailed === false)
    check('result status is the LAST CONFIRMED status, never "completed"', result?.status === 'shopify_confirmed' && (result?.status as string) !== 'completed')
    check('the DB row itself is still non-terminal (never silently marked completed)', (admin.tables.shopify_billing_migrations[0] as Record<string, unknown>).status === 'shopify_confirmed')
    check('exactly 3 write attempts were made (bounded retry, not silently given up on the first failure, not unbounded)', updateAttempts === 3)
    check('the subscriptions row was NOT touched (no completion mirror without a confirmed migration write)', (admin.tables.subscriptions[0] as Record<string, unknown>).status === 'active')
  }

  console.log('\n2) the write fails once, then succeeds on retry — recovers WITHIN the same call')
  {
    let attempts = 0
    const hooks: Record<string, ErrorHooks> = {
      shopify_billing_migrations: { update: () => { attempts++; return attempts < 2 ? { code: '500', message: 'transient' } : null } },
    }
    const admin = new FakeAdmin({ shopify_billing_migrations: [baseMigration({ status: 'shopify_confirmed' })], subscriptions: [{ user_id: 'u1', status: 'active', paypal_subscription_id: 'SUB-1' }] }, hooks)
    const result = await confirmShopifyActiveAndAdvance(admin as unknown as Admin, 'u1', fakePayPalFetch())
    check('result status completed (in-call retry recovered it)', result?.status === 'completed' && !result?.dbWriteUnconfirmed)
    check('the DB row reflects completed', (admin.tables.shopify_billing_migrations[0] as Record<string, unknown>).status === 'completed')
  }

  console.log('\n3) the merchant safely recovers via a LATER call (new billing intent) after a permanent write failure')
  {
    const failingHooks: Record<string, ErrorHooks> = {
      shopify_billing_migrations: { update: () => ({ code: '500', message: 'db down' }) },
    }
    const admin = new FakeAdmin({ shopify_billing_migrations: [baseMigration({ status: 'shopify_confirmed' })], subscriptions: [{ user_id: 'u1', status: 'active', paypal_subscription_id: 'SUB-1' }] }, failingHooks)
    const first = await confirmShopifyActiveAndAdvance(admin as unknown as Admin, 'u1', fakePayPalFetch())
    check('first attempt: dbWriteUnconfirmed, row still non-terminal', first?.dbWriteUnconfirmed === true && (admin.tables.shopify_billing_migrations[0] as Record<string, unknown>).status !== 'completed')

    // The merchant creates a new billing intent and returns again — a fresh
    // admin client (DB is healthy now), but the SAME underlying tables (the
    // real Postgres row would likewise just still be sitting there
    // non-terminal, waiting for a healthy write).
    const recoveredAdmin = new FakeAdmin(admin.tables)
    const callsBefore = cancelCallCount
    const second = await confirmShopifyActiveAndAdvance(recoveredAdmin as unknown as Admin, 'u1', fakePayPalFetch())
    check('second attempt (recovery) reaches completed', second?.status === 'completed' && !second?.dbWriteUnconfirmed)
    check('the DB row now correctly reflects completed', (admin.tables.shopify_billing_migrations[0] as Record<string, unknown>).status === 'completed')
    check('re-cancelling an already-cancelled PayPal subscription was attempted again but is harmless/idempotent (no error, no crash)', cancelCallCount === callsBefore + 1)
  }

  console.log('\n4) once genuinely completed, a THIRD callback is a pure no-op — no double-cancel, no double-transition')
  {
    const admin = new FakeAdmin({ shopify_billing_migrations: [baseMigration({ status: 'completed' })], subscriptions: [{ user_id: 'u1', status: 'cancelled', paypal_subscription_id: 'SUB-1' }] })
    const callsBefore = cancelCallCount
    const result = await confirmShopifyActiveAndAdvance(admin as unknown as Admin, 'u1', fakePayPalFetch())
    check('returns null — "completed" is excluded from active migrations, nothing to advance', result === null)
    check('PayPal cancel endpoint was NEVER called again for an already-completed migration', cancelCallCount === callsBefore)
    check('the migration row is untouched', (admin.tables.shopify_billing_migrations[0] as Record<string, unknown>).status === 'completed')
  }

  console.log(`\n${pass} passed, ${fail} failed`)
  if (fail > 0) process.exitCode = 1
}
main()
