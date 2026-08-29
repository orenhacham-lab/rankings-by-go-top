/**
 * Corrective pass — regression coverage for a production-blocking PayPal
 * renewal date-COMPARISON bug found during staging review:
 * lib/paypal/webhook-processing.ts compared billing-period timestamps as
 * raw strings (`authoritative.periodEnd === previousPeriodEnd`,
 * `authoritative.periodEnd < previousPeriodEnd`). PayPal commonly returns
 * "2036-01-01T00:00:00Z"; Postgres/PostgREST can return the SAME instant as
 * "2036-01-01T00:00:00+00:00"; fractional-second precision can also differ.
 * Equivalent instants therefore did not always compare equal, and a
 * duplicate renewal could be misclassified as a genuinely newer one,
 * corrupting the stored period into a zero-length or backward-moving
 * window.
 *
 * The fix (lib/paypal/timestamp.ts + lib/paypal/webhook-processing.ts +
 * lib/paypal/client.ts + lib/billing/usage-period.ts): every comparison now
 * goes through `parseInstantMs` (epoch milliseconds, Number.isFinite-
 * validated); every value persisted back to the database goes through
 * normalization to the canonical `new Date(ms).toISOString()` form.
 *
 * This file exercises the ACTUAL comparison logic in
 * processVerifiedPayPalWebhookEvent directly with hand-rolled ProcessDeps
 * (bypassing lib/paypal/client.ts's own normalization on purpose, for tests
 * F/G specifically) so the exact representational mismatches described in
 * the bug report are reproduced byte-for-byte. Run:
 *   npx tsx lib/paypal/__qa__/phase3-timestamp-comparison-fix.qa.ts
 */
import { FakeAdmin } from '../../__qa__/_fake-admin'
import { processVerifiedPayPalWebhookEvent, type ProcessDeps } from '../webhook-processing'
import { parseInstantMs, normalizeInstant } from '../timestamp'

let pass = 0, fail = 0
function check(name: string, cond: boolean, detail?: string) {
  if (cond) { pass++; console.log(`  ✓ ${name}`) } else { fail++; console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`) }
}

function depsReturning(periodEnd: string, periodStart: string | null = null): ProcessDeps {
  return { fetchAuthoritativeBillingPeriod: async () => ({ ok: true, periodEnd, periodStart }) }
}
function subRow(overrides: Record<string, unknown>) {
  return { id: 'row', paypal_subscription_id: 'SUB', status: 'active', current_period_start: null, current_period_end: null, ...overrides }
}

async function main() {
  console.log('Corrective pass — PayPal renewal timestamp-comparison fix QA\n')

  console.log('0) lib/paypal/timestamp.ts — the shared helper itself')
  {
    check('parseInstantMs parses a clean UTC "Z" timestamp', parseInstantMs('2036-01-01T00:00:00Z') === Date.UTC(2036, 0, 1, 0, 0, 0))
    check('parseInstantMs parses an equivalent "+00:00" timestamp to the SAME epoch ms', parseInstantMs('2036-01-01T00:00:00+00:00') === Date.UTC(2036, 0, 1, 0, 0, 0))
    check('parseInstantMs parses an equivalent non-UTC-offset timestamp to the SAME epoch ms', parseInstantMs('2036-01-01T02:00:00+02:00') === Date.UTC(2036, 0, 1, 0, 0, 0))
    check('parseInstantMs returns null for null', parseInstantMs(null) === null)
    check('parseInstantMs returns null for undefined', parseInstantMs(undefined) === null)
    check('parseInstantMs returns null for an empty string', parseInstantMs('') === null)
    check('parseInstantMs returns null for unparseable garbage', parseInstantMs('not-a-real-date') === null)
    check('normalizeInstant round-trips a clean input to the canonical .000Z form', normalizeInstant('2036-01-01T00:00:00Z') === '2036-01-01T00:00:00.000Z')
    check('normalizeInstant maps an equivalent "+00:00" input to the IDENTICAL canonical string as the "Z" input', normalizeInstant('2036-01-01T00:00:00+00:00') === normalizeInstant('2036-01-01T00:00:00Z'))
    check('normalizeInstant returns null for garbage (never invents a date)', normalizeInstant('garbage') === null)
  }

  console.log('\nA) Stored "2036-01-01T00:00:00+00:00" vs authoritative "2036-01-01T00:00:00Z" — the EXACT representational mismatch from the bug report')
  {
    const before = subRow({ paypal_subscription_id: 'SUB-A', current_period_start: '2035-12-01T00:00:00Z', current_period_end: '2036-01-01T00:00:00+00:00' })
    const admin = new FakeAdmin({ subscriptions: [{ ...before }] })
    const outcome = await processVerifiedPayPalWebhookEvent(admin, { event_type: 'BILLING.SUBSCRIPTION.RENEWED', resource: { id: 'SUB-A' } }, depsReturning('2036-01-01T00:00:00Z'))
    check('A: outcome is renewal_duplicate (NOT processed — was misclassified as newer under the old string compare)', outcome.kind === 'renewal_duplicate')
    check('A: no DB update — row completely untouched', admin.tables.subscriptions[0].current_period_end === before.current_period_end && admin.tables.subscriptions[0].current_period_start === before.current_period_start)
  }

  console.log('\nB) Equivalent timezone-offset representations of the same instant')
  {
    const before = subRow({ paypal_subscription_id: 'SUB-B', current_period_start: '2035-12-01T00:00:00Z', current_period_end: '2036-01-01T05:30:00+05:30' }) // = 2036-01-01T00:00:00Z
    const admin = new FakeAdmin({ subscriptions: [{ ...before }] })
    const outcome = await processVerifiedPayPalWebhookEvent(admin, { event_type: 'BILLING.SUBSCRIPTION.RENEWED', resource: { id: 'SUB-B' } }, depsReturning('2036-01-01T00:00:00Z'))
    check('B: outcome is renewal_duplicate', outcome.kind === 'renewal_duplicate')
    check('B: no DB update', admin.tables.subscriptions[0].current_period_end === before.current_period_end)
  }

  console.log('\nC) Equivalent values with different fractional-second precision')
  {
    const before = subRow({ paypal_subscription_id: 'SUB-C', current_period_start: '2035-12-01T00:00:00Z', current_period_end: '2036-01-01T00:00:00.000000Z' })
    const admin = new FakeAdmin({ subscriptions: [{ ...before }] })
    const outcome = await processVerifiedPayPalWebhookEvent(admin, { event_type: 'BILLING.SUBSCRIPTION.RENEWED', resource: { id: 'SUB-C' } }, depsReturning('2036-01-01T00:00:00Z'))
    check('C: outcome is renewal_duplicate', outcome.kind === 'renewal_duplicate')
    check('C: no DB update', admin.tables.subscriptions[0].current_period_end === before.current_period_end)
  }

  console.log('\nD) Authoritative instant genuinely OLDER, despite a lexicographically MISLEADING representation')
  console.log('    stored = "2036-01-01T00:00:00Z" (Jan 1, 00:00 UTC). authoritative = "2036-01-01T01:30:00+02:00" (= Dec 31 23:30 UTC — 30 min EARLIER).')
  console.log('    A PLAIN STRING compare says authoritative > stored (lexicographically "01:30...+02:00" > "00:00...Z") — the OLD buggy code would have')
  console.log('    WRONGLY treated this as a newer renewal and overwritten the period with a BACKWARD-moving boundary. Verified below that it does not.')
  {
    const storedInstant = Date.parse('2036-01-01T00:00:00Z')
    const authoritativeInstant = Date.parse('2036-01-01T01:30:00+02:00')
    check('(sanity) the authoritative instant really is earlier than the stored one', authoritativeInstant < storedInstant)
    const before = subRow({ paypal_subscription_id: 'SUB-D', current_period_start: '2035-12-01T00:00:00Z', current_period_end: '2036-01-01T00:00:00Z' })
    const admin = new FakeAdmin({ subscriptions: [{ ...before }] })
    const outcome = await processVerifiedPayPalWebhookEvent(admin, { event_type: 'BILLING.SUBSCRIPTION.RENEWED', resource: { id: 'SUB-D' } }, depsReturning('2036-01-01T01:30:00+02:00'))
    check('D: outcome is renewal_stale (correctly older, NOT processed as newer)', outcome.kind === 'renewal_stale')
    check('D: no DB update — row completely untouched', admin.tables.subscriptions[0].current_period_end === before.current_period_end && admin.tables.subscriptions[0].current_period_start === before.current_period_start)
  }

  console.log('\nE) Authoritative instant genuinely NEWER')
  {
    const before = subRow({ paypal_subscription_id: 'SUB-E', current_period_start: '2035-12-01T00:00:00Z', current_period_end: '2036-01-01T00:00:00Z' })
    const admin = new FakeAdmin({ subscriptions: [{ ...before }] })
    const outcome = await processVerifiedPayPalWebhookEvent(admin, { event_type: 'BILLING.SUBSCRIPTION.RENEWED', resource: { id: 'SUB-E' } }, depsReturning('2036-02-01T00:00:00Z'))
    const after = admin.tables.subscriptions[0]
    check('E: outcome is processed', outcome.kind === 'processed')
    check('E: current_period_end is the new authoritative instant, normalized', after.current_period_end === '2036-02-01T00:00:00.000Z')
    check('E: current_period_start is the PRIOR stored period end, normalized', after.current_period_start === '2036-01-01T00:00:00.000Z')
  }

  console.log('\nF) Invalid authoritative periodEnd — fails closed, never guesses')
  {
    const before = subRow({ paypal_subscription_id: 'SUB-F', current_period_start: '2035-12-01T00:00:00Z', current_period_end: '2036-01-01T00:00:00Z' })
    const admin = new FakeAdmin({ subscriptions: [{ ...before }] })
    const outcome = await processVerifiedPayPalWebhookEvent(admin, { event_type: 'BILLING.SUBSCRIPTION.RENEWED', resource: { id: 'SUB-F' } }, depsReturning('not-a-real-timestamp'))
    check('F: outcome is renewal_date_unavailable', outcome.kind === 'renewal_date_unavailable')
    check("F: reason distinguishes THIS failure from a stored-value failure", outcome.kind === 'renewal_date_unavailable' && outcome.reason === 'unparseable_authoritative_period_end')
    check('F: no DB update', admin.tables.subscriptions[0].current_period_end === before.current_period_end)
  }

  console.log('\nG) Invalid stored current_period_end — fails closed WITHOUT mutating the subscription, distinguishable reason')
  {
    const before = subRow({ paypal_subscription_id: 'SUB-G', current_period_start: '2035-12-01T00:00:00Z', current_period_end: 'corrupt-legacy-value' })
    const admin = new FakeAdmin({ subscriptions: [{ ...before }] })
    const outcome = await processVerifiedPayPalWebhookEvent(admin, { event_type: 'BILLING.SUBSCRIPTION.RENEWED', resource: { id: 'SUB-G' } }, depsReturning('2036-01-01T00:00:00Z'))
    check('G: outcome is renewal_date_unavailable', outcome.kind === 'renewal_date_unavailable')
    check("G: reason distinguishes THIS failure from an authoritative-value failure", outcome.kind === 'renewal_date_unavailable' && outcome.reason === 'unparseable_stored_period_end')
    check('G: no DB update — the corrupt value is left exactly as-is, never guessed at or silently repaired', admin.tables.subscriptions[0].current_period_end === 'corrupt-legacy-value')
  }

  console.log('\nH) Missing stored current_period_end — missing-period recovery preserved')
  {
    const before = subRow({ paypal_subscription_id: 'SUB-H', current_period_start: null, current_period_end: null })
    const admin = new FakeAdmin({ subscriptions: [{ ...before }] })
    const outcome = await processVerifiedPayPalWebhookEvent(admin, { event_type: 'BILLING.SUBSCRIPTION.RENEWED', resource: { id: 'SUB-H' } }, depsReturning('2036-01-01T00:00:00Z'))
    const after = admin.tables.subscriptions[0]
    check('H: outcome is processed', outcome.kind === 'processed')
    check('H: current_period_start remains null (never invented)', after.current_period_start === null)
    check('H: current_period_end is set, normalized', after.current_period_end === '2036-01-01T00:00:00.000Z')
  }

  console.log('\nI) Two concurrent renewal handlers reading the SAME stored boundary — exactly one wins, the loser cannot overwrite it')
  {
    const before = subRow({ paypal_subscription_id: 'SUB-I', current_period_start: '2035-12-01T00:00:00Z', current_period_end: '2036-01-01T00:00:00Z' })
    const admin = new FakeAdmin({ subscriptions: [{ ...before }] })
    const depsA = depsReturning('2036-02-01T00:00:00Z')
    const depsB = depsReturning('2036-02-01T00:00:00Z')
    const [rA, rB] = await Promise.all([
      processVerifiedPayPalWebhookEvent(admin, { event_type: 'BILLING.SUBSCRIPTION.RENEWED', resource: { id: 'SUB-I' } }, depsA),
      processVerifiedPayPalWebhookEvent(admin, { event_type: 'BILLING.SUBSCRIPTION.RENEWED', resource: { id: 'SUB-I' } }, depsB),
    ])
    const outcomes = [rA.kind, rB.kind].sort()
    check('I: exactly one conditional update wins (processed), the other gets renewal_conflict', outcomes[0] === 'processed' && outcomes[1] === 'renewal_conflict', `outcomes=${outcomes.join(',')}`)
    const after = admin.tables.subscriptions[0]
    check('I: the row ends at the winner\'s (normalized) boundary — the loser could NOT overwrite it', after.current_period_end === '2036-02-01T00:00:00.000Z' && after.current_period_start === '2036-01-01T00:00:00.000Z')
  }

  console.log(`\n${pass} passed, ${fail} failed`)
  if (fail > 0) process.exitCode = 1
}
main()
