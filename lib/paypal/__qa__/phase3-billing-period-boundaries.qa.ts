/**
 * Phase 3 (2nd review correction) — PayPal authoritative billing-period
 * boundary policy for RENEWALS. Corrects the prior pass's use of
 * `last_payment.time` as the period-start anchor (a payment timestamp is not
 * a billing-boundary field — see lib/paypal/webhook-processing.ts's header
 * for the full rationale). The new policy:
 *   - current_period_end is ALWAYS PayPal's freshly-fetched next_billing_time.
 *   - current_period_start is ALWAYS the row's PREVIOUSLY STORED
 *     current_period_end — NEVER last_payment.time.
 *   - next_billing_time EQUAL to the stored value → 'renewal_duplicate' (no-op).
 *   - next_billing_time OLDER than the stored value → 'renewal_stale' (no-op).
 *   - A concurrent handler that already advanced the row wins the race;
 *     the loser gets 'renewal_conflict' (safe to retry) via a conditional
 *     (compare-and-swap) update, never overwriting the winner.
 * Complements lib/paypal/__qa__/paypal-billing.qa.ts (basic replay
 * idempotency) and lib/billing/__qa__/usage-period.qa.ts (the missing-period
 * fallback used until a row has a real stored boundary). Run:
 *   npx tsx lib/paypal/__qa__/phase3-billing-period-boundaries.qa.ts
 */
import { FakeAdmin } from '../../__qa__/_fake-admin'
import { verifyPayPalActivation } from '../client'
import { transitionSubscriptionToActivePlan, type PaidSubscriptionFields } from '../activation-processing'
import { processVerifiedPayPalWebhookEvent, httpStatusForOutcome, type ProcessDeps } from '../webhook-processing'

let pass = 0, fail = 0
function check(name: string, cond: boolean, detail?: string) {
  if (cond) { pass++; console.log(`  ✓ ${name}`) } else { fail++; console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`) }
}
function showBeforeAfter(before: Record<string, unknown> | undefined, after: Record<string, unknown> | undefined) {
  console.log(`    before: start=${before?.current_period_start ?? 'null'} end=${before?.current_period_end ?? 'null'}`)
  console.log(`    after:  start=${after?.current_period_start ?? 'null'} end=${after?.current_period_end ?? 'null'}`)
}

process.env.PAYPAL_CLIENT_ID = 'test-client-id'
process.env.PAYPAL_SECRET = 'test-secret'
process.env.NEXT_PUBLIC_PAYPAL_PLAN_ID_REGULAR = 'P-REGULAR'
process.env.NEXT_PUBLIC_PAYPAL_PLAN_ID_ADVANCED = 'P-ADVANCED'
process.env.NEXT_PUBLIC_PAYPAL_PLAN_ID_PREMIUM = 'P-PREMIUM'
process.env.NEXT_PUBLIC_PAYPAL_PLAN_ID_LARGE_AGENCY = 'P-LARGE'

function fakeFetch(impl: (url: string) => { ok: boolean; status?: number; body: unknown }): typeof fetch {
  return (async (url: string) => {
    if (String(url).includes('/v1/oauth2/token')) {
      return { ok: true, status: 200, json: async () => ({ access_token: 'fake-token' }) } as Response
    }
    const r = impl(String(url))
    return { ok: r.ok, status: r.status ?? (r.ok ? 200 : 400), json: async () => r.body } as Response
  }) as unknown as typeof fetch
}

/** deps whose fetchAuthoritativeBillingPeriod is a plain function of its
 *  input — NOT of any wall-clock "now" — modelling a genuine live PayPal
 *  query. `calls` records every invocation for delay/reorder assertions. */
function scriptedDeps(responses: Array<{ periodEnd: string; periodStart: string | null }>): ProcessDeps & { calls: string[] } {
  const calls: string[] = []
  let i = 0
  return {
    calls,
    fetchAuthoritativeBillingPeriod: async (subscriptionId: string) => {
      calls.push(subscriptionId)
      const r = responses[Math.min(i, responses.length - 1)]
      i++
      return { ok: true, periodEnd: r.periodEnd, periodStart: r.periodStart }
    },
  }
}
function subRow(overrides: Record<string, unknown>) {
  return { id: 'row', paypal_subscription_id: 'SUB', status: 'active', current_period_start: null, current_period_end: null, ...overrides }
}

async function main() {
  console.log('Phase 3 (2nd correction) — PayPal renewal period-boundary QA\n')

  console.log('0) Initial activation still uses start_time/next_billing_time (unaffected by this correction — activation, not renewal)')
  {
    const f = fakeFetch(() => ({
      ok: true,
      body: { id: 'SUB-A1', status: 'ACTIVE', plan_id: 'P-PREMIUM', start_time: '2026-08-15T10:00:00Z', billing_info: { next_billing_time: '2026-09-15T10:00:00Z' } },
    }))
    const verified = await verifyPayPalActivation({ submittedSubscriptionId: 'SUB-A1', submittedPlanCode: 'premium', fetchImpl: f })
    check('verification succeeds', verified.ok === true)
    if (!verified.ok) return
    const admin = new FakeAdmin({ subscriptions: [{ id: 'trial-1', user_id: 'u1', status: 'trial', trial_ends_at: '2026-08-20T00:00:00Z', created_at: '2026-08-01T00:00:00Z' }] })
    const paid: PaidSubscriptionFields = { plan_code: verified.planCode, status: 'active', paypal_subscription_id: 'SUB-A1', current_period_end: verified.periodEnd, current_period_start: verified.periodStart }
    await transitionSubscriptionToActivePlan(admin, 'u1', paid)
    const row = admin.tables.subscriptions[0]
    check('current_period_start is PayPal\'s start_time', row.current_period_start === '2026-08-15T10:00:00Z')
    check('current_period_end is PayPal\'s next_billing_time', row.current_period_end === '2026-09-15T10:00:00Z')
  }

  console.log('\n1) Billing boundary at 00:00, payment CAPTURED at 00:07 — period_start must be the PRIOR stored period_end, NEVER the 00:07 payment timestamp')
  {
    const before = subRow({ paypal_subscription_id: 'SUB-1', current_period_start: '2026-07-01T00:00:00Z', current_period_end: '2026-08-01T00:00:00Z' })
    const admin = new FakeAdmin({ subscriptions: [{ ...before }] })
    // PayPal reports the NEW next_billing_time as Sep 1 00:00, but the
    // last_payment.time (the actual capture) was 00:07 — 7 minutes into the
    // new cycle, a completely realistic processing delay.
    const deps = scriptedDeps([{ periodEnd: '2026-09-01T00:00:00Z', periodStart: '2026-08-01T00:00:07Z' }])
    const outcome = await processVerifiedPayPalWebhookEvent(admin, { event_type: 'BILLING.SUBSCRIPTION.RENEWED', resource: { id: 'SUB-1' } }, deps)
    const after = admin.tables.subscriptions[0]
    showBeforeAfter(before, after)
    check('processed', outcome.kind === 'processed')
    check('current_period_start is the PRIOR stored period_end (Aug 1 00:00:00), NOT the 00:00:07 payment-capture time', after.current_period_start === '2026-08-01T00:00:00Z')
    check('current_period_start is NOT the last_payment.time value at all', after.current_period_start !== '2026-08-01T00:00:07Z')
    check('current_period_end is the new authoritative next_billing_time', after.current_period_end === '2026-09-01T00:00:00Z')
  }

  console.log('\n2) Webhook delivered several hours later — delayed DELIVERY must not shift the period start either')
  {
    const before = subRow({ paypal_subscription_id: 'SUB-2', current_period_start: '2026-07-01T00:00:00Z', current_period_end: '2026-08-01T00:00:00Z' })
    const admin = new FakeAdmin({ subscriptions: [{ ...before }] })
    // The event nominally fired at Aug 1 00:00, but is only processed here
    // hours later — nothing about "now" ever enters this function; the
    // authoritative fetch is scripted to still return the SAME correct
    // boundary PayPal would report regardless of when we happen to process it.
    const deps = scriptedDeps([{ periodEnd: '2026-09-01T00:00:00Z', periodStart: '2026-08-01T09:00:00Z' }])
    const outcome = await processVerifiedPayPalWebhookEvent(admin, { event_type: 'BILLING.SUBSCRIPTION.RENEWED', resource: { id: 'SUB-2' } }, deps)
    const after = admin.tables.subscriptions[0]
    showBeforeAfter(before, after)
    check('processed', outcome.kind === 'processed')
    check('current_period_start is STILL the prior stored period_end, unaffected by a 9-hour-delayed last_payment.time or delivery delay', after.current_period_start === '2026-08-01T00:00:00Z')
    check('current_period_end correctly advanced', after.current_period_end === '2026-09-01T00:00:00Z')
  }

  console.log('\n3) Duplicate webhook — next_billing_time EQUALS the stored period_end')
  {
    const before = subRow({ paypal_subscription_id: 'SUB-3', current_period_start: '2026-07-01T00:00:00Z', current_period_end: '2026-08-01T00:00:00Z' })
    const admin = new FakeAdmin({ subscriptions: [{ ...before }] })
    const deps = scriptedDeps([{ periodEnd: '2026-08-01T00:00:00Z', periodStart: '2026-08-01T00:00:03Z' }])
    const outcome = await processVerifiedPayPalWebhookEvent(admin, { event_type: 'PAYMENT.SALE.COMPLETED', resource: { id: 'SALE-1', billing_agreement_id: 'SUB-3' } }, deps)
    const after = admin.tables.subscriptions[0]
    showBeforeAfter(before, after)
    check('outcome is renewal_duplicate (distinct from stale)', outcome.kind === 'renewal_duplicate')
    check('reports the duplicate period end', outcome.kind === 'renewal_duplicate' && outcome.periodEnd === '2026-08-01T00:00:00Z')
    check('row is completely untouched — start AND end unchanged', after.current_period_start === before.current_period_start && after.current_period_end === before.current_period_end)
    check('maps to 200 (expected, not an error)', httpStatusForOutcome(outcome) === 200)
  }

  console.log('\n4) Stale webhook — next_billing_time is OLDER than the stored period_end')
  {
    const before = subRow({ paypal_subscription_id: 'SUB-4', current_period_start: '2026-08-01T00:00:00Z', current_period_end: '2026-09-01T00:00:00Z' })
    const admin = new FakeAdmin({ subscriptions: [{ ...before }] })
    const deps = scriptedDeps([{ periodEnd: '2026-08-01T00:00:00Z', periodStart: '2026-07-01T00:00:00Z' }])
    const outcome = await processVerifiedPayPalWebhookEvent(admin, { event_type: 'BILLING.SUBSCRIPTION.RENEWED', resource: { id: 'SUB-4' } }, deps)
    const after = admin.tables.subscriptions[0]
    showBeforeAfter(before, after)
    check('outcome is renewal_stale (distinct from duplicate)', outcome.kind === 'renewal_stale')
    check('reports both the stored and the (older) reported value', outcome.kind === 'renewal_stale' && outcome.storedPeriodEnd === '2026-09-01T00:00:00Z' && outcome.reportedPeriodEnd === '2026-08-01T00:00:00Z')
    check('row is completely untouched', after.current_period_start === before.current_period_start && after.current_period_end === before.current_period_end)
    check('maps to 200 (expected, not an error)', httpStatusForOutcome(outcome) === 200)
  }

  console.log('\n5) Two concurrent renewal handlers — the loser must NOT overwrite the winner\'s newer state')
  {
    // Handler A and Handler B both read the SAME stored state
    // (start=Jul1, end=Aug1) before either writes. A resolves the CORRECT
    // next boundary (Aug1->Sep1) and writes first. B — still holding its
    // stale read of end=Aug1 — must be REFUSED (not blindly overwrite using
    // its own, now-outdated "previousPeriodEnd=Aug1" assumption), which
    // would otherwise silently skip/lose A's Sep1 boundary.
    const before = subRow({ paypal_subscription_id: 'SUB-5', current_period_start: '2026-07-01T00:00:00Z', current_period_end: '2026-08-01T00:00:00Z' })
    const admin = new FakeAdmin({ subscriptions: [{ ...before }] })
    const depsA = scriptedDeps([{ periodEnd: '2026-09-01T00:00:00Z', periodStart: null }])
    const depsB = scriptedDeps([{ periodEnd: '2026-09-01T00:00:00Z', periodStart: null }])
    // Both "read" (the lookup inside processVerifiedPayPalWebhookEvent) race
    // via Promise.all — since both start from the same pre-write snapshot,
    // this genuinely exercises the conditional-update guard rather than
    // asserting the outcome by fiat.
    const [rA, rB] = await Promise.all([
      processVerifiedPayPalWebhookEvent(admin, { event_type: 'BILLING.SUBSCRIPTION.RENEWED', resource: { id: 'SUB-5' } }, depsA),
      processVerifiedPayPalWebhookEvent(admin, { event_type: 'BILLING.SUBSCRIPTION.RENEWED', resource: { id: 'SUB-5' } }, depsB),
    ])
    const after = admin.tables.subscriptions[0]
    showBeforeAfter(before, after)
    const outcomes = [rA.kind, rB.kind].sort()
    check('exactly one handler processed, the other got renewal_conflict (never both "processed", never both silently no-op)', outcomes[0] === 'processed' && outcomes[1] === 'renewal_conflict', `outcomes=${outcomes.join(',')}`)
    check('the conflict outcome maps to 409 (retryable), never a silent 200', httpStatusForOutcome(rA.kind === 'renewal_conflict' ? rA : rB) === 409)
    check('the row ends up at the correct advanced boundary exactly once — never double-applied, never lost', after.current_period_end === '2026-09-01T00:00:00Z' && after.current_period_start === '2026-08-01T00:00:00Z')
  }
  console.log('\n5b) After a conflict, reprocessing the LOSING event resolves correctly (as a duplicate) against the now-current state')
  {
    const before = subRow({ paypal_subscription_id: 'SUB-5b', current_period_start: '2026-07-01T00:00:00Z', current_period_end: '2026-08-01T00:00:00Z' })
    const admin = new FakeAdmin({ subscriptions: [{ ...before }] })
    // Simulate: A already won (row now at Sep1); B's original delivery is reprocessed.
    admin.tables.subscriptions[0].current_period_start = '2026-08-01T00:00:00Z'
    admin.tables.subscriptions[0].current_period_end = '2026-09-01T00:00:00Z'
    const depsBRetry = scriptedDeps([{ periodEnd: '2026-09-01T00:00:00Z', periodStart: null }])
    const retryOutcome = await processVerifiedPayPalWebhookEvent(admin, { event_type: 'BILLING.SUBSCRIPTION.RENEWED', resource: { id: 'SUB-5b' } }, depsBRetry)
    check('reprocessing the loser now correctly resolves as renewal_duplicate (live-requeried, self-correcting)', retryOutcome.kind === 'renewal_duplicate')
    check('row unchanged by the reprocessed retry', admin.tables.subscriptions[0].current_period_end === '2026-09-01T00:00:00Z')
  }

  console.log('\n6) Month-end anchors — Jan 31 → Feb 28/29, Feb 28/29 → Mar 31, Mar 31 → Apr 30 — always PayPal\'s own absolute dates, never local day-count arithmetic')
  {
    const cases: Array<{ label: string; priorEnd: string; newEnd: string }> = [
      { label: 'Jan 31 -> Feb 28 (non-leap 2027)', priorEnd: '2027-01-31T00:00:00Z', newEnd: '2027-02-28T00:00:00Z' },
      { label: 'Jan 31 -> Feb 29 (leap 2028)', priorEnd: '2028-01-31T00:00:00Z', newEnd: '2028-02-29T00:00:00Z' },
      { label: 'Feb 28 -> Mar 31 (non-leap 2027)', priorEnd: '2027-02-28T00:00:00Z', newEnd: '2027-03-31T00:00:00Z' },
      { label: 'Mar 31 -> Apr 30', priorEnd: '2026-03-31T00:00:00Z', newEnd: '2026-04-30T00:00:00Z' },
    ]
    for (const c of cases) {
      const before = subRow({ paypal_subscription_id: `SUB-6-${c.label}`, current_period_start: '2026-01-01T00:00:00Z', current_period_end: c.priorEnd })
      const admin = new FakeAdmin({ subscriptions: [{ ...before }] })
      const deps = scriptedDeps([{ periodEnd: c.newEnd, periodStart: null }])
      const outcome = await processVerifiedPayPalWebhookEvent(admin, { event_type: 'BILLING.SUBSCRIPTION.RENEWED', resource: { id: `SUB-6-${c.label}` } }, deps)
      const after = admin.tables.subscriptions[0]
      console.log(`  ${c.label}:`); showBeforeAfter(before, after)
      check(`${c.label} — processed, period_start = prior end exactly, period_end = new authoritative date exactly`,
        outcome.kind === 'processed' && after.current_period_start === c.priorEnd && after.current_period_end === c.newEnd)
    }
  }

  console.log('\n7) Existing legacy subscription with MISSING stored boundaries — first tracked renewal sets period_end only; period_start is deliberately left unset (non-authoritative fallback lives in usage-period.ts, not here)')
  {
    const before = subRow({ paypal_subscription_id: 'SUB-7', current_period_start: null, current_period_end: null })
    const admin = new FakeAdmin({ subscriptions: [{ ...before }] })
    const deps = scriptedDeps([{ periodEnd: '2026-09-01T00:00:00Z', periodStart: '2026-08-15T00:00:00Z' }])
    const outcome = await processVerifiedPayPalWebhookEvent(admin, { event_type: 'BILLING.SUBSCRIPTION.RENEWED', resource: { id: 'SUB-7' } }, deps)
    const after = admin.tables.subscriptions[0]
    showBeforeAfter(before, after)
    check('processed', outcome.kind === 'processed')
    check('current_period_end is set from the authoritative next_billing_time', after.current_period_end === '2026-09-01T00:00:00Z')
    check('current_period_start is left NULL — NOT last_payment.time (Aug 15), not invented', after.current_period_start === null)
    console.log('  (from the row\'s SECOND tracked renewal onward, current_period_start chains normally from this current_period_end — see test 2 above for the steady-state behavior; the interim gap is covered by the documented, tested, explicitly non-authoritative -1-month fallback in lib/billing/usage-period.ts::resolveCurrentUsagePeriod)')
  }

  console.log(`\n${pass} passed, ${fail} failed`)
  if (fail > 0) process.exitCode = 1
}
main()
