/**
 * THE MONEY. "30% of every payment, for as long as the customer keeps paying,
 * rising to 40%" is a published offer in four languages, so what follows is the
 * proof that the code pays exactly that and only that.
 *
 *   A) the arithmetic and the tier (pure, so it can be stated plainly)
 *   B) a payment earns once, and a retry earns nothing more
 *   C) a refund or chargeback reverses it; a reversal is final
 *   D) churn stops the tier but never takes back what was earned
 *   E) the PayPal bridge: which event means what, and what carries no amount
 *   F) the hold and the payout minimum
 *   G) the wiring: bookkeeping can never fail a subscription event, and Shopify
 *      is commissioned by hand rather than guessed at
 *
 * Every guard has a MUTATION CONTROL.
 */
import { readFileSync } from 'fs'
import { join } from 'path'
import { FakeAdmin } from '../../__qa__/_fake-admin'
import { AFFILIATE_TERMS } from '../terms'
import { effectiveRate, commissionAmount, releaseAt, released, payable } from '../rates'
import { recordCommissionForPayment, reverseCommissionForPayment, markReferralChurned, recordManualCommission, countActivePayingReferrals } from '../commissions'
import { applyPayPalEventToAffiliateBooks, saleAmount, bridgeOutcomeIsNotable } from '../paypal-bridge'
import { applyCreemEventToAffiliateBooks, commissionBase, creemBridgeOutcomeIsNotable } from '../creem-bridge'
import { creemTransactionOf, type CreemResult, type CreemSubscriptionSnapshot } from '../../creem/client'
import { EVENT_EFFECTS } from '../../creem/events'

let pass = 0, fail = 0
function check(name: string, cond: boolean, detail?: string) {
  if (cond) { pass++; console.log(`  ✓ ${name}`) } else { fail++; console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`) }
}
const ROOT = join(__dirname, '..', '..', '..')
const read = (rel: string) => readFileSync(join(ROOT, rel), 'utf8')
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')

const NOW = new Date('2026-10-09T12:00:00.000Z')
const CARD = { baseRate: AFFILIATE_TERMS.baseRate, topRate: AFFILIATE_TERMS.topRate, topRateFrom: AFFILIATE_TERMS.topRateFrom }

/** One approved partner, one paying-eligible referral, nothing else. */
function books({ payingReferrals = 0, status = 'approved' }: { payingReferrals?: number; status?: string } = {}) {
  const referrals: Record<string, unknown>[] = [
    { id: 'ref-1', affiliate_id: 'aff-1', referred_user_id: 'cust-1', code: 'dana', status: 'signed_up', billing_source: 'paypal', first_paid_at: null, review_flags: [] },
  ]
  for (let i = 0; i < payingReferrals; i++) {
    referrals.push({ id: `ref-p${i}`, affiliate_id: 'aff-1', referred_user_id: `other-${i}`, code: 'dana', status: 'paying', billing_source: 'paypal', first_paid_at: '2026-01-01T00:00:00.000Z', review_flags: [] })
  }
  return new FakeAdmin({
    affiliates: [{ id: 'aff-1', user_id: 'partner-user', code: 'dana', status, base_rate: 30, top_rate: 40, top_rate_from: 10 }],
    affiliate_referrals: referrals,
    affiliate_commissions: [],
    subscriptions: [{ user_id: 'cust-1', paypal_subscription_id: 'I-SUB-1', creem_subscription_id: 'sub_1' }],
  })
}

async function main() {
  console.log('A) the arithmetic and the tier')
  {
    check('A1: the base rate applies below the threshold', effectiveRate(CARD, AFFILIATE_TERMS.topRateFrom - 1) === AFFILIATE_TERMS.baseRate)
    check('A2: the higher rate applies AT the threshold, as the page says "from 10"',
      effectiveRate(CARD, AFFILIATE_TERMS.topRateFrom) === AFFILIATE_TERMS.topRate)
    check('A3: a partner who fell back below the threshold is back on the base rate',
      effectiveRate(CARD, 3) === AFFILIATE_TERMS.baseRate)
    check('A4: nonsense counts fall back to the base rate, never the higher one',
      effectiveRate(CARD, -1) === AFFILIATE_TERMS.baseRate && effectiveRate(CARD, Number.NaN) === AFFILIATE_TERMS.baseRate)
    // 30% of ₪249 is ₪74.70, and nothing about floating point may make it 74.699999.
    check('A5: 30% of a real plan price is exact', commissionAmount(249, 30) === 74.7
      && commissionAmount(549, 30) === 164.7 && commissionAmount(79, 40) === 31.6)
    check('A6: a zero or negative payment earns nothing rather than failing',
      commissionAmount(0, 30) === 0 && commissionAmount(-100, 30) === 0 && commissionAmount(249, 0) === 0)
    check('A7: rounding is to the currency’s two decimals, half up',
      commissionAmount(0.05, 30) === 0.02 && commissionAmount(1.675, 30) === 0.5)
    /* A2-MUT: a strict ">" would deny the tier to the partner at exactly 10. */
    check('A2-MUT: a strict comparison at the threshold is caught',
      (AFFILIATE_TERMS.topRateFrom > AFFILIATE_TERMS.topRateFrom ? AFFILIATE_TERMS.topRate : AFFILIATE_TERMS.baseRate) !== AFFILIATE_TERMS.topRate)
    check('A5-MUT: floating-point multiplication without rounding is caught',
      0.05 * 30 / 100 !== 0.02 && commissionAmount(0.05, 30) === 0.02)
  }

  console.log('\nB) a payment earns once')
  {
    const a = books()
    const first = await recordCommissionForPayment(a, { userId: 'cust-1', externalPaymentId: 'SALE-1', amount: 249, currency: 'ILS', source: 'paypal', earnedAt: NOW })
    check('B1: the first payment earns the base rate',
      first.kind === 'recorded' && first.rate === 30 && first.amount === 74.7 && first.currency === 'ILS', JSON.stringify(first))
    check('B1b: the commission is pending and held, never payable on arrival', (() => {
      const row = a.tables.affiliate_commissions[0]
      return row?.status === 'pending' && row.releases_at === releaseAt(NOW, AFFILIATE_TERMS.holdDays).toISOString()
    })(), JSON.stringify(a.tables.affiliate_commissions[0]))
    check('B1c: the referral is now paying, with its first payment recorded', (() => {
      const r = a.tables.affiliate_referrals.find((x) => x.id === 'ref-1')
      return r?.status === 'paying' && r.first_paid_at === NOW.toISOString()
    })())

    // PayPal retries until it gets a 2xx, so the same sale arrives again. The
    // DATABASE's uniqueness is what makes double payment impossible; 23505 here.
    const retrying = new FakeAdmin(
      { ...books().tables },
      { affiliate_commissions: { insert: () => ({ code: '23505' }) } },
    )
    const again = await recordCommissionForPayment(retrying, { userId: 'cust-1', externalPaymentId: 'SALE-1', amount: 249, currency: 'ILS', source: 'paypal', earnedAt: NOW })
    check('B2: the same sale delivered twice earns nothing more', again.kind === 'already_recorded', JSON.stringify(again))

    const later = new Date(NOW.getTime() + 30 * 24 * 60 * 60 * 1000)
    const second = await recordCommissionForPayment(a, { userId: 'cust-1', externalPaymentId: 'SALE-2', amount: 249, currency: 'ILS', source: 'paypal', earnedAt: later })
    check('B3: the NEXT month’s payment earns again — "for as long as they keep paying"',
      second.kind === 'recorded' && a.tables.affiliate_commissions.length === 2)
    check('B3b: and first_paid_at was not moved by the second payment',
      a.tables.affiliate_referrals.find((x) => x.id === 'ref-1')?.first_paid_at === NOW.toISOString())

    const tiered = books({ payingReferrals: AFFILIATE_TERMS.topRateFrom })
    const high = await recordCommissionForPayment(tiered, { userId: 'cust-1', externalPaymentId: 'SALE-3', amount: 249, currency: 'ILS', source: 'paypal', earnedAt: NOW })
    check('B4: a partner at the threshold earns the higher rate on this payment',
      high.kind === 'recorded' && high.rate === AFFILIATE_TERMS.topRate, JSON.stringify(high))
    check('B4b: the count that decides it is of referrals paying NOW',
      await countActivePayingReferrals(tiered, 'aff-1') === AFFILIATE_TERMS.topRateFrom + 1)

    const unreferred = await recordCommissionForPayment(books(), { userId: 'nobody', externalPaymentId: 'SALE-4', amount: 249, currency: 'ILS', source: 'paypal' })
    check('B5: a payer nobody referred is the ordinary answer, not an error', unreferred.kind === 'not_referred')
    const suspended = await recordCommissionForPayment(books({ status: 'suspended' }), { userId: 'cust-1', externalPaymentId: 'SALE-5', amount: 249, currency: 'ILS', source: 'paypal' })
    check('B6: a suspended partner earns nothing more', suspended.kind === 'partner_not_active', JSON.stringify(suspended))
    const voided = books()
    voided.tables.affiliate_referrals[0].status = 'void'
    const refused = await recordCommissionForPayment(voided, { userId: 'cust-1', externalPaymentId: 'SALE-6', amount: 249, currency: 'ILS', source: 'paypal' })
    check('B7: a referral an operator voided earns nothing', refused.kind === 'referral_void', JSON.stringify(refused))
    const odd = await recordCommissionForPayment(books(), { userId: 'cust-1', externalPaymentId: 'SALE-7', amount: 100, currency: 'EUR', source: 'paypal' })
    check('B8: a currency we do not keep books in is refused, never converted', odd.kind === 'unsupported_currency', JSON.stringify(odd))
    check('B8b: and no row was invented for it', !JSON.stringify(books().tables.affiliate_commissions).includes('EUR'))
    /* B2-MUT: any other insert error must NOT be read as "already recorded". */
    const broken = new FakeAdmin({ ...books().tables }, { affiliate_commissions: { insert: () => ({ code: '23502' }) } })
    const failed = await recordCommissionForPayment(broken, { userId: 'cust-1', externalPaymentId: 'SALE-8', amount: 249, currency: 'ILS', source: 'paypal' })
    check('B2-MUT: a different database error is not read as already-paid', failed.kind === 'failed', JSON.stringify(failed))
  }

  console.log('\nC) a refund reverses it')
  {
    const a = books()
    await recordCommissionForPayment(a, { userId: 'cust-1', externalPaymentId: 'SALE-1', amount: 249, currency: 'ILS', source: 'paypal', earnedAt: NOW })
    const out = await reverseCommissionForPayment(a, { source: 'paypal', externalPaymentId: 'SALE-1', reason: 'refund', now: NOW })
    check('C1: the commission on a refunded payment is reversed', out.kind === 'reversed', JSON.stringify(out))
    check('C1b: and the row says so, with its reason', (() => {
      const row = a.tables.affiliate_commissions[0]
      return row?.status === 'reversed' && row.reversed_reason === 'refund' && row.reversed_at === NOW.toISOString()
    })(), JSON.stringify(a.tables.affiliate_commissions[0]))
    const twice = await reverseCommissionForPayment(a, { source: 'paypal', externalPaymentId: 'SALE-1', reason: 'refund', now: NOW })
    check('C2: reversing it again does nothing', twice.kind === 'nothing_to_reverse')
    const nothing = await reverseCommissionForPayment(books(), { source: 'paypal', externalPaymentId: 'SALE-UNKNOWN', reason: 'refund' })
    check('C3: a refund of a payment that earned nothing is not an error', nothing.kind === 'nothing_to_reverse')
    // A commission already PAID is reversed too: it then stands against the
    // partner's next payout, which is what the agreement's wording means.
    const paid = books()
    paid.tables.affiliate_commissions.push({ id: 'c-paid', affiliate_id: 'aff-1', referral_id: 'ref-1', source: 'paypal', external_payment_id: 'SALE-9', status: 'paid', payout_id: 'pay-1', amount: 74.7, currency: 'ILS' })
    const reversedPaid = await reverseCommissionForPayment(paid, { source: 'paypal', externalPaymentId: 'SALE-9', reason: 'chargeback', now: NOW })
    check('C4: a commission already paid out is reversed as well',
      reversedPaid.kind === 'reversed' && paid.tables.affiliate_commissions.find((c) => c.id === 'c-paid')?.status === 'reversed')
    /* C2-MUT: without the reversed check, a second refund would rewrite the row. */
    check('C2-MUT: a reversal that could be re-applied is caught',
      /found\.data\.status === 'reversed'/.test(strip(read('lib/affiliate/commissions.ts'))))
    check('C1-MUT: the reason is clamped so a provider string cannot be stored whole',
      /reason\.slice\(0, 200\)/.test(strip(read('lib/affiliate/commissions.ts'))))
  }

  console.log('\nD) churn stops the tier, not the earnings')
  {
    const a = books()
    await recordCommissionForPayment(a, { userId: 'cust-1', externalPaymentId: 'SALE-1', amount: 249, currency: 'ILS', source: 'paypal', earnedAt: NOW })
    check('D1: a customer who stops paying is recorded as churned',
      await markReferralChurned(a, 'cust-1', NOW) && a.tables.affiliate_referrals.find((r) => r.id === 'ref-1')?.status === 'churned')
    check('D2: the commission already earned is untouched',
      a.tables.affiliate_commissions[0]?.status === 'pending')
    check('D3: and the churned referral no longer counts towards the tier',
      await countActivePayingReferrals(a, 'aff-1') === 0)
    const nothing = await markReferralChurned(books(), 'nobody', NOW)
    check('D4: churn for an unreferred account is harmless', nothing === true)
    /* D1-MUT: churn must only touch a referral that is paying. */
    check('D1-MUT: a churn update not filtered to paying referrals is caught',
      /\.eq\('status', 'paying'\)/.test(strip(read('lib/affiliate/commissions.ts'))))
  }

  console.log('\nE) the PayPal bridge')
  {
    const sale = (over: Record<string, unknown> = {}) => ({
      event_type: 'PAYMENT.SALE.COMPLETED',
      resource: { id: 'SALE-1', billing_agreement_id: 'I-SUB-1', amount: { total: '249.00', currency: 'ILS' }, ...over },
    })
    const a = books()
    const earned = await applyPayPalEventToAffiliateBooks(a, sale(), NOW)
    check('E1: a completed sale earns a commission for the payer’s partner',
      earned.kind === 'commission' && earned.outcome.kind === 'recorded' && earned.outcome.amount === 74.7, JSON.stringify(earned))
    check('E1b: the sale’s own id is the idempotency key, not the subscription’s',
      a.tables.affiliate_commissions[0]?.external_payment_id === 'SALE-1')

    // ACTIVATED carries no amount, and the first payment arrives as its own
    // SALE.COMPLETED, so acting on both would double-count or invent a figure.
    const activated = await applyPayPalEventToAffiliateBooks(books(), { event_type: 'BILLING.SUBSCRIPTION.ACTIVATED', resource: { id: 'I-SUB-1' } }, NOW)
    check('E2: an activation earns nothing — it carries no amount', activated.kind === 'not_an_affiliate_event', JSON.stringify(activated))
    const noAmount = await applyPayPalEventToAffiliateBooks(books(), sale({ amount: undefined }), NOW)
    check('E3: a sale without an amount is refused rather than guessed at',
      noAmount.kind === 'unusable_event', JSON.stringify(noAmount))
    const oneOff = await applyPayPalEventToAffiliateBooks(books(), sale({ billing_agreement_id: undefined }), NOW)
    check('E4: a one-off sale with no subscription behind it credits nobody', oneOff.kind === 'not_an_affiliate_event')
    const unknown = await applyPayPalEventToAffiliateBooks(books(), sale({ billing_agreement_id: 'I-NOBODY' }), NOW)
    check('E5: a subscription we do not know is reported, not silently dropped', unknown.kind === 'unknown_subscription', JSON.stringify(unknown))

    // The refund's own id is NOT the payment's: using it would look for a
    // commission that never existed and reverse nothing.
    const refunded = await applyPayPalEventToAffiliateBooks(a, { event_type: 'PAYMENT.SALE.REFUNDED', resource: { id: 'REFUND-77', sale_id: 'SALE-1' } }, NOW)
    check('E6: a refund reverses the SALE it points at, by sale_id',
      refunded.kind === 'reversal' && refunded.outcome.kind === 'reversed'
      && a.tables.affiliate_commissions[0]?.status === 'reversed', JSON.stringify(refunded))
    const noSale = await applyPayPalEventToAffiliateBooks(books(), { event_type: 'PAYMENT.SALE.REVERSED', resource: { id: 'REFUND-78' } }, NOW)
    check('E7: a reversal with no sale_id is unusable, not applied to the refund’s own id', noSale.kind === 'unusable_event')

    const churning = books()
    churning.tables.affiliate_referrals[0].status = 'paying'
    const churned = await applyPayPalEventToAffiliateBooks(churning, { event_type: 'BILLING.SUBSCRIPTION.CANCELLED', resource: { id: 'I-SUB-1' } }, NOW)
    check('E8: a cancelled subscription churns the referral',
      churned.kind === 'churn' && churning.tables.affiliate_referrals[0].status === 'churned', JSON.stringify(churned))
    const expired = await applyPayPalEventToAffiliateBooks(books(), { event_type: 'BILLING.SUBSCRIPTION.EXPIRED', resource: { id: 'I-SUB-1' } }, NOW)
    check('E8b: so does an expired one', expired.kind === 'churn')
    const other = await applyPayPalEventToAffiliateBooks(books(), { event_type: 'BILLING.SUBSCRIPTION.UPDATED', resource: { id: 'I-SUB-1' } }, NOW)
    check('E9: every other event costs not a single query', other.kind === 'not_an_affiliate_event')
    check('E10: an event with no type or no resource is answered, never thrown on',
      (await applyPayPalEventToAffiliateBooks(books(), {}, NOW)).kind === 'not_an_affiliate_event')

    check('E11: the amount is read as a number, and nonsense is no amount',
      saleAmount({ amount: { total: '249.00', currency: 'ILS' } })?.amount === 249
      && saleAmount({ amount: { total: 249, currency: 'USD' } })?.currency === 'USD'
      && saleAmount({ amount: { total: 'abc', currency: 'ILS' } }) === null
      && saleAmount({ amount: { total: '-5', currency: 'ILS' } }) === null
      && saleAmount({ amount: { total: '5' } }) === null
      && saleAmount(undefined) === null)
    check('E12: only the outcomes worth reading are logged',
      bridgeOutcomeIsNotable({ kind: 'commission', outcome: { kind: 'recorded', commissionId: 'c', affiliateId: 'a', amount: 1, currency: 'ILS', rate: 30 } })
      && bridgeOutcomeIsNotable({ kind: 'failed', reason: 'x' })
      && !bridgeOutcomeIsNotable({ kind: 'not_an_affiliate_event', eventType: 'X' })
      && !bridgeOutcomeIsNotable({ kind: 'commission', outcome: { kind: 'not_referred' } })
      && !bridgeOutcomeIsNotable({ kind: 'reversal', outcome: { kind: 'nothing_to_reverse' } }))
    /* E6-MUT: reversing by the refund's own id would reverse nothing. */
    const wrongKey = books()
    await recordCommissionForPayment(wrongKey, { userId: 'cust-1', externalPaymentId: 'SALE-1', amount: 249, currency: 'ILS', source: 'paypal', earnedAt: NOW })
    const missed = await reverseCommissionForPayment(wrongKey, { source: 'paypal', externalPaymentId: 'REFUND-77', reason: 'refund', now: NOW })
    check('E6-MUT: reversing by the refund’s own id reverses nothing', missed.kind === 'nothing_to_reverse')
  }

  console.log('\nF) the hold and the minimum')
  {
    const releaseDate = releaseAt(NOW, AFFILIATE_TERMS.holdDays)
    check('F1: the hold is the published number of days',
      releaseDate.getTime() - NOW.getTime() === AFFILIATE_TERMS.holdDays * 24 * 60 * 60 * 1000)
    check('F2: nothing is released a day early',
      !released(NOW, AFFILIATE_TERMS.holdDays, new Date(releaseDate.getTime() - 1))
      && released(NOW, AFFILIATE_TERMS.holdDays, releaseDate))
    check('F3: the minimum is the one the page states, per currency',
      payable(AFFILIATE_TERMS.minPayoutIls, 'ILS', AFFILIATE_TERMS)
      && !payable(AFFILIATE_TERMS.minPayoutIls - 1, 'ILS', AFFILIATE_TERMS)
      && payable(AFFILIATE_TERMS.minPayoutUsd, 'USD', AFFILIATE_TERMS)
      && !payable(AFFILIATE_TERMS.minPayoutUsd - 1, 'USD', AFFILIATE_TERMS))
    check('F4: a shekel balance is never measured against the dollar minimum',
      payable(120, 'ILS', AFFILIATE_TERMS) === false && payable(120, 'USD', AFFILIATE_TERMS) === true)
    check('F1-MUT: a hold of zero days would release on the spot',
      releaseAt(NOW, 0).getTime() === NOW.getTime() && AFFILIATE_TERMS.holdDays > 0)
  }

  console.log('\nG) the wiring')
  {
    const route = strip(read('app/api/paypal/webhook/route.ts'))
    check('G1: the webhook applies the subscription event FIRST, then the books',
      route.indexOf('processVerifiedPayPalWebhookEvent') < route.indexOf('applyPayPalEventToAffiliateBooks'))
    check('G2: a bookkeeping failure cannot change the webhook’s verdict',
      /try \{[\s\S]{0,600}applyPayPalEventToAffiliateBooks[\s\S]{0,600}\} catch \(affiliateError\)/.test(route)
      && route.indexOf('applyPayPalEventToAffiliateBooks') < route.indexOf('isError'))
    check('G3: the subscription module itself knows nothing about commissions',
      !/affiliate/i.test(strip(read('lib/paypal/webhook-processing.ts'))))
    // Shopify tells the app a plan is active, never that a charge was taken, so
    // there is no payment event to hang a per-payment commission on. Saying so
    // in the admin screen is the honest version; inventing a figure is not.
    check('G4: a Shopify-billed referral is commissioned by hand, never guessed', (() => {
      const admin = strip(read('app/(dashboard)/admin/affiliates/page.tsx'))
      const ops = strip(read('lib/affiliate/operations.ts'))
      return /shopify/i.test(admin) && /addManualCommission/.test(ops)
    })())
    const manual = books()
    const entered = await recordManualCommission(manual, { affiliateId: 'aff-1', referralId: 'ref-1', reference: 'shopify-charge-55', paymentAmount: 329, currency: 'USD', rate: 30, now: NOW })
    check('G5: a manual commission is pending and held like any other',
      entered.kind === 'recorded' && entered.amount === 98.7
      && manual.tables.affiliate_commissions[0]?.status === 'pending'
      && manual.tables.affiliate_commissions[0]?.source === 'manual', JSON.stringify(entered))
    const dup = new FakeAdmin({ ...books().tables }, { affiliate_commissions: { insert: () => ({ code: '23505' }) } })
    const again = await recordManualCommission(dup, { affiliateId: 'aff-1', referralId: 'ref-1', reference: 'shopify-charge-55', paymentAmount: 329, currency: 'USD', rate: 30, now: NOW })
    check('G6: the same reference entered twice is refused, not paid twice', again.kind === 'already_recorded', JSON.stringify(again))
    check('G7: nothing in the money code moves money', (() => {
      const files = ['lib/affiliate/commissions.ts', 'lib/affiliate/rates.ts', 'lib/affiliate/operations.ts']
      // A payout is a STATEMENT an operator marks paid by hand; no code of ours
      // calls a provider's payout or payment API.
      return files.every((f) => !/\/v1\/payments|payouts\/batch|paypal\.com|fetch\(/i.test(strip(read(f))))
    })())
    /* G2-MUT: the call outside a try would turn a bookkeeping error into a 500
       and PayPal would retry a delivery whose real work already succeeded. */
    check('G2-MUT: an unguarded bridge call is caught',
      !/try \{[\s\S]{0,600}applyPayPalEventToAffiliateBooks[\s\S]{0,600}\} catch \(affiliateError\)/
        .test(route.replace('} catch (affiliateError)', '} catch (other)')))
    check('G3-MUT: a commission import in the subscription module is caught',
      /affiliate/i.test('import { recordCommissionForPayment } from "@/lib/affiliate/commissions"'))
  }

  console.log('\nH) the Creem bridge')
  {
    // Creem is the merchant of record for every card payment outside Israel,
    // so this is the ONLY path by which a partner is paid on a customer from
    // abroad. Amounts are minor units, and Creem reports the tax it collects
    // as merchant of record separately — tax is not our revenue.
    const tran = (over: Record<string, unknown> = {}) => ({
      id: 'tran_1', object: 'transaction', amount: 8690, amount_paid: 8690, tax_amount: 790,
      currency: 'USD', status: 'paid', ...over,
    })
    const snap = (over: Partial<CreemSubscriptionSnapshot> = {}): CreemSubscriptionSnapshot => ({
      id: 'sub_1', status: 'active', productId: 'prod_x', customerId: 'cus_1',
      currentPeriodStart: '2026-10-24T00:00:00Z', currentPeriodEnd: '2026-11-24T00:00:00Z',
      metadata: null, lastTransaction: creemTransactionOf(tran()), ...over,
    })
    const creem = (answer: CreemResult<CreemSubscriptionSnapshot> = { ok: true, value: snap() }) => {
      const calls: string[] = []
      return { calls, fetchSubscription: async (id: string) => { calls.push(id); return answer } }
    }

    const a = books()
    const paid = await applyCreemEventToAffiliateBooks(a, {
      eventType: 'subscription.paid',
      object: { id: 'sub_1', last_transaction: tran() },
    }, creem(), NOW)
    check('H1: a Creem payment earns 30% of what the customer paid, net of the tax Creem collects',
      paid.kind === 'commission' && paid.outcome.kind === 'recorded'
      && paid.outcome.currency === 'USD' && paid.outcome.amount === 23.7, JSON.stringify(paid))
    check('H1b: the PAYMENT’s own id is the idempotency key, never the subscription’s', (() => {
      const row = a.tables.affiliate_commissions[0]
      return row?.external_payment_id === 'tran_1' && row.source === 'creem' && row.payment_amount === 79
    })(), JSON.stringify(a.tables.affiliate_commissions[0]))
    check('H1c: and the referral is recorded as billed through Creem',
      a.tables.affiliate_referrals.find((r) => r.id === 'ref-1')?.billing_source === 'creem')

    // The event body carried the transaction above. A checkout.completed does
    // not, so the amount comes from the same server-side read the entitlement
    // is granted from — never from our own price list.
    const first = books()
    const fake = creem()
    const checkout = await applyCreemEventToAffiliateBooks(first, {
      eventType: 'checkout.completed',
      object: { id: 'ch_1', subscription: 'sub_1', request_id: 'cust-1' },
    }, fake, NOW)
    check('H2: a first payment earns, with the amount read back from Creem',
      checkout.kind === 'commission' && checkout.outcome.kind === 'recorded'
      && checkout.outcome.amount === 23.7 && fake.calls.length === 1, JSON.stringify(checkout))
    check('H2b: the subscription is taken from the checkout’s subscription field, not its own id',
      fake.calls[0] === 'sub_1')

    // The first payment can arrive as BOTH events. Both name the same
    // transaction, so the (source, external_payment_id) uniqueness makes the
    // second a no-op — which is why keying on the payment is what makes
    // earning on both events safe.
    const twice = new FakeAdmin({ ...books().tables }, { affiliate_commissions: { insert: () => ({ code: '23505' }) } })
    const again = await applyCreemEventToAffiliateBooks(twice, {
      eventType: 'subscription.paid', object: { id: 'sub_1', last_transaction: tran() },
    }, creem(), NOW)
    check('H3: the same payment arriving as both events earns once',
      again.kind === 'commission' && again.outcome.kind === 'already_recorded', JSON.stringify(again))

    const renewal = await applyCreemEventToAffiliateBooks(a, {
      eventType: 'subscription.paid',
      object: { id: 'sub_1', last_transaction: tran({ id: 'tran_2' }) },
    }, creem(), NOW)
    check('H4: next month’s payment earns again — "for as long as they keep paying"',
      renewal.kind === 'commission' && renewal.outcome.kind === 'recorded'
      && a.tables.affiliate_commissions.length === 2)
    /* H4-MUT: the failure this key exists to prevent. Keying on the
       SUBSCRIPTION id would make every renewal look like the same payment, and
       the partner would be paid once and never again — months before anyone
       noticed. */
    check('H4-MUT: the subscription id is the SAME across the two payments, the transaction id is not',
      a.tables.affiliate_commissions[0].external_payment_id !== a.tables.affiliate_commissions[1].external_payment_id
      && !a.tables.affiliate_commissions.some((c) => c.external_payment_id === 'sub_1'))

    const noTran = await applyCreemEventToAffiliateBooks(books(), {
      eventType: 'subscription.paid', object: { id: 'sub_1' },
    }, creem({ ok: true, value: snap({ lastTransaction: null }) }), NOW)
    check('H5: a payment with no amount anywhere is refused, never priced from our own plan list',
      noTran.kind === 'unusable_event', JSON.stringify(noTran))
    const unreachable = await applyCreemEventToAffiliateBooks(books(), {
      eventType: 'subscription.paid', object: { id: 'sub_1' },
    }, creem({ ok: false, reason: 'timeout' }), NOW)
    check('H6: an unreachable Creem is reported as unverifiable, not guessed at',
      unreachable.kind === 'amount_unverifiable', JSON.stringify(unreachable))
    const foreign = await applyCreemEventToAffiliateBooks(books(), {
      eventType: 'subscription.paid', object: { id: 'sub_nobody', last_transaction: tran() },
    }, creem(), NOW)
    check('H7: a subscription we do not hold credits nobody and is reported',
      foreign.kind === 'unknown_subscription', JSON.stringify(foreign))

    const refunded = await applyCreemEventToAffiliateBooks(a, {
      eventType: 'refund.created', object: { id: 'ref_9', transaction: 'tran_1', subscription: 'sub_1' },
    }, creem(), NOW)
    check('H8: a refund reverses the PAYMENT it points at',
      refunded.kind === 'reversal' && refunded.outcome.kind === 'reversed'
      && a.tables.affiliate_commissions.find((c) => c.external_payment_id === 'tran_1')?.status === 'reversed',
      JSON.stringify(refunded))
    const disputed = await applyCreemEventToAffiliateBooks(a, {
      eventType: 'dispute.created', object: { id: 'dis_9', transaction: 'tran_2' },
    }, creem(), NOW)
    check('H8b: a dispute reverses it as a chargeback',
      disputed.kind === 'reversal'
      && a.tables.affiliate_commissions.find((c) => c.external_payment_id === 'tran_2')?.reversed_reason === 'chargeback',
      JSON.stringify(disputed))
    // `transaction_id` is the name Creem's own refund API uses for this
    // reference (POST /v1/refunds), so it has to be the first one read.
    const byApiName = books()
    await recordCommissionForPayment(byApiName, { userId: 'cust-1', externalPaymentId: 'tran_7', amount: 79, currency: 'USD', source: 'creem', earnedAt: NOW })
    const apiShape = await applyCreemEventToAffiliateBooks(byApiName, {
      eventType: 'refund.created', object: { id: 'ref_11', transaction_id: 'tran_7', status: 'succeeded' },
    }, creem(), NOW)
    check('H8c: a refund naming the payment as transaction_id reverses it',
      apiShape.kind === 'reversal' && apiShape.outcome.kind === 'reversed'
      && byApiName.tables.affiliate_commissions[0]?.status === 'reversed', JSON.stringify(apiShape))

    // Creem's refund status is an enum of five, and two of them mean no money
    // went back. A commission must not be taken away for those.
    for (const status of ['failed', 'canceled']) {
      const kept = books()
      await recordCommissionForPayment(kept, { userId: 'cust-1', externalPaymentId: 'tran_8', amount: 79, currency: 'USD', source: 'creem', earnedAt: NOW })
      const untouched = await applyCreemEventToAffiliateBooks(kept, {
        eventType: 'refund.created', object: { id: 'ref_12', transaction_id: 'tran_8', status },
      }, creem(), NOW)
      check(`H8d: a refund reported as ${status} takes nothing from the partner`,
        untouched.kind === 'reversal_not_applicable' && kept.tables.affiliate_commissions[0]?.status === 'pending',
        JSON.stringify(untouched))
    }
    const pendingRefund = books()
    await recordCommissionForPayment(pendingRefund, { userId: 'cust-1', externalPaymentId: 'tran_9', amount: 79, currency: 'USD', source: 'creem', earnedAt: NOW })
    const onPending = await applyCreemEventToAffiliateBooks(pendingRefund, {
      eventType: 'refund.created', object: { id: 'ref_13', transaction_id: 'tran_9', status: 'pending' },
    }, creem(), NOW)
    check('H8e: a pending refund still reverses — Creem has no refund.succeeded event to wait for',
      onPending.kind === 'reversal' && pendingRefund.tables.affiliate_commissions[0]?.status === 'reversed',
      JSON.stringify(onPending))
    /* H8d-MUT: a guard that read the status as a whole-string match against
       'failed' only, or that let an unknown status through as refused, would
       either take a commission on a cancelled refund or never reverse at all. */
    check('H8d-MUT: an unrecognised status does not block the reversal',
      (await (async () => {
        const odd = books()
        await recordCommissionForPayment(odd, { userId: 'cust-1', externalPaymentId: 'tran_10', amount: 79, currency: 'USD', source: 'creem', earnedAt: NOW })
        return applyCreemEventToAffiliateBooks(odd, {
          eventType: 'refund.created', object: { id: 'ref_14', transaction_id: 'tran_10', status: 'requiresAction' },
        }, creem(), NOW)
      })()).kind === 'reversal')

    const bareRefund = await applyCreemEventToAffiliateBooks(books(), {
      eventType: 'refund.created', object: { id: 'ref_10' },
    }, creem(), NOW)
    check('H9: a refund naming no payment is reported, never applied to the refund’s own id',
      bareRefund.kind === 'unusable_event', JSON.stringify(bareRefund))
    /* H9-MUT: reversing by the refund's own id reverses nothing at all. */
    const wrongKey = books()
    await recordCommissionForPayment(wrongKey, { userId: 'cust-1', externalPaymentId: 'tran_1', amount: 79, currency: 'USD', source: 'creem', earnedAt: NOW })
    const missed = await reverseCommissionForPayment(wrongKey, { source: 'creem', externalPaymentId: 'ref_9', reason: 'refund', now: NOW })
    check('H9-MUT: reversing by the refund’s own id reverses nothing', missed.kind === 'nothing_to_reverse')

    for (const event of ['subscription.canceled', 'subscription.expired', 'subscription.unpaid']) {
      const churning = books()
      churning.tables.affiliate_referrals[0].status = 'paying'
      const churned = await applyCreemEventToAffiliateBooks(churning, { eventType: event, object: { id: 'sub_1' } }, creem(), NOW)
      check(`H10: ${event} stops the referral counting towards the 40% tier`,
        churned.kind === 'churn' && churning.tables.affiliate_referrals[0].status === 'churned', JSON.stringify(churned))
    }
    const stillTrying = books()
    stillTrying.tables.affiliate_referrals[0].status = 'paying'
    const pastDue = await applyCreemEventToAffiliateBooks(stillTrying, { eventType: 'subscription.past_due', object: { id: 'sub_1' } }, creem(), NOW)
    check('H10b: a charge Creem is still retrying does NOT churn the referral',
      pastDue.kind === 'not_an_affiliate_event' && stillTrying.tables.affiliate_referrals[0].status === 'paying', JSON.stringify(pastDue))
    check('H10c: every other event costs not a single query',
      (await applyCreemEventToAffiliateBooks(books(), { eventType: 'subscription.update', object: { id: 'sub_1' } }, creem(), NOW)).kind === 'not_an_affiliate_event'
      && (await applyCreemEventToAffiliateBooks(books(), {}, creem(), NOW)).kind === 'not_an_affiliate_event')

    check('H11: the commission base is minor units, net of tax, and never a guess', (() => {
      const base = (over: Record<string, unknown>) => commissionBase(creemTransactionOf(tran(over))!)
      return base({})?.amount === 79
        && base({ tax_amount: 0 })?.amount === 86.9
        // amount_paid is what was collected; `amount` is only the fallback.
        && base({ amount_paid: 2000, amount: 9999, tax_amount: 0 })?.amount === 20
        && base({ currency: 'EUR' }) === null
        && base({ currency: 'JPY' }) === null
        && base({ currency: null }) === null
        && base({ amount_paid: 0, amount: 0 }) === null
        && base({ amount_paid: -500, amount: -500 }) === null
        // Two fields that are not the pair we think they are: never a negative base.
        && base({ amount_paid: 790, tax_amount: 8690 })?.amount === 7.9
    })())
    check('H11b: a transaction with no id is not a transaction, whatever amount it carries',
      creemTransactionOf({ amount: 7900, currency: 'USD' }) === null && creemTransactionOf(null) === null)
    check('H12: only the outcomes worth reading are logged',
      creemBridgeOutcomeIsNotable({ kind: 'commission', outcome: { kind: 'recorded', commissionId: 'c', affiliateId: 'a', amount: 1, currency: 'USD', rate: 30 } })
      && creemBridgeOutcomeIsNotable({ kind: 'amount_unverifiable', eventType: 'subscription.paid', reason: 'timeout' })
      && !creemBridgeOutcomeIsNotable({ kind: 'not_an_affiliate_event', eventType: 'credits.granted' })
      && !creemBridgeOutcomeIsNotable({ kind: 'commission', outcome: { kind: 'not_referred' } }))

    // The two event sets are not a second opinion about Creem's event table:
    // every event this bridge earns on is one lib/creem/events.ts treats as a
    // live subscription, and every event it churns on is one that ends access.
    check('H13: the bridge’s event sets agree with the entitlement policy', (() => {
      const bridge = strip(read('lib/affiliate/creem-bridge.ts'))
      const earns = ['checkout.completed', 'subscription.paid']
      const churns = ['subscription.canceled', 'subscription.expired', 'subscription.unpaid']
      const effects = EVENT_EFFECTS as Record<string, { kind: string; status?: string }>
      return earns.every((e) => bridge.includes(`'${e}'`) && (effects[e].kind === 'activate' || effects[e].status === 'active'))
        && churns.every((e) => bridge.includes(`'${e}'`) && effects[e].kind === 'status' && effects[e].status !== 'active')
        && effects['subscription.past_due'].status === 'active' && !new RegExp("CHURN_EVENTS[^)]*past_due").test(bridge)
    })())

    const route = strip(read('app/api/creem/webhook/route.ts'))
    // The CALL sites, not the imports: the import order says nothing.
    check('H14: the webhook applies the entitlement FIRST, then the books',
      route.indexOf('processVerifiedCreemEvent(admin') > 0
      && route.indexOf('processVerifiedCreemEvent(admin') < route.indexOf('applyCreemEventToAffiliateBooks(admin'))
    check('H15: a bookkeeping failure cannot change the webhook’s verdict',
      /try \{[\s\S]{0,900}applyCreemEventToAffiliateBooks[\s\S]{0,900}\} catch \(affiliateError\)/.test(route)
      && route.indexOf('applyCreemEventToAffiliateBooks(admin') < route.indexOf('httpStatusForCreemOutcome(outcome)'))
    check('H16: the entitlement module itself knows nothing about commissions',
      !/affiliate/i.test(strip(read('lib/creem/webhook-processing.ts'))))
    /* H15-MUT: the call outside a try would turn a bookkeeping error into a 500,
       and Creem would retry a delivery whose real work already succeeded. */
    check('H15-MUT: an unguarded bridge call is caught',
      !/try \{[\s\S]{0,900}applyCreemEventToAffiliateBooks[\s\S]{0,900}\} catch \(affiliateError\)/
        .test(route.replace('} catch (affiliateError)', '} catch (other)')))
    /* H13-MUT: an earn list that included an event carrying no payment would
       book a commission on a status change. */
    check('H13-MUT: an event with no payment behind it is not in the earn list',
      !/EARN_EVENTS[\s\S]{0,120}subscription\.active/.test(strip(read('lib/affiliate/creem-bridge.ts'))))
  }

  console.log(`\n${pass} passed, ${fail} failed`)
  if (fail > 0) process.exitCode = 1
}

void main()

export {}
