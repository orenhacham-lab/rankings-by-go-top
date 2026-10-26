/**
 * The channel's brakes: bounces, complaints, and the stop rules they feed.
 *
 * THE TWO FAILURES THIS SUITE EXISTS FOR, and they pull in opposite directions:
 *
 *   1. A failure we caused goes uncounted, so the channel keeps sending into a
 *      domain that is already rejecting it and the sending domain burns. That is
 *      the expensive one, and it is why an unreadable report counts as hard.
 *   2. A failure somebody ELSE caused is counted as ours and stops the channel.
 *      This is not hypothetical: on 13 Oct 2026 a MAILER-DAEMON message arrived
 *      about sales@db-toolco.com which had in fact been delivered — their own
 *      mailbox forwards to Gmail and that hop was refused. B7/I2/I5 are that
 *      case, and I2-MUT is the proof they can fail.
 *
 * And one that is quieter than both: a person's reply read as a bounce, or a
 * bounce read as a person asking to be removed. A bounce body quotes our own
 * message, footer included, and that footer contains the word "unsubscribe".
 * I6 and I6-MUT are that.
 *
 * Run: npx tsx lib/outreach/__qa__/outreach-bounce.qa.ts
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { FakeAdmin } from '@/lib/__qa__/_fake-admin'
import { withMutant } from '@/lib/reminders/__qa__/_mutant'
import { SUPPRESSION_TABLE, hashEmail } from '@/lib/email-suppression'
import {
  BOUNCE_RATE_WINDOW,
  DELIVERY_EVENTS_TABLE,
  channelStop,
  classifyDelivery,
  readStopState,
  recipientIn,
  recordDeliveryReport,
} from '../bounce'
import { handleInboundReply } from '../inbound'
import { dailyQuota } from '../schedule'
import { PROSPECTS_TABLE } from '../prospects'
import { sendNextProspect } from '../send'
import type { MessageSender } from '../smtp'

let pass = 0
let fail = 0
function check(name: string, ok: boolean) {
  if (ok) { pass++; console.log(`  ok   ${name}`) } else { fail++; console.log(`  FAIL ${name}`) }
}

/* eslint-disable @typescript-eslint/no-explicit-any */
const asAdmin = (f: FakeAdmin) => f as any

const NOW = new Date('2026-10-16T14:30:00Z')
const PROSPECT = 'owner@store.example'
const STRANGER = 'sales@forwarded.example'

/** The footer of our own message, which every bounce body quotes back. */
const FOOTER = `This is an advertisement sent by Go Top SEO at HaRechasim 24/2, Ramat Gan 5235524, Israel. If you would rather not
hear from us again, unsubscribe here:
https://www.gotopseo.com/api/outreach/unsubscribe?u=aaaa
- we act on it immediately. How we handle your details:
https://www.gotopseo.com/en/privacy`

/**
 * A real bounce, in the shape Postfix sends one: the daemon, the human
 * paragraph, the machine-readable part, and the original message quoted whole.
 */
const bounceBody = (recipient: string, status = '5.1.1', diagnostic = '550 5.1.1 <user> User unknown') => `This is the mail system at host smtp.hostinger.com.

I'm sorry to have to inform you that your message could not
be delivered to one or more recipients.

Reporting-MTA: dns; smtp.hostinger.com

Final-Recipient: rfc822; ${recipient}
Original-Recipient: rfc822;${recipient}
Action: failed
Status: ${status}
Diagnostic-Code: smtp; ${diagnostic}

Content-Type: message/rfc822

From: Oren Hacham <oren@trygotopseo.com>
To: ${recipient}
Subject: a question about Store Example's organic traffic

Hello,

I run Go Top SEO, a tool that writes and publishes SEO content.

${FOOTER}
`

const delivery = (sender: string, subject: string, body: string) =>
  ({ from: sender, subject, text: body })

const prospectRow = (overrides: Record<string, unknown> = {}) => ({
  id: 'p1',
  email: PROSPECT,
  email_hash: hashEmail(PROSPECT),
  company: 'Store Example LLC',
  contact_name: null,
  site_host: 'store.example',
  platform: 'shopify',
  unsub_token: 'a'.repeat(48),
  status: 'sent_first',
  finding: 'your sitemap lists a single article',
  finding_checked: '2026-10-16T13:00:00Z',
  first_sent_at: '2026-10-16T13:00:00Z',
  second_sent_at: null,
  replied_at: null,
  note: 'auto wave',
  created_at: '2026-10-13T09:00:00Z',
  updated_at: '2026-10-16T13:00:00Z',
  ...overrides,
})

const world = (
  prospects: Record<string, unknown>[] = [prospectRow()],
  events: Record<string, unknown>[] = [],
  hooks: Record<string, any> = {},
) => new FakeAdmin({
  [PROSPECTS_TABLE]: prospects,
  [DELIVERY_EVENTS_TABLE]: events,
  [SUPPRESSION_TABLE]: [],
}, hooks)

const event = (overrides: Record<string, unknown> = {}) => ({
  id: `e${Math.random()}`,
  email_hash: hashEmail(PROSPECT),
  kind: 'hard_bounce',
  attributed: true,
  detail: 'dsn 5.1.1',
  occurred_at: '2026-10-16T13:30:00Z',
  cleared_at: null,
  ...overrides,
})

async function main() {
  console.log('\n— B: what an inbound message is —')

  // The common case, and the one that must never be read as a bounce: a person.
  check('B1: a person\'s reply is not a delivery report',
    classifyDelivery({ sender: PROSPECT, subject: 're: a question', body: 'Sure, send it over. Thanks!' }) === null)
  check('B2: a reply that quotes our whole footer is still not a delivery report',
    classifyDelivery({ sender: PROSPECT, subject: 're: a question', body: `Yes please.\n\n${FOOTER}` }) === null)

  const hard = classifyDelivery({
    sender: 'MAILER-DAEMON@smtp.hostinger.com',
    subject: 'Undelivered Mail Returned to Sender',
    body: bounceBody(PROSPECT),
  })
  check('B3: a 5.x.x delivery status is a hard bounce, with the code recorded',
    hard?.kind === 'hard_bounce' && hard.detail === 'dsn 5.1.1')
  check('B4: the bounce names the recipient it is about, not us',
    hard?.recipient === PROSPECT)

  const soft = classifyDelivery({
    sender: 'MAILER-DAEMON@smtp.hostinger.com',
    subject: 'Delivery Status Notification (Delay)',
    body: bounceBody(PROSPECT, '4.2.2', '452 4.2.2 Mailbox full'),
  })
  check('B5: a 4.x.x status is a soft bounce', soft?.kind === 'soft_bounce' && soft.detail === 'dsn 4.2.2')

  // A 2.x.x report is the mail system saying it worked out. Counting it would
  // stop the channel on its own successes.
  check('B6: a 2.x.x report is not a failure at all',
    classifyDelivery({
      sender: 'MAILER-DAEMON@smtp.hostinger.com',
      subject: 'Delivery Status Notification (Relayed)',
      body: bounceBody(PROSPECT, '2.6.0', '250 2.6.0 relayed'),
    }) === null)

  // THE DB-TOOLCO SHAPE: a daemon report about an address we never wrote to.
  // It is still classified as a bounce here; whether it is OURS is decided
  // later, against the list. B7 only fixes what the classifier may assume.
  const stranger = classifyDelivery({
    sender: 'MAILER-DAEMON@carrierzone.example',
    subject: 'Mail delivery failed: returning message to sender',
    body: bounceBody(STRANGER),
  })
  check('B7: a report about an address we never wrote to is read, not judged',
    stranger?.kind === 'hard_bounce' && stranger.recipient === STRANGER)

  const complaint = classifyDelivery({
    sender: 'complaints@feedback.example',
    subject: 'Abuse report',
    body: 'Content-Type: message/feedback-report\n\nFeedback-Type: abuse\nUser-Agent: SomeFBL/1.0\nOriginal-Rcpt-To: ' + PROSPECT,
  })
  check('B8: a feedback report is a complaint', complaint?.kind === 'complaint')
  check('B8b: and a complaint names the recipient where the report does',
    complaint?.recipient === PROSPECT)

  // An unreadable report. The plan's own words: better to stop early than burn.
  const vague = classifyDelivery({
    sender: 'postmaster@mail.example',
    subject: 'Failure notice',
    body: 'Sorry, we were unable to deliver your message to the following address.',
  })
  check('B9: a report with no code at all counts as permanent, not as nothing',
    vague?.kind === 'hard_bounce' && vague.detail === 'unreadable report')

  check('B10: a report that arrives only by subject, from no daemon, is still read',
    classifyDelivery({ sender: 'bounces-x@mail.example', subject: 'Undeliverable: a question', body: bounceBody(PROSPECT) })?.kind === 'hard_bounce')

  check('B11: X-Failed-Recipients is read when there is no DSN block',
    recipientIn(`X-Failed-Recipients: ${PROSPECT}\n\n550 no such user`) === PROSPECT)
  // Our own address is in every bounce body, as the sender being reported to.
  check('B12: our own address is never read as the failed recipient',
    recipientIn('Final-Recipient: rfc822; oren@trygotopseo.com\nStatus: 5.1.1') === null)

  // THE TWO REPORTS THIS CHANNEL REALLY RECEIVED, 19 and 21 Oct 2026. Both were
  // real bounces on addresses we chose; both were recorded as not ours because
  // the headers sat in an attachment the webhook does not hand us.
  const postfixReport = [
    'This is the mail system at host relay.mailchannels.net.',
    '',
    `<${PROSPECT}>: host example-com.mail.protection.outlook.com[52.101.8.35] said: 550 5.4.1`,
    '    Recipient address rejected: Access denied. (in reply to RCPT TO command)',
  ].join('\n')
  check('B13: a Postfix transcript line names the recipient',
    recipientIn(postfixReport) === PROSPECT)

  const office365Report = [
    `Your message to ${PROSPECT} couldn't be delivered.`,
    'Security or policy settings at example.com have rejected your message.',
    'Status code: 550 5.7.1',
  ].join('\n')
  check('B14: an Office 365 report names the recipient in prose',
    recipientIn(office365Report) === PROSPECT)

  // A bounce body quotes the original message whole, our own footer included.
  check('B15: an address that is merely quoted in the body is not the recipient',
    recipientIn(`550 rejected\n\n--- original message ---\nTo: ${PROSPECT}\nHello,`) === null)

  console.log('\n— S: the plan\'s stop rules —')

  const counts = (o: Partial<Parameters<typeof channelStop>[0]>) => channelStop({
    complaints: 0, hardBouncesInWindow: 0, sendsInWindow: 50, hardBouncesToday: 0, ...o,
  })

  check('S1: one spam complaint is a full stop', counts({ complaints: 1 }).stopped === true)
  const rate = counts({ hardBouncesInWindow: 2 })
  check('S2: two bounces in fifty sends is 4% and stops the channel',
    rate.stopped === true && rate.reason === 'bounce_rate')
  check('S3: one bounce in fifty sends is 2% and does not',
    counts({ hardBouncesInWindow: 1 }).stopped === false)
  // The one departure from the plan's literal wording, and the reason for it:
  // read literally, a single mistyped address among seven sends is 14% and
  // stops the whole channel until a human clears it.
  check('S4: a single bounce early in the channel\'s life does not stop it',
    counts({ hardBouncesInWindow: 1, sendsInWindow: 7 }).stopped === false)
  check('S5: two bounces early in its life do',
    counts({ hardBouncesInWindow: 2, sendsInWindow: 7 }).stopped === true)
  const today = counts({ hardBouncesToday: 2, sendsInWindow: 200 })
  check('S6: two hard bounces in one day stop the day on their own',
    today.stopped === true && today.reason === 'hard_bounces_today')
  check('S7: a clean channel is not stopped', counts({}).stopped === false)
  // The window is the plan's own number and the sender reads 50 sends to find it.
  check('S8: the window is the last fifty sends', BOUNCE_RATE_WINDOW === 50)

  console.log('\n— I: the whole path, against the list —')

  let f = world()
  let outcome = await handleInboundReply(
    delivery('MAILER-DAEMON@smtp.hostinger.com', 'Undelivered Mail Returned to Sender', bounceBody(PROSPECT)),
    asAdmin(f), NOW,
  )
  let events = f.tables[DELIVERY_EVENTS_TABLE]
  check('I1: a bounce about a business we wrote to is recorded as ours',
    outcome.action === 'delivery_report' && events.length === 1
    && events[0].attributed === true && events[0].kind === 'hard_bounce')
  check('I1b: and that address is parked, so the follow-up never goes to it',
    f.tables[PROSPECTS_TABLE][0].status === 'disqualified' && f.tables[PROSPECTS_TABLE][0].note === 'hard bounce')
  // A PERMANENT FAILURE ALSO CLOSES THE ADDRESS, product-wide. Parking the row
  // stops this channel's follow-up; the suppression list stops every sender,
  // which is what a dead or closed address warrants. It is recorded as a bounce
  // and not as an opt-out, because nobody asked us for anything.
  check('I1c: and the address itself goes on the suppression list as a bounce',
    f.tables[SUPPRESSION_TABLE].length === 1
    && f.tables[SUPPRESSION_TABLE][0].source === 'hard_bounce'
    && f.tables[SUPPRESSION_TABLE][0].email === PROSPECT)

  // THE DB-TOOLCO CASE, end to end.
  f = world()
  outcome = await handleInboundReply(
    delivery('MAILER-DAEMON@carrierzone.example', 'Mail delivery failed', bounceBody(STRANGER)),
    asAdmin(f), NOW,
  )
  events = f.tables[DELIVERY_EVENTS_TABLE]
  check('I2: a bounce about somebody else\'s mail is recorded as not ours',
    outcome.action === 'delivery_report' && events.length === 1 && events[0].attributed === false
    && String(events[0].detail).includes('unmatched recipient'))
  check('I2b: and it leaves our own prospect alone',
    f.tables[PROSPECTS_TABLE][0].status === 'sent_first')
  check('I2c: and suppresses nothing, because the address is not ours to close',
    f.tables[SUPPRESSION_TABLE].length === 0)

  // Two of ours: the channel stops itself.
  f = world([prospectRow()], [event(), event({ id: 'e2', occurred_at: '2026-10-16T13:45:00Z' })])
  let state = await readStopState(asAdmin(f), NOW)
  check('I3: two of our own bounces stop the channel',
    state.readable && state.verdict.stopped === true)

  const sender = async (): Promise<ReturnType<MessageSender>> => {
    throw new Error('the sender must not be reached while the channel is stopped')
  }
  const result = await sendNextProspect(asAdmin(f), {
    now: new Date('2026-10-19T13:30:00Z'), // a Monday inside the window
    fetchPage: async () => { throw new Error('no page should be fetched') },
    send: sender as unknown as MessageSender,
  })
  check('I3b: and the sender refuses, saying why',
    result.status === 'idle' && result.reason === 'stopped_on_delivery')

  // A human looked: cleared events stop counting.
  f = world([prospectRow()], [
    event({ cleared_at: '2026-10-16T14:00:00Z' }),
    event({ id: 'e2', cleared_at: '2026-10-16T14:00:00Z' }),
  ])
  state = await readStopState(asAdmin(f), NOW)
  check('I4: events a human has cleared no longer stop the channel',
    state.readable && state.verdict.stopped === false)

  // THE ONE THAT MATTERS: unattributed bounces never stop anything.
  f = world([prospectRow()], [
    event({ attributed: false, email_hash: hashEmail(STRANGER) }),
    event({ id: 'e2', attributed: false, email_hash: hashEmail(STRANGER) }),
    event({ id: 'e3', attributed: false, email_hash: hashEmail(STRANGER) }),
  ])
  state = await readStopState(asAdmin(f), NOW)
  check('I5: bounces that were never ours do not stop the channel',
    state.readable && state.verdict.stopped === false && state.counts.hardBouncesInWindow === 0)

  // A complaint is the exception: it reaches the mailbox that sent the message
  // complained about, so it is ours whether or not we can match an address.
  f = world([prospectRow()], [event({ kind: 'complaint', attributed: false, email_hash: null })])
  state = await readStopState(asAdmin(f), NOW)
  check('I5b: a complaint we could not attribute still stops the channel',
    state.readable && state.verdict.stopped === true
    && state.verdict.stopped === true && state.verdict.reason === 'complaint')

  // A lost bounce is a brake that silently did not engage, so the provider is
  // asked to deliver it again rather than told everything is fine.
  f = world([prospectRow()], [], { [DELIVERY_EVENTS_TABLE]: { insert: () => ({ code: 'PGRST500' }) } })
  outcome = await handleInboundReply(
    delivery('MAILER-DAEMON@smtp.hostinger.com', 'Undelivered Mail', bounceBody(PROSPECT)),
    asAdmin(f), NOW,
  )
  check('I6: a bounce we could not write down is a failure the provider retries',
    outcome.action === 'failed')

  // And a stop state we cannot read is not a clean one.
  f = world([prospectRow()], [], { [DELIVERY_EVENTS_TABLE]: { select: () => ({ code: 'PGRST500' }) } })
  state = await readStopState(asAdmin(f), NOW)
  check('I7: a stop state we could not read reports itself unreadable',
    state.readable === false)
  const refused = await sendNextProspect(asAdmin(f), {
    now: new Date('2026-10-19T13:30:00Z'),
    fetchPage: async () => { throw new Error('no page should be fetched') },
    send: sender as unknown as MessageSender,
  })
  check('I7b: and the sender sends nothing on it',
    refused.status === 'idle' && refused.reason === 'read_failed')

  console.log('\n— mutation controls —')

  // If every report were attributed, the db-toolco message would have counted
  // as ours and two of them would have stopped the channel over someone else's
  // broken forwarder.
  const mutAttribute = await withMutant<{ recordDeliveryReport: typeof recordDeliveryReport }, boolean>(
    'lib/outreach/bounce.ts',
    [[/    attributed = match === true/, '    attributed = true']],
    async (m) => {
      const broken = world()
      await m.recordDeliveryReport(asAdmin(broken), { kind: 'hard_bounce', detail: 'dsn 5.1.1', recipient: STRANGER }, NOW)
      return broken.tables[DELIVERY_EVENTS_TABLE][0]?.attributed === true
    },
  )
  check('I2-MUT: with attribution forced true, a stranger\'s bounce becomes ours',
    mutAttribute === true)

  // CLASSIFY-FIRST, and the reason is not the one it looks like. Some servers
  // reject with words rather than only a code: "this recipient does not accept
  // mail from you, do not contact this address again" is a real shape, and
  // "do not contact" is one of the refusal phrases the opt-out matcher looks
  // for. Read in the other order, that bounce is filed as the business asking
  // to be removed, the address put on the suppression list is the MAIL SYSTEM'S
  // own, and the bounce itself is never counted — so the brake that exists to
  // protect the sending domain never engages at all.
  const wordyBounce = `This is the mail system at host smtp.hostinger.com.

Your message could not be delivered.

Final-Recipient: rfc822; ${PROSPECT}
Action: failed
Status: 5.7.1
Diagnostic-Code: smtp; 550 5.7.1 This recipient does not accept mail from this
 sender. Do not contact this address again.

From: Oren Hacham <oren@trygotopseo.com>
Subject: a question about Store Example's organic traffic
`
  f = world()
  outcome = await handleInboundReply(
    delivery('MAILER-DAEMON@smtp.hostinger.com', 'Undelivered Mail Returned to Sender', wordyBounce),
    asAdmin(f), NOW,
  )
  check('I8: a bounce whose text reads like a refusal is still counted as a bounce',
    outcome.action === 'delivery_report' && f.tables[DELIVERY_EVENTS_TABLE].length === 1
    && f.tables[DELIVERY_EVENTS_TABLE][0].attributed === true)
  // The address closed is the business's, which the report names. The mail
  // system's own address is the sender of the report and never its subject.
  check('I8b: and the address closed is the business\'s, never the mail system\'s',
    f.tables[SUPPRESSION_TABLE].length === 1
    && f.tables[SUPPRESSION_TABLE][0].email === PROSPECT)

  const mutOrder = await withMutant<{ handleInboundReply: typeof handleInboundReply }, boolean>(
    'lib/outreach/inbound.ts',
    [[/  const report = classifyDelivery\(\{ sender: email, subject, body \}\)/,
      '  const report: ReturnType<typeof classifyDelivery> = null']],
    async (m) => {
      const broken = world()
      const r = await m.handleInboundReply(
        delivery('MAILER-DAEMON@smtp.hostinger.com', 'Undelivered Mail Returned to Sender', wordyBounce),
        asAdmin(broken), NOW,
      )
      // The harm is both halves: an opt-out recorded against the mail system,
      // and no bounce counted anywhere.
      return r.action === 'suppressed'
        && broken.tables[DELIVERY_EVENTS_TABLE].length === 0
        && broken.tables[SUPPRESSION_TABLE].length === 1
    },
  )
  check('I8-MUT: read in the other order, the bounce is lost and the daemon is suppressed',
    mutOrder === true)

  // THE RAMP'S HOLD. The brakes have two different jobs: stopping the channel
  // (I3) and holding the ramp where it is (here). The hold is the one that runs
  // on a single bounce, so it is the one that will actually fire.
  check('R1: the ramp sits a step below the calendar while a bounce of ours is uncleared',
    dailyQuota(NOW, new Date(NOW.getTime() - 7 * 24 * 60 * 60 * 1000), true) === 10)
  const mutHold = await withMutant<{ dailyQuota: typeof dailyQuota }, boolean>(
    'lib/outreach/schedule.ts',
    [[/  return RAMP\[hold \? Math\.max\(0, index - 1\) : index\]/, '  return RAMP[index]']],
    (m) => m.dailyQuota(NOW, new Date(NOW.getTime() - 7 * 24 * 60 * 60 * 1000), true) === 20,
  )
  check('R1-MUT: a ramp that ignored the hold would climb through its own bounces',
    mutHold === true)
  // And the sender is what connects the two: a hold nobody passes is a hold
  // that does nothing. The source is the guard, because the behavioural pair
  // needs a day's worth of sent rows to show a difference of one step.
  const sendSource = readFileSync(join(__dirname, '..', 'send.ts'), 'utf8')
  check('R2: the sender derives the ramp from the bounces it just read',
    /dailyQuota\(now, channelStart, stop\.counts\.hardBouncesInWindow > 0\)/.test(sendSource))

  const mutSeverity = await withMutant<{ classifyDelivery: typeof classifyDelivery }, boolean>(
    'lib/outreach/bounce.ts',
    [[/  const kind: DeliveryKind = permanent \|\| !temporary \? 'hard_bounce' : 'soft_bounce'/,
      "  const kind: DeliveryKind = 'soft_bounce'"]],
    (m) => m.classifyDelivery({
      sender: 'postmaster@mail.example', subject: 'Failure notice',
      body: 'Sorry, we were unable to deliver your message.',
    })?.kind === 'soft_bounce',
  )
  check('B9-MUT: reading an unreadable report as temporary would hide a real bounce',
    mutSeverity === true)

  const mutComplaint = await withMutant<{ channelStop: typeof channelStop }, boolean>(
    'lib/outreach/bounce.ts',
    [[/  if \(counts\.complaints > 0\) \{/, '  if (false) {']],
    (m) => m.channelStop({ complaints: 3, hardBouncesInWindow: 0, sendsInWindow: 50, hardBouncesToday: 0 }).stopped === false,
  )
  check('S1-MUT: dropping the complaint rule would let three complaints pass',
    mutComplaint === true)

  const mutProse = await withMutant<{ recipientIn: typeof recipientIn }, boolean>(
    'lib/outreach/bounce.ts',
    [[/  for \(const re of PROSE_RECIPIENT\) \{/, '  for (const re of []) {']],
    (m) => m.recipientIn(postfixReport) === null && m.recipientIn(office365Report) === null,
  )
  check('B13-MUT: without the prose patterns both real bounces go unattributed',
    mutProse === true)

  const mutClose = await withMutant<{ handleInboundReply: typeof handleInboundReply }, boolean>(
    'lib/outreach/inbound.ts',
    [[/      if \(report\.recipient !== null\) \{/, '      if (false) {']],
    async (m) => {
      const open = world()
      await m.handleInboundReply(
        delivery('MAILER-DAEMON@smtp.hostinger.com', 'Undelivered Mail Returned to Sender', bounceBody(PROSPECT)),
        asAdmin(open), NOW,
      )
      return open.tables[SUPPRESSION_TABLE].length === 0
    },
  )
  check('I1c-MUT: without that step a dead address stays open to every sender',
    mutClose === true)

  console.log(`\n${pass} passed, ${fail} failed`)
  if (fail > 0) process.exit(1)
}
main().catch((e) => { console.error(e); process.exit(1) })
export {}
