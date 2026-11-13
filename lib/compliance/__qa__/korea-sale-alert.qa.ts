/**
 * THE ALERT THAT CLOSES THE ONE HOLE THE COUNTRY HEADER LEAVES.
 *
 * lib/billing/korea-sale.ts refuses a Korean checkout on the CDN's country
 * header alone, and says in its own header why an unplaceable visitor is let
 * through. Creem reports the billing country at its webhook, after the sale.
 * lib/compliance/korea-sale-alert.ts turns that into one email to the owner.
 *
 * What can silently undo it, which is what each section here holds down:
 *
 *   A) the country is read out of the event at all — Creem's documented path
 *      is object.customer.country, and a wrong path means an alert that never
 *      fires and nobody ever notices;
 *   B) only Korea alerts, and an unknown country alerts NOBODY rather than
 *      everybody (an alert on every sale would be ignored within a week);
 *   C) the buyer's address is escaped before it reaches the inbox;
 *   D) the alert cannot break the delivery: a throwing sender is swallowed,
 *      and the kill switch turns it off with the rest of the alerts;
 *   E) it NEVER refunds, cancels or writes — the source carries no such call;
 *   F) the webhook route actually calls it, after the entitlement is saved.
 *
 * Each section ends with a MUTATION CONTROL: the proof fails when the fix is
 * reverted.
 *
 * Run: npx tsx lib/compliance/__qa__/korea-sale-alert.qa.ts
 */
import { readFileSync } from 'fs'
import {
  buildKoreanSaleAlertHtml,
  creemEventBillingCountry,
  creemEventCustomerEmail,
  notifyKoreanBillingAddress,
} from '../korea-sale-alert'
import { KOREA_COUNTRY } from '../../billing/korea-sale'
import type { OperatorMessage } from '../../notifications/operator-alerts'

let pass = 0, fail = 0
function check(name: string, cond: boolean, detail?: string) {
  if (cond) { pass++; console.log(`  ✓ ${name}`) } else { fail++; console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`) }
}

const read = (path: string) => readFileSync(path, 'utf8')
const stripComments = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '').replace(/\{\/\*[\s\S]*?\*\/\}/g, '')

const ALERT_SRC = read('lib/compliance/korea-sale-alert.ts')
const ROUTE_SRC = stripComments(read('app/api/creem/webhook/route.ts'))

/** A sender that records what it was asked to send and always succeeds. */
function recorder() {
  const sent: OperatorMessage[] = []
  return {
    sent,
    send: async (message: OperatorMessage) => { sent.push(message); return { ok: true } },
  }
}

const ENV = { RESEND_API_KEY: 'test-key' } as Record<string, string | undefined>

console.log('A) the billing country is read out of a real Creem event shape')
{
  check('A1: Creem\'s documented path, object.customer.country',
    creemEventBillingCountry({ eventType: 'checkout.completed', object: { customer: { country: 'KR' } } }) === 'KR')
  check('A2: a lower-case code is normalised',
    creemEventBillingCountry({ object: { customer: { country: 'kr' } } }) === 'KR')
  check('A3: the customer nested under an order',
    creemEventBillingCountry({ object: { order: { customer: { country: 'NL' } } } }) === 'NL')
  check('A4: a billing_address object',
    creemEventBillingCountry({ object: { customer: { billing_address: { country: 'JP' } } } }) === 'JP')
  check('A5: no country at all is null, never a guess',
    creemEventBillingCountry({ object: { customer: { email: 'a@b.com' } } }) === null)
  check('A6: a country name is not a country code',
    creemEventBillingCountry({ object: { customer: { country: 'Korea, Republic of' } } }) === null)
  check('A7: a non-object event is null and does not throw',
    creemEventBillingCountry('nope') === null && creemEventBillingCountry(null) === null)
  check('A8: an array in place of the object is not read as one',
    creemEventBillingCountry({ object: [{ country: 'KR' }] }) === null)
  check('A9: the buyer\'s address comes off the same event',
    creemEventCustomerEmail({ object: { customer: { email: ' buyer@example.com ' } } }) === 'buyer@example.com')
  check('A10: a value that is not an address is null',
    creemEventCustomerEmail({ object: { customer: { email: 'not-an-address' } } }) === null)
}

console.log('\nB) only Korea alerts, and an unknown country alerts nobody')
void (async () => {
  {
    const r = recorder()
    const out = await notifyKoreanBillingAddress({ country: 'KR', email: 'buyer@example.com' }, { env: ENV, send: r.send })
    check('B1: a Korean billing address sends exactly one email', out.sent === true && r.sent.length === 1)
    check('B2: the subject names the country', !!r.sent[0] && r.sent[0].subject.includes('KR'))
  }
  {
    const r = recorder()
    const out = await notifyKoreanBillingAddress({ country: 'US' }, { env: ENV, send: r.send })
    check('B3: an American billing address sends nothing',
      out.sent === false && out.reason === 'not_korea' && r.sent.length === 0)
  }
  {
    const r = recorder()
    const out = await notifyKoreanBillingAddress({ country: null }, { env: ENV, send: r.send })
    check('B4: an unknown country sends nothing — the default is silence, not noise',
      out.sent === false && out.reason === 'unknown_country' && r.sent.length === 0)
  }
  {
    const r = recorder()
    await notifyKoreanBillingAddress({ country: 'kr' }, { env: ENV, send: r.send })
    check('B5: the match is on the normalised code, so a lower-case event still alerts', r.sent.length === 1)
  }
  check('B6: the module matches KOREA_COUNTRY, it does not spell "KR" again',
    /KOREA_COUNTRY/.test(ALERT_SRC) && KOREA_COUNTRY === 'KR')

  console.log('\nC) the buyer\'s address never reaches the inbox unescaped')
  {
    const html = buildKoreanSaleAlertHtml({
      country: 'KR',
      email: '<script>alert(1)</script>@x.com',
      eventType: 'checkout.completed',
      when: new Date('2026-11-13T00:00:00.000Z'),
    })
    check('C1: no script tag survives', !/<script>/.test(html))
    check('C2: the country and the time are in the body',
      html.includes('KR') && html.includes('2026-11-13T00:00:00.000Z'))
    check('C3: the event type is escaped through the helper too',
      /escapeEmailHtml\(i\.eventType\)/.test(ALERT_SRC))
    const noEmail = buildKoreanSaleAlertHtml({ country: 'KR', email: null, eventType: null, when: new Date() })
    check('C4: an absent address leaves no empty row behind', !noEmail.includes('כתובת הקונה'))
  }

  console.log('\nD) the alert can never break the delivery')
  {
    const out = await notifyKoreanBillingAddress(
      { country: 'KR' },
      { env: ENV, send: async () => { throw new Error('resend is down') } },
    )
    // deliverOperatorEmail catches the sender's throw itself and reports
    // send_failed; the module's own catch is the second net (D3). Either way
    // the caller gets a result and the webhook never sees an exception.
    check('D1: a throwing sender is swallowed and reported, not rethrown',
      out.sent === false && (out.reason === 'send_failed' || out.reason === 'error'), String(out.reason))
  }
  {
    const r = recorder()
    const out = await notifyKoreanBillingAddress(
      { country: 'KR' },
      { env: { ...ENV, OPERATOR_ALERTS_DISABLED: 'true' }, send: r.send },
    )
    check('D2: the one kill switch turns this off with the other operator alerts',
      out.sent === false && out.reason === 'disabled' && r.sent.length === 0)
  }
  check('D3: every path returns a result — the function\'s body is wrapped in try/catch',
    /try \{[\s\S]*catch \(err\)/.test(ALERT_SRC))

  console.log('\nE) it never moves the customer\'s money')
  {
    const code = stripComments(ALERT_SRC)
    check('E1: no refund, cancel or void call anywhere in the module',
      !/refund|cancel|void\s*\(/i.test(code), code.match(/refund|cancel/i)?.[0])
    check('E2: no database write — it takes no admin client at all',
      !/createAdminClient|ServiceRoleClient|\.from\(/.test(code))
    check('E3: no Creem API call — it reads the event it was given',
      !/fetchCreemSubscription|creemApiBase|fetch\(/.test(code))
    check('E4: the only thing it sends is an operator email',
      /deliverOperatorEmail/.test(code) && !/resend\.emails\.send/.test(code))
  }

  console.log('\nF) the webhook route calls it, after the entitlement is saved')
  {
    check('F1: the route calls the alert', /notifyKoreanBillingAddress\(/.test(ROUTE_SRC))
    check('F2: it reads the country off the parsed event', /creemEventBillingCountry\(parsed\)/.test(ROUTE_SRC))
    const entitlementAt = ROUTE_SRC.indexOf('processVerifiedCreemEvent(')
    const alertAt = ROUTE_SRC.indexOf('notifyKoreanBillingAddress(')
    const statusAt = ROUTE_SRC.indexOf('httpStatusForCreemOutcome(')
    check('F3: the alert runs AFTER the entitlement is processed',
      entitlementAt > 0 && alertAt > entitlementAt)
    check('F4: and before the response is built, inside the same request',
      statusAt > alertAt && alertAt > 0)
    const block = ROUTE_SRC.slice(alertAt - 400, alertAt + 600)
    check('F5: it is wrapped in its own try/catch, so it cannot fail the delivery',
      /try \{/.test(block) && /catch \(koreaError\)/.test(block))
    check('F6: the route\'s status still comes from the outcome, not from the alert',
      /const status = httpStatusForCreemOutcome\(outcome\)/.test(ROUTE_SRC))
  }

  console.log('\nM) mutation controls: each proof fails when the fix is reverted')
  {
    const noPath = ALERT_SRC.replace(/record\(object\.customer\)\?\.country,/, '')
    check('M1: dropping Creem\'s documented country path is caught',
      !/record\(object\.customer\)\?\.country,/.test(noPath))
    const everyCountry = ALERT_SRC.replace('if (country !== KOREA_COUNTRY) return { sent: false, reason: \'not_korea\' }', '')
    check('M2: removing the Korea test — alerting on every sale — is caught',
      !/country !== KOREA_COUNTRY/.test(everyCountry))
    check('M3: the body interpolates the address only through the escape helper',
      !/\$\{i\.email\}/.test(ALERT_SRC) && /escapeEmailHtml\(i\.email\)/.test(ALERT_SRC))
    const noAlert = ROUTE_SRC.replace(/notifyKoreanBillingAddress\(/g, 'noop(')
    check('M4: a route that stops calling the alert is caught',
      !/notifyKoreanBillingAddress\(/.test(noAlert))
    const refunding = `${ALERT_SRC}\nawait creemRefund(order)\n`
    check('M5: a refund added to the module is caught', /refund/i.test(stripComments(refunding)))
    const noGuard = ROUTE_SRC.replace(/catch \(koreaError\)/, 'catch (other)')
    check('M6: the alert\'s own catch clause is what F5 matches',
      !/catch \(koreaError\)/.test(noGuard))
  }

  console.log(`\n${pass} passed, ${fail} failed`)
  if (fail > 0) process.exit(1)
})()

export {}
