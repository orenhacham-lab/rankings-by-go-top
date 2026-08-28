/**
 * Phase 3 — resolveCurrentUsagePeriod: actual billing-period boundaries for
 * PayPal, Shopify, and trial users (NEVER a fixed UTC calendar month). Run:
 *   npx tsx lib/billing/__qa__/usage-period.qa.ts
 */
import type { createAdminClient } from '@/lib/supabase/admin'
import { FakeAdmin } from '../../__qa__/_fake-admin'
import { resolveCurrentUsagePeriod } from '../usage-period'

type Admin = ReturnType<typeof createAdminClient>

let pass = 0, fail = 0
function check(name: string, cond: boolean, detail?: string) {
  if (cond) { pass++; console.log(`  ✓ ${name}`) } else { fail++; console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`) }
}

async function main() {
  console.log('Phase 3 — usage-period resolver QA\n')

  console.log('1) PayPal subscription — uses the REAL current_period_start/end, never a UTC calendar month')
  {
    const admin = new FakeAdmin({
      shopify_connections: [],
      subscriptions: [{ id: 's1', user_id: 'u1', status: 'active', plan_code: 'premium', trial_ends_at: null, current_period_start: '2026-08-15T00:00:00Z', current_period_end: '2026-09-15T00:00:00Z', created_at: '2026-08-15T00:00:00Z' }],
    })
    const period = await resolveCurrentUsagePeriod(admin as unknown as Admin, 'u1')
    check('period resolved', period !== null)
    check('start is the authoritative Aug 15 (NOT the calendar month start)', period?.start.toISOString() === '2026-08-15T00:00:00.000Z')
    check('end is the authoritative Sep 15', period?.end.toISOString() === '2026-09-15T00:00:00.000Z')
    check('source is paypal', period?.source === 'paypal')
  }

  console.log('\n2) A customer subscribing near month-end does NOT get a fresh allowance when the calendar month rolls over')
  {
    // Subscribed Aug 28 -> period end Sep 28. On Sep 2 (after the calendar
    // month rolled over), the period is STILL Aug 28 - Sep 28, not reset.
    const admin = new FakeAdmin({
      shopify_connections: [],
      subscriptions: [{ id: 's2', user_id: 'u2', status: 'active', plan_code: 'regular', trial_ends_at: null, current_period_start: '2026-08-28T00:00:00Z', current_period_end: '2026-09-28T00:00:00Z', created_at: '2026-08-28T00:00:00Z' }],
    })
    const period = await resolveCurrentUsagePeriod(admin as unknown as Admin, 'u2')
    check('period start is still Aug 28 (the real subscription anchor)', period?.start.toISOString() === '2026-08-28T00:00:00.000Z')
    check('NOT reset to Sep 1 (a calendar-month boundary)', period?.start.toISOString() !== '2026-09-01T00:00:00.000Z')
  }

  console.log('\n3) PayPal subscriber with no stored current_period_start (pre-migration row) — documented compatibility fallback')
  {
    const admin = new FakeAdmin({
      shopify_connections: [],
      subscriptions: [{ id: 's3', user_id: 'u3', status: 'active', plan_code: 'regular', trial_ends_at: null, current_period_start: null, current_period_end: '2026-09-22T00:00:00Z', created_at: '2026-01-01T00:00:00Z' }],
    })
    const period = await resolveCurrentUsagePeriod(admin as unknown as Admin, 'u3')
    check('falls back to current_period_end - 1 month', period?.start.toISOString() === '2026-08-22T00:00:00.000Z')
    check('end is still the authoritative current_period_end', period?.end.toISOString() === '2026-09-22T00:00:00.000Z')
  }

  console.log('\n4) Trial user — prefers subscriptions.created_at as the trial start, trial_ends_at as the end')
  {
    const admin = new FakeAdmin({
      shopify_connections: [],
      subscriptions: [{ id: 's4', user_id: 'u4', status: 'trial', plan_code: null, trial_ends_at: '2026-09-07T00:00:00Z', current_period_start: null, current_period_end: null, created_at: '2026-08-31T00:00:00Z' }],
    })
    const period = await resolveCurrentUsagePeriod(admin as unknown as Admin, 'u4')
    check('start is the REAL stored created_at (Aug 31)', period?.start.toISOString() === '2026-08-31T00:00:00.000Z')
    check('end is trial_ends_at (Sep 7 — 7 days later)', period?.end.toISOString() === '2026-09-07T00:00:00.000Z')
    check('source is trial', period?.source === 'trial')
  }

  console.log('\n5) Trial user with no created_at available — documented fallback to trial_ends_at - 7 days')
  {
    const admin = new FakeAdmin({
      shopify_connections: [],
      subscriptions: [{ id: 's5', user_id: 'u5', status: 'trial', plan_code: null, trial_ends_at: '2026-09-07T00:00:00Z', current_period_start: null, current_period_end: null, created_at: '' }],
    })
    const period = await resolveCurrentUsagePeriod(admin as unknown as Admin, 'u5')
    check('falls back to trial_ends_at - 7 days', period?.start.toISOString() === '2026-08-31T00:00:00.000Z')
  }

  console.log('\n6) Shopify-governed user — uses shopify_current_period_start/end, never PayPal/trial data')
  {
    const admin = new FakeAdmin({
      shopify_connections: [{ id: 'c1', user_id: 'u6', connection_status: 'connected', shopify_current_period_start: '2026-08-10T00:00:00Z', shopify_current_period_end: '2026-09-10T00:00:00Z', updated_at: '2026-08-10T00:00:00Z' }],
      subscriptions: [{ id: 's6', user_id: 'u6', status: 'active', plan_code: 'premium', trial_ends_at: null, current_period_start: '2020-01-01T00:00:00Z', current_period_end: '2020-02-01T00:00:00Z', created_at: '2020-01-01T00:00:00Z' }],
    })
    const period = await resolveCurrentUsagePeriod(admin as unknown as Admin, 'u6')
    check('source is shopify', period?.source === 'shopify')
    check('uses the Shopify period, NOT the stale PayPal row', period?.start.toISOString() === '2026-08-10T00:00:00.000Z')
  }

  console.log('\n7) Shopify-governed user with no verified period yet — fails closed, never falls back to PayPal/trial')
  {
    const admin = new FakeAdmin({
      shopify_connections: [{ id: 'c2', user_id: 'u7', connection_status: 'connected', shopify_current_period_start: null, shopify_current_period_end: null, updated_at: '2026-08-10T00:00:00Z' }],
      subscriptions: [{ id: 's7', user_id: 'u7', status: 'active', plan_code: 'premium', trial_ends_at: null, current_period_start: '2026-08-01T00:00:00Z', current_period_end: '2026-09-01T00:00:00Z', created_at: '2026-08-01T00:00:00Z' }],
    })
    const period = await resolveCurrentUsagePeriod(admin as unknown as Admin, 'u7')
    check('null — never silently defers to the PayPal row', period === null)
  }

  console.log('\n8) No subscription row at all — null (fail closed)')
  {
    const admin = new FakeAdmin({ shopify_connections: [], subscriptions: [] })
    const period = await resolveCurrentUsagePeriod(admin as unknown as Admin, 'u8')
    check('null', period === null)
  }

  console.log(`\n${pass} passed, ${fail} failed`)
  if (fail > 0) process.exitCode = 1
}
main()
