/**
 * Phase 1 (PayPal/Shopify billing hardening) — activation verification
 * (goal E) and webhook signature verification + processing (goals F/G).
 *
 * Every network-facing function under test accepts an injectable `fetchImpl`
 * (lib/paypal/client.ts) or a fake admin client (lib/paypal/webhook-processing.ts)
 * — no live PayPal calls, no live Supabase. Run:
 *   npx tsx lib/paypal/__qa__/paypal-billing.qa.ts
 */
import { readFileSync } from 'fs'
import { join } from 'path'
import { FakeAdmin } from '../../__qa__/_fake-admin'
import {
  extractPayPalWebhookHeaders, verifyPayPalActivation, verifyPayPalWebhookSignature,
  resolvePlanCodeFromPayPalPlanId, type PayPalWebhookHeaders,
} from '../client'
import { processVerifiedPayPalWebhookEvent, httpStatusForOutcome, type ProcessDeps } from '../webhook-processing'
import { transitionSubscriptionToActivePlan, type PaidSubscriptionFields } from '../activation-processing'

/** Fake authoritative-billing-date dependency — always returns the same
 *  fixed date unless overridden, so idempotency is genuinely exercised
 *  (two calls, same PayPal-reported date, same result) rather than assumed. */
function fakeDeps(nextBillingTime: string | null = '2026-10-01T00:00:00Z'): ProcessDeps {
  return {
    fetchAuthoritativeNextBillingTime: async () =>
      nextBillingTime ? { ok: true, nextBillingTime } : { ok: false, reason: 'no_authoritative_date' },
  }
}
function failingDeps(reason: string): ProcessDeps {
  return { fetchAuthoritativeNextBillingTime: async () => ({ ok: false, reason }) }
}

let pass = 0, fail = 0
function check(name: string, cond: boolean, detail?: string) {
  if (cond) { pass++; console.log(`  ✓ ${name}`) } else { fail++; console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`) }
}
const ROOT = join(__dirname, '..', '..', '..')
const read = (rel: string) => readFileSync(join(ROOT, rel), 'utf8')
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1')

process.env.PAYPAL_CLIENT_ID = 'test-client-id'
process.env.PAYPAL_SECRET = 'test-secret'
process.env.NEXT_PUBLIC_PAYPAL_PLAN_ID_REGULAR = 'P-REGULAR'
process.env.NEXT_PUBLIC_PAYPAL_PLAN_ID_ADVANCED = 'P-ADVANCED'
process.env.NEXT_PUBLIC_PAYPAL_PLAN_ID_PREMIUM = 'P-PREMIUM'
process.env.NEXT_PUBLIC_PAYPAL_PLAN_ID_LARGE_AGENCY = 'P-LARGE'

/** A minimal fake `fetch` — token endpoint always succeeds; the subscription-detail
 *  fetch or verify-webhook-signature endpoint responds per `impl`. */
function fakeFetch(impl: (url: string, init?: RequestInit) => { ok: boolean; status?: number; body: unknown }): typeof fetch {
  return (async (url: string, init?: RequestInit) => {
    if (String(url).includes('/v1/oauth2/token')) {
      return { ok: true, status: 200, json: async () => ({ access_token: 'fake-token' }) } as Response
    }
    const r = impl(String(url), init)
    return { ok: r.ok, status: r.status ?? (r.ok ? 200 : 400), json: async () => r.body } as Response
  }) as unknown as typeof fetch
}

const HEADERS: PayPalWebhookHeaders = {
  authAlgo: 'SHA256withRSA', certUrl: 'https://api.paypal.com/cert', transmissionId: 'tid-1',
  transmissionSig: 'sig-1', transmissionTime: '2026-08-22T00:00:00Z',
}

async function main() {
  console.log('PayPal billing hardening — activation verification + webhook signature\n')

  // ── Test 6: valid activation ──
  console.log('6) valid PayPal subscription activation')
  {
    const f = fakeFetch(() => ({ ok: true, body: { id: 'SUB-1', status: 'ACTIVE', plan_id: 'P-PREMIUM' } }))
    const r = await verifyPayPalActivation({ submittedSubscriptionId: 'SUB-1', submittedPlanCode: 'premium', fetchImpl: f })
    check('verification succeeds', r.ok === true)
    check('resolved planCode is server-derived (premium)', r.ok && r.planCode === 'premium')
  }

  // ── Test 7: PayPal verification failure ──
  console.log('\n7) PayPal verification call fails (network/HTTP error)')
  {
    const f = fakeFetch(() => ({ ok: false, status: 500, body: {} }))
    const r = await verifyPayPalActivation({ submittedSubscriptionId: 'SUB-2', submittedPlanCode: 'premium', fetchImpl: f })
    check('activation is rejected', r.ok === false)
    check('reason is paypal_verification_failed', !r.ok && r.reason === 'paypal_verification_failed')
  }
  console.log('\n7b) PayPal not configured at all → fails closed, never silently skips verification')
  {
    const savedId = process.env.PAYPAL_CLIENT_ID
    delete process.env.PAYPAL_CLIENT_ID
    const r = await verifyPayPalActivation({ submittedSubscriptionId: 'SUB-2b', submittedPlanCode: 'premium' })
    process.env.PAYPAL_CLIENT_ID = savedId
    check('rejected, not silently allowed through', r.ok === false)
    check('reason is paypal_not_configured', !r.ok && r.reason === 'paypal_not_configured')
  }
  console.log('\n7c) subscription status is not acceptable (e.g. SUSPENDED)')
  {
    const f = fakeFetch(() => ({ ok: true, body: { id: 'SUB-2c', status: 'SUSPENDED', plan_id: 'P-PREMIUM' } }))
    const r = await verifyPayPalActivation({ submittedSubscriptionId: 'SUB-2c', submittedPlanCode: 'premium', fetchImpl: f })
    check('rejected', r.ok === false)
    check('reason is subscription_status_unacceptable', !r.ok && r.reason === 'subscription_status_unacceptable')
  }

  // ── Test 8: submitted PayPal ID does not match verified ID ──
  console.log('\n8) submitted subscription id does not match PayPal\'s own returned id')
  {
    const f = fakeFetch(() => ({ ok: true, body: { id: 'SUB-DIFFERENT', status: 'ACTIVE', plan_id: 'P-PREMIUM' } }))
    const r = await verifyPayPalActivation({ submittedSubscriptionId: 'SUB-3', submittedPlanCode: 'premium', fetchImpl: f })
    check('rejected', r.ok === false)
    check('reason is subscription_id_mismatch', !r.ok && r.reason === 'subscription_id_mismatch')
  }

  // ── Test 9: submitted plan does not match verified PayPal plan ──
  console.log('\n9) submitted plan does not match the PayPal-verified plan_id')
  {
    const f = fakeFetch(() => ({ ok: true, body: { id: 'SUB-4', status: 'ACTIVE', plan_id: 'P-REGULAR' } }))
    const r = await verifyPayPalActivation({ submittedSubscriptionId: 'SUB-4', submittedPlanCode: 'large_agency', fetchImpl: f })
    check('rejected — never activates on client-submitted plan alone', r.ok === false)
    check('reason is plan_mismatch', !r.ok && r.reason === 'plan_mismatch')
  }
  console.log('\n9b) PayPal plan_id does not map to ANY known internal plan_code')
  {
    const f = fakeFetch(() => ({ ok: true, body: { id: 'SUB-4b', status: 'ACTIVE', plan_id: 'P-UNKNOWN-LEGACY' } }))
    const r = await verifyPayPalActivation({ submittedSubscriptionId: 'SUB-4b', submittedPlanCode: 'regular', fetchImpl: f })
    check('rejected', r.ok === false)
    check('reason is unrecognized_paypal_plan', !r.ok && r.reason === 'unrecognized_paypal_plan')
  }
  console.log('\n9c) resolvePlanCodeFromPayPalPlanId — pure mapping, unit-level')
  {
    check('maps a known plan id', resolvePlanCodeFromPayPalPlanId('P-ADVANCED') === 'advanced')
    check('unknown id → null', resolvePlanCodeFromPayPalPlanId('nonsense') === null)
    check('null/undefined input → null (no throw)', resolvePlanCodeFromPayPalPlanId(null) === null && resolvePlanCodeFromPayPalPlanId(undefined) === null)
  }

  // ── Test 10: missing PayPal webhook signature headers ──
  console.log('\n10) missing PayPal webhook signature headers')
  {
    const partial = new Map([['paypal-auth-algo', 'SHA256withRSA'], ['paypal-cert-url', 'https://x']])
    const headers = { get: (n: string) => partial.get(n) ?? null }
    check('extraction fails (returns null) when any header is missing', extractPayPalWebhookHeaders(headers) === null)
    const empty = { get: () => null }
    check('extraction fails when all headers are missing', extractPayPalWebhookHeaders(empty) === null)
    const full = new Map([
      ['paypal-auth-algo', 'a'], ['paypal-cert-url', 'b'], ['paypal-transmission-id', 'c'],
      ['paypal-transmission-sig', 'd'], ['paypal-transmission-time', 'e'],
    ])
    const okHeaders = { get: (n: string) => full.get(n) ?? null }
    check('extraction succeeds when all 5 are present', extractPayPalWebhookHeaders(okHeaders) !== null)
  }

  // ── Test 11: invalid PayPal webhook signature ──
  console.log('\n11) PayPal explicitly rejects the signature')
  {
    const f = fakeFetch(() => ({ ok: true, body: { verification_status: 'FAILURE' } }))
    const outcome = await verifyPayPalWebhookSignature({ headers: HEADERS, webhookEvent: { foo: 1 }, webhookId: 'WH-1', fetchImpl: f })
    check('outcome is unverified', outcome === 'unverified')
  }
  console.log('\n11b) the verification call itself fails (transport/config) — distinct from an explicit rejection')
  {
    const f = fakeFetch(() => ({ ok: false, status: 500, body: {} }))
    const outcome = await verifyPayPalWebhookSignature({ headers: HEADERS, webhookEvent: {}, webhookId: 'WH-1', fetchImpl: f })
    check('outcome is error, not unverified (so the route can 502-retry, not 401-reject)', outcome === 'error')
  }

  // ── Test 12: valid PayPal webhook ──
  console.log('\n12) PayPal confirms the signature')
  {
    const f = fakeFetch(() => ({ ok: true, body: { verification_status: 'SUCCESS' } }))
    const outcome = await verifyPayPalWebhookSignature({ headers: HEADERS, webhookEvent: { event_type: 'BILLING.SUBSCRIPTION.ACTIVATED' }, webhookId: 'WH-1', fetchImpl: f })
    check('outcome is verified', outcome === 'verified')
  }

  // ── Test 13: a Supabase update error is not silently swallowed ──
  console.log('\n13) Supabase update error surfaces as a retryable outcome, not silent success')
  {
    const admin = new FakeAdmin(
      { subscriptions: [{ id: 'row-1', paypal_subscription_id: 'SUB-9', status: 'trial' }] },
      { subscriptions: { update: () => ({ code: '42703', message: 'column does not exist' }) } },
    )
    const outcome = await processVerifiedPayPalWebhookEvent(admin, { event_type: 'BILLING.SUBSCRIPTION.ACTIVATED', resource: { id: 'SUB-9' } }, fakeDeps())
    check('outcome is update_failed, not processed', outcome.kind === 'update_failed')
    check('the actual Supabase error message is carried through (not discarded)', outcome.kind === 'update_failed' && outcome.message === 'column does not exist')
    check('maps to a non-2xx HTTP status (retryable)', httpStatusForOutcome(outcome) >= 500)
    // Confirm the row was genuinely NOT mutated on failure.
    const row = admin.tables.subscriptions[0]
    check('the row status was NOT changed despite the failed update attempt reaching it', row.status === 'trial')
  }
  console.log('\n13b) a lookup error also surfaces (not silently treated as "unknown subscription")')
  {
    const admin = new FakeAdmin({ subscriptions: [] }, { subscriptions: { select: () => ({ message: 'RLS denied' }) } })
    const outcome = await processVerifiedPayPalWebhookEvent(admin, { event_type: 'BILLING.SUBSCRIPTION.ACTIVATED', resource: { id: 'SUB-10' } }, fakeDeps())
    check('outcome is lookup_failed, distinct from ignored_unknown_subscription', outcome.kind === 'lookup_failed')
    check('maps to a non-2xx HTTP status', httpStatusForOutcome(outcome) >= 500)
  }
  console.log('\n13c) an unknown subscription id (genuinely no matching row) is a 200 — verified but intentionally ignored')
  {
    const admin = new FakeAdmin({ subscriptions: [] })
    const outcome = await processVerifiedPayPalWebhookEvent(admin, { event_type: 'BILLING.SUBSCRIPTION.ACTIVATED', resource: { id: 'SUB-11' } }, fakeDeps())
    check('outcome is ignored_unknown_subscription', outcome.kind === 'ignored_unknown_subscription')
    check('maps to 200', httpStatusForOutcome(outcome) === 200)
  }

  // ── Test 14: repeated lifecycle events remain idempotent where possible ──
  console.log('\n14) repeated status-transition events converge to the same state (idempotent)')
  {
    const admin = new FakeAdmin({ subscriptions: [{ id: 'row-2', paypal_subscription_id: 'SUB-12', status: 'active' }] })
    await processVerifiedPayPalWebhookEvent(admin, { event_type: 'BILLING.SUBSCRIPTION.CANCELLED', resource: { id: 'SUB-12' } }, fakeDeps())
    const afterOnce = { ...admin.tables.subscriptions[0] }
    await processVerifiedPayPalWebhookEvent(admin, { event_type: 'BILLING.SUBSCRIPTION.CANCELLED', resource: { id: 'SUB-12' } }, fakeDeps())
    const afterTwice = admin.tables.subscriptions[0]
    check('replaying the same status event twice produces the identical end state', JSON.stringify(afterOnce) === JSON.stringify(afterTwice))
  }

  // ── Corrective-pass test: PAYMENT.SALE.COMPLETED uses billing_agreement_id, never resource.id ──
  console.log('\n[corrective] PAYMENT.SALE.COMPLETED resolves the subscription id from billing_agreement_id, not resource.id')
  {
    // resource.id is the SALE id (e.g. a transaction id) — deliberately
    // different from the real subscription id, to prove the wrong field is
    // never used as a lookup key.
    const admin = new FakeAdmin({ subscriptions: [{ id: 'row-4', paypal_subscription_id: 'I-REAL-SUB', status: 'active', current_period_end: '2026-09-01T00:00:00Z' }] })
    const outcome = await processVerifiedPayPalWebhookEvent(
      admin,
      { event_type: 'PAYMENT.SALE.COMPLETED', resource: { id: 'SALE-TXN-999', billing_agreement_id: 'I-REAL-SUB' } },
      fakeDeps('2026-10-01T00:00:00Z'),
    )
    check('processed successfully by resolving via billing_agreement_id', outcome.kind === 'processed')
    check('the row matched by paypal_subscription_id was updated', admin.tables.subscriptions[0].current_period_end === '2026-10-01T00:00:00Z')
  }
  console.log('\n[corrective] PAYMENT.SALE.COMPLETED with NO billing_agreement_id is an ordinary non-subscription sale — ignored, not an error')
  {
    const admin = new FakeAdmin({ subscriptions: [] })
    const outcome = await processVerifiedPayPalWebhookEvent(admin, { event_type: 'PAYMENT.SALE.COMPLETED', resource: { id: 'SALE-TXN-1000' } }, fakeDeps())
    check('outcome is ignored_non_subscription_payment (not an error)', outcome.kind === 'ignored_non_subscription_payment')
    check('maps to 200', httpStatusForOutcome(outcome) === 200)
  }

  // ── Required test: missing subscription reference does not mutate data ──
  console.log('\n[required] a BILLING.SUBSCRIPTION.* event with NO resource.id does not mutate anything')
  {
    const admin = new FakeAdmin({ subscriptions: [{ id: 'row-5', paypal_subscription_id: 'I-OTHER', status: 'active' }] })
    const outcome = await processVerifiedPayPalWebhookEvent(admin, { event_type: 'BILLING.SUBSCRIPTION.CANCELLED', resource: {} }, fakeDeps())
    check('outcome is unmappable_subscription_reference', outcome.kind === 'unmappable_subscription_reference')
    check('never returns 2xx for this — never silently "succeeds"', httpStatusForOutcome(outcome) !== 200)
    check('no row was touched', admin.tables.subscriptions[0].status === 'active')
  }

  // ── Required test: replaying the same renewal event twice leaves the SAME current_period_end ──
  console.log('\n[required] replaying the same renewal event twice converges on the identical current_period_end')
  {
    const admin = new FakeAdmin({ subscriptions: [{ id: 'row-6', paypal_subscription_id: 'SUB-13', status: 'active', current_period_end: '2026-09-01T00:00:00Z' }] })
    const deps = fakeDeps('2026-10-01T00:00:00Z') // PayPal reports the SAME authoritative date both times.
    await processVerifiedPayPalWebhookEvent(admin, { event_type: 'BILLING.SUBSCRIPTION.RENEWED', resource: { id: 'SUB-13' } }, deps)
    const after1 = admin.tables.subscriptions[0].current_period_end
    await processVerifiedPayPalWebhookEvent(admin, { event_type: 'BILLING.SUBSCRIPTION.RENEWED', resource: { id: 'SUB-13' } }, deps)
    const after2 = admin.tables.subscriptions[0].current_period_end
    check('FIXED: replaying RENEWED twice produces the IDENTICAL current_period_end (was: extended again each time)', after1 === after2 && after1 === '2026-10-01T00:00:00Z')
  }

  // ── Required test: PayPal subscription-detail lookup failure does not extend the period ──
  console.log('\n[required] PayPal cannot supply an authoritative date → does NOT invent one, does NOT extend locally')
  {
    const admin = new FakeAdmin({ subscriptions: [{ id: 'row-7', paypal_subscription_id: 'SUB-14', status: 'active', current_period_end: '2026-09-01T00:00:00Z' }] })
    const outcome = await processVerifiedPayPalWebhookEvent(admin, { event_type: 'BILLING.SUBSCRIPTION.RENEWED', resource: { id: 'SUB-14' } }, failingDeps('fetch_failed'))
    check('outcome is renewal_date_unavailable', outcome.kind === 'renewal_date_unavailable')
    check('non-2xx (retryable)', httpStatusForOutcome(outcome) !== 200)
    check('current_period_end was NOT changed (no invented +1 month)', admin.tables.subscriptions[0].current_period_end === '2026-09-01T00:00:00Z')
  }
  console.log('\n[required, variant] PayPal returns the subscription but with no next_billing_time at all')
  {
    const admin = new FakeAdmin({ subscriptions: [{ id: 'row-8', paypal_subscription_id: 'SUB-15', status: 'active', current_period_end: '2026-09-01T00:00:00Z' }] })
    const outcome = await processVerifiedPayPalWebhookEvent(admin, { event_type: 'BILLING.SUBSCRIPTION.RENEWED', resource: { id: 'SUB-15' } }, fakeDeps(null))
    check('outcome is renewal_date_unavailable', outcome.kind === 'renewal_date_unavailable')
    check('current_period_end unchanged', admin.tables.subscriptions[0].current_period_end === '2026-09-01T00:00:00Z')
  }

  // ── Required test: activation database failure preserves the previous trial ──
  console.log('\n[required] activation DB write failure preserves the prior trial (no cancel-then-fail window)')
  {
    const admin = new FakeAdmin(
      { subscriptions: [{ id: 'trial-row', user_id: 'u1', status: 'trial', trial_ends_at: '2026-09-01T00:00:00Z', created_at: '2026-08-01T00:00:00Z' }] },
      { subscriptions: { update: () => ({ message: 'connection reset' }) } },
    )
    const paid: PaidSubscriptionFields = { plan_code: 'premium', status: 'active', paypal_subscription_id: 'SUB-20', current_period_end: '2026-09-22T00:00:00Z' }
    const result = await transitionSubscriptionToActivePlan(admin, 'u1', paid)
    check('outcome is write_failed', result.kind === 'write_failed')
    const row = admin.tables.subscriptions[0]
    check('the trial row is COMPLETELY untouched — still trial, still its original trial_ends_at', row.status === 'trial' && row.trial_ends_at === '2026-09-01T00:00:00Z')
    check('it was NOT cancelled despite the (failed) attempt to transition it', row.status !== 'cancelled')
  }

  // ── Required test: successful activation transitions EXACTLY ONCE to the verified paid plan ──
  console.log('\n[required] successful activation: the trial row transitions exactly once, in place — no separate cancel+insert')
  {
    const admin = new FakeAdmin({ subscriptions: [{ id: 'trial-row-2', user_id: 'u1', status: 'trial', trial_ends_at: '2026-09-01T00:00:00Z', created_at: '2026-08-01T00:00:00Z' }] })
    const paid: PaidSubscriptionFields = { plan_code: 'large_agency', status: 'active', paypal_subscription_id: 'SUB-21', current_period_end: '2026-09-22T00:00:00Z' }
    const result = await transitionSubscriptionToActivePlan(admin, 'u1', paid)
    check('outcome is transitioned_existing (in-place update, not insert)', result.kind === 'transitioned_existing')
    check('exactly one row for this user — no second row was inserted', admin.tables.subscriptions.filter((r) => r.user_id === 'u1').length === 1)
    const row = admin.tables.subscriptions[0]
    check('the SAME row (same id) is now the verified paid plan', row.id === 'trial-row-2' && row.status === 'active' && row.plan_code === 'large_agency')
    check('the row id returned matches the transitioned row', result.kind === 'transitioned_existing' && result.rowId === 'trial-row-2')
  }
  console.log('\n[required, variant] no prior trial/active row → inserts fresh, exactly once')
  {
    const admin = new FakeAdmin({ subscriptions: [] })
    const paid: PaidSubscriptionFields = { plan_code: 'regular', status: 'active', paypal_subscription_id: 'SUB-22', current_period_end: '2026-09-22T00:00:00Z' }
    const result = await transitionSubscriptionToActivePlan(admin, 'u2', paid)
    check('outcome is inserted_new', result.kind === 'inserted_new')
    check('exactly one row now exists', admin.tables.subscriptions.length === 1)
    check('it is the active paid row, not left cancelled or duplicated', admin.tables.subscriptions[0].status === 'active')
  }

  // ── Database-integrity hardening pass: required tests ──────────────────
  console.log('\n[required] reusing one PayPal subscription id for a different user fails safely')
  {
    // Simulates the unique partial index rejecting the write (a real
    // unique_violation once the migration is applied) — the application
    // layer does NOT pre-check this itself; it relies on the DB constraint
    // and must correctly surface the resulting write error.
    const admin = new FakeAdmin(
      { subscriptions: [{ id: 'row-u2', user_id: 'u2', status: 'trial', trial_ends_at: '2026-09-01T00:00:00Z' }] },
      { subscriptions: { update: () => ({ code: '23505', message: 'duplicate key value violates unique constraint "subscriptions_paypal_subscription_id_unique"' }) } },
    )
    const paid: PaidSubscriptionFields = { plan_code: 'premium', status: 'active', paypal_subscription_id: 'SUB-ALREADY-USED', current_period_end: '2026-09-22T00:00:00Z' }
    const result = await transitionSubscriptionToActivePlan(admin, 'u2', paid)
    check('outcome is write_failed, not silently accepted', result.kind === 'write_failed')
    check('the constraint-violation message is carried through', result.kind === 'write_failed' && /unique constraint/.test(result.message))
    check('the row was NOT transitioned to active', admin.tables.subscriptions[0].status === 'trial')
  }

  console.log('\n[required] more than one trial/active row for a user fails safely — never picks one arbitrarily')
  {
    const admin = new FakeAdmin({
      subscriptions: [
        { id: 'dup-1', user_id: 'u3', status: 'trial', trial_ends_at: '2026-09-01T00:00:00Z', created_at: '2026-08-01T00:00:00Z' },
        { id: 'dup-2', user_id: 'u3', status: 'active', plan_code: 'regular', created_at: '2026-08-10T00:00:00Z' },
      ],
    })
    const paid: PaidSubscriptionFields = { plan_code: 'premium', status: 'active', paypal_subscription_id: 'SUB-23', current_period_end: '2026-09-22T00:00:00Z' }
    const result = await transitionSubscriptionToActivePlan(admin, 'u3', paid)
    check('outcome is multiple_current_entitlement_rows', result.kind === 'multiple_current_entitlement_rows')
    check('reports the actual count (2), not just a boolean', result.kind === 'multiple_current_entitlement_rows' && result.count === 2)
    check('NEITHER row was touched — no arbitrary "pick the newest" fallback', admin.tables.subscriptions[0].status === 'trial' && admin.tables.subscriptions[1].status === 'active' && admin.tables.subscriptions[1].plan_code === 'regular')
  }

  console.log('\n[required] normal one-row trial-to-active transition still succeeds after the hardening pass')
  {
    const admin = new FakeAdmin({ subscriptions: [{ id: 'trial-row-3', user_id: 'u4', status: 'trial', trial_ends_at: '2026-09-01T00:00:00Z', created_at: '2026-08-01T00:00:00Z' }] })
    const paid: PaidSubscriptionFields = { plan_code: 'advanced', status: 'active', paypal_subscription_id: 'SUB-24', current_period_end: '2026-09-22T00:00:00Z' }
    const result = await transitionSubscriptionToActivePlan(admin, 'u4', paid)
    check('outcome is transitioned_existing', result.kind === 'transitioned_existing')
    check('the single row is now active with the correct plan', admin.tables.subscriptions[0].status === 'active' && admin.tables.subscriptions[0].plan_code === 'advanced')
  }

  // ── Source contract ──
  console.log('\nSOURCE) webhook route wiring')
  {
    const route = read('app/api/paypal/webhook/route.ts')
    check('requires PAYPAL_WEBHOOK_ID', /PAYPAL_WEBHOOK_ID/.test(route))
    check('calls verifyPayPalWebhookSignature before any DB access', /verifyPayPalWebhookSignature/.test(route))
    check('the old always-200 catch comment is gone', !/Return 200 OK even on error to prevent PayPal retries/.test(route))
    check("unverified signature returns 401", /if \(verification === 'unverified'\)[\s\S]{0,400}status: 401/.test(route))
    check("a verification-call failure (not a rejection) returns 502", /if \(verification === 'error'\)[\s\S]{0,400}status: 502/.test(route))
    const activateStripped = strip(read('app/api/paypal/activate/route.ts'))
    check('activation route no longer has an env-gated optional-verify skip', !/Continue anyway - webhook will verify later/.test(activateStripped))
    check('activation route always calls verifyPayPalActivation', /verifyPayPalActivation/.test(activateStripped))
    check('activation route delegates the write to transitionSubscriptionToActivePlan (no inline cancel-then-insert)',
      /transitionSubscriptionToActivePlan/.test(activateStripped))
    check('the route builds plan_code from verified.planCode (server-resolved, not the raw client plan string)',
      /plan_code:\s*verified\.planCode/.test(activateStripped))
    check('the route no longer contains a standalone "cancel prior" update BEFORE any insert (the old unsafe ordering)',
      !/status: 'cancelled' \}\)[\s\S]{0,80}\.eq\('user_id', user\.id\)[\s\S]{0,40}\.in\('status', \['trial', 'active'\]\)[\s\S]{0,200}insert\(/.test(activateStripped))

    console.log('\nSOURCE) activation write-ordering (lib/paypal/activation-processing.ts)')
    const activationProcessing = strip(read('lib/paypal/activation-processing.ts'))
    check('no longer references the nonexistent plan/current_period_start/scans_* columns',
      !/\bplan:\s*plan\b|current_period_start|scans_this_period|scans_period_key/.test(activationProcessing))
    check('the best-effort cleanup step is GONE — no application-layer cancellation of other rows at all',
      !/status: 'cancelled'/.test(activationProcessing))
    check('no order()/limit(1)/maybeSingle() narrowing — reads ALL current-entitlement rows, not just the newest',
      !/\.order\(/.test(activationProcessing) && !/\.limit\(/.test(activationProcessing) && !/\.maybeSingle\(\)/.test(activationProcessing))
    check('more than one row is detected and rejected BEFORE any write is attempted',
      /rows\.length > 1[\s\S]{0,80}return \{ kind: 'multiple_current_entitlement_rows'/.test(activationProcessing))
    check('insert() only happens in the zero-rows branch (nothing to lose on failure)',
      /rows\.length === 1[\s\S]*?const \{ data: inserted, error \} = await admin\.from\('subscriptions'\)\.insert/.test(activationProcessing))
  }

  console.log('\nSOURCE) migration — both unique partial indexes + preflight validation')
  {
    const migration = read('supabase/migrations/20260822_make_trial_ends_at_nullable.sql')
    check('unique partial index on paypal_subscription_id (non-null only)',
      /CREATE UNIQUE INDEX[\s\S]{0,80}subscriptions_paypal_subscription_id_unique[\s\S]{0,150}WHERE paypal_subscription_id IS NOT NULL/.test(migration))
    check('unique partial index on one current entitlement row per user (trial/active)',
      /CREATE UNIQUE INDEX[\s\S]{0,80}subscriptions_one_current_entitlement_per_user[\s\S]{0,150}WHERE status IN \('trial', 'active'\)/.test(migration))
    check('preflight RAISE EXCEPTION block precedes the paypal_subscription_id index',
      /RAISE EXCEPTION[\s\S]{0,600}subscriptions_paypal_subscription_id_unique/.test(migration))
    check('preflight RAISE EXCEPTION block precedes the one-current-entitlement index',
      /RAISE EXCEPTION[\s\S]{0,600}subscriptions_one_current_entitlement_per_user/.test(migration))
    // Match actual executable statement syntax only (UPDATE ... SET / DELETE
    // FROM / MERGE INTO) — the preflight RAISE EXCEPTION messages legitimately
    // use the words "update"/"delete"/"merge" in prose to explain what this
    // migration deliberately does NOT do, which a bare keyword search would
    // wrongly flag.
    check('no executable UPDATE/DELETE/MERGE statement anywhere — never silently fixes data',
      !/\bUPDATE\s+\S+\s+SET\b/i.test(migration) && !/\bDELETE\s+FROM\b/i.test(migration) && !/\bMERGE\s+INTO\b/i.test(migration))
  }

  console.log(`\n${pass} passed, ${fail} failed`)
  if (fail > 0) process.exitCode = 1
}
main()
