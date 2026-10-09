/**
 * The weekly summary email (lib/reports/weekly): the sender behind the switch the settings
 * screen has stored since the monthly report shipped.
 *
 *   A) the week: the window is the seven days ending at the send, the key is one per ISO
 *      week, and the send window is SUNDAY 09:00 Israel (summer and winter time)
 *   B) what is worth sending: an empty week sends nothing, a section that could not be read
 *      is absent rather than zero, and a flat Search Console week is not news
 *   C) the flag and the configuration: unset / "false" / "1" / "TRUE" read nothing
 *   D) the run: opt-in only, one email per project per week, two ticks never send twice, a
 *      refused send releases its claim, another email the same morning defers to next week,
 *      a database without the new columns is "not installed"
 *   E) the email: four languages, escaped, internal link only, a stored article URL can only
 *      be https, RFC 8058 headers, and only measured lines are printed
 *   F) the one-click link stops the weekly summary too
 *   G) the cron: the weekly step is last, isolated (throwing / hanging cannot reach the cron)
 *
 * Every guard runs against the real code and again against a deliberately broken copy.
 * Nothing here talks to Resend or Supabase.
 * Run: npx tsx lib/reports/weekly/__qa__/weekly-summary.qa.ts
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { FakeAdmin } from '@/lib/__qa__/_fake-admin'
import type { ServiceRoleClient } from '@/lib/supabase/admin'
import { getDashboardDictionary } from '@/lib/i18n/dashboard/getDashboardDictionary'
import { PUBLIC_LOCALES } from '@/lib/i18n/locales'
import { makeUnsubscribeToken } from '@/lib/reminders/token'
import { unsubscribeByToken } from '@/lib/reminders/http'
import { withMutant } from '@/lib/reminders/__qa__/_mutant'
import { aggregateWeek, type WeeklyInputs } from '../aggregate'
import { inWeeklyWindow, weekKeyOf, weekWindow } from '../period'
import { buildWeeklyEmail, safeLink } from '../email'
import { runWeeklySummaries, weeklyGate, type OutgoingWeekly, type WeeklyDeps } from '../run'
import { runIsolatedWeeklySummaries } from '../isolated'

let pass = 0
let fail = 0
function check(name: string, cond: boolean, detail?: unknown) {
  if (cond) { pass++; console.log(`  ✓ ${name}`) } else { fail++; console.log(`  ✗ ${name}${detail !== undefined ? ` — ${JSON.stringify(detail)}` : ''}`) }
}
const ROOT = join(__dirname, '..', '..', '..', '..')
const code = (rel: string) => readFileSync(join(ROOT, rel), 'utf8')
const strip = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/.*$/gm, '$1')

const OWNER = '11111111-1111-4111-8111-111111111111'
const STRANGER = '22222222-2222-4222-8222-222222222222'
const P1 = 'aaaaaaaa-0000-4000-8000-000000000001'
const SECRET = 'cron-secret-for-tests-only'
const H = 3_600_000
const D = 24 * H
// Sunday 11 Oct 2026, 09:10 in Israel (summer time, UTC+3) = 06:10 UTC.
const SUN_9 = new Date('2026-10-11T06:10:00.000Z')
const now = SUN_9
const before = (ms: number) => new Date(now.getTime() - ms).toISOString()

const fullEnv = {
  WEEKLY_SUMMARY_EMAIL_ENABLED: 'true',
  RESEND_API_KEY: 're_test',
  RESEND_FROM_EMAIL: 'Go Top <hello@mail.example.com>',
  CRON_SECRET: SECRET,
  NEXT_PUBLIC_APP_URL: 'https://app.example.com',
}

const inputs = (over: Partial<WeeklyInputs> = {}): WeeklyInputs =>
  ({ published: [], waiting: null, nextScheduled: null, rank: null, gsc: null, ...over })

async function main() {
  // ── A) the week ───────────────────────────────────────────────────────────
  console.log('\nA) The week')
  const win = weekWindow(now)
  check('A1: the window is the seven days ending at the send',
    win.end.getTime() === now.getTime() && now.getTime() - win.start.getTime() === 7 * D)
  check('A2: Sunday 09:00 Israel is the send window', inWeeklyWindow(now))
  check('A3: Sunday 10:00 is not', !inWeeklyWindow(new Date('2026-10-11T07:10:00.000Z')))
  check('A4: Monday 09:00 is not', !inWeeklyWindow(new Date('2026-10-12T06:10:00.000Z')))
  // Winter time (UTC+2): 09:10 Israel on Sunday 6 Dec 2026 is 07:10 UTC.
  check('A5: winter time is handled', inWeeklyWindow(new Date('2026-12-06T07:10:00.000Z')))
  check('A6: one key per week', weekKeyOf(now) === weekKeyOf(new Date(now.getTime() + 2 * H))
    && weekKeyOf(now) !== weekKeyOf(new Date(now.getTime() + 8 * D)), weekKeyOf(now))
  check('A7: the key is YYYY-Www', /^\d{4}-W\d{2}$/.test(weekKeyOf(now)), weekKeyOf(now))

  // ── B) what is worth sending ──────────────────────────────────────────────
  console.log('\nB) What is worth sending')
  check('B1: a week with nothing in it is not sent', aggregateWeek(inputs()).worthSending === false)
  check('B2: a published article is worth sending',
    aggregateWeek(inputs({ published: [{ title: 't', url: null, at: before(D) }] })).worthSending === true)
  check('B3: something waiting for the owner is worth sending', aggregateWeek(inputs({ waiting: 2 })).worthSending === true)
  check('B4: a ranking check is worth sending', aggregateWeek(inputs({ rank: { checked: 5, improved: 1, dropped: 0 } })).worthSending === true)
  check('B5: a check that measured nothing is not', aggregateWeek(inputs({ rank: { checked: 0, improved: 0, dropped: 0 } })).worthSending === false)
  check('B6: Search Console that did not move is not news',
    aggregateWeek(inputs({ gsc: { clicks: 40, previousClicks: 40 } })).worthSending === false
    && aggregateWeek(inputs({ gsc: { clicks: 40, previousClicks: 31 } })).worthSending === true)
  check('B7: clicks with nothing to compare them to are not news',
    aggregateWeek(inputs({ gsc: { clicks: 40, previousClicks: null } })).worthSending === false)
  check('B8: an unreadable section is absent, not zero',
    aggregateWeek(inputs({ published: null, waiting: null })).publishedCount === 0
    && aggregateWeek(inputs({ waiting: null })).waiting === null
    && aggregateWeek(inputs({ waiting: 0 })).waiting === null)
  check('B9: only the next scheduled article is not a reason to write',
    aggregateWeek(inputs({ nextScheduled: { title: 't', at: before(-D) } })).worthSending === false)
  await withMutant<{ aggregateWeek: typeof aggregateWeek }, void>(
    'lib/reports/weekly/aggregate.ts', [['const worthSending =', 'const worthSending = true ||']],
    async (mod) => check('B-MUT: always worth sending fails B1', mod.aggregateWeek(inputs()).worthSending === true),
  )

  // ── C) the flag ───────────────────────────────────────────────────────────
  console.log('\nC) The flag')
  for (const v of [undefined, 'false', '1', 'TRUE', 'yes']) {
    check(`C1: the flag as ${JSON.stringify(v)} is off`, weeklyGate({ ...fullEnv, WEEKLY_SUMMARY_EMAIL_ENABLED: v }, now) === 'off')
  }
  check('C2: the flag on, Sunday morning, fully configured, is a go', weeklyGate(fullEnv, now) === 'go')
  check('C3: any other day is outside the window', weeklyGate(fullEnv, new Date('2026-10-12T06:10:00.000Z')) === 'outside_window')
  for (const key of ['RESEND_API_KEY', 'RESEND_FROM_EMAIL', 'CRON_SECRET', 'NEXT_PUBLIC_APP_URL'] as const) {
    check(`C4: without ${key} it is not configured`, weeklyGate({ ...fullEnv, [key]: undefined }, now) === 'not_configured')
  }

  // ── D) the run ────────────────────────────────────────────────────────────
  console.log('\nD) The run')
  const prefsRow = (over: Record<string, unknown> = {}) =>
    ({ project_id: P1, user_id: OWNER, weekly_email_summary: true, weekly_last_week: null, weekly_last_sent_at: null, updated_at: before(30 * D), ...over })
  const projectRow = (over: Record<string, unknown> = {}) =>
    ({ id: P1, user_id: OWNER, target_domain: 'shop.example.com', business_name: null, is_active: true, ...over })
  const articleRow = (over: Record<string, unknown> = {}) =>
    ({ id: 'art-1', project_id: P1, user_id: OWNER, title: 'מה חשוב לדעת', status: 'published', published_at: before(2 * D), wp_post_url: 'https://shop.example.com/a', ...over })
  const tables = (over: Record<string, unknown[]> = {}) => ({
    project_report_preferences: [prefsRow()],
    projects: [projectRow()],
    generated_articles: [articleRow()],
    ...over,
  })
  const owner = async () => ({ email: 'owner@example.com', locale: 'he' as const, firstName: 'דנה', shopify: false })
  const deps = (admin: FakeAdmin, over: Partial<WeeklyDeps> = {}): WeeklyDeps => ({
    admin: admin as unknown as ServiceRoleClient, env: fullEnv, now: () => now, owner, send: async () => ({ ok: true }), ...over,
  })

  const sent: OutgoingWeekly[] = []
  const a1 = new FakeAdmin(tables())
  const r1 = await runWeeklySummaries(deps(a1, { send: async (m) => { sent.push(m); return { ok: true } } }))
  check('D1: a project with the switch on and a published article gets the summary',
    r1.status === 'done' && r1.sent === 1 && sent[0]?.to === 'owner@example.com' && sent[0].email.text.includes('מה חשוב לדעת'), r1)
  check('D2: the week is recorded on the row',
    a1.tables.project_report_preferences[0]?.weekly_last_week === weekKeyOf(now)
    && a1.tables.project_report_preferences[0]?.weekly_last_sent_at === now.toISOString(), a1.tables.project_report_preferences)
  check('D3: the summary does not silence the reminder that asks for something',
    (a1.tables.project_reminder_state ?? []).every((r) => !r.last_sent_at))

  let again = 0
  const a2 = new FakeAdmin(tables({ project_report_preferences: [...a1.tables.project_report_preferences] }))
  const r2 = await runWeeklySummaries(deps(a2, { send: async () => { again++; return { ok: true } } }))
  check('D4: the next tick the same morning sends nothing', r2.status === 'done' && again === 0, r2)

  let offSwitch = 0
  const a3 = new FakeAdmin(tables({ project_report_preferences: [prefsRow({ weekly_email_summary: false })] }))
  const r3 = await runWeeklySummaries(deps(a3, { send: async () => { offSwitch++; return { ok: true } } }))
  check('D5: a project whose owner never asked for it is not even read', r3.status === 'done' && offSwitch === 0 && r3.considered === 0)

  let emptyWeek = 0
  const a4 = new FakeAdmin(tables({ generated_articles: [] }))
  const r4 = await runWeeklySummaries(deps(a4, { send: async () => { emptyWeek++; return { ok: true } } }))
  check('D6: an empty week sends nothing and keeps the week open',
    r4.status === 'done' && emptyWeek === 0 && r4.skipped === 1
    && a4.tables.project_report_preferences[0]?.weekly_last_week === null, r4)

  let quiet = 0
  const a5 = new FakeAdmin(tables({
    project_reminder_state: [{ project_id: P1, user_id: OWNER, reminders_enabled: true, last_sent_at: before(3 * H), updated_at: before(3 * H) }],
  }))
  const r5 = await runWeeklySummaries(deps(a5, { send: async () => { quiet++; return { ok: true } } }))
  check('D7: another email about this project this morning defers the summary', r5.status === 'done' && quiet === 0 && r5.skipped === 1, r5)

  let old = 0
  const a6 = new FakeAdmin(tables({
    project_reminder_state: [{ project_id: P1, user_id: OWNER, reminders_enabled: true, last_sent_at: before(5 * D), updated_at: before(5 * D) }],
  }))
  const r6 = await runWeeklySummaries(deps(a6, { send: async () => { old++; return { ok: true } } }))
  check('D8: an email from days ago does not defer it', r6.status === 'done' && old === 1)

  const a7 = new FakeAdmin(tables())
  const r7 = await runWeeklySummaries(deps(a7, { send: async () => ({ ok: false }) }))
  check('D9: a refused send is released, so next week is not lost',
    r7.status === 'done' && r7.failed === 1 && a7.tables.project_report_preferences[0]?.weekly_last_week === null, a7.tables.project_report_preferences)

  let stranger = 0
  const a8 = new FakeAdmin(tables({ projects: [projectRow({ user_id: STRANGER })] }))
  const r8 = await runWeeklySummaries(deps(a8, { send: async () => { stranger++; return { ok: true } } }))
  check('D10: a preferences row whose project belongs to someone else is skipped', r8.status === 'done' && stranger === 0)

  let inactive = 0
  const a9 = new FakeAdmin(tables({ projects: [projectRow({ is_active: false })] }))
  check('D11: an inactive project gets nothing',
    (await runWeeklySummaries(deps(a9, { send: async () => { inactive++; return { ok: true } } }))).status === 'done' && inactive === 0)

  let notInstalled = 0
  const a10 = new FakeAdmin(tables(), { project_report_preferences: { select: () => ({ code: '42703', message: 'column does not exist' }) } })
  const r10 = await runWeeklySummaries(deps(a10, { send: async () => { notInstalled++; return { ok: true } } }))
  check('D12: a database without the new columns is "not installed"', r10.status === 'not_installed' && notInstalled === 0, r10)

  let unreadable = 0
  const a11 = new FakeAdmin(tables(), { generated_articles: { select: () => ({ code: '08006', message: 'reset' }) } })
  const r11 = await runWeeklySummaries(deps(a11, { send: async () => { unreadable++; return { ok: true } } }))
  check('D13: a week whose articles could not be read sends nothing', r11.status === 'done' && unreadable === 0, r11)

  let noAddress = 0
  const a12 = new FakeAdmin(tables())
  await runWeeklySummaries(deps(a12, {
    owner: async () => ({ email: null, locale: null, firstName: null, shopify: false }),
    send: async () => { noAddress++; return { ok: true } },
  }))
  check('D14: no address, no email and no claim', noAddress === 0 && a12.tables.project_report_preferences[0]?.weekly_last_week === null)

  const lostClaim = () => new FakeAdmin(tables(), { project_report_preferences: { update: () => ({ code: '08006', message: 'reset' }) } })
  let claimSends = 0
  const r15 = await runWeeklySummaries(deps(lostClaim(), { send: async () => { claimSends++; return { ok: true } } }))
  check('D15: a claim that could not be written sends nothing', r15.status === 'done' && claimSends === 0, r15)
  await withMutant<{ runWeeklySummaries: typeof runWeeklySummaries }, void>(
    'lib/reports/weekly/run.ts', [['if (!won) continue', '']],
    async (mod) => {
      let sends = 0
      await mod.runWeeklySummaries(deps(lostClaim(), { send: async () => { sends++; return { ok: true } } }))
      check('D-MUT: sending without winning the claim emails an unrecorded send', sends === 1)
    },
  )
  await withMutant<{ runWeeklySummaries: typeof runWeeklySummaries }, void>(
    'lib/reports/weekly/run.ts', [['if (!summary.worthSending) { skipped++; continue }', '']],
    async (mod) => {
      let sends = 0
      await mod.runWeeklySummaries(deps(new FakeAdmin(tables({ generated_articles: [] })), { send: async () => { sends++; return { ok: true } } }))
      check('D-MUT: sending an empty week fails D6', sends === 1)
    },
  )

  // ── E) the email ──────────────────────────────────────────────────────────
  console.log('\nE) The email')
  const token = makeUnsubscribeToken(P1, OWNER, { CRON_SECRET: SECRET })!
  const summary = aggregateWeek(inputs({
    published: [{ title: 'כותרת', url: 'https://shop.example.com/a', at: before(2 * D) }],
    waiting: 2, rank: { checked: 7, improved: 3, dropped: 1 }, gsc: { clicks: 120, previousClicks: 100 },
    nextScheduled: { title: 'הבא בתור', at: new Date(now.getTime() + 2 * D).toISOString() },
  }))
  const mail = buildWeeklyEmail({ locale: 'he', firstName: 'דנה', domain: 'shop.example.com', projectId: P1, summary, origin: 'https://app.example.com', token })
  check('E1: the button goes to this project\'s reports screen, inside the app',
    mail.reportsUrl === `https://app.example.com/login?next=${encodeURIComponent(`/reports?projectId=${P1}`)}`, mail.reportsUrl)
  check('E2: RFC 8058 one-click headers',
    mail.headers['List-Unsubscribe'] === `<${mail.unsubscribeUrl}>` && mail.headers['List-Unsubscribe-Post'] === 'List-Unsubscribe=One-Click')
  check('E3: every measured section is in the body',
    mail.text.includes('כותרת') && /2 מאמרים מחכים/.test(mail.text) && /7 ביטויים/.test(mail.text)
    && /120 קליקים/.test(mail.text) && mail.text.includes('הבא בתור'), mail.text)
  const bare = buildWeeklyEmail({
    locale: 'he', firstName: null, domain: 'shop.example.com', projectId: P1, origin: 'https://app.example.com', token,
    summary: aggregateWeek(inputs({ waiting: 1 })),
  })
  check('E4: a section that was not measured prints no line',
    !/קליקים/.test(bare.text) && !/ביטויים/.test(bare.text) && !/פורסם/.test(bare.text) && /מאמר אחד מחכה/.test(bare.text), bare.text)
  const nasty = buildWeeklyEmail({
    locale: 'he', firstName: '<script>alert(1)</script>', domain: '"><img src=x>', projectId: P1, origin: 'https://app.example.com', token,
    summary: aggregateWeek(inputs({ published: [{ title: '<b>hi</b>', url: 'javascript:alert(1)', at: before(D) }] })),
  })
  check('E5: a stored title, name or domain cannot become markup',
    !nasty.html.includes('<script>') && !nasty.html.includes('<img') && !nasty.html.includes('<b>hi</b>') && nasty.html.includes('&lt;b&gt;'))
  check('E6: a stored URL that is not https is not linked',
    !nasty.html.includes('javascript:') && safeLink('javascript:alert(1)') === null && safeLink('http://x.co/a') === null
    && safeLink('https://x.co/a') === 'https://x.co/a')
  check('E7: the only app links are the app\'s origin',
    (mail.html.match(/href="([^"]*)"/g) ?? []).every((h) => h.includes('https://app.example.com') || h.includes('https://shop.example.com')))
  // Latin-only data, so the script check reads the WORDS of the email, not its content.
  const neutral = aggregateWeek(inputs({
    published: [{ title: 'Title', url: 'https://shop.example.com/a', at: before(2 * D) }],
    waiting: 2, rank: { checked: 7, improved: 3, dropped: 1 }, gsc: { clicks: 120, previousClicks: 100 },
  }))
  for (const locale of PUBLIC_LOCALES) {
    const m = buildWeeklyEmail({ locale, firstName: null, domain: 'x.co', projectId: P1, summary: neutral, origin: 'https://app.example.com', token })
    check(`E8: ${locale} has a subject, a body and the right script`,
      m.subject.length > 5 && m.text.includes('x.co') && /[א-ת]/.test(m.subject + m.text) === (locale === 'he'), m.subject)
    const d = getDashboardDictionary(locale)
    check(`E9: ${locale} has every weekly key`,
      Object.keys(d.weeklySummaryEmail).sort().join() === Object.keys(getDashboardDictionary('he').weeklySummaryEmail).sort().join())
  }
  check('E10: the RTL direction is Hebrew only', /dir="rtl"/.test(mail.html)
    && /dir="ltr"/.test(buildWeeklyEmail({ locale: 'pt-BR', firstName: null, domain: 'x.co', projectId: P1, summary, origin: 'https://app.example.com', token }).html))
  await withMutant<{ safeLink: typeof safeLink }, void>(
    'lib/reports/weekly/email.ts', [["return u.protocol === 'https:' ? u.toString() : null", 'return raw']],
    async (mod) => check('E-MUT: linking any stored URL fails E6', mod.safeLink('javascript:alert(1)') === 'javascript:alert(1)'),
  )

  // ── F) one click stops everything ─────────────────────────────────────────
  console.log('\nF) One click stops everything')
  const unsub = new FakeAdmin({
    projects: [projectRow()],
    project_reminder_state: [{ project_id: P1, user_id: OWNER, reminders_enabled: true, updated_at: before(D) }],
    project_report_preferences: [prefsRow()],
  })
  const outcome = await unsubscribeByToken(token, { admin: () => unsub as unknown as ServiceRoleClient, now: () => now, env: { CRON_SECRET: SECRET } })
  check('F1: one click turns the reminders AND the weekly summary off',
    outcome === 'done' && unsub.tables.project_reminder_state[0]?.reminders_enabled === false
    && unsub.tables.project_report_preferences[0]?.weekly_email_summary === false, unsub.tables.project_report_preferences)
  const noPrefs = new FakeAdmin({
    projects: [projectRow()],
    project_reminder_state: [{ project_id: P1, user_id: OWNER, reminders_enabled: true, updated_at: before(D) }],
  }, { project_report_preferences: { update: () => ({ code: '42P01' }) } })
  check('F2: a weekly table that is not there does not fail the unsubscribe',
    (await unsubscribeByToken(token, { admin: () => noPrefs as unknown as ServiceRoleClient, now: () => now, env: { CRON_SECRET: SECRET } })) === 'done')
  const wrongOwner = new FakeAdmin({
    projects: [projectRow({ user_id: STRANGER })],
    project_report_preferences: [prefsRow()],
  })
  check('F3: a token for a project that changed hands changes nothing',
    (await unsubscribeByToken(token, { admin: () => wrongOwner as unknown as ServiceRoleClient, now: () => now, env: { CRON_SECRET: SECRET } })) === 'invalid'
    && wrongOwner.tables.project_report_preferences[0]?.weekly_email_summary === true)

  // ── G) the cron ───────────────────────────────────────────────────────────
  console.log('\nG) The cron')
  const route = strip(code('app/api/content/automation/cron/route.ts'))
  const iRem = route.indexOf('runIsolatedReminders()')
  const iOnb = route.indexOf('runIsolatedOnboardingEmails()')
  const iWk = route.indexOf('runIsolatedWeeklySummaries()')
  check('G1: the weekly step runs last of all', iRem > 0 && iOnb > iRem && iWk > iOnb)
  check('G2: the cron reaches it only through the isolated wrapper',
    /runIsolatedWeeklySummaries/.test(route) && !/runWeeklySummaries\(/.test(route) && !/liveWeeklyDeps/.test(route))
  const thrown = await runIsolatedWeeklySummaries(async () => { throw new Error('boom') }, { env: fullEnv, now: () => now })
  check('G3: a throwing run is caught', thrown.status === 'error')
  const hung = await runIsolatedWeeklySummaries(() => new Promise(() => undefined), { env: fullEnv, now: () => now, capMs: 30 })
  check('G4: a hanging run hits the time cap', hung.status === 'time_cap')
  let called = 0
  const gatedOff = await runIsolatedWeeklySummaries(async () => { called++; return { status: 'done', considered: 0, sent: 0, skipped: 0, failed: 0 } },
    { env: { ...fullEnv, WEEKLY_SUMMARY_EMAIL_ENABLED: undefined }, now: () => now })
  check('G5: with the flag off the wrapper constructs nothing', gatedOff.status === 'off' && called === 0)
  check('G6: only the live deps import the provider',
    /import\('resend'\)/.test(strip(code('lib/reports/weekly/live.ts')))
    && !/resend/i.test(strip(code('lib/reports/weekly/run.ts')).replace(/RESEND_[A-Z_]+/g, ''))
    && !/resend/i.test(strip(code('lib/reports/weekly/email.ts')))
    && !/resend/i.test(strip(code('lib/reports/weekly/aggregate.ts')))
    && !/resend/i.test(strip(code('lib/reports/weekly/store.ts'))))
  await withMutant<{ runIsolatedWeeklySummaries: typeof runIsolatedWeeklySummaries }, void>(
    'lib/reports/weekly/isolated.ts',
    [[/  \} catch \{\n    console\.error\('\[weekly-summary\] failed', \{ reason: 'threw' \}\)\n    return \{ status: 'error' \}\n  \}/, '  } catch (e) {\n    throw e\n  }']],
    async (mod) => {
      let threw = false
      await mod.runIsolatedWeeklySummaries(async () => { throw new Error('boom') }, { env: fullEnv, now: () => now }).catch(() => { threw = true })
      check('G-MUT: without the catch the cron would see the failure', threw)
    },
  )

  console.log(`\n${pass} passed, ${fail} failed`)
  if (fail > 0) process.exitCode = 1
}

void main()

export {}
