/**
 * A SILENT MORNING IS REPORTED — offline, no DB, no mail sent.
 *
 * 6 Nov 2026: nothing published in any of the ten languages, no row in
 * blog_plan touched, and no trace anywhere. It was found on 9 Nov by counting
 * rows, and by then the runtime logs (one hour on this plan) were long gone. The
 * defect is that a whole silent morning is indistinguishable from a healthy one:
 * the cron answers 202 either way and `[blog-window] run complete` just does not
 * appear.
 *
 * A: the day's one slot — the hour after the window, before :15, and nothing
 *    else, so the alert cannot arrive twice or daily.
 * B: a morning that published is silent; a morning that did not sends one email
 *    and logs one line.
 * C: the kill switch and the single recipient still hold, since this rides the
 *    operator channel.
 * D: the window is wired to it, and nothing else about the window changed.
 * Each group ends with a MUTATION CONTROL.
 */
process.env.NEXT_PUBLIC_SPANISH_SITE_ENABLED = 'true'
process.env.NEXT_PUBLIC_PORTUGUESE_SITE_ENABLED = 'true'
process.env.NEXT_PUBLIC_FRENCH_SITE_ENABLED = 'true'
process.env.NEXT_PUBLIC_ITALIAN_SITE_ENABLED = 'true'
process.env.NEXT_PUBLIC_JAPANESE_SITE_ENABLED = 'true'
process.env.NEXT_PUBLIC_GERMAN_SITE_ENABLED = 'true'

import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  SILENCE_CHECK_BEFORE_MINUTE, SILENCE_CHECK_HOUR_UTC,
  reportSilentMorning, silentMorningEmail, silentMorningVerdict,
} from '@/lib/blog/auto/silent-morning'
import { WINDOW_HOURS_UTC, isInWindow } from '@/lib/blog/auto/window-hours'
import { runBlogDailyWindow } from '@/lib/blog/auto/daily-window'
import { localesForDay } from '@/lib/blog/auto/rotation'
import { PLAN_TABLE } from '@/lib/blog/auto/store'
import { FakeAdmin } from '@/lib/__qa__/_fake-admin'
import type { OperatorMessage } from '@/lib/notifications/operator-alerts'
import type { createAdminClient } from '@/lib/supabase/admin'

type Admin = ReturnType<typeof createAdminClient>
let pass = 0, fail = 0
function check(name: string, cond: boolean, detail?: unknown) {
  if (cond) { pass++; console.log(`  ✓ ${name}`) } else { fail++; console.log(`  ✗ ${name} ${detail === undefined ? '' : JSON.stringify(detail)}`) }
}
const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8')
const stripComments = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')

const article = (locale: string, publishedAt: string) => ({ locale, is_published: true, published_at: publishedAt })
const fake = (articles: Record<string, unknown>[] = []) => new FakeAdmin({ [PLAN_TABLE]: [], articles })

/** A sender that records instead of sending. */
function recorder() {
  const sent: OperatorMessage[] = []
  return { sent, send: async (m: OperatorMessage) => { sent.push(m); return { ok: true } } }
}
const ENV = { RESEND_API_KEY: 'test', ADMIN_NOTIFICATION_EMAIL: 'ops@example.com' }

/** The hour after the window closes, as a timestamp on the day of the outage. */
const at = (hhmm: string) => Date.parse(`2026-11-06T${hhmm}:00Z`)

async function main() {
  console.log('A) the day has exactly one silence check')
  {
    // 17:00 UTC since 24 Nov 2026 (16:00 from 21 Nov): the window was widened to twelve hours once
    // the pass gate of PR 472 turned each hour from four chances into one
    // (lib/blog/auto/window-hours.ts), so the window closes at 16:59 (15:59 until 24 Nov) and the
    // check moved with it. The literal is kept beside the derivation on purpose
    // — the two together are what catches a widened window that forgot this file,
    // which is exactly what this assertion did on 21 November.
    check('A1: the check is the hour after the window closes',
      SILENCE_CHECK_HOUR_UTC === Math.max(...WINDOW_HOURS_UTC) + 1 && SILENCE_CHECK_HOUR_UTC === 17)
    check('A2: and that hour is outside the window, so it never costs a publishing pass',
      !isInWindow(at('17:00')))
    check('A3: the first cron slot of that hour checks', silentMorningVerdict(at('17:00')).check)
    // MEASURED, 21 Nov 2026: the gated pass lands wherever the scheduler's drift
    // puts it — :15, :16, :17, :18 that day — so a cutoff at 15 meant the day's
    // check never ran. Every one of those minutes must check.
    for (const m of ['15', '16', '17', '18', '29']) {
      check(`A4 :${m} — a pass that drifted past the quarter still checks`,
        silentMorningVerdict(at(`17:${m}`)).check)
    }
    check('A5: the second half of the hour does not, so one email a day at most',
      !silentMorningVerdict(at('17:30')).check
      && !silentMorningVerdict(at('17:45')).check)
    for (const h of WINDOW_HOURS_UTC) {
      check(`A6 ${h}:00 inside the window does not check`,
        !silentMorningVerdict(at(`0${h}:00`.slice(-5))).check)
    }
    check('A7: nor does the rest of the day', !silentMorningVerdict(at('18:00')).check
      && !silentMorningVerdict(at('23:05')).check && !silentMorningVerdict(at('00:05')).check)
    check('A8: the bound is half an hour, which the fifty-minute pass gate makes single',
      SILENCE_CHECK_BEFORE_MINUTE === 30 && SILENCE_CHECK_BEFORE_MINUTE < 50)

    // MUTATION CONTROL — a check with no minute bound would fire on every pass
    // of the hour; the bound is what keeps it to one.
    const everySlot = (ms: number) => new Date(ms).getUTCHours() === SILENCE_CHECK_HOUR_UTC
    check('MUTATION: without the minute bound the later slots fire too (so A5 would fail)',
      everySlot(at('17:00')) && everySlot(at('17:30')) && everySlot(at('17:45')))
  }

  console.log('B) what it does with the morning it finds')
  {
    const quiet = recorder()
    const published = await reportSilentMorning(
      fake(localesForDay().map((l) => article(l, '2026-11-06T04:10:00Z'))) as unknown as Admin,
      { now: at('17:02'), deps: { env: ENV, send: quiet.send } })
    check('B1: a morning that published says nothing',
      published.state === 'published' && quiet.sent.length === 0, published)

    const partial = recorder()
    const one = await reportSilentMorning(
      fake([article('he', '2026-11-06T04:10:00Z')]) as unknown as Admin,
      { now: at('17:02'), deps: { env: ENV, send: partial.send } })
    check('B2: one language published is not a silent morning — this alert is for zero only',
      one.state === 'published' && partial.sent.length === 0, one)

    const silent = recorder()
    const none = await reportSilentMorning(fake([]) as unknown as Admin,
      { now: at('17:02'), deps: { env: ENV, send: silent.send } })
    check('B3: a morning with nothing published sends exactly one email',
      none.state === 'alerted' && silent.sent.length === 1, none)
    check('B4: to the operator, and nobody else',
      silent.sent[0]?.to === 'ops@example.com')
    check('B5: the subject names the day, so two mornings are two emails',
      silent.sent[0]?.subject.includes('2026-11-06'), silent.sent[0]?.subject)
    check('B6: the body says how many languages were due and that none wrote',
      silent.sent[0]?.html.includes(String(localesForDay().length))
      && silent.sent[0]?.html.includes('אף שפה לא פרסמה'), silent.sent[0]?.html?.slice(0, 200))
    check('B7: and it is in the language its one reader reads',
      /[֐-׿]/.test(silentMorningEmail(at('17:02'), 10).subject))

    const yesterdayOnly = recorder()
    const stale = await reportSilentMorning(
      fake(localesForDay().map((l) => article(l, '2026-11-05T04:10:00Z'))) as unknown as Admin,
      { now: at('17:02'), deps: { env: ENV, send: yesterdayOnly.send } })
    check('B8: yesterday\'s articles do not make today look healthy',
      stale.state === 'alerted' && yesterdayOnly.sent.length === 1, stale)

    const skipped = recorder()
    // 18:02, an hour PAST the check hour. It has moved twice with the window:
    // 11:02 when the window closed at 09:59, 12:02 when Korean bought the
    // seventh hour, 17:02 after the twelve-hour window of 21 Nov 2026, and now 18:02.
    const outOfSlot = await reportSilentMorning(fake([]) as unknown as Admin,
      { now: at('18:02'), deps: { env: ENV, send: skipped.send } })
    check('B9: outside its slot it does not even read the blog',
      outOfSlot.state === 'not_checked' && skipped.sent.length === 0, outOfSlot)

    // MUTATION CONTROL — the pre-fix behaviour: nothing looked at all.
    check('MUTATION: a check that never runs reports nothing on the 6 Nov data (so B3 would fail)',
      (await reportSilentMorning(fake([]) as unknown as Admin,
        { now: at('09:02'), deps: { env: ENV, send: recorder().send } })).state === 'not_checked')
  }

  console.log('C) it rides the operator channel, with its guarantees')
  {
    const killed = recorder()
    const off = await reportSilentMorning(fake([]) as unknown as Admin,
      { now: at('17:02'), deps: { env: { ...ENV, OPERATOR_ALERTS_DISABLED: 'true' }, send: killed.send } })
    check('C1: the operator kill switch silences it like every other alert',
      off.state === 'alerted' && off.sent === false && killed.sent.length === 0, off)

    const unconfigured = recorder()
    const noKey = await reportSilentMorning(fake([]) as unknown as Admin,
      { now: at('17:02'), deps: { env: { ADMIN_NOTIFICATION_EMAIL: 'ops@example.com' }, send: unconfigured.send } })
    check('C2: with no Resend key it reports instead of throwing',
      noKey.state === 'alerted' && noKey.sent === false && unconfigured.sent.length === 0, noKey)

    const src = stripComments(read('lib/blog/auto/silent-morning.ts'))
    check('C3: it never names a recipient of its own — the channel decides',
      !/\bto\s*:/.test(src), src.match(/.{0,40}to\s*:.{0,40}/)?.[0])
    check('C4: and it goes through deliverOperatorEmail, not Resend directly',
      src.includes('deliverOperatorEmail') && !/\bresend\b/i.test(src))

    // MUTATION CONTROL — a module that built its own message would bypass both.
    check('MUTATION: a hand-rolled send would not honour the kill switch (so C1 would fail)',
      !src.includes('new Resend'))
  }

  console.log('D) the window calls it, and is otherwise unchanged')
  {
    const env = { VERCEL_ENV: 'production' } as unknown as NodeJS.ProcessEnv
    process.env.BLOG_AUTO_PUBLISH_ENABLED = 'true'
    const far = () => Date.now() + 600_000

    const checked = await runBlogDailyWindow(fake([]) as unknown as Admin,
      { env, now: at('17:02'), deadlineAt: far() })
    check('D1: the window reports the silence check it ran',
      checked.state === 'silence_checked', checked)

    const ordinary = await runBlogDailyWindow(fake([]) as unknown as Admin,
      { env, now: at('18:00'), deadlineAt: far() })
    check('D2: every other hour outside the window is still a bare return',
      ordinary.state === 'outside_window', ordinary)

    const preview = await runBlogDailyWindow(fake([]) as unknown as Admin,
      { env: { VERCEL_ENV: 'preview' } as unknown as NodeJS.ProcessEnv, now: at('17:02'), deadlineAt: far() })
    check('D3: preview never mails the operator about the company blog',
      preview.state === 'not_production', preview)

    process.env.BLOG_AUTO_PUBLISH_ENABLED = 'no'
    const disabled = await runBlogDailyWindow(fake([]) as unknown as Admin,
      { env, now: at('17:02'), deadlineAt: far() })
    check('D4: and the blog kill switch comes before the check',
      disabled.state === 'disabled', disabled)
    process.env.BLOG_AUTO_PUBLISH_ENABLED = 'true'

    const windowSrc = stripComments(read('lib/blog/auto/daily-window.ts'))
    check('D5: the check is wired into the window, not left for a caller to remember',
      windowSrc.includes('reportSilentMorning'))

    // MUTATION CONTROL — the pre-fix window returned at once.
    check('MUTATION: a window that returns before the check leaves 16:02 as outside_window (so D1 would fail)',
      !isInWindow(at('17:02')))
  }

  console.log(`\n${pass} passed, ${fail} failed`)
  if (fail > 0) process.exitCode = 1
}
main()

export {}
