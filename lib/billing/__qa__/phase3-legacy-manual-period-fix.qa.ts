/**
 * Final Phase 3 compatibility fix — resolveCurrentUsagePeriod must resolve a
 * period for a legitimate legacy/manual active paid subscriber, instead of
 * incorrectly failing closed against them.
 *
 * Production evidence (verified read-only): one active subscription,
 * plan_code=large_agency, profile role=user, paypal_subscription_id NULL, no
 * connected Shopify connection, current_period_end NULL, expired
 * trial_ends_at. Before this fix, resolveCurrentUsagePeriod returned null
 * for this account — a genuine paying customer would have been blocked from
 * every usage-quota check.
 *
 * The fix distinguishes this case EXPLICITLY by paypal_subscription_id being
 * NULL while status='active' — never by "current_period_end happens to be
 * missing" (a genuine PayPal subscription with a missing/corrupt
 * current_period_end must still fail closed; proven below). Resolves a
 * deterministic UTC-calendar-month period via an injectable `nowFn` — never
 * the wall clock — so month-boundary tests (December -> January, leap
 * years) are genuinely deterministic. Run:
 *   npx tsx lib/billing/__qa__/phase3-legacy-manual-period-fix.qa.ts
 */
import type { createAdminClient } from '@/lib/supabase/admin'
import { FakeAdmin } from '../../__qa__/_fake-admin'
import { resolveCurrentUsagePeriod } from '../usage-period'

type Admin = ReturnType<typeof createAdminClient>

let pass = 0, fail = 0
function check(name: string, cond: boolean, detail?: string) {
  if (cond) { pass++; console.log(`  ✓ ${name}`) } else { fail++; console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`) }
}

function baseAdmin(subscriptions: Record<string, unknown>[]) {
  return new FakeAdmin({ shopify_connections: [], subscriptions })
}

async function main() {
  console.log('Final Phase 3 compatibility fix — legacy/manual active-subscription period QA\n')

  console.log('1) The EXACT production shape resolves successfully (was: incorrectly null)')
  {
    const admin = baseAdmin([{
      id: 'prod-row', user_id: 'u1', status: 'active', plan_code: 'large_agency',
      trial_ends_at: '2026-07-01T00:00:00Z', // expired
      current_period_start: null, current_period_end: null,
      created_at: '2026-01-01T00:00:00Z', paypal_subscription_id: null,
    }])
    const nowFn = () => new Date('2026-08-15T12:00:00Z')
    const period = await resolveCurrentUsagePeriod(admin as unknown as Admin, 'u1', nowFn)
    check('period resolves (not null) — the production-blocking bug is fixed', period !== null)
    check('source is legacy_manual, never labeled paypal', period?.source === 'legacy_manual')
    check('start is the first instant of the reference UTC month (Aug 1)', period?.start.toISOString() === '2026-08-01T00:00:00.000Z')
    check('end is the first instant of the NEXT UTC month (Sep 1)', period?.end.toISOString() === '2026-09-01T00:00:00.000Z')
  }

  console.log('\n2) An EXPIRED trial_ends_at does not override the active manual entitlement (status/plan_code/paypal_subscription_id decide, not trial_ends_at)')
  {
    const admin = baseAdmin([{
      id: 'expired-trial-row', user_id: 'u2', status: 'active', plan_code: 'regular',
      trial_ends_at: '2020-01-01T00:00:00Z', // long expired
      current_period_start: null, current_period_end: null,
      created_at: '2026-01-01T00:00:00Z', paypal_subscription_id: null,
    }])
    const nowFn = () => new Date('2026-08-15T00:00:00Z')
    const period = await resolveCurrentUsagePeriod(admin as unknown as Admin, 'u2', nowFn)
    check('resolves the legacy/manual period, NOT null, NOT the trial branch', period !== null && period?.source === 'legacy_manual')
  }
  console.log('\n2b) A genuinely trialing row (status=\'trial\') is UNAFFECTED — still resolves via trial_ends_at, never legacy_manual')
  {
    const admin = baseAdmin([{
      id: 'real-trial-row', user_id: 'u2b', status: 'trial', plan_code: null,
      trial_ends_at: '2026-09-07T00:00:00Z', current_period_start: null, current_period_end: null,
      created_at: '2026-08-31T00:00:00Z', paypal_subscription_id: null,
    }])
    const period = await resolveCurrentUsagePeriod(admin as unknown as Admin, 'u2b')
    check('source is trial, not legacy_manual', period?.source === 'trial')
    check('end is trial_ends_at exactly', period?.end.toISOString() === '2026-09-07T00:00:00.000Z')
  }

  console.log('\n3) UTC-calendar-month boundaries are correct — mid-month, December -> January, and a leap year')
  {
    const cases: Array<{ label: string; nowIso: string; expectedStart: string; expectedEnd: string }> = [
      { label: 'mid-month (Aug 15)', nowIso: '2026-08-15T09:30:00Z', expectedStart: '2026-08-01T00:00:00.000Z', expectedEnd: '2026-09-01T00:00:00.000Z' },
      { label: 'first instant of the month (exactly Aug 1 00:00:00)', nowIso: '2026-08-01T00:00:00Z', expectedStart: '2026-08-01T00:00:00.000Z', expectedEnd: '2026-09-01T00:00:00.000Z' },
      { label: 'last instant of the month (Aug 31 23:59:59.999)', nowIso: '2026-08-31T23:59:59.999Z', expectedStart: '2026-08-01T00:00:00.000Z', expectedEnd: '2026-09-01T00:00:00.000Z' },
      { label: 'December -> January year rollover', nowIso: '2026-12-20T00:00:00Z', expectedStart: '2026-12-01T00:00:00.000Z', expectedEnd: '2027-01-01T00:00:00.000Z' },
      { label: 'February in a leap year (2028)', nowIso: '2028-02-15T00:00:00Z', expectedStart: '2028-02-01T00:00:00.000Z', expectedEnd: '2028-03-01T00:00:00.000Z' },
      { label: 'February in a non-leap year (2027)', nowIso: '2027-02-15T00:00:00Z', expectedStart: '2027-02-01T00:00:00.000Z', expectedEnd: '2027-03-01T00:00:00.000Z' },
    ]
    for (const c of cases) {
      const admin = baseAdmin([{
        id: `row-${c.label}`, user_id: `u-${c.label}`, status: 'active', plan_code: 'regular',
        trial_ends_at: null, current_period_start: null, current_period_end: null,
        created_at: '2026-01-01T00:00:00Z', paypal_subscription_id: null,
      }])
      const nowFn = () => new Date(c.nowIso)
      const period = await resolveCurrentUsagePeriod(admin as unknown as Admin, `u-${c.label}`, nowFn)
      check(`${c.label} — start=${c.expectedStart}, end=${c.expectedEnd}`,
        period?.start.toISOString() === c.expectedStart && period?.end.toISOString() === c.expectedEnd,
        `got start=${period?.start.toISOString()} end=${period?.end.toISOString()}`)
    }
  }

  console.log('\n4) An ACTIVE PayPal row (paypal_subscription_id present) with a MISSING current_period_end still fails closed — never routed to legacy_manual')
  {
    const admin = baseAdmin([{
      id: 'paypal-missing-end', user_id: 'u4', status: 'active', plan_code: 'premium',
      trial_ends_at: null, current_period_start: null, current_period_end: null,
      created_at: '2026-01-01T00:00:00Z', paypal_subscription_id: 'I-REAL-PAYPAL-SUB',
    }])
    const period = await resolveCurrentUsagePeriod(admin as unknown as Admin, 'u4')
    check('null — a genuine PayPal subscription with no authoritative date fails closed, exactly as before this fix', period === null)
  }

  console.log('\n5) A malformed PayPal current_period_end still fails closed — never routed to legacy_manual')
  {
    const admin = baseAdmin([{
      id: 'paypal-corrupt-end', user_id: 'u5', status: 'active', plan_code: 'premium',
      trial_ends_at: null, current_period_start: null, current_period_end: 'not-a-real-timestamp',
      created_at: '2026-01-01T00:00:00Z', paypal_subscription_id: 'I-REAL-PAYPAL-SUB-2',
    }])
    const period = await resolveCurrentUsagePeriod(admin as unknown as Admin, 'u5')
    check('null — malformed data fails closed, never silently treated as legacy_manual', period === null)
  }

  console.log('\n6) A CONNECTED Shopify user with a missing/corrupt period still fails closed — never falls back to legacy/manual, even with paypal_subscription_id NULL and status=active')
  {
    const admin = new FakeAdmin({
      shopify_connections: [{ id: 'conn-1', user_id: 'u6', connection_status: 'connected', shopify_current_period_start: null, shopify_current_period_end: null, updated_at: '2026-08-01T00:00:00Z' }],
      // Shopify governance is what makes this a Shopify case — the connection
      // row alone no longer decides billing authority.
      billing_governance: [{ user_id: 'u6', signup_origin: 'shopify_app_store', billing_authority: 'shopify' }],
      subscriptions: [{
        id: 'shopify-user-sub', user_id: 'u6', status: 'active', plan_code: 'premium',
        trial_ends_at: null, current_period_start: null, current_period_end: null,
        created_at: '2026-01-01T00:00:00Z', paypal_subscription_id: null,
      }],
    })
    const period = await resolveCurrentUsagePeriod(admin as unknown as Admin, 'u6')
    check('null — Shopify governance takes precedence and fails closed on its own missing period, never legacy_manual', period === null)
  }
  console.log('\n6b) A CONNECTED Shopify user with a CORRUPT (unparseable) period also fails closed, never legacy_manual')
  {
    const admin = new FakeAdmin({
      shopify_connections: [{ id: 'conn-2', user_id: 'u6b', connection_status: 'connected', shopify_current_period_start: 'garbage', shopify_current_period_end: 'also-garbage', updated_at: '2026-08-01T00:00:00Z' }],
      billing_governance: [{ user_id: 'u6b', signup_origin: 'shopify_app_store', billing_authority: 'shopify' }],
      subscriptions: [{
        id: 'shopify-user-sub-2', user_id: 'u6b', status: 'active', plan_code: 'premium',
        trial_ends_at: null, current_period_start: null, current_period_end: null,
        created_at: '2026-01-01T00:00:00Z', paypal_subscription_id: null,
      }],
    })
    const period = await resolveCurrentUsagePeriod(admin as unknown as Admin, 'u6b')
    check('null — corrupt Shopify data fails closed, never legacy_manual', period === null)
  }
  console.log('\n6c) A CONNECTED Shopify user WITH a valid period still resolves via Shopify — legacy/manual is never even considered')
  {
    const admin = new FakeAdmin({
      shopify_connections: [{ id: 'conn-3', user_id: 'u6c', connection_status: 'connected', shopify_subscription_status: 'active', shopify_plan_handle: 'advanced', shopify_current_period_start: '2026-08-01T00:00:00Z', shopify_current_period_end: '2026-09-01T00:00:00Z', updated_at: '2026-08-01T00:00:00Z' }],
      billing_governance: [{ user_id: 'u6c', signup_origin: 'shopify_app_store', billing_authority: 'shopify' }],
      subscriptions: [{
        id: 'shopify-user-sub-3', user_id: 'u6c', status: 'active', plan_code: 'premium',
        trial_ends_at: null, current_period_start: null, current_period_end: null,
        created_at: '2026-01-01T00:00:00Z', paypal_subscription_id: null,
      }],
    })
    const period = await resolveCurrentUsagePeriod(admin as unknown as Admin, 'u6c')
    check('source is shopify', period?.source === 'shopify')
  }

  console.log('\n7) A CANCELLED legacy/manual row (paypal_subscription_id NULL, status=\'cancelled\') is NOT routed to legacy_manual — the fallback is status=\'active\' only')
  {
    const admin = baseAdmin([{
      id: 'cancelled-legacy-row', user_id: 'u7', status: 'cancelled', plan_code: 'regular',
      trial_ends_at: null, current_period_start: null, current_period_end: null,
      created_at: '2026-01-01T00:00:00Z', paypal_subscription_id: null,
    }])
    const period = await resolveCurrentUsagePeriod(admin as unknown as Admin, 'u7')
    check('null — a cancelled legacy/manual row has no authoritative period to grant against', period === null)
  }

  console.log('\n8) Existing valid PayPal behavior is UNCHANGED — a real PayPal subscription with a valid stored period still resolves from ITS OWN dates, never the UTC-month fallback')
  {
    const admin = baseAdmin([{
      id: 'paypal-valid', user_id: 'u8', status: 'active', plan_code: 'premium',
      trial_ends_at: null, current_period_start: '2026-08-15T00:00:00Z', current_period_end: '2026-09-15T00:00:00Z',
      created_at: '2026-08-15T00:00:00Z', paypal_subscription_id: 'I-REAL-PAYPAL-SUB-3',
    }])
    const nowFn = () => new Date('2026-08-28T00:00:00Z') // deliberately NOT month-aligned with the real period
    const period = await resolveCurrentUsagePeriod(admin as unknown as Admin, 'u8', nowFn)
    check('source is paypal', period?.source === 'paypal')
    check('start is the REAL subscription anchor (Aug 15), NOT the UTC calendar-month start (Aug 1)', period?.start.toISOString() === '2026-08-15T00:00:00.000Z')
    check('end is the REAL authoritative date (Sep 15), NOT a UTC calendar-month end', period?.end.toISOString() === '2026-09-15T00:00:00.000Z')
  }

  console.log('\n9) Existing valid trial behavior is UNCHANGED')
  {
    const admin = baseAdmin([{
      id: 'trial-valid', user_id: 'u9', status: 'trial', plan_code: null,
      trial_ends_at: '2026-09-07T00:00:00Z', current_period_start: null, current_period_end: null,
      created_at: '2026-08-31T00:00:00Z', paypal_subscription_id: null,
    }])
    const period = await resolveCurrentUsagePeriod(admin as unknown as Admin, 'u9')
    check('source is trial', period?.source === 'trial')
    check('start is the real created_at (Aug 31)', period?.start.toISOString() === '2026-08-31T00:00:00.000Z')
    check('end is trial_ends_at (Sep 7)', period?.end.toISOString() === '2026-09-07T00:00:00.000Z')
  }

  console.log('\n10) No subscription row at all — still null (fail closed), unaffected by this fix')
  {
    const admin = baseAdmin([])
    const period = await resolveCurrentUsagePeriod(admin as unknown as Admin, 'u10')
    check('null', period === null)
  }

  console.log(`\n${pass} passed, ${fail} failed`)
  if (fail > 0) process.exitCode = 1
}
main()
