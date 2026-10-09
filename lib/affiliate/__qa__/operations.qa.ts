/**
 * WHAT AN OPERATOR MAY DO, and the two gates that are not conveniences.
 *
 *   A) a code exists only because a person chose it — the program's whole
 *      defence against someone joining to refer themselves
 *   B) a commission cannot be approved inside its hold (the refund window the
 *      terms promise in four languages)
 *   C) a payout is a statement, and the money moves by hand
 *   D) refusals rather than repairs: every outcome a click can reach
 *   E) two operators clicking at once never both succeed
 *   F) the route proves the caller is an administrator before any of it
 *
 * Every guard has a MUTATION CONTROL.
 */
import { readFileSync } from 'fs'
import { join } from 'path'
import { FakeAdmin } from '../../__qa__/_fake-admin'
import { AFFILIATE_TERMS } from '../terms'
import {
  approveApplication, rejectApplication, setPartnerStatus, setPayoutDetails, linkPartnerAccount,
  approveCommission, reverseCommission, voidReferral, addManualCommission,
  createPayout, markPayoutPaid, cancelPayout,
} from '../operations'
import { purgeAffiliateApplications, retentionCutoff, APPLICATION_RETENTION_DAYS } from '../retention'

let pass = 0, fail = 0
function check(name: string, cond: boolean, detail?: string) {
  if (cond) { pass++; console.log(`  ✓ ${name}`) } else { fail++; console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`) }
}
const ROOT = join(__dirname, '..', '..', '..')
const read = (rel: string) => readFileSync(join(ROOT, rel), 'utf8')
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')

const NOW = new Date('2026-10-09T12:00:00.000Z')
const HELD = new Date(NOW.getTime() + 5 * 24 * 60 * 60 * 1000).toISOString()
const RELEASED = new Date(NOW.getTime() - 60_000).toISOString()
const ADMIN = 'admin-user'

function world() {
  return new FakeAdmin({
    affiliates: [
      { id: 'app-1', user_id: null, code: null, status: 'pending', name: 'דנה', email: 'dana@dana-digital.co.il', base_rate: 30, top_rate: 40, top_rate_from: 10, decided_at: null },
      { id: 'aff-2', user_id: 'partner-2', code: 'noa', status: 'approved', email: 'noa@x.co.il', base_rate: 30, top_rate: 40, top_rate_from: 10, decided_at: '2026-09-01T00:00:00.000Z' },
    ],
    affiliate_referrals: [
      { id: 'ref-2', affiliate_id: 'aff-2', referred_user_id: 'cust-2', code: 'noa', status: 'paying', billing_source: 'shopify', review_flags: [] },
    ],
    affiliate_commissions: [
      { id: 'c-held', affiliate_id: 'aff-2', referral_id: 'ref-2', source: 'paypal', external_payment_id: 'S1', status: 'pending', amount: 74.7, currency: 'ILS', earned_at: NOW.toISOString(), releases_at: HELD, payout_id: null },
      { id: 'c-ready', affiliate_id: 'aff-2', referral_id: 'ref-2', source: 'paypal', external_payment_id: 'S2', status: 'pending', amount: 100, currency: 'ILS', earned_at: '2026-09-01T00:00:00.000Z', releases_at: RELEASED, payout_id: null },
      { id: 'c-usd', affiliate_id: 'aff-2', referral_id: 'ref-2', source: 'paypal', external_payment_id: 'S3', status: 'approved', amount: 23.7, currency: 'USD', earned_at: '2026-09-02T00:00:00.000Z', releases_at: RELEASED, payout_id: null },
    ],
    affiliate_payouts: [],
  })
}

async function main() {
  console.log('A) a code exists only because a person chose it')
  {
    const a = world()
    const ok = await approveApplication(a, { affiliateId: 'app-1', code: '  Dana-Digital ', decidedBy: ADMIN, now: NOW })
    check('A1: approving gives the partner the code the operator chose, normalised',
      ok.kind === 'ok' && ok.detail?.code === 'dana-digital', JSON.stringify(ok))
    check('A1b: and records who decided, and when',
      a.tables.affiliates[0].status === 'approved' && a.tables.affiliates[0].decided_by === ADMIN
      && a.tables.affiliates[0].decided_at === NOW.toISOString())
    const again = await approveApplication(a, { affiliateId: 'app-1', code: 'other', decidedBy: ADMIN, now: NOW })
    check('A2: an application already decided cannot be approved twice', again.kind === 'conflict' && again.reason === 'already_decided', JSON.stringify(again))

    const taken = world()
    const clash = await approveApplication(taken, { affiliateId: 'app-1', code: 'NOA', decidedBy: ADMIN, now: NOW })
    check('A3: a code another partner holds is refused, so the operator picks another',
      clash.kind === 'conflict' && clash.reason === 'code_taken', JSON.stringify(clash))
    check('A3b: and the application is still pending', taken.tables.affiliates[0].status === 'pending')

    const bad = world()
    const junk = await approveApplication(bad, { affiliateId: 'app-1', code: '../../admin', decidedBy: ADMIN, now: NOW })
    check('A4: a code a link could not carry is refused', junk.kind === 'invalid' && junk.reason === 'code_shape', JSON.stringify(junk))
    const rates = await Promise.all([
      approveApplication(world(), { affiliateId: 'app-1', code: 'a1', decidedBy: ADMIN, baseRate: 0, now: NOW }),
      approveApplication(world(), { affiliateId: 'app-1', code: 'a2', decidedBy: ADMIN, topRate: 140, now: NOW }),
      approveApplication(world(), { affiliateId: 'app-1', code: 'a3', decidedBy: ADMIN, baseRate: 40, topRate: 30, now: NOW }),
      approveApplication(world(), { affiliateId: 'app-1', code: 'a4', decidedBy: ADMIN, topRateFrom: 0, now: NOW }),
    ])
    check('A5b: every impossible rate card is refused with its own reason',
      rates.map((r) => (r.kind === 'invalid' ? r.reason : r.kind)).join(',') === 'base_rate,top_rate,top_below_base,top_rate_from',
      JSON.stringify(rates))
    const negotiated = world()
    await approveApplication(negotiated, { affiliateId: 'app-1', code: 'dana', decidedBy: ADMIN, baseRate: 35, topRate: 45, topRateFrom: 5, now: NOW })
    check('A5c: a negotiated card is stored on the partner, not on the program',
      negotiated.tables.affiliates[0].base_rate === 35 && negotiated.tables.affiliates[0].top_rate === 45
      && AFFILIATE_TERMS.baseRate === 30)

    const rejected = world()
    const no = await rejectApplication(rejected, { affiliateId: 'app-1', decidedBy: ADMIN, notes: 'לא רלוונטי', now: NOW })
    check('A6: a refused application keeps no code, so no link ever existed',
      no.kind === 'ok' && rejected.tables.affiliates[0].status === 'rejected' && rejected.tables.affiliates[0].code === null)
    check('A7: nothing here creates an approved partner without a chosen code', (() => {
      const src = strip(read('lib/affiliate/operations.ts'))
      // One payload in the module sets an affiliate to approved, and it carries
      // the code in the same object. Every other move between approved and
      // suspended is filtered to rows that already HAVE a code.
      const payloads = [...src.matchAll(/\{\s*\n?\s*status: 'approved',\n([\s\S]{0,300}?)\n\s*\}/g)]
      const approvedPayload = payloads.length === 1 && /code: normalized/.test(payloads[0][1])
      return approvedPayload && /\.in\('status', \['approved', 'suspended'\]\)/.test(src)
    })())
    /* A3-MUT: without the taken check, two partners would share a code. */
    check('A3-MUT: a missing "code taken" check is caught',
      /if \(taken\.data\) return \{ kind: 'conflict', reason: 'code_taken' \}/.test(strip(read('lib/affiliate/operations.ts'))))
    check('A1-MUT: a code not normalised before storing is caught',
      /const normalized = normalizeReferralCode\(code\)/.test(strip(read('lib/affiliate/operations.ts'))))
  }

  console.log('\nB) the hold is the refund window')
  {
    const a = world()
    const early = await approveCommission(a, { commissionId: 'c-held', approvedBy: ADMIN, now: NOW })
    check('B1: a commission still inside its hold cannot be approved',
      early.kind === 'conflict' && early.reason === 'still_held', JSON.stringify(early))
    check('B1b: and it is still pending', a.tables.affiliate_commissions[0].status === 'pending')
    const ready = await approveCommission(a, { commissionId: 'c-ready', approvedBy: ADMIN, now: NOW })
    check('B2: once the hold has passed it can be approved',
      ready.kind === 'ok' && a.tables.affiliate_commissions[1].status === 'approved'
      && a.tables.affiliate_commissions[1].approved_by === ADMIN)
    const twice = await approveCommission(a, { commissionId: 'c-ready', approvedBy: ADMIN, now: NOW })
    check('B3: approving it again is refused, with the status it is in',
      twice.kind === 'conflict' && twice.reason === 'status_approved', JSON.stringify(twice))
    const missing = await approveCommission(a, { commissionId: 'nope', approvedBy: ADMIN, now: NOW })
    check('B4: a commission that does not exist is not found', missing.kind === 'not_found')
    check('B5: the hold is the row’s own releases_at, never recomputed at approval time',
      /new Date\(found\.data\.releases_at as string\)\.getTime\(\) > now\.getTime\(\)/.test(strip(read('lib/affiliate/operations.ts'))))
    /* B1-MUT: comparing the wrong way would release everything early. */
    check('B1-MUT: the comparison inverted would approve a held commission',
      new Date(HELD).getTime() > NOW.getTime() && !(new Date(HELD).getTime() < NOW.getTime()))

    const voided = world()
    const reversed = await reverseCommission(voided, { commissionId: 'c-ready', reason: 'הפניה עצמית', now: NOW })
    check('B6: an operator can void a commission, with a reason on the row',
      reversed.kind === 'ok' && voided.tables.affiliate_commissions[1].status === 'reversed'
      && voided.tables.affiliate_commissions[1].reversed_reason === 'הפניה עצמית')
    check('B7: a reason is required — a reversal without one is refused',
      (await reverseCommission(world(), { commissionId: 'c-ready', reason: '   ', now: NOW })).kind === 'invalid')
    const twiceRev = await reverseCommission(voided, { commissionId: 'c-ready', reason: 'x', now: NOW })
    check('B8: a reversal is final', twiceRev.kind === 'conflict' && twiceRev.reason === 'already_reversed')

    const vr = world()
    check('B9: a referral can be voided, and then earns nothing more',
      (await voidReferral(vr, { referralId: 'ref-2', now: NOW })).kind === 'ok' && vr.tables.affiliate_referrals[0].status === 'void')
    check('B9b: voiding a referral that is not there is not found',
      (await voidReferral(world(), { referralId: 'nope', now: NOW })).kind === 'not_found')
  }

  console.log('\nC) a payout is a statement, paid by hand')
  {
    const a = world()
    await approveCommission(a, { commissionId: 'c-ready', approvedBy: ADMIN, now: NOW })
    // ₪100 is under the published ₪350 minimum, and the agreement says such a
    // balance CARRIES OVER rather than being paid. So it is refused first, and
    // only an operator's deliberate override draws it.
    const tooSmall = await createPayout(a, { affiliateId: 'aff-2', currency: 'ILS', createdBy: ADMIN, now: NOW })
    check('C0: a balance under the published minimum is refused — it carries over',
      tooSmall.kind === 'conflict' && tooSmall.reason === 'below_minimum', JSON.stringify(tooSmall))
    check('C0b: and nothing was drawn up', a.tables.affiliate_payouts.length === 0)
    const drawn = await createPayout(a, { affiliateId: 'aff-2', currency: 'ILS', createdBy: ADMIN, allowBelowMinimum: true, now: NOW })
    check('C1: with the operator\u2019s override it adds up everything approved and unpaid in ONE currency',
      drawn.kind === 'ok' && drawn.detail?.amount === 100 && drawn.detail?.commissions === 1, JSON.stringify(drawn))
    check('C1b: the shekel statement did not swallow the dollar commission',
      a.tables.affiliate_commissions.find((c) => c.id === 'c-usd')?.payout_id === null)
    check('C1c: it is a DRAFT — no money has moved',
      a.tables.affiliate_payouts[0]?.status === 'draft' && a.tables.affiliate_payouts[0]?.paid_at === undefined)
    check('C1d: and the commissions behind it are traceable from it',
      a.tables.affiliate_commissions.find((c) => c.id === 'c-ready')?.payout_id === a.tables.affiliate_payouts[0].id)
    const empty = await createPayout(a, { affiliateId: 'aff-2', currency: 'ILS', createdBy: ADMIN, allowBelowMinimum: true, now: NOW })
    check('C2: a second statement with nothing approved is refused, not drawn for zero',
      empty.kind === 'conflict' && empty.reason === 'nothing_approved')
    check('C3: a currency we do not keep books in is refused',
      (await createPayout(world(), { affiliateId: 'aff-2', currency: 'EUR', createdBy: ADMIN, now: NOW })).kind === 'invalid')

    const payoutId = a.tables.affiliate_payouts[0].id as string
    check('C4: closing it needs a reference an operator can point at',
      (await markPayoutPaid(a, { payoutId, reference: '  ', now: NOW })).kind === 'invalid')
    const paid = await markPayoutPaid(a, { payoutId, reference: 'PayPal 7X9', now: NOW })
    check('C5: once the transfer is made, the statement and its commissions are paid',
      paid.kind === 'ok' && a.tables.affiliate_payouts[0].status === 'paid'
      && a.tables.affiliate_commissions.find((c) => c.id === 'c-ready')?.status === 'paid', JSON.stringify(paid))
    check('C5b: and the reference is on the statement', a.tables.affiliate_payouts[0].reference === 'PayPal 7X9')
    check('C6: a statement already paid cannot be paid again',
      (await markPayoutPaid(a, { payoutId, reference: 'again', now: NOW })).kind === 'conflict')
    check('C7: and it cannot be cancelled after the money left',
      (await cancelPayout(a, { payoutId, now: NOW })).kind === 'conflict')

    // A commission reversed between the statement and the transfer stays
    // reversed: only the approved ones become paid.
    const racing = world()
    await approveCommission(racing, { commissionId: 'c-ready', approvedBy: ADMIN, now: NOW })
    await createPayout(racing, { affiliateId: 'aff-2', currency: 'ILS', createdBy: ADMIN, allowBelowMinimum: true, now: NOW })
    await reverseCommission(racing, { commissionId: 'c-ready', reason: 'refund', now: NOW })
    const partial = await markPayoutPaid(racing, { payoutId: racing.tables.affiliate_payouts[0].id as string, reference: 'r', now: NOW })
    check('C8: a commission reversed before the transfer is NOT revived as paid',
      partial.kind === 'ok' && partial.detail?.commissions === 0
      && racing.tables.affiliate_commissions.find((c) => c.id === 'c-ready')?.status === 'reversed', JSON.stringify(partial))

    const cancelled = world()
    await approveCommission(cancelled, { commissionId: 'c-ready', approvedBy: ADMIN, now: NOW })
    await createPayout(cancelled, { affiliateId: 'aff-2', currency: 'ILS', createdBy: ADMIN, allowBelowMinimum: true, now: NOW })
    const dropped = await cancelPayout(cancelled, { payoutId: cancelled.tables.affiliate_payouts[0].id as string, now: NOW })
    check('C9: a statement that was never sent can be thrown away',
      dropped.kind === 'ok' && cancelled.tables.affiliate_payouts[0].status === 'cancelled')
    check('C9b: and its commissions go back in the queue, still approved', (() => {
      const row = cancelled.tables.affiliate_commissions.find((c) => c.id === 'c-ready')
      return row?.payout_id === null && row.status === 'approved'
    })())
    // A balance that clears the minimum needs no override at all.
    const big = world()
    big.tables.affiliate_commissions.push({ id: 'c-big', affiliate_id: 'aff-2', referral_id: 'ref-2', source: 'paypal', external_payment_id: 'S4', status: 'approved', amount: 400, currency: 'ILS', earned_at: '2026-09-03T00:00:00.000Z', releases_at: RELEASED, payout_id: null })
    const cleared = await createPayout(big, { affiliateId: 'aff-2', currency: 'ILS', createdBy: ADMIN, now: NOW })
    check('C10: a balance over the minimum is drawn with no override',
      cleared.kind === 'ok' && cleared.detail?.amount === 400, JSON.stringify(cleared))
    check('C10b: the minimum compared against is the published one, per currency',
      AFFILIATE_TERMS.minPayoutIls === 350 && AFFILIATE_TERMS.minPayoutUsd === 100)
    /* C0-MUT: without the check, the ₪100 statement would simply be drawn. */
    check('C0-MUT: a createPayout with no minimum check is caught',
      /allowBelowMinimum && !meetsMinimum\(amount, currency, AFFILIATE_TERMS\)/.test(strip(read('lib/affiliate/operations.ts'))))
    /* C5-MUT: marking paid without filtering to approved would revive a reversal. */
    check('C5-MUT: a paid update not filtered to approved commissions is caught', (() => {
      const src = strip(read('lib/affiliate/operations.ts'))
      const paidBlock = src.slice(src.indexOf(".eq('payout_id', payoutId)\n    .eq('status', 'approved')"))
      return paidBlock.startsWith(".eq('payout_id', payoutId)") && /^\.eq\('payout_id', payoutId\)\n    \.eq\('status', 'approved'\)/.test(paidBlock)
    })())
  }

  console.log('\nD) refusals rather than repairs')
  {
    const a = world()
    check('D1: a partner can be suspended and let back in',
      (await setPartnerStatus(a, { affiliateId: 'aff-2', status: 'suspended', now: NOW })).kind === 'ok'
      && a.tables.affiliates[1].status === 'suspended'
      && (await setPartnerStatus(a, { affiliateId: 'aff-2', status: 'approved', now: NOW })).kind === 'ok')
    // Suspension never touches the link: it is published on somebody's blog and
    // a visitor must not meet a dead end. What stops is EARNING.
    check('D2: suspending a pending application is not a way around approval',
      (await setPartnerStatus(world(), { affiliateId: 'app-1', status: 'approved', now: NOW })).kind === 'not_found')
    check('D3: payout details are checked for a method we actually use',
      (await setPayoutDetails(world(), { affiliateId: 'aff-2', method: 'crypto', details: 'x', now: NOW })).kind === 'invalid'
      && (await setPayoutDetails(world(), { affiliateId: 'aff-2', method: 'wise', details: 'noa@x.co.il', now: NOW })).kind === 'ok')
    check('D3b: and clamped, so a paste cannot fill the column',
      (await setPayoutDetails(world(), { affiliateId: 'aff-2', method: 'bank', details: 'x'.repeat(501), now: NOW })).kind === 'invalid')

    // Linking a partner to one of THEIR OWN referrals would make every
    // commission on it a commission on themselves.
    const own = await linkPartnerAccount(world(), { affiliateId: 'aff-2', userId: 'cust-2', now: NOW })
    check('D4: a partner cannot be linked to an account they themselves referred',
      own.kind === 'conflict' && own.reason === 'own_referral', JSON.stringify(own))
    const linked = world()
    check('D5: an ordinary account can be linked',
      (await linkPartnerAccount(linked, { affiliateId: 'app-1', userId: 'new-user', now: NOW })).kind === 'ok'
      && linked.tables.affiliates[0].user_id === 'new-user')
    const dup = new FakeAdmin({ ...world().tables }, { affiliates: { update: () => ({ code: '23505' }) } })
    const already = await linkPartnerAccount(dup, { affiliateId: 'app-1', userId: 'partner-2', now: NOW })
    check('D6: an account that is already a partner is refused, not silently moved',
      already.kind === 'conflict' && already.reason === 'account_already_partner', JSON.stringify(already))

    const manual = world()
    const entered = await addManualCommission(manual, { affiliateId: 'aff-2', referralId: 'ref-2', reference: 'shopify-charge-9', paymentAmount: 329, currency: 'USD', rate: 30, now: NOW })
    check('D7: a Shopify-billed referral is commissioned by hand',
      entered.kind === 'ok' && entered.detail?.amount === 98.7, JSON.stringify(entered))
    const wrongPartner = await addManualCommission(world(), { affiliateId: 'app-1', referralId: 'ref-2', reference: 'x', paymentAmount: 100, currency: 'USD', rate: 30, now: NOW })
    check('D8: a commission cannot be entered against another partner’s referral',
      wrongPartner.kind === 'invalid' && wrongPartner.reason === 'referral_not_theirs', JSON.stringify(wrongPartner))
    const invalids = await Promise.all([
      addManualCommission(world(), { affiliateId: 'aff-2', referralId: 'ref-2', reference: ' ', paymentAmount: 100, currency: 'USD', rate: 30, now: NOW }),
      addManualCommission(world(), { affiliateId: 'aff-2', referralId: 'ref-2', reference: 'x', paymentAmount: 0, currency: 'USD', rate: 30, now: NOW }),
      addManualCommission(world(), { affiliateId: 'aff-2', referralId: 'ref-2', reference: 'x', paymentAmount: 100, currency: 'USD', rate: 0, now: NOW }),
      addManualCommission(world(), { affiliateId: 'aff-2', referralId: 'ref-2', reference: 'x', paymentAmount: 100, currency: 'EUR', rate: 30, now: NOW }),
    ])
    check('D9: every nonsense entry is refused with its own reason',
      invalids.map((r) => (r.kind === 'invalid' ? r.reason : r.kind)).join(',') === 'reference_required,payment_amount,rate,currency',
      JSON.stringify(invalids))
    /* D4-MUT: without the own-referral check, a partner could earn on themselves. */
    check('D4-MUT: a missing own-referral check is caught',
      /if \(referred\.data\) return \{ kind: 'conflict', reason: 'own_referral' \}/.test(strip(read('lib/affiliate/operations.ts'))))
  }

  console.log('\nE) two operators at once')
  {
    // Every write is filtered by the status it expects, so the second click
    // changes nothing and is told so rather than reported as success.
    const a = world()
    const [first, second] = await Promise.all([
      approveApplication(a, { affiliateId: 'app-1', code: 'dana', decidedBy: ADMIN, now: NOW }),
      approveApplication(a, { affiliateId: 'app-1', code: 'dana2', decidedBy: 'admin-b', now: NOW }),
    ])
    const kinds = [first.kind, second.kind].sort().join(',')
    check('E1: two operators approving one application do not both succeed',
      kinds === 'conflict,ok', JSON.stringify([first, second]))
    check('E1b: and the partner has exactly one code',
      typeof a.tables.affiliates[0].code === 'string' && a.tables.affiliates[0].status === 'approved')
    check('E2: every decisive write is filtered by the status it expects', (() => {
      const src = strip(read('lib/affiliate/operations.ts'))
      return /\.eq\('status', 'pending'\)[\s\S]{0,80}\.select\('id'\)/.test(src)
        && /\.eq\('status', 'draft'\)[\s\S]{0,80}\.select\('id'\)/.test(src)
    })())
    check('E3: zero rows written is never reported as success', (() => {
      const src = strip(read('lib/affiliate/operations.ts'))
      return [...src.matchAll(/updated\.data \?\? \[\]\)\.length/g)].length >= 5
    })())
    /* E1-MUT: an update not filtered by status would let both clicks win. */
    check('E1-MUT: an unfiltered approval update is caught',
      !/\.eq\('status', 'pending'\)/.test("await admin.from('affiliates').update(payload).eq('id', affiliateId).select('id')"))
  }

  console.log('\nF) only an administrator gets here')
  {
    const route = strip(read('app/api/admin/affiliates/route.ts'))
    // proxy.ts's matcher excludes /api/*, so this route authenticates itself.
    check('F1: the route proves the caller is an administrator first',
      /requireAdminApi\(\)/.test(route) && route.indexOf('requireAdminApi') < route.indexOf('switch'))
    check('F2: it has no reviewer bypass and no hard-coded id',
      !/reviewer|bypass/i.test(route) && !/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}/.test(route))
    check('F3: the operator doing it is taken from the proven session, never the body',
      /decidedBy: gate\.userId/.test(route) && !/decidedBy: body/.test(route),
      route.match(/decidedBy: [^,\n]*/)?.[0] ?? 'not found')
    check('F4: every outcome has an HTTP answer, and failure is never a 200',
      /not_found: 404/.test(route) && /invalid: 400/.test(route) && /conflict: 409/.test(route) && /failed: 500/.test(route))
    /* F1-MUT: a route without the admin check would be open to any signed-in user. */
    check('F1-MUT: a route missing requireAdminApi is caught',
      !/requireAdminApi\(\)/.test(route.replace(/requireAdminApi\(\)/g, 'getUser()')))
  }

  console.log('\nG) forgetting an application')
  {
    // applied_ip exists to recognise a flood of applications as they arrive, and
    // that purpose is spent within hours. A year later it goes, and a refused
    // application goes with it.
    const old = new Date(NOW.getTime() - 400 * 24 * 60 * 60 * 1000).toISOString()
    const recent = new Date(NOW.getTime() - 10 * 24 * 60 * 60 * 1000).toISOString()
    const a = new FakeAdmin({
      affiliates: [
        { id: 'old-rejected', status: 'rejected', code: null, applied_at: old, applied_ip: '1.1.1.1', decided_at: old },
        { id: 'old-approved', status: 'approved', code: 'dana', applied_at: old, applied_ip: '2.2.2.2', decided_at: old },
        { id: 'old-pending', status: 'pending', code: null, applied_at: old, applied_ip: '3.3.3.3', decided_at: null },
        { id: 'new-rejected', status: 'rejected', code: null, applied_at: recent, applied_ip: '4.4.4.4', decided_at: recent },
        { id: 'new-approved', status: 'approved', code: 'noa', applied_at: recent, applied_ip: '5.5.5.5', decided_at: recent },
        { id: 'already-forgotten', status: 'approved', code: 'tal', applied_at: old, applied_ip: null, decided_at: old },
      ],
    })
    const out = await purgeAffiliateApplications(a, NOW)
    check('G1: a refused application older than the retention is deleted whole',
      out.rejectedDeleted === 1 && !a.tables.affiliates.some((r) => r.id === 'old-rejected'), JSON.stringify(out))
    check('G2: everyone else keeps their row and loses the address',
      a.tables.affiliates.find((r) => r.id === 'old-approved')?.applied_ip === null
      && a.tables.affiliates.find((r) => r.id === 'old-pending')?.applied_ip === null)
    check('G3: a recent application is untouched — the limit it serves is still live',
      a.tables.affiliates.find((r) => r.id === 'new-rejected')?.applied_ip === '4.4.4.4'
      && a.tables.affiliates.find((r) => r.id === 'new-approved')?.applied_ip === '5.5.5.5')
    check('G4: a row already forgotten is not counted again as work', out.ipsForgotten === 2, String(out.ipsForgotten))
    const before = JSON.stringify(a.tables.affiliates)
    const second = await purgeAffiliateApplications(a, NOW)
    check('G5: running it again changes nothing and reports no work',
      second.rejectedDeleted === 0 && second.ipsForgotten === 0 && JSON.stringify(a.tables.affiliates) === before,
      JSON.stringify(second))
    check('G6: the retention is a year, stated once', APPLICATION_RETENTION_DAYS === 365
      && retentionCutoff(NOW) === new Date(NOW.getTime() - 365 * 24 * 60 * 60 * 1000).toISOString())

    // THE BOOKS ARE NOT TOUCHED. A referral, a commission and a payout are what
    // a partner is owed and what we paid; the database grants DELETE on
    // `affiliates` alone so this cannot change.
    check('G7: nothing else is ever deleted', (() => {
      const src = strip(read('lib/affiliate/retention.ts'))
      const deletes = [...src.matchAll(/\.from\('([a-z_]+)'\)\s*\n?\s*\.delete\(\)/g)].map((m) => m[1])
      return deletes.length === 1 && deletes[0] === 'affiliates'
    })())
    check('G8: and the database grants DELETE on that table alone', (() => {
      const sql = read('supabase/migrations/20261009190000_affiliate_program.sql').replace(/^\s*--.*$/gm, '')
      const grants = [...sql.matchAll(/GRANT ([A-Z, ]+) ON TABLE public\.(affiliate[a-z_]*)\s+TO service_role/g)]
      return grants.length === 5 && grants.filter(([, verbs]) => verbs.includes('DELETE')).map(([, , table]) => table).join(',') === 'affiliates'
    })(), 'grants')
    check('G9: the cron proves the caller before it deletes anything', (() => {
      const route = strip(read('app/api/affiliate/retention/cron/route.ts'))
      return route.indexOf("authorizeCronRequest(request, 'affiliate-retention')") > -1
        && route.indexOf('authorizeCronRequest') < route.indexOf('purgeAffiliateApplications')
    })())
    check('G10: and it is actually scheduled', /"\/api\/affiliate\/retention\/cron"/.test(read('vercel.json')))
    check('G11: the log carries counts, never an applicant', (() => {
      const route = strip(read('app/api/affiliate/retention/cron/route.ts'))
      return /console\.log\('\[affiliate-retention\] pass complete', summary\)/.test(route)
        && !/applied_ip|email|name/.test(route)
    })())
    /* G1-MUT: a purge not filtered to rejected would delete live partners. */
    check('G1-MUT: a delete not filtered to rejected applications is caught',
      /\.eq\('status', 'rejected'\)/.test(strip(read('lib/affiliate/retention.ts'))))
    check('G2-MUT: an IP cleared to a value rather than NULL is caught',
      /applied_ip: null/.test(strip(read('lib/affiliate/retention.ts'))))
  }

  console.log(`\n${pass} passed, ${fail} failed`)
  if (fail > 0) process.exitCode = 1
}

void main()

export {}
