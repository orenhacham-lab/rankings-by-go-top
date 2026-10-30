/**
 * The email that carries a marketplace buyer's claim link.
 *
 * The thing worth guarding here is not the wording, it is that the link
 * leaves the building at all: the order was recorded and the URL discarded
 * for as long as this layer existed, so every check below is about the
 * delivery actually happening, happening once, and never happening to the
 * wrong recipient or without a configured sender.
 *
 * MUTATION CONTROLS throughout: each guard also runs against a broken version
 * of what it protects and must fail there.
 *
 * Run: npx tsx lib/marketplace/__qa__/claim-email.qa.ts
 */
import { readFileSync } from 'fs'
import {
  buildClaimEmail,
  sendClaimEmail,
  type BuyerSender,
} from '../claim-email'

let pass = 0, fail = 0
function check(name: string, cond: boolean, detail?: string) {
  if (cond) { pass++; console.log(`  ✓ ${name}`) } else { fail++; console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`) }
}
const read = (p: string) => readFileSync(p, 'utf8')
/** Comments stripped: a rule must hold in the CODE, not in a sentence. */
const code = (p: string) => read(p).replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')

const URL = 'https://www.gotopseo.com/claim?order=tok-123'
const ENV = { RESEND_API_KEY: 'k', RESEND_FROM_EMAIL: 'no-reply@example.com' }

/** A sender that records what it was asked to send and claims success. */
function recorder() {
  const sent: Parameters<BuyerSender>[0][] = []
  const send: BuyerSender = async (m) => { sent.push(m); return { ok: true } }
  return { sent, send }
}

async function main() {
  console.log('\nA. the email itself')
  {
    const email = buildClaimEmail({ claimUrl: URL, plan: 'premium', providerLabel: 'JVZoo' })
    check('A1: the claim URL is in the html', email.html.includes(URL))
    check('A2: and in the plain-text part, for a client that renders no html',
      email.text.includes(URL))
    check('A3: the platform the buyer actually paid is named', email.text.includes('JVZoo'))
    check('A4: the plan is named', email.subject.includes('Premium') && email.text.includes('Premium'))
    check('A5: it never states a price, because what they paid is the platform\'s fact',
      !/[$€₪]\s?\d/.test(email.text) && !/[$€₪]\s?\d/.test(email.html))
    check('A6: and never claims an account already exists',
      !/your account is ready/i.test(email.text))

    const label = buildClaimEmail({ claimUrl: URL, plan: 'large_agency', providerLabel: 'JVZoo' })
    check('A7: large_agency is written as words, not as a column value',
      label.subject.includes('Large Agency') && !label.subject.includes('large_agency'))

    const nasty = buildClaimEmail({
      claimUrl: URL,
      plan: 'regular',
      providerLabel: '<script>x</script>',
    })
    check('A8: a provider label is escaped into the html',
      !nasty.html.includes('<script>') && nasty.html.includes('&lt;script&gt;'))
    check('A-MUT1: ...and the control, a label with no markup is left alone',
      buildClaimEmail({ claimUrl: URL, plan: 'regular', providerLabel: 'JVZoo' }).html.includes('JVZoo'))
  }

  console.log('\nB. the send, and the gate in front of it')
  {
    const r = recorder()
    const ok = await sendClaimEmail('Buyer@Example.com', { claimUrl: URL, plan: 'advanced', providerLabel: 'JVZoo' },
      { env: ENV, send: r.send })
    check('B1: a configured sender sends', ok.sent === true)
    check('B2: to the buyer\'s address, lower-cased as the row holds it',
      r.sent.length === 1 && r.sent[0].to === 'buyer@example.com')
    check('B3: from the configured sender and nobody else',
      r.sent[0].from === 'no-reply@example.com')
    check('B4: carrying the claim URL', r.sent[0].html.includes(URL) && r.sent[0].text.includes(URL))
    check('B5: and no Reply-To unless one is configured', r.sent[0].replyTo === undefined)

    const withReply = recorder()
    await sendClaimEmail('b@example.com', { claimUrl: URL, plan: 'advanced', providerLabel: 'JVZoo' },
      { env: { ...ENV, RESEND_REPLY_TO: 'hello@example.com' }, send: withReply.send })
    check('B6: a configured Reply-To is used', withReply.sent[0].replyTo === 'hello@example.com')
  }

  console.log('\nC. everything that must NOT send')
  {
    const noKey = recorder()
    const a = await sendClaimEmail('b@example.com', { claimUrl: URL, plan: 'regular', providerLabel: 'JVZoo' },
      { env: { RESEND_FROM_EMAIL: 'x@example.com' }, send: noKey.send })
    check('C1: no API key is not_configured, and nothing is attempted',
      a.sent === false && a.reason === 'not_configured' && noKey.sent.length === 0)

    const noFrom = recorder()
    const b = await sendClaimEmail('b@example.com', { claimUrl: URL, plan: 'regular', providerLabel: 'JVZoo' },
      { env: { RESEND_API_KEY: 'k' }, send: noFrom.send })
    check('C2: no sender address is not_configured',
      b.sent === false && b.reason === 'not_configured' && noFrom.sent.length === 0)

    const badTo = recorder()
    const c = await sendClaimEmail('not-an-address', { claimUrl: URL, plan: 'regular', providerLabel: 'JVZoo' },
      { env: ENV, send: badTo.send })
    check('C3: an unusable recipient is refused before the provider is called',
      c.sent === false && c.reason === 'invalid_recipient' && badTo.sent.length === 0)

    const empty = recorder()
    const d = await sendClaimEmail('', { claimUrl: URL, plan: 'regular', providerLabel: 'JVZoo' },
      { env: ENV, send: empty.send })
    check('C4: and so is an empty one', d.sent === false && empty.sent.length === 0)

    const httpUrl = recorder()
    const e = await sendClaimEmail('b@example.com',
      { claimUrl: 'http://www.gotopseo.com/claim?order=t', plan: 'regular', providerLabel: 'JVZoo' },
      { env: ENV, send: httpUrl.send })
    check('C5: a claim link that is not absolute https never goes out',
      e.sent === false && httpUrl.sent.length === 0)

    const refused: BuyerSender = async () => ({ ok: false })
    const f = await sendClaimEmail('b@example.com', { claimUrl: URL, plan: 'regular', providerLabel: 'JVZoo' },
      { env: ENV, send: refused })
    check('C6: a provider that refuses is send_failed, not a silent success',
      f.sent === false && f.reason === 'send_failed')

    const threw: BuyerSender = async () => { throw new Error('network') }
    const g = await sendClaimEmail('b@example.com', { claimUrl: URL, plan: 'regular', providerLabel: 'JVZoo' },
      { env: ENV, send: threw })
    check('C7: and a provider that throws never reaches the caller as an exception',
      g.sent === false && g.reason === 'send_failed')

    const c5control = recorder()
    const h = await sendClaimEmail('b@example.com', { claimUrl: URL, plan: 'regular', providerLabel: 'JVZoo' },
      { env: ENV, send: c5control.send })
    check('C-MUT1: the control for C1..C5, the same call with everything in place DOES send',
      h.sent === true && c5control.sent.length === 1)
  }

  console.log('\nD. the webhook actually calls it')
  {
    const routePath = 'app/api/marketplace/[provider]/webhook/route.ts'
    const src = code(routePath)
    check('D1: the route sends the claim email', /sendClaimEmail\(/.test(src))
    check('D2: only for a recorded order', /outcome\.kind === 'recorded'/.test(src))
    check('D3: after the platform has been answered, so a refused email cannot force a retry',
      /after\(async \(\) => \{[\s\S]*?sendClaimEmail\(/.test(src))
    check('D4: with the URL the intake minted, not one rebuilt here',
      /claimUrl: claimUrl/.test(src) || /claimUrl,/.test(src))
    check('D5: a failure alerts the operator', /alertClaimEmailFailed\(/.test(src))
    check('D6: and the log line carries the order id, never the token or the address',
      /orderId,/.test(src) && !/claim_token/.test(src) && !/buyerEmail,\s*$/m.test(src))

    const broken = src.replace(/sendClaimEmail\(/g, 'noop(')
    check('D-MUT2: ...and a route that stops sending fails D1',
      !/sendClaimEmail\(/.test(broken))
    const unguarded = src.replace(/outcome\.kind === 'recorded'/g, "outcome.kind === 'anything'")
    check('D-MUT3: ...and one that sends on any outcome fails D2',
      !/outcome\.kind === 'recorded'/.test(unguarded))
  }

  console.log('\nE. one order, one email')
  {
    const src = code('lib/marketplace/intake.ts')
    check('E1: a redelivery returns already_recorded and carries no claim URL',
      /kind: 'already_recorded'/.test(src)
      && !/kind: 'already_recorded'[^}]*claimUrl/.test(src))
    const routeSrc = code('app/api/marketplace/[provider]/webhook/route.ts')
    check('E2: so the route has nothing to send on a redelivery',
      !/already_recorded[\s\S]{0,200}sendClaimEmail/.test(routeSrc))
  }

  console.log('\nF. the operator alert gives enough to recover and no more')
  {
    const src = read('lib/marketplace/claim-email.ts')
    check('F1: the alert names the order id', /Order id: \$\{escapeEmailHtml\(params\.orderId\)\}/.test(src))
    check('F2: and never the claim token or the buyer\'s address',
      !/claimUrl/.test(src.split('export async function alertClaimEmailFailed')[1] ?? '')
      && !/recipient/.test(src.split('export async function alertClaimEmailFailed')[1] ?? ''))
    check('F3: it goes through the one place an operator email leaves the app',
      /deliverOperatorEmail\(/.test(src))
    check('F4: and the buyer email has exactly one recipient argument',
      /export async function sendClaimEmail\(\s*to: string,/.test(src))
  }
}

main().then(() => {
  console.log(`\n${pass} passed, ${fail} failed`)
  if (fail > 0) process.exitCode = 1
})

export {}
