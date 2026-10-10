/**
 * The webhook handler is the only thing standing between a Creem event and a
 * customer's entitlement, so this suite drives it against a fake admin
 * client and a fake Creem, and asserts the things that cost real money when
 * they go wrong:
 *
 *  A) the event type decides the effect, and an undocumented one decides
 *     nothing at all
 *  B) activation grants the plan Creem reports, refuses a product we do not
 *     recognise, and never attaches a payment to an account that does not
 *     exist
 *  C) a redelivered checkout grants once
 *  D) a lifecycle event moves the status of the right row, and an id we do
 *     not hold writes nothing
 *  E) a renewal advances the period from Creem's own date, and a duplicate,
 *     an out-of-order and a concurrently-raced delivery each leave the row
 *     correct
 *  F) the HTTP answer never reads as success for work that failed
 *
 * MUTATION CONTROLS at the end break the four rules that would actually cost
 * money — trusting the event body's product, granting on an unpaid checkout,
 * granting twice on a retry, and computing the period locally — and show the
 * assertions catch each one.
 *
 * Nothing here touches live Creem, live Supabase, or production data: the
 * subscription ids, product ids and account ids below are fabricated in this
 * file.
 *
 * Run: npx tsx lib/creem/__qa__/creem-webhook-processing.qa.ts
 */
import { FakeAdmin } from '@/lib/__qa__/_fake-admin'
import {
  processVerifiedCreemEvent,
  httpStatusForCreemOutcome,
  type CreemProcessDeps,
  type CreemWebhookEvent,
  type CreemWebhookOutcome,
} from '../webhook-processing'
import type { CreemResult, CreemSubscriptionSnapshot } from '../client'

let pass = 0, fail = 0
function check(name: string, cond: boolean, detail?: string) {
  if (cond) { pass++; console.log(`  ✓ ${name}`) } else { fail++; console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`) }
}

// Our configured products, set for this process only. The resolver reads
// process.env on every call (lib/creem/checkout-products.ts).
const ENV = process.env as Record<string, string | undefined>
ENV.CREEM_PRODUCT_ID_USD_REGULAR = 'prod_regular'
ENV.CREEM_PRODUCT_ID_USD_ADVANCED = 'prod_advanced'
ENV.CREEM_PRODUCT_ID_USD_PREMIUM = 'prod_premium'
ENV.CREEM_PRODUCT_ID_USD_LARGE_AGENCY = 'prod_large_agency'
// Sandbox mode writes only to accounts named here. Every scenario below uses
// USER, so the suite declares it as the test account; section H proves the
// restriction itself by taking it away.
ENV.CREEM_TEST_ACCOUNT_IDS = '11111111-1111-1111-1111-111111111111'

const USER = '11111111-1111-1111-1111-111111111111'
const PERIOD_END = '2026-11-10T00:00:00.000Z'
const NEXT_PERIOD_END = '2026-12-10T00:00:00.000Z'

function snapshot(over: Partial<CreemSubscriptionSnapshot> = {}): CreemSubscriptionSnapshot {
  return {
    id: 'sub_1',
    status: 'active',
    productId: 'prod_advanced',
    customerId: 'cust_1',
    currentPeriodStart: '2026-10-10T00:00:00Z',
    currentPeriodEnd: PERIOD_END,
    metadata: null,
    ...over,
  }
}

/** A fake Creem that answers with whatever the test hands it, and counts
 *  calls so "the plan came from the server read" is provable. */
function fakeCreem(answer: CreemResult<CreemSubscriptionSnapshot>): CreemProcessDeps & { calls: string[] } {
  const calls: string[] = []
  return {
    calls,
    fetchSubscription: async (id: string) => { calls.push(id); return answer },
  }
}

/** An account that exists, and no subscription rows. */
function adminWith(rows: Record<string, unknown>[] = [], profiles = [{ id: USER }]) {
  return new FakeAdmin({ subscriptions: rows, profiles })
}

const checkoutEvent = (over: Record<string, unknown> = {}): CreemWebhookEvent => ({
  id: 'evt_1',
  eventType: 'checkout.completed',
  object: { id: 'ch_1', request_id: USER, subscription: { id: 'sub_1' }, ...over },
})

const subscriptionEvent = (eventType: string, over: Record<string, unknown> = {}): CreemWebhookEvent => ({
  id: 'evt_2',
  eventType,
  object: { id: 'sub_1', ...over },
})

async function run() {
  console.log('\nA) the event type decides the effect')
  {
    const deps = fakeCreem({ ok: true, value: snapshot() })

    const noType = await processVerifiedCreemEvent(adminWith(), { object: {} }, deps)
    check('A1: an event with no type is ignored', noType.kind === 'ignored_malformed_event')

    const noObject = await processVerifiedCreemEvent(adminWith(), { eventType: 'subscription.active' }, deps)
    check('A2: an event with no object is ignored', noObject.kind === 'ignored_malformed_event')

    const invented = await processVerifiedCreemEvent(adminWith(), { eventType: 'subscription.exploded', object: { id: 'sub_1' } }, deps)
    check('A3: an undocumented event type writes nothing', invented.kind === 'ignored_unknown_event_type')

    const credits = await processVerifiedCreemEvent(adminWith(), { eventType: 'credits.granted', object: { id: 'x' } }, deps)
    check('A4: an event with no entitlement meaning is reported as such', credits.kind === 'ignored_no_effect')

    const dispute = await processVerifiedCreemEvent(adminWith(), { eventType: 'dispute.created', object: { id: 'x' } }, deps)
    check('A5: a dispute asks for a human instead of changing access', dispute.kind === 'operator_attention')

    check('A6: none of the above asked Creem anything', deps.calls.length === 0)
  }

  console.log('\nB) activation')
  {
    const admin = adminWith()
    const deps = fakeCreem({ ok: true, value: snapshot() })
    const result = await processVerifiedCreemEvent(admin, checkoutEvent(), deps)
    check('B1: a completed checkout grants the plan', result.kind === 'activated', JSON.stringify(result))
    check('B2: the plan is the one the SERVER read resolves, not the event body',
      result.kind === 'activated' && result.plan === 'advanced')
    check('B3: Creem was asked about the subscription itself', deps.calls.length === 1 && deps.calls[0] === 'sub_1')
    const row = admin.tables.subscriptions[0] as Record<string, unknown>
    check('B4: the row records the Creem subscription id', row?.creem_subscription_id === 'sub_1')
    check('B5: the row carries no PayPal id', row?.paypal_subscription_id === undefined)
    check('B6: the period end is Creem\'s own date, normalised', row?.current_period_end === PERIOD_END)
    check('B7: the row belongs to the account the checkout named', row?.user_id === USER)
    check('B8: the status is active', row?.status === 'active')

    // A product that is not one of ours: an upgrade nobody notices is worse
    // than a failed activation.
    const unknownProduct = adminWith()
    const r2 = await processVerifiedCreemEvent(unknownProduct, checkoutEvent(), fakeCreem({ ok: true, value: snapshot({ productId: 'prod_someone_elses' }) }))
    check('B9: an unrecognised product grants nothing',
      r2.kind === 'activation_refused' && r2.reason === 'unknown_product')
    check('B9b: and writes no row', unknownProduct.tables.subscriptions.length === 0)

    // A checkout that was opened but never paid.
    const unpaid = adminWith()
    const r3 = await processVerifiedCreemEvent(unpaid, checkoutEvent(), fakeCreem({ ok: true, value: snapshot({ status: 'incomplete' }) }))
    check('B10: a subscription Creem does not call live grants nothing',
      r3.kind === 'activation_refused' && r3.reason === 'subscription_not_live')
    check('B10b: and writes no row', unpaid.tables.subscriptions.length === 0)

    // No account reference at all.
    const noRef = adminWith()
    const r4 = await processVerifiedCreemEvent(noRef, { eventType: 'checkout.completed', object: { id: 'ch_2', subscription: 'sub_9' } }, fakeCreem({ ok: true, value: snapshot() }))
    check('B11: a checkout naming no account grants nothing',
      r4.kind === 'activation_refused' && r4.reason === 'no_account_reference')

    // An account that does not exist.
    const strangerAdmin = new FakeAdmin({ subscriptions: [], profiles: [] })
    const r5 = await processVerifiedCreemEvent(strangerAdmin, checkoutEvent(), fakeCreem({ ok: true, value: snapshot() }))
    check('B12: a payment is never attached to an account that does not exist',
      r5.kind === 'activation_refused' && r5.reason === 'unknown_account')
    check('B12b: and writes no row', strangerAdmin.tables.subscriptions.length === 0)

    // Creem unreachable: retryable, and nothing granted meanwhile.
    const unreachable = adminWith()
    const r6 = await processVerifiedCreemEvent(unreachable, checkoutEvent(), fakeCreem({ ok: false, reason: 'timeout' }))
    check('B13: an unreachable Creem grants nothing and is retryable',
      r6.kind === 'activation_unverifiable' && r6.reason === 'timeout')
    check('B13b: and writes no row', unreachable.tables.subscriptions.length === 0)

    // No period end reported: never invented.
    const noEnd = adminWith()
    const r7 = await processVerifiedCreemEvent(noEnd, checkoutEvent(), fakeCreem({ ok: true, value: snapshot({ currentPeriodEnd: null }) }))
    check('B14: a missing period end is refused, never computed locally',
      r7.kind === 'activation_refused' && r7.reason === 'no_period_end')
    check('B14b: and writes no row', noEnd.tables.subscriptions.length === 0)

    // A checkout with no subscription behind it.
    const oneOff = adminWith()
    const r8 = await processVerifiedCreemEvent(oneOff, { eventType: 'checkout.completed', object: { id: 'ch_3', request_id: USER } }, fakeCreem({ ok: true, value: snapshot() }))
    check('B15: a checkout with no subscription grants nothing',
      r8.kind === 'activation_refused' && r8.reason === 'no_subscription_on_checkout')

    // The account reference may also arrive in metadata.
    const viaMetadata = adminWith()
    const r9 = await processVerifiedCreemEvent(viaMetadata, { eventType: 'checkout.completed', object: { id: 'ch_4', subscription: 'sub_1', metadata: { user_id: USER } } }, fakeCreem({ ok: true, value: snapshot() }))
    check('B16: metadata.user_id is accepted as the account reference', r9.kind === 'activated')
  }

  console.log('\nB′) an existing trial is replaced in place, never cancelled first')
  {
    const admin = adminWith([{ id: 'row-1', user_id: USER, plan_code: 'trial', status: 'trial', creem_subscription_id: null }])
    const r = await processVerifiedCreemEvent(admin, checkoutEvent(), fakeCreem({ ok: true, value: snapshot({ productId: 'prod_premium' }) }))
    check('B17: the trial row becomes the paid row', r.kind === 'activated')
    check('B17b: there is still exactly one row', admin.tables.subscriptions.length === 1)
    const row = admin.tables.subscriptions[0] as Record<string, unknown>
    check('B17c: it is the same row, now on the paid plan', row.id === 'row-1' && row.plan_code === 'premium' && row.status === 'active')

    // Two current rows: an invariant broken before this event. Never resolved
    // by picking one.
    const broken = adminWith([
      { id: 'a', user_id: USER, status: 'trial' },
      { id: 'b', user_id: USER, status: 'active' },
    ])
    const r2 = await processVerifiedCreemEvent(broken, checkoutEvent(), fakeCreem({ ok: true, value: snapshot() }))
    check('B18: two current entitlement rows fail loudly instead of being guessed between',
      r2.kind === 'activation_write_failed')
  }

  console.log('\nC) a redelivered checkout grants once')
  {
    const admin = adminWith()
    const first = await processVerifiedCreemEvent(admin, checkoutEvent(), fakeCreem({ ok: true, value: snapshot() }))
    const second = await processVerifiedCreemEvent(admin, checkoutEvent(), fakeCreem({ ok: true, value: snapshot() }))
    check('C1: the first delivery activates', first.kind === 'activated')
    check('C2: the second is reported as already applied', second.kind === 'activation_already_applied')
    check('C3: there is one row, not two', admin.tables.subscriptions.length === 1)
    check('C4: a redelivery answers 2xx so Creem stops retrying', httpStatusForCreemOutcome(second) === 200)
  }

  console.log('\nD) lifecycle events')
  {
    const cases: [string, string][] = [
      ['subscription.active', 'active'],
      ['subscription.trialing', 'active'],
      ['subscription.scheduled_cancel', 'active'],
      ['subscription.past_due', 'active'],
      ['subscription.canceled', 'cancelled'],
      ['subscription.expired', 'expired'],
      ['subscription.unpaid', 'inactive'],
      ['subscription.paused', 'inactive'],
    ]
    for (const [eventType, expected] of cases) {
      const admin = adminWith([{ id: 'row-1', user_id: USER, status: 'active', creem_subscription_id: 'sub_1', current_period_end: PERIOD_END }])
      const r = await processVerifiedCreemEvent(admin, subscriptionEvent(eventType), fakeCreem({ ok: true, value: snapshot() }))
      const row = admin.tables.subscriptions[0] as Record<string, unknown>
      check(`D: ${eventType} leaves the row ${expected}`, r.kind === 'processed' && row.status === expected, `${r.kind}/${String(row.status)}`)
    }

    // A row with the same id as a PayPal subscription must not be touched:
    // the lookup is on the Creem column only.
    const paypalOnly = adminWith([{ id: 'row-p', user_id: USER, status: 'active', paypal_subscription_id: 'sub_1', creem_subscription_id: null }])
    const r = await processVerifiedCreemEvent(paypalOnly, subscriptionEvent('subscription.canceled'), fakeCreem({ ok: true, value: snapshot() }))
    check('D9: a Creem event never reaches a PayPal row that shares the id',
      r.kind === 'ignored_unknown_subscription')
    check('D9b: the PayPal row is untouched', (paypalOnly.tables.subscriptions[0] as Record<string, unknown>).status === 'active')

    const noId = adminWith()
    const r2 = await processVerifiedCreemEvent(noId, { eventType: 'subscription.canceled', object: { customer: 'cust_1' } }, fakeCreem({ ok: true, value: snapshot() }))
    check('D10: a subscription event with no id is reported, not shrugged off',
      r2.kind === 'unmappable_subscription_reference')

    const failing = new FakeAdmin(
      { subscriptions: [{ id: 'row-1', user_id: USER, status: 'active', creem_subscription_id: 'sub_1' }], profiles: [{ id: USER }] },
      { subscriptions: { update: () => ({ message: 'db down' }) } },
    )
    const r3 = await processVerifiedCreemEvent(failing, subscriptionEvent('subscription.canceled'), fakeCreem({ ok: true, value: snapshot() }))
    check('D11: a failed write is reported, never treated as success', r3.kind === 'update_failed')
    check('D11b: and answers 5xx so Creem retries', httpStatusForCreemOutcome(r3) === 500)
  }

  console.log('\nE) the renewal')
  {
    const stored = { id: 'row-1', user_id: USER, status: 'active', creem_subscription_id: 'sub_1', current_period_end: PERIOD_END, current_period_start: '2026-10-10T00:00:00.000Z' }

    const admin = adminWith([{ ...stored }])
    const r = await processVerifiedCreemEvent(admin, subscriptionEvent('subscription.paid'), fakeCreem({ ok: true, value: snapshot({ currentPeriodEnd: NEXT_PERIOD_END }) }))
    const row = admin.tables.subscriptions[0] as Record<string, unknown>
    check('E1: a renewal advances the period to Creem\'s own next date', r.kind === 'processed' && row.current_period_end === NEXT_PERIOD_END, JSON.stringify(r))
    check('E2: the new period starts where the old one ended', row.current_period_start === PERIOD_END)

    // The same instant in a different spelling is ONE renewal, not two.
    const dupAdmin = adminWith([{ ...stored, current_period_end: '2026-11-10T00:00:00+00:00' }])
    const dup = await processVerifiedCreemEvent(dupAdmin, subscriptionEvent('subscription.paid'), fakeCreem({ ok: true, value: snapshot({ currentPeriodEnd: '2026-11-10T00:00:00Z' }) }))
    check('E3: a redelivered renewal is a no-op, even spelled differently', dup.kind === 'renewal_duplicate')
    check('E3b: the stored period is untouched',
      (dupAdmin.tables.subscriptions[0] as Record<string, unknown>).current_period_end === '2026-11-10T00:00:00+00:00')
    check('E3c: and it answers 2xx, because it is the correct outcome', httpStatusForCreemOutcome(dup) === 200)

    // An out-of-order delivery must never move the period backwards.
    const staleAdmin = adminWith([{ ...stored, current_period_end: NEXT_PERIOD_END }])
    const stale = await processVerifiedCreemEvent(staleAdmin, subscriptionEvent('subscription.paid'), fakeCreem({ ok: true, value: snapshot({ currentPeriodEnd: PERIOD_END }) }))
    check('E4: an out-of-order renewal is a no-op', stale.kind === 'renewal_stale')
    check('E4b: the period did not move backwards',
      (staleAdmin.tables.subscriptions[0] as Record<string, unknown>).current_period_end === NEXT_PERIOD_END)

    // A row that never had a period: set the end, leave the start null rather
    // than inventing one.
    const legacy = adminWith([{ id: 'row-1', user_id: USER, status: 'active', creem_subscription_id: 'sub_1', current_period_end: null }])
    const r2 = await processVerifiedCreemEvent(legacy, subscriptionEvent('subscription.paid'), fakeCreem({ ok: true, value: snapshot({ currentPeriodEnd: NEXT_PERIOD_END }) }))
    const legacyRow = legacy.tables.subscriptions[0] as Record<string, unknown>
    check('E5: a row with no stored period gets the authoritative end', r2.kind === 'processed' && legacyRow.current_period_end === NEXT_PERIOD_END)
    check('E5b: and no invented start', legacyRow.current_period_start === null)

    // Creem unreachable on a renewal: the period is left alone.
    const unreachable = adminWith([{ ...stored }])
    const r3 = await processVerifiedCreemEvent(unreachable, subscriptionEvent('subscription.paid'), fakeCreem({ ok: false, reason: 'network' }))
    check('E6: an unreachable Creem leaves the period alone', r3.kind === 'renewal_date_unavailable')
    check('E6b: the row is untouched',
      (unreachable.tables.subscriptions[0] as Record<string, unknown>).current_period_end === PERIOD_END)
    check('E6c: and it answers non-2xx', httpStatusForCreemOutcome(r3) === 422)

    // A corrupt stored value is never guessed against.
    const corrupt = adminWith([{ ...stored, current_period_end: 'not a date' }])
    const r4 = await processVerifiedCreemEvent(corrupt, subscriptionEvent('subscription.paid'), fakeCreem({ ok: true, value: snapshot({ currentPeriodEnd: NEXT_PERIOD_END }) }))
    check('E7: a corrupt stored period end fails closed',
      r4.kind === 'renewal_date_unavailable' && r4.reason === 'unparseable_stored_period_end')
    check('E7b: the row is untouched',
      (corrupt.tables.subscriptions[0] as Record<string, unknown>).current_period_end === 'not a date')

    // A concurrent delivery already advanced the row: this handler stands
    // down rather than overwriting a boundary it never saw.
    const raced = adminWith([{ ...stored }])
    const racedRow = raced.tables.subscriptions[0] as Record<string, unknown>
    const racingDeps: CreemProcessDeps = {
      fetchSubscription: async () => {
        // Between this handler's read and its write, another delivery lands.
        racedRow.current_period_end = NEXT_PERIOD_END
        return { ok: true, value: snapshot({ currentPeriodEnd: '2027-01-10T00:00:00.000Z' }) }
      },
    }
    const r5 = await processVerifiedCreemEvent(raced, subscriptionEvent('subscription.paid'), racingDeps)
    check('E8: a concurrently-raced renewal stands down', r5.kind === 'renewal_conflict')
    check('E8b: the concurrent winner\'s period is intact', racedRow.current_period_end === NEXT_PERIOD_END)
    check('E8c: and it answers 409 so this delivery is retried', httpStatusForCreemOutcome(r5) === 409)
  }

  console.log('\nF) the HTTP answer')
  {
    const nonSuccess: CreemWebhookOutcome[] = [
      { kind: 'lookup_failed', message: 'x' },
      { kind: 'update_failed', eventType: 'subscription.paid', message: 'x' },
      { kind: 'activation_write_failed', message: 'x' },
      { kind: 'activation_unverifiable', reason: 'timeout' },
      { kind: 'activation_refused', reason: 'unknown_product' },
      { kind: 'unmappable_subscription_reference', eventType: 'subscription.active' },
      { kind: 'renewal_date_unavailable', eventType: 'subscription.paid', reason: 'x' },
      { kind: 'renewal_conflict', eventType: 'subscription.paid' },
    ]
    check('F1: nothing that failed or granted nothing reads as success',
      nonSuccess.every((o) => httpStatusForCreemOutcome(o) >= 400))

    const success: CreemWebhookOutcome[] = [
      { kind: 'activated', creemSubscriptionId: 'sub_1', plan: 'advanced', userId: USER },
      { kind: 'activation_already_applied', creemSubscriptionId: 'sub_1' },
      { kind: 'processed', eventType: 'subscription.active' },
      { kind: 'ignored_malformed_event' },
      { kind: 'ignored_unknown_event_type', eventType: 'x' },
      { kind: 'ignored_no_effect', eventType: 'credits.granted', why: 'x' },
      { kind: 'operator_attention', eventType: 'dispute.created', why: 'x' },
      { kind: 'ignored_unknown_subscription', creemSubscriptionId: 'sub_other' },
      { kind: 'renewal_duplicate', eventType: 'subscription.paid', periodEnd: PERIOD_END },
      { kind: 'renewal_stale', eventType: 'subscription.paid', storedPeriodEnd: PERIOD_END, reportedPeriodEnd: PERIOD_END },
    ]
    check('F2: a handled or deliberately-ignored event answers 2xx',
      success.every((o) => httpStatusForCreemOutcome(o) === 200))
  }

  console.log('\nG) mutation controls')
  {
    // If the plan came from the event body instead of the server read, a
    // payer could name their own plan. The event below says "premium" while
    // Creem says the product is the regular one.
    const admin = adminWith()
    const r = await processVerifiedCreemEvent(
      admin,
      checkoutEvent({ product: { id: 'prod_premium' }, plan: 'premium', metadata: { plan: 'large_agency' } }),
      fakeCreem({ ok: true, value: snapshot({ productId: 'prod_regular' }) }),
    )
    check('G1-MUT: the plan the EVENT claims is ignored; the server read wins',
      r.kind === 'activated' && r.plan === 'regular')

    // If GRANTABLE_STATUSES were widened, an unpaid checkout would grant.
    const unpaidGrants = await processVerifiedCreemEvent(adminWith(), checkoutEvent(), fakeCreem({ ok: true, value: snapshot({ status: 'canceled' }) }))
    check('G2-MUT: a cancelled subscription still grants nothing', unpaidGrants.kind === 'activation_refused')

    // If the already-applied check were dropped, a retry would insert a
    // second row for the same payment.
    const retried = adminWith([{ id: 'row-1', user_id: USER, status: 'active', creem_subscription_id: 'sub_1' }])
    const again = await processVerifiedCreemEvent(retried, checkoutEvent(), fakeCreem({ ok: true, value: snapshot() }))
    check('G3-MUT: a retry against an existing row grants nothing new',
      again.kind === 'activation_already_applied' && retried.tables.subscriptions.length === 1)

    // If the period were computed locally (stored + a month) rather than read
    // from Creem, replaying one delivery would extend it every time. Three
    // replays of the SAME event must converge on the same date.
    const converge = adminWith([{ id: 'row-1', user_id: USER, status: 'active', creem_subscription_id: 'sub_1', current_period_end: PERIOD_END }])
    for (let i = 0; i < 3; i++) {
      await processVerifiedCreemEvent(converge, subscriptionEvent('subscription.paid'), fakeCreem({ ok: true, value: snapshot({ currentPeriodEnd: NEXT_PERIOD_END }) }))
    }
    check('G4-MUT: replaying a renewal three times lands on one date, not three months later',
      (converge.tables.subscriptions[0] as Record<string, unknown>).current_period_end === NEXT_PERIOD_END)
  }

  console.log('\nH) sandbox mode cannot reach an account it was not pointed at')
  {
    // The preview shares the PRODUCTION database, so this is the guard that
    // stops a sandbox event changing a real customer's entitlement.
    const stranger = '99999999-9999-9999-9999-999999999999'
    const admin = new FakeAdmin({ subscriptions: [], profiles: [{ id: stranger }] })
    const r = await processVerifiedCreemEvent(
      admin,
      { eventType: 'checkout.completed', object: { id: 'ch_9', request_id: stranger, subscription: 'sub_9' } },
      fakeCreem({ ok: true, value: snapshot({ id: 'sub_9' }) }),
    )
    check('H1: a checkout for an account outside the test list grants nothing',
      r.kind === 'refused_outside_test_accounts', r.kind)
    check('H1b: and writes no row', admin.tables.subscriptions.length === 0)
    check('H1c: and answers non-2xx, so it never reads as handled', httpStatusForCreemOutcome(r) === 422)

    const strangerRow = new FakeAdmin({
      subscriptions: [{ id: 'row-x', user_id: stranger, status: 'active', creem_subscription_id: 'sub_1', current_period_end: PERIOD_END }],
      profiles: [{ id: stranger }],
    })
    const r2 = await processVerifiedCreemEvent(strangerRow, subscriptionEvent('subscription.canceled'), fakeCreem({ ok: true, value: snapshot() }))
    check('H2: a lifecycle event for another account\'s row changes nothing',
      r2.kind === 'refused_outside_test_accounts')
    check('H2b: that row is untouched',
      (strangerRow.tables.subscriptions[0] as Record<string, unknown>).status === 'active')

    const r3 = await processVerifiedCreemEvent(strangerRow, subscriptionEvent('subscription.paid'), fakeCreem({ ok: true, value: snapshot({ currentPeriodEnd: NEXT_PERIOD_END }) }))
    check('H3: a renewal for another account\'s row does not move its period',
      r3.kind === 'refused_outside_test_accounts'
      && (strangerRow.tables.subscriptions[0] as Record<string, unknown>).current_period_end === PERIOD_END)

    // MUTATION CONTROL — an empty list in sandbox mode must refuse
    // EVERYTHING, not allow everything. That is the difference between a
    // misconfigured test doing nothing and a misconfigured test writing to
    // whoever the event names.
    ENV.CREEM_TEST_ACCOUNT_IDS = ''
    const empty = adminWith()
    const r4 = await processVerifiedCreemEvent(empty, checkoutEvent(), fakeCreem({ ok: true, value: snapshot() }))
    check('H4-MUT: with no test account configured, sandbox mode writes to nobody',
      r4.kind === 'refused_outside_test_accounts' && empty.tables.subscriptions.length === 0)

    // And in LIVE mode the restriction is inert: every account is real.
    ENV.CREEM_MODE = 'live'
    const live = new FakeAdmin({ subscriptions: [], profiles: [{ id: stranger }] })
    const r5 = await processVerifiedCreemEvent(
      live,
      { eventType: 'checkout.completed', object: { id: 'ch_9', request_id: stranger, subscription: 'sub_9' } },
      fakeCreem({ ok: true, value: snapshot({ id: 'sub_9' }) }),
    )
    check('H5: in live mode the list means nothing and a real account is granted',
      r5.kind === 'activated', r5.kind)
    ENV.CREEM_MODE = undefined
    ENV.CREEM_TEST_ACCOUNT_IDS = '11111111-1111-1111-1111-111111111111'
  }

  console.log(`\n${pass} passed, ${fail} failed`)
  if (fail > 0) process.exitCode = 1
}

run()

export {}
