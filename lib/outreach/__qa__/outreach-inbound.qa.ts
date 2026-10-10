/**
 * Replies to an outbound prospecting email.
 *
 * The message promises "reply no and I will not write again". Keeping that promise by
 * machine is the whole point of this endpoint, so the two failures that matter are:
 * missing a refusal (a broken promise, FTC Act s.5), and suppressing someone because our
 * own footer was quoted back in their reply (every interested answer lost).
 *
 * Every guard runs twice: against the real module, and against a deliberately broken
 * copy that must fail. A guard that cannot fail tests nothing.
 *
 * Run: npx tsx lib/outreach/__qa__/outreach-inbound.qa.ts
 */
import { FakeAdmin } from '@/lib/__qa__/_fake-admin'
import { withMutant } from '@/lib/reminders/__qa__/_mutant'
import { SUPPRESSION_TABLE, hashEmail } from '@/lib/email-suppression'
import { handleInboundReply, isOptOut, messageText, ownWords, senderAddress } from '../inbound'
import { authorized, handleInbound } from '../inbound-http'

let pass = 0
let fail = 0
function check(name: string, ok: boolean) {
  if (ok) { pass++; console.log(`  ok   ${name}`) } else { fail++; console.log(`  FAIL ${name}`) }
}

/* eslint-disable @typescript-eslint/no-explicit-any */
const asAdmin = (f: FakeAdmin) => f as any
const SECRET = 'webhook-secret-value'
const ENV = { OUTREACH_INBOUND_SECRET: SECRET }
const ADDR = 'owner@store.example'

/** The footer of our own message, which a reply quotes back verbatim. */
const OUR_FOOTER = `
On Mon, Oct 12, 2026 at 9:02 AM Oren <oren@trygotopseo.com> wrote:
> Would it be useful if I sent you the full free report? If it is not
> relevant, reply "no" and I will not write again.
> This is an advertisement sent by GO TOP MARKETING GRUO LTD, which operates
> Go Top SEO. If you would rather not hear from us again, unsubscribe here.`

const emptyList = () => new FakeAdmin({ [SUPPRESSION_TABLE]: [] })
const rows = (f: FakeAdmin) => f.tables[SUPPRESSION_TABLE] as Record<string, unknown>[]
const post = (body: unknown, token: string | null = SECRET) =>
  new Request('https://app.example/api/outreach/inbound', {
    method: 'POST',
    headers: token === null ? {} : { authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  })
const delivery = (from: string, text: string, subject = 're: your organic traffic') =>
  ({ event: 'message.received', data: { from: { address: from, name: 'Owner' }, subject, text } })

async function main() {
  console.log('\noutreach inbound — keeping the promise we made in writing')

  // ── Quoted text is not the person's words ──────────────────────────────────
  check('Q1: a quoted original is removed before anything is matched',
    ownWords(`Yes please, send it over.${OUR_FOOTER}`) === 'Yes please, send it over.')
  check('Q2: an interested reply is NOT an opt-out, though our footer says "unsubscribe"',
    !isOptOut(`Yes please, send it over.${OUR_FOOTER}`))
  check('Q3: nor is an interested reply with a signature block',
    !isOptOut(`Sure, interested.\nSent from my iPhone${OUR_FOOTER}`))
  check('Q4: "-----Original Message-----" is a quote marker too',
    !isOptOut('Sounds good.\n-----Original Message-----\nunsubscribe here'))

  // ── A refusal is a refusal ─────────────────────────────────────────────────
  check('O1: a bare "no" is a refusal, because that is the word we asked for',
    isOptOut('no') && isOptOut('No.') && isOptOut('NO'))
  check('O2: a bare "stop" or "unsubscribe" is a refusal',
    isOptOut('stop') && isOptOut('unsubscribe') && isOptOut('Remove'))
  check('O3: a refusal in a sentence is a refusal',
    isOptOut('Please remove me from your list, thanks.')
    && isOptOut('Not interested, but good luck.')
    && isOptOut('do not email me again'))
  check('O4: a refusal still counts with our footer quoted underneath',
    isOptOut(`No thanks.${OUR_FOOTER}`))
  check('O5: a refusal in the subject counts',
    isOptOut('(see subject)', 'unsubscribe'))
  check('O6: an ordinary interested reply is left alone',
    !isOptOut('Thanks — can you send the report for our shop? We are rebuilding in November.'))
  check('O7: a question is left alone',
    !isOptOut('What does this cost?'))

  // ── Reading the delivery ───────────────────────────────────────────────────
  check('S1: the sender is read from a nested address object',
    senderAddress(delivery(ADDR, 'no')) === ADDR)
  check('S2: the sender is read from a plain "From" header string',
    senderAddress({ from: `Owner <${ADDR}>` }) === ADDR)
  check('S3: the sender is read from an array of addresses',
    senderAddress({ message: { from: [{ email: ADDR }] } }) === ADDR)
  check('S4: the sender is normalized',
    senderAddress({ from: '  OWNER@Store.EXAMPLE ' }) === ADDR)
  check('S5: a payload with no address at all yields nothing, never a guess',
    senderAddress({ data: { subject: 'hello', text: 'no' } }) === null
    && senderAddress(null) === null && senderAddress('from: someone') === null)
  check('S6: the subject and body are both found',
    messageText(delivery(ADDR, 'no', 'go away')).subject === 'go away'
    && messageText(delivery(ADDR, 'no')).body === 'no')

  // ── The decision ───────────────────────────────────────────────────────────
  const listA = emptyList()
  check('D1: a refusal puts the address on the list',
    (await handleInboundReply(delivery(ADDR, 'No thanks.'), asAdmin(listA))).action === 'suppressed'
    && rows(listA).length === 1 && rows(listA)[0].email_hash === hashEmail(ADDR))
  check('D2: the row says it came from a reply, on the prospecting channel',
    rows(listA)[0].source === 'reply_optout' && rows(listA)[0].channel === 'outbound_prospect')

  const listB = emptyList()
  check('D3: an interested reply records nothing and is left for a human',
    (await handleInboundReply(delivery(ADDR, `Yes please!${OUR_FOOTER}`), asAdmin(listB))).action === 'left_for_a_human'
    && rows(listB).length === 0)
  check('D4: a delivery with no sender records nothing',
    (await handleInboundReply({ data: { text: 'no' } }, asAdmin(listB))).action === 'no_sender'
    && rows(listB).length === 0)

  const failing = () => new FakeAdmin({ [SUPPRESSION_TABLE]: [] }, { [SUPPRESSION_TABLE]: { upsert: () => ({ code: 'PGRST500' }) } })
  check('D5: an opt-out we could not record is a failure, never a silent success',
    (await handleInboundReply(delivery(ADDR, 'no'), asAdmin(failing()))).action === 'failed')

  // ── The endpoint ───────────────────────────────────────────────────────────
  check('A1: no secret configured authorizes nobody',
    !authorized(post({}), {}) && !authorized(post({}, 'anything'), {}))
  check('A2: the wrong secret is refused', !authorized(post({}, 'wrong-secret-value'), ENV))
  check('A3: a missing header is refused', !authorized(post({}, null), ENV))
  check('A4: the configured secret is accepted', authorized(post({}), ENV))

  const listC = emptyList()
  check('E1: an authorized refusal answers 200 and the address is listed',
    (await handleInbound(post(delivery(ADDR, 'no')), { admin: () => asAdmin(listC), env: ENV })).status === 200
    && rows(listC).length === 1)
  const listD = emptyList()
  check('E2: an unauthorized delivery answers 401 and changes nothing',
    (await handleInbound(post(delivery(ADDR, 'no'), 'wrong-secret-value'), { admin: () => asAdmin(listD), env: ENV })).status === 401
    && rows(listD).length === 0)
  check('E3: with no secret configured every delivery is refused',
    (await handleInbound(post(delivery(ADDR, 'no')), { admin: () => asAdmin(listD), env: {} })).status === 401
    && rows(listD).length === 0)
  const okRes = await handleInbound(post(delivery(ADDR, 'Yes please')), { admin: () => asAdmin(listD), env: ENV })
  check('E4: the answer says nothing about the message, so it cannot be used to probe',
    okRes.status === 200 && JSON.stringify(await okRes.json()) === JSON.stringify({ ok: true }))
  check('E5: an opt-out we could not record answers 503, so the provider delivers it again',
    (await handleInbound(post(delivery(ADDR, 'no')), { admin: () => asAdmin(failing()), env: ENV })).status === 503)
  check('E6: a body that is not JSON answers 400',
    (await handleInbound(new Request('https://app.example/api/outreach/inbound', {
      method: 'POST', headers: { authorization: `Bearer ${SECRET}` }, body: 'not json',
    }), { admin: () => asAdmin(listD), env: ENV })).status === 400)

  // ── Mutation controls ──────────────────────────────────────────────────────
  const mutQuote = await withMutant<{ isOptOut: typeof isOptOut }, boolean>(
    'lib/outreach/inbound.ts',
    [[/  const words = ownWords\(body\)/, '  const words = body']],
    (m) => m.isOptOut(`Yes please, send it over.${OUR_FOOTER}`),
  )
  check('Q2-MUT: matching the raw body would suppress everyone who said yes', mutQuote)

  const mutShortNo = await withMutant<{ isOptOut: typeof isOptOut }, boolean>(
    'lib/outreach/inbound.ts',
    [[/  if \(SHORT_NO\.test\(words\)\) return true/, '']],
    (m) => !m.isOptOut('no'),
  )
  check('O1-MUT: dropping the short-refusal rule would miss the exact word we asked for', mutShortNo)

  const mutGuess = await withMutant<{ senderAddress: typeof senderAddress }, boolean>(
    'lib/outreach/inbound.ts',
    [[/    for \(const key of \['from', 'sender', 'replyTo', 'reply_to', 'envelopeFrom', 'envelope_from'\]\) \{/,
      "    for (const key of ['to', 'from', 'sender', 'replyTo', 'reply_to', 'envelopeFrom', 'envelope_from']) {"]],
    (m) => m.senderAddress({ data: { to: { address: 'oren@trygotopseo.com' }, from: { address: ADDR }, text: 'no' } }) === 'oren@trygotopseo.com',
  )
  check('S5-MUT: reading the recipient as the sender would suppress our own address', mutGuess)

  const mutFail = await withMutant<{ handleInboundReply: typeof handleInboundReply }, boolean>(
    'lib/outreach/inbound.ts',
    [[/    return result\.status === 'ok' \? \{ action: 'suppressed' \} : \{ action: 'failed' \}/, "    return { action: 'suppressed' }"]],
    async (m) => (await m.handleInboundReply(delivery(ADDR, 'no'), asAdmin(failing()))).action === 'suppressed',
  )
  check('D5-MUT: treating a failed write as done would drop an opt-out silently', mutFail)

  const mutAuth = await withMutant<{ authorized: typeof authorized }, boolean>(
    'lib/outreach/inbound-http.ts',
    [[/  const expected = env\.OUTREACH_INBOUND_SECRET\n  if \(!expected\) return false/, '  const expected = env.OUTREACH_INBOUND_SECRET\n  if (!expected) return true']],
    (m) => m.authorized(post({}, null), {}),
  )
  check('A1-MUT: an endpoint that opened up when unconfigured would be caught', mutAuth)

  console.log(`\n${pass} passed, ${fail} failed`)
  if (fail > 0) process.exit(1)
}
main().catch((e) => { console.error(e); process.exit(1) })
export {}
