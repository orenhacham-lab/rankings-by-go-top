/**
 * Phase 1 (PayPal/Shopify billing hardening) — lib/subscription.ts.
 *
 * DEFECT (production-confirmed): getUserEntitlement selected `plan`,
 * `scans_this_period`, `scans_period_key` — none of which exist on the real
 * `subscriptions` table (verified against information_schema.columns). The
 * select error was discarded, so `sub` was always undefined and EVERY
 * non-admin user — trial or paying — silently fell back to trial-tier limits.
 * The real plan column is `plan_code`.
 *
 * This suite is behavioral (a real FakeAdmin, not string-matching source) so
 * the actual before/after entitlement outcome is proven, not just the query
 * shape. Run: npx tsx lib/__qa__/subscription-entitlement.qa.ts
 */
import { readFileSync } from 'fs'
import { join } from 'path'
import { FakeAdmin } from './_fake-admin'
import { getUserEntitlement, hasAccess, PLAN_LIMITS } from '../subscription'

let pass = 0, fail = 0
function check(name: string, cond: boolean, detail?: string) {
  if (cond) { pass++; console.log(`  ✓ ${name}`) } else { fail++; console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`) }
}
const ROOT = join(__dirname, '..', '..')
const read = (rel: string) => readFileSync(join(ROOT, rel), 'utf8')
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1')

const NOW = new Date('2026-08-22T12:00:00Z')
const future = (days: number) => new Date(NOW.getTime() + days * 86400000).toISOString()
const past = (days: number) => new Date(NOW.getTime() - days * 86400000).toISOString()

function adminWith(subRows: Record<string, unknown>[], profileRole: string | null = null, userId = 'u1') {
  const tables: Record<string, Record<string, unknown>[]> = { subscriptions: subRows }
  if (profileRole) tables.profiles = [{ id: userId, role: profileRole }]
  return new FakeAdmin(tables)
}

async function main() {
  console.log('lib/subscription.ts — entitlement resolution (behavioral)\n')

  // ── Test 1: active manually-granted large_agency, no PayPal ID, stays active ──
  console.log('1) manually-granted active large_agency (no paypal_subscription_id)')
  {
    // This is the EXACT production row shape confirmed this session:
    // status=active, plan_code=large_agency, current_period_end=null, paypal_subscription_id=null.
    const admin = adminWith([{
      id: 'sub1', user_id: 'u1', status: 'active', plan_code: 'large_agency',
      trial_ends_at: null, current_period_end: null, paypal_subscription_id: null, created_at: '2026-07-01',
    }])
    const ent = await getUserEntitlement('u1', admin)
    check('plan resolves to large_agency', ent.plan === 'large_agency', ent.plan)
    check('hasActiveSubscription is true', ent.hasActiveSubscription === true)
    check('limits match large_agency (not trial)', ent.limits.maxProjects === PLAN_LIMITS.large_agency.maxProjects)
    check('a null current_period_end does NOT expire an active row', ent.hasActiveSubscription === true)
    const access = await hasAccess('u1', admin)
    check('hasAccess (middleware gate) also grants access', access === true)
  }

  // ── Test 2: valid (unexpired) trial is active ──
  console.log('\n2) valid trial')
  {
    const admin = adminWith([{
      id: 'sub2', user_id: 'u1', status: 'trial', plan_code: null,
      trial_ends_at: future(3), current_period_end: null, paypal_subscription_id: null, created_at: '2026-08-20',
    }])
    const ent = await getUserEntitlement('u1', admin)
    check('plan is trial', ent.plan === 'trial')
    check('trialActive is true', ent.trialActive === true)
    check('hasActiveSubscription is false (trial is a separate flag)', ent.hasActiveSubscription === false)
  }

  // ── Test 3: expired trial is inactive ──
  console.log('\n3) expired trial')
  {
    const admin = adminWith([{
      id: 'sub3', user_id: 'u1', status: 'trial', plan_code: null,
      trial_ends_at: past(1), current_period_end: null, paypal_subscription_id: null, created_at: '2026-08-01',
    }])
    const ent = await getUserEntitlement('u1', admin)
    check('trialActive is false', ent.trialActive === false)
    const access = await hasAccess('u1', admin)
    check('hasAccess denies (middleware gate)', access === false)
  }

  // ── Test 4: missing trial_ends_at on a trial fails safely ──
  console.log('\n4) trial row with trial_ends_at = null (nullable as of the Phase-1 migration)')
  {
    const admin = adminWith([{
      id: 'sub4', user_id: 'u1', status: 'trial', plan_code: null,
      trial_ends_at: null, current_period_end: null, paypal_subscription_id: null, created_at: '2026-08-20',
    }])
    const ent = await getUserEntitlement('u1', admin)
    check('trialActive is false (no end date → cannot be active)', ent.trialActive === false)
    check('trialEndsAt surfaces as null, not thrown/crashed', ent.trialEndsAt === null)
    const access = await hasAccess('u1', admin)
    check('hasAccess denies — a trial with no end is never granted', access === false)
  }

  // ── Test 5: unknown/invalid plan_code fails safely ──
  console.log('\n5) active row with an unrecognized plan_code')
  {
    const admin = adminWith([{
      id: 'sub5', user_id: 'u1', status: 'active', plan_code: 'enterprise_legacy_typo',
      trial_ends_at: null, current_period_end: null, paypal_subscription_id: 'PP-1', created_at: '2026-08-01',
    }])
    const ent = await getUserEntitlement('u1', admin)
    check('does NOT grant the unrecognized plan', (ent.plan as string) !== 'enterprise_legacy_typo')
    check('falls back to trial-tier, not full access', ent.plan === 'trial' && ent.hasActiveSubscription === false)
  }

  // ── Additional coverage: cancelled-but-still-in-period, and a plain query error ──
  console.log('\n6) cancelled subscription still inside its paid period')
  {
    const admin = adminWith([{
      id: 'sub6', user_id: 'u1', status: 'cancelled', plan_code: 'premium',
      trial_ends_at: null, current_period_end: future(10), paypal_subscription_id: 'PP-2', created_at: '2026-07-01',
    }])
    const ent = await getUserEntitlement('u1', admin)
    check('still entitled until current_period_end', ent.hasActiveSubscription === true && ent.plan === 'premium')
  }
  console.log('\n7) cancelled subscription with NO current_period_end is NOT active (asymmetric vs. active-status null handling)')
  {
    const admin = adminWith([{
      id: 'sub7', user_id: 'u1', status: 'cancelled', plan_code: 'premium',
      trial_ends_at: null, current_period_end: null, paypal_subscription_id: 'PP-3', created_at: '2026-07-01',
    }])
    const ent = await getUserEntitlement('u1', admin)
    check('a cancelled row with no period end is NOT treated as unlimited', ent.hasActiveSubscription === false)
  }
  console.log('\n8) a genuine query error (e.g. RLS/connectivity) fails closed, is logged not swallowed')
  {
    const tables = { subscriptions: [{ id: 'sub8', user_id: 'u1', status: 'active', plan_code: 'premium', trial_ends_at: null, current_period_end: null, paypal_subscription_id: null, created_at: '2026-08-01' }] }
    const admin = new FakeAdmin(tables, { subscriptions: { select: () => ({ code: '500', message: 'connection reset' }) } })
    const origError = console.error
    let logged = false
    console.error = (...args: unknown[]) => { if (String(args[0]).includes('getUserEntitlement query failed')) logged = true }
    const ent = await getUserEntitlement('u1', admin)
    console.error = origError
    check('falls back to trial (fail closed), not a throw or full access', ent.plan === 'trial' && ent.hasActiveSubscription === false)
    check('the error is LOGGED, not silently discarded', logged)
  }
  console.log('\n9) admin role bypasses subscription entirely')
  {
    const admin = adminWith([], 'admin', 'u1')
    const ent = await getUserEntitlement('u1', admin)
    check('admin gets premium limits regardless of subscription state', ent.isAdmin === true && ent.plan === 'premium')
  }

  // ── Source contract: the fix is actually wired, not just behaviorally coincidental ──
  console.log('\nSOURCE) column names + removed fields')
  {
    const src = read('lib/subscription.ts')
    check('selects plan_code, not the nonexistent `plan` column', /select\('id, plan_code, status, trial_ends_at, current_period_end'\)/.test(src))
    check('no longer selects scans_this_period/scans_period_key', !/scans_this_period|scans_period_key/.test(src))
    check('the select error is destructured and checked', /const \{ data: sub, error \} = await supabase/.test(src) && /if \(error\) \{/.test(src))
    check('scansThisPeriod field is gone from UserEntitlement', !/scansThisPeriod/.test(src))
    check('the dead currentPeriodKey() helper is gone (was only used by the removed field)', !/currentPeriodKey/.test(src))
    const types = read('lib/supabase/types.ts')
    const interfaceBody = (types.match(/export interface Subscription \{[\s\S]*?\n\}/) ?? [''])[0]
    check('Subscription type uses plan_code, not plan', /plan_code: SubscriptionPlan \| null/.test(interfaceBody) && !/\n\s*plan: SubscriptionPlan\n/.test(interfaceBody))
    check('Subscription interface body declares no scans_this_period/scans_period_key/current_period_start field',
      !/scans_this_period|scans_period_key|current_period_start/.test(interfaceBody))
  }
  console.log('\nSOURCE) the forced scan/route.ts consequence — dead write to a nonexistent column removed')
  {
    const scanRoute = strip(read('app/api/scan/route.ts'))
    check('no longer writes scans_this_period (that column does not exist)', !/scans_this_period/.test(scanRoute))
    check('no longer references entitlement.scansThisPeriod', !/entitlement\.scansThisPeriod/.test(scanRoute))
  }

  console.log(`\n${pass} passed, ${fail} failed`)
  if (fail > 0) process.exitCode = 1
}
main()
