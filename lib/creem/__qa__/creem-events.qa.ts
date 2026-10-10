/**
 * The Creem event table decides whether a paying customer keeps access, so
 * this suite pins both halves of it:
 *
 *  1. COMPLETENESS against Creem's published event list. DOCUMENTED below is
 *     the list from https://docs.creem.io/code/webhooks, copied by hand. If
 *     Creem adds an event, or we invent one they do not send, the two sets
 *     stop matching and this fails. That is the whole point: an unhandled
 *     provider event must never look like a handled one.
 *  2. The POLICY itself — which events keep access and which take it away —
 *     because those four or five lines are the entire commercial behaviour
 *     of the integration.
 *
 * MUTATION CONTROLS at the end break the policy in the two ways that would
 * actually cost money (revoking on a scheduled cancel, revoking on the first
 * failed charge) and in the way that would silently give access away
 * (treating an unknown event as harmless), and show the assertions catch it.
 *
 * Run: npx tsx lib/creem/__qa__/creem-events.qa.ts
 */
import {
  CREEM_EVENT_TYPES,
  EVENT_EFFECTS,
  effectForCreemEvent,
  isCreemEventType,
  type CreemEventEffect,
} from '../events'

let pass = 0, fail = 0
function check(name: string, cond: boolean, detail?: string) {
  if (cond) { pass++; console.log(`  ✓ ${name}`) } else { fail++; console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`) }
}

/** Creem's documented event types, from docs.creem.io/code/webhooks. */
const DOCUMENTED = [
  'checkout.completed',
  'subscription.active',
  'subscription.paid',
  'subscription.canceled',
  'subscription.scheduled_cancel',
  'subscription.past_due',
  'subscription.unpaid',
  'subscription.expired',
  'refund.created',
  'dispute.created',
  'subscription.update',
  'subscription.trialing',
  'subscription.paused',
  'credits.granted',
  'credits.consumed',
  'customer_credits.exhausted',
  'credits.auto_recharged',
].sort()

console.log('A) the table covers Creem\'s documented events exactly')
{
  const ours = [...CREEM_EVENT_TYPES].sort()
  const missing = DOCUMENTED.filter((e) => !ours.includes(e as never))
  const extra = ours.filter((e) => !DOCUMENTED.includes(e))
  check('no documented event is unhandled', missing.length === 0, `missing: ${missing.join(', ')}`)
  check('no event is invented', extra.length === 0, `extra: ${extra.join(', ')}`)
}

console.log('\nB) access is KEPT where the customer has paid for it')
const keepsAccess = (event: string) => {
  const e = effectForCreemEvent(event)
  return e.kind === 'status' && e.status === 'active'
}
check('subscription.active keeps access', keepsAccess('subscription.active'))
check('subscription.paid keeps access', keepsAccess('subscription.paid'))
check('subscription.trialing keeps access', keepsAccess('subscription.trialing'))
check('subscription.scheduled_cancel keeps access to the end of the paid period',
  keepsAccess('subscription.scheduled_cancel'))
check('subscription.past_due keeps access while Creem retries the charge',
  keepsAccess('subscription.past_due'))

console.log('\nC) access is TAKEN only when it genuinely ends')
const statusFor = (event: string) => {
  const e = effectForCreemEvent(event)
  return e.kind === 'status' ? e.status : `not-a-status:${e.kind}`
}
check('subscription.canceled -> cancelled', statusFor('subscription.canceled') === 'cancelled')
check('subscription.expired -> expired', statusFor('subscription.expired') === 'expired')
check('subscription.unpaid -> inactive (retries are over)', statusFor('subscription.unpaid') === 'inactive')
check('subscription.paused -> inactive', statusFor('subscription.paused') === 'inactive')

console.log('\nD) the events that must NOT move the entitlement')
check('checkout.completed goes to the activation path, not a status write',
  effectForCreemEvent('checkout.completed').kind === 'activate')
check('subscription.update changes no state by itself',
  effectForCreemEvent('subscription.update').kind === 'none')
check('a refund is flagged for a human, not absorbed',
  effectForCreemEvent('refund.created').kind === 'notify')
check('a dispute is flagged for a human, not absorbed',
  effectForCreemEvent('dispute.created').kind === 'notify')
check('credit events do nothing: we do not sell credits',
  ['credits.granted', 'credits.consumed', 'credits.auto_recharged', 'customer_credits.exhausted']
    .every((e) => effectForCreemEvent(e).kind === 'none'))
check('every "none" and "notify" entry says why',
  Object.values(EVENT_EFFECTS as Record<string, CreemEventEffect>)
    .filter((e) => e.kind === 'none' || e.kind === 'notify')
    .every((e) => 'why' in e && typeof e.why === 'string' && e.why.length > 10))

console.log('\nE) anything undocumented fails closed')
for (const junk of ['subscription.deleted', 'SUBSCRIPTION.PAID', 'checkout.completed ', '', 'null', '__proto__', 'toString']) {
  check(`"${junk}" is unknown`, effectForCreemEvent(junk).kind === 'unknown')
}
for (const junk of [null, undefined, 42, {}, [], true]) {
  check(`${JSON.stringify(junk) ?? String(junk)} is unknown`, effectForCreemEvent(junk).kind === 'unknown')
}
check('isCreemEventType agrees with the table',
  isCreemEventType('subscription.paid') && !isCreemEventType('subscription.deleted') && !isCreemEventType('hasOwnProperty'))

console.log('\nF) mutation controls: break the policy and these assertions must fail')
{
  type Table = (event: unknown) => CreemEventEffect

  /** Does a policy survive the commercial assertions above? */
  function survives(effect: Table): boolean {
    const keeps = (e: string) => { const r = effect(e); return r.kind === 'status' && r.status === 'active' }
    const isStatus = (e: string, s: string) => { const r = effect(e); return r.kind === 'status' && r.status === s }
    return keeps('subscription.scheduled_cancel')
      && keeps('subscription.past_due')
      && keeps('subscription.paid')
      && isStatus('subscription.unpaid', 'inactive')
      && isStatus('subscription.expired', 'expired')
      && effect('subscription.deleted').kind === 'unknown'
      && effect('dispute.created').kind === 'notify'
  }

  check('the real table survives', survives(effectForCreemEvent) === true)

  const revokesOnScheduledCancel: Table = (e) =>
    e === 'subscription.scheduled_cancel' ? { kind: 'status', status: 'cancelled' } : effectForCreemEvent(e)
  check('MUTATION: revoking on a scheduled cancel is caught', survives(revokesOnScheduledCancel) === false)

  const revokesOnFirstFailedCharge: Table = (e) =>
    e === 'subscription.past_due' ? { kind: 'status', status: 'inactive' } : effectForCreemEvent(e)
  check('MUTATION: revoking on the first failed charge is caught', survives(revokesOnFirstFailedCharge) === false)

  const unknownIsHarmless: Table = (e) => {
    const real = effectForCreemEvent(e)
    return real.kind === 'unknown' ? { kind: 'none', why: 'assumed harmless' } : real
  }
  check('MUTATION: treating an unknown event as harmless is caught', survives(unknownIsHarmless) === false)

  const swallowsDisputes: Table = (e) =>
    e === 'dispute.created' ? { kind: 'none', why: 'swallowed' } : effectForCreemEvent(e)
  check('MUTATION: swallowing a dispute is caught', survives(swallowsDisputes) === false)
}

console.log(`\n${pass} passed, ${fail} failed`)
if (fail > 0) process.exitCode = 1

export {}
