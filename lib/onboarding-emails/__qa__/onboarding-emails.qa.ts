/**
 * The two setup emails (lib/onboarding-emails): "your site is not connected yet" and
 * "nothing has been published yet".
 *
 *   A) cadence: 3 days for `connect`, 7 for `publish`, a second one 7 days later and no
 *      third, the stage decided by the project's facts, never 2 emails within 72h (the
 *      approval reminder counts), stop when the stage is done or the switch is off
 *   B) the flag: unset / "false" / "1" / "TRUE" send nothing AND read nothing; a missing
 *      key, sender, origin or secret is "not configured"
 *   C) the run: owner filtering, fail closed on an unreadable absence, one claim per send,
 *      a failed send releases its claim, two ticks never send twice, a database without the
 *      new columns is "not installed"
 *   D) the email: four languages, escaped, internal link only, RFC 8058 headers, the same
 *      unsubscribe token the approval reminder uses
 *   E) the copy: the switch and the unsubscribe page say these emails are covered too
 *   F) the cron: the setup step is last, after the reminder, isolated (throwing / hanging
 *      cannot reach the cron)
 *   G) the two scopes: the link in a setup email stops THESE emails alone and leaves the
 *      approval reminder and the weekly summary in place, says so, and offers one click for
 *      the rest; the link in a reminder still stops everything; the settings switch turning
 *      back on clears the narrow stop
 *
 * Every guard runs against the real code and again against a deliberately broken copy.
 * Nothing here talks to Resend or Supabase.
 * Run: npx tsx lib/onboarding-emails/__qa__/onboarding-emails.qa.ts
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { FakeAdmin } from '@/lib/__qa__/_fake-admin'
import type { ServiceRoleClient } from '@/lib/supabase/admin'
import { getDashboardDictionary } from '@/lib/i18n/dashboard/getDashboardDictionary'
import { PUBLIC_LOCALES } from '@/lib/i18n/locales'
import { makeUnsubscribeToken, verifyUnsubscribeToken } from '@/lib/reminders/token'
import { SETUP_UNSUBSCRIBE_SCOPE, unsubscribeUrlFor } from '@/lib/reminders/email'
import { handlePreferencesPut, handleUnsubscribe, unsubscribeScope } from '@/lib/reminders/http'
import { withMutant } from '@/lib/reminders/__qa__/_mutant'
import { decideOnboardingEmail, stageOf, type OnboardingState } from '../cadence'
import { actionPathFor, buildOnboardingEmail } from '../email'
import { onboardingGate, runOnboardingEmails, type OnboardingDeps, type OutgoingOnboarding } from '../run'
import { runIsolatedOnboardingEmails } from '../isolated'

let pass = 0
let fail = 0
function check(name: string, cond: boolean, detail?: unknown) {
  if (cond) { pass++; console.log(`  ✓ ${name}`) } else { fail++; console.log(`  ✗ ${name}${detail !== undefined ? ` — ${JSON.stringify(detail)}` : ''}`) }
}
const ROOT = join(__dirname, '..', '..', '..')
const code = (rel: string) => readFileSync(join(ROOT, rel), 'utf8')
const strip = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/.*$/gm, '$1')

const OWNER = '11111111-1111-4111-8111-111111111111'
const STRANGER = '22222222-2222-4222-8222-222222222222'
const P1 = 'aaaaaaaa-0000-4000-8000-000000000001'
const P2 = 'aaaaaaaa-0000-4000-8000-000000000002'
const SECRET = 'cron-secret-for-tests-only'
const H = 3_600_000
const D = 24 * H
// Sunday 27 Sep 2026, 09:10 in Israel (summer time, UTC+3) = 06:10 UTC.
const SUN_9 = new Date('2026-09-27T06:10:00.000Z')
const now = SUN_9
const before = (ms: number) => new Date(now.getTime() - ms).toISOString()

const fullEnv = {
  ONBOARDING_EMAILS_ENABLED: 'true',
  RESEND_API_KEY: 're_test',
  RESEND_FROM_EMAIL: 'Go Top <hello@mail.example.com>',
  CRON_SECRET: SECRET,
  NEXT_PUBLIC_APP_URL: 'https://app.example.com',
}

async function main() {
  // ── A) cadence ────────────────────────────────────────────────────────────
  console.log('\nA) Cadence')
  const st = (over: Partial<OnboardingState> = {}): OnboardingState =>
    ({ stage: null, sentCount: 0, lastSentAt: null, lastAnyAt: null, enabled: true, optedOut: false, ...over })
  const facts = (over: Partial<{ createdAt: string; connected: boolean; published: boolean }> = {}) =>
    ({ createdAt: before(10 * D), connected: false, published: false, ...over })
  const dec = (mod: { decideOnboardingEmail: typeof decideOnboardingEmail }, f = facts(), s: OnboardingState | null = null) =>
    mod.decideOnboardingEmail({ now, facts: f, state: s })
  const real = { decideOnboardingEmail, stageOf }

  check('A1: a project with no connection is at the connect stage', stageOf({ connected: false, published: false }) === 'connect')
  check('A2: connected but nothing published is at the publish stage', stageOf({ connected: true, published: false }) === 'publish')
  check('A3: connected and published is past both', stageOf({ connected: true, published: true }) === null)
  check('A4: connect waits 3 days', dec(real, facts({ createdAt: before(2 * D + 23 * H) })).send === false
    && dec(real, facts({ createdAt: before(3 * D + H) })).send === true)
  check('A5: publish waits 7 days', dec(real, facts({ createdAt: before(5 * D), connected: true })).send === false
    && dec(real, facts({ createdAt: before(7 * D + H), connected: true })).send === true)
  const first = dec(real, facts(), st())
  check('A6: the first one is counted as 1', first.send === true && first.stage === 'connect' && first.sentCount === 1)
  check('A7: a second one only 7 days later',
    dec(real, facts(), st({ stage: 'connect', sentCount: 1, lastSentAt: before(6 * D), lastAnyAt: before(6 * D) })).send === false
    && dec(real, facts(), st({ stage: 'connect', sentCount: 1, lastSentAt: before(8 * D), lastAnyAt: before(8 * D) })).send === true)
  check('A8: and never a third', dec(real, facts(), st({ stage: 'connect', sentCount: 2, lastSentAt: before(30 * D), lastAnyAt: before(30 * D) })) .send === false)
  check('A9: reaching the next stage starts its own count',
    dec(real, facts({ connected: true }), st({ stage: 'connect', sentCount: 2, lastSentAt: before(30 * D), lastAnyAt: before(30 * D) })).send === true)
  check('A10: an approval reminder in the last 72h stops it',
    dec(real, facts(), st({ lastAnyAt: before(2 * D) })).send === false
    && dec(real, facts(), st({ lastAnyAt: before(4 * D) })).send === true)
  check('A11: the switch off stops it', dec(real, facts(), st({ enabled: false })).send === false)
  check('A12: nothing to do once connected and published', dec(real, facts({ connected: true, published: true }), st()).send === false)
  check('A13: an unreadable creation date sends nothing', dec(real, facts({ createdAt: 'not a date' }), st()).send === false)

  await withMutant<{ decideOnboardingEmail: typeof decideOnboardingEmail }, void>(
    'lib/onboarding-emails/cadence.ts', [['t - lastAny < MIN_GAP_MS', 'false']],
    async (mod) => check('A-MUT: dropping the 72-hour gap fails A10',
      mod.decideOnboardingEmail({ now, facts: facts(), state: st({ lastAnyAt: before(2 * D) }) }).send === true),
  )
  await withMutant<{ decideOnboardingEmail: typeof decideOnboardingEmail }, void>(
    'lib/onboarding-emails/cadence.ts', [['if (sent >= MAX_PER_STAGE)', 'if (false)']],
    async (mod) => check('A-MUT: dropping the per-stage cap fails A8',
      mod.decideOnboardingEmail({ now, facts: facts(), state: st({ stage: 'connect', sentCount: 2, lastSentAt: before(30 * D), lastAnyAt: before(30 * D) }) }).send === true),
  )

  // ── B) the flag and the configuration ─────────────────────────────────────
  console.log('\nB) The flag')
  for (const v of [undefined, 'false', '1', 'TRUE', 'yes']) {
    check(`B1: the flag as ${JSON.stringify(v)} is off`, onboardingGate({ ...fullEnv, ONBOARDING_EMAILS_ENABLED: v }, now) === 'off')
  }
  check('B2: the flag on, in the window, fully configured, is a go', onboardingGate(fullEnv, now) === 'go')
  check('B3: outside the window', onboardingGate(fullEnv, new Date('2026-09-27T10:10:00.000Z')) === 'outside_window')
  check('B4: Friday morning is outside the window', onboardingGate(fullEnv, new Date('2026-09-25T06:10:00.000Z')) === 'outside_window')
  for (const key of ['RESEND_API_KEY', 'RESEND_FROM_EMAIL', 'CRON_SECRET', 'NEXT_PUBLIC_APP_URL'] as const) {
    check(`B5: without ${key} it is not configured`, onboardingGate({ ...fullEnv, [key]: undefined }, now) === 'not_configured')
  }
  check('B6: an http origin is not configured', onboardingGate({ ...fullEnv, NEXT_PUBLIC_APP_URL: 'http://app.example.com' }, now) === 'not_configured')
  const offAdmin = new FakeAdmin({ projects: [{ id: P1, user_id: OWNER, created_at: before(10 * D), target_domain: 'a.co', is_active: true }] })
  const offRun = await runOnboardingEmails({
    admin: offAdmin as unknown as ServiceRoleClient, env: { ...fullEnv, ONBOARDING_EMAILS_ENABLED: undefined }, now: () => now,
    owner: async () => { throw new Error('must not be asked') },
    send: async () => { throw new Error('must not send') },
  })
  check('B7: with the flag off the run reads nothing at all', offRun.status === 'off' && offAdmin.tables.projects.length === 1
    && Object.keys(offAdmin.tables).length === 1)

  // ── C) the run ────────────────────────────────────────────────────────────
  console.log('\nC) The run')
  const project = (over: Record<string, unknown> = {}) =>
    ({ id: P1, user_id: OWNER, created_at: before(10 * D), target_domain: 'shop.example.com', business_name: null, is_active: true, ...over })
  const owner = async () => ({ email: 'owner@example.com', locale: 'he' as const, firstName: 'דנה', shopify: false })
  const deps = (admin: FakeAdmin, over: Partial<OnboardingDeps> = {}): OnboardingDeps => ({
    admin: admin as unknown as ServiceRoleClient, env: fullEnv, now: () => now, owner, send: async () => ({ ok: true }), ...over,
  })

  const sentTo: OutgoingOnboarding[] = []
  const a1 = new FakeAdmin({ projects: [project()] })
  const r1 = await runOnboardingEmails(deps(a1, { send: async (m) => { sentTo.push(m); return { ok: true } } }))
  check('C1: a project with no connection gets the connect email',
    r1.status === 'done' && r1.sent === 1 && sentTo.length === 1 && sentTo[0].to === 'owner@example.com'
    && sentTo[0].email.subject.includes('shop.example.com'), r1)
  check('C2: the send is recorded, with the shared date so no reminder follows the same morning',
    a1.tables.project_reminder_state?.[0]?.onboarding_stage === 'connect'
    && a1.tables.project_reminder_state?.[0]?.onboarding_sent_count === 1
    && a1.tables.project_reminder_state?.[0]?.last_sent_at === now.toISOString(), a1.tables.project_reminder_state)

  const a2 = new FakeAdmin({ projects: [project()], project_reminder_state: [...(a1.tables.project_reminder_state ?? [])] })
  let second = 0
  const r2 = await runOnboardingEmails(deps(a2, { send: async () => { second++; return { ok: true } } }))
  check('C3: the next tick the same morning sends nothing', r2.status === 'done' && second === 0, r2)

  const a3 = new FakeAdmin({ projects: [project()] })
  const r3 = await runOnboardingEmails(deps(a3, { send: async () => ({ ok: false }) }))
  check('C4: a refused send is released, so a later tick may try again',
    r3.status === 'done' && r3.failed === 1
    && (a3.tables.project_reminder_state?.[0]?.onboarding_stage ?? null) === null
    && (a3.tables.project_reminder_state?.[0]?.onboarding_last_sent_at ?? null) === null, a3.tables.project_reminder_state)

  let strangerSends = 0
  const a4 = new FakeAdmin({
    projects: [project()],
    // The connection belongs to someone else's project: it must not count as this one's.
    wordpress_connections: [{ project_id: P2, user_id: STRANGER }],
  })
  const r4 = await runOnboardingEmails(deps(a4, { send: async () => { strangerSends++; return { ok: true } } }))
  check('C5: another project\'s connection does not count', r4.status === 'done' && r4.sent === 1 && strangerSends === 1)

  let connectedSends = 0
  const a5 = new FakeAdmin({
    projects: [project()],
    wordpress_connections: [{ project_id: P1, user_id: OWNER }],
    generated_articles: [{ id: 'x', project_id: P1, user_id: OWNER, status: 'published' }],
  })
  const r5 = await runOnboardingEmails(deps(a5, { send: async () => { connectedSends++; return { ok: true } } }))
  check('C6: a connected project that has published gets nothing', r5.status === 'done' && r5.sent === 0 && connectedSends === 0)

  const publishSends: OutgoingOnboarding[] = []
  const a6 = new FakeAdmin({
    projects: [project()],
    site_platform_connections: [{ project_id: P1, user_id: OWNER }],
    generated_articles: [{ id: 'x', project_id: P1, user_id: OWNER, status: 'ready' }],
  })
  const r6 = await runOnboardingEmails(deps(a6, { send: async (m) => { publishSends.push(m); return { ok: true } } }))
  check('C7: connected with nothing published gets the publish email',
    r6.status === 'done' && r6.sent === 1 && publishSends[0]?.email.actionUrl.includes('%2Fcontent')
    && a6.tables.project_reminder_state?.[0]?.onboarding_stage === 'publish', r6)

  let archivedSends = 0
  const a7 = new FakeAdmin({
    projects: [project()],
    shopify_connections: [{ project_id: P1, user_id: OWNER, archived_at: before(D) }],
  })
  const r7 = await runOnboardingEmails(deps(a7, { send: async () => { archivedSends++; return { ok: true } } }))
  check('C8: an archived Shopify connection is not a connection', r7.status === 'done' && archivedSends === 1)

  let failClosed = 0
  const a8 = new FakeAdmin({ projects: [project()] }, { wordpress_connections: { select: () => ({ code: '08006', message: 'connection reset' }) } })
  const r8 = await runOnboardingEmails(deps(a8, { send: async () => { failClosed++; return { ok: true } } }))
  check('C9: an unreadable connection table sends nothing (an absence we cannot see is not an absence)',
    r8.status === 'failed' && failClosed === 0, r8)

  let publishedUnreadable = 0
  const a9 = new FakeAdmin({
    projects: [project()], site_platform_connections: [{ project_id: P1, user_id: OWNER }],
  }, { generated_articles: { select: () => ({ code: '08006', message: 'connection reset' }) } })
  const r9 = await runOnboardingEmails(deps(a9, { send: async () => { publishedUnreadable++; return { ok: true } } }))
  check('C10: an unreadable article table sends no publish email', r9.status === 'done' && r9.failed === 1 && publishedUnreadable === 0, r9)

  let notInstalled = 0
  const a10 = new FakeAdmin({ projects: [project()] }, { project_reminder_state: { select: () => ({ code: '42703', message: 'column does not exist' }) } })
  const r10 = await runOnboardingEmails(deps(a10, { send: async () => { notInstalled++; return { ok: true } } }))
  check('C11: a database without the new columns is "not installed" and sends nothing', r10.status === 'not_installed' && notInstalled === 0, r10)

  let offSwitch = 0
  const a11 = new FakeAdmin({
    projects: [project()],
    project_reminder_state: [{ project_id: P1, user_id: OWNER, reminders_enabled: false, updated_at: before(30 * D) }],
  })
  const r11 = await runOnboardingEmails(deps(a11, { send: async () => { offSwitch++; return { ok: true } } }))
  check('C12: an owner who unsubscribed gets nothing', r11.status === 'done' && offSwitch === 0)

  let noAddress = 0
  const a12 = new FakeAdmin({ projects: [project()] })
  const r12 = await runOnboardingEmails(deps(a12, {
    owner: async () => ({ email: null, locale: null, firstName: null, shopify: false }),
    send: async () => { noAddress++; return { ok: true } },
  }))
  check('C13: no address, no email and no claim', r12.status === 'done' && noAddress === 0 && (a12.tables.project_reminder_state ?? []).length === 0)

  let inactive = 0
  const a13 = new FakeAdmin({ projects: [project({ is_active: false })] })
  const r13 = await runOnboardingEmails(deps(a13, { send: async () => { inactive++; return { ok: true } } }))
  check('C14: an inactive project gets nothing', r13.status === 'done' && inactive === 0)

  let shopifyLocale: OutgoingOnboarding | undefined
  const a14 = new FakeAdmin({ projects: [project()] })
  await runOnboardingEmails(deps(a14, {
    owner: async () => ({ email: 'store@example.com', locale: null, firstName: null, shopify: true }),
    send: async (m) => { shopifyLocale = m; return { ok: true } },
  }))
  check('C15: a Shopify owner with no stored language gets English',
    /lang="en"/.test(shopifyLocale?.email.html ?? ''), shopifyLocale?.email.subject)

  // A CONNECTED project whose connection table cannot be read: the real code sends nothing,
  // a version that reads an error as "no row" tells a connected owner to connect.
  const connectedButUnreadable = () => new FakeAdmin(
    { projects: [project()], wordpress_connections: [{ project_id: P1, user_id: OWNER }] },
    { wordpress_connections: { select: () => ({ code: '08006', message: 'reset' }) } },
  )
  let realSends = 0
  const rReal = await runOnboardingEmails(deps(connectedButUnreadable(), { send: async () => { realSends++; return { ok: true } } }))
  check('C16: a connected project whose connection cannot be read is left alone', rReal.status === 'failed' && realSends === 0, rReal)
  await withMutant<{ runOnboardingEmails: typeof runOnboardingEmails }, void>(
    'lib/onboarding-emails/run.ts', [['return MISSING_TABLE.has(String((error as { code?: unknown }).code ?? \'\')) ? new Set() : null', 'return new Set()']],
    async (mod) => {
      let sends = 0
      await mod.runOnboardingEmails(deps(connectedButUnreadable(), { send: async () => { sends++; return { ok: true } } })).catch(() => undefined)
      check('C-MUT: reading an error as "no row" emails a connected site', sends === 1)
    },
  )
  // A claim that cannot be written (another tick got there first, or the write failed):
  // the real code sends nothing, so a lost claim can never become a second email.
  const lostClaim = () => new FakeAdmin(
    { projects: [project()], project_reminder_state: [{ project_id: P1, user_id: OWNER, reminders_enabled: true, onboarding_sent_count: 0, updated_at: before(30 * D) }] },
    { project_reminder_state: { update: () => ({ code: '08006', message: 'reset' }) } },
  )
  let claimSends = 0
  const rClaim = await runOnboardingEmails(deps(lostClaim(), { send: async () => { claimSends++; return { ok: true } } }))
  check('C17: a claim that could not be written sends nothing', rClaim.status === 'done' && claimSends === 0, rClaim)
  await withMutant<{ runOnboardingEmails: typeof runOnboardingEmails }, void>(
    'lib/onboarding-emails/run.ts', [['if (!won) continue', '']],
    async (mod) => {
      let sends = 0
      await mod.runOnboardingEmails(deps(lostClaim(), { send: async () => { sends++; return { ok: true } } }))
      check('C-MUT: sending without winning the claim emails an unrecorded send', sends === 1)
    },
  )

  // ── D) the email ──────────────────────────────────────────────────────────
  console.log('\nD) The email')
  const token = makeUnsubscribeToken(P1, OWNER, { CRON_SECRET: SECRET })!
  const built = buildOnboardingEmail({
    stage: 'connect', locale: 'he', firstName: 'דנה', domain: 'shop.example.com', projectId: P1,
    origin: 'https://app.example.com', token,
  })
  check('D1: the button goes to the app\'s login with an internal next only',
    built.actionUrl === `https://app.example.com/login?next=${encodeURIComponent(`/settings?projectId=${P1}#platform`)}`, built.actionUrl)
  check('D2: RFC 8058 one-click headers',
    built.headers['List-Unsubscribe'] === `<${built.unsubscribeUrl}>` && built.headers['List-Unsubscribe-Post'] === 'List-Unsubscribe=One-Click')
  check('D3: the unsubscribe link carries a token bound to this project and owner',
    built.unsubscribeUrl.includes(encodeURIComponent(token)) && verifyUnsubscribeToken(token, P1, OWNER, { CRON_SECRET: SECRET })
    && !verifyUnsubscribeToken(token, P1, STRANGER, { CRON_SECRET: SECRET }))
  const nasty = buildOnboardingEmail({
    stage: 'publish', locale: 'he', firstName: '<script>alert(1)</script>', domain: '"><img src=x onerror=alert(1)>', projectId: P1,
    origin: 'https://app.example.com', token,
  })
  check('D4: a stored name or domain cannot become markup',
    !nasty.html.includes('<script>') && !nasty.html.includes('<img') && !/ onerror=[^a]/.test(nasty.html)
    && nasty.html.includes('&lt;script&gt;') && nasty.html.includes('&quot;'))
  check('D5: the only links in the email are the app\'s origin',
    (built.html.match(/href="([^"]*)"/g) ?? []).every((h) => h.includes('https://app.example.com')), built.html.match(/href="([^"]*)"/g))
  for (const locale of PUBLIC_LOCALES) {
    for (const stage of ['connect', 'publish'] as const) {
      const e = buildOnboardingEmail({ stage, locale, firstName: null, domain: 'x.co', projectId: P1, origin: 'https://app.example.com', token })
      const hebrew = /[א-ת]/.test(e.subject + e.text)
      check(`D6: ${locale}/${stage} has a subject, a body, a button and the right script`,
        e.subject.length > 5 && e.text.includes('x.co') && e.text.includes('https://app.example.com')
        && hebrew === (locale === 'he'), { locale, stage, subject: e.subject })
    }
  }
  check('D7: the RTL direction is Hebrew only',
    /dir="rtl"/.test(buildOnboardingEmail({ stage: 'connect', locale: 'he', firstName: null, domain: 'x.co', projectId: P1, origin: 'https://app.example.com', token }).html)
    && /dir="ltr"/.test(buildOnboardingEmail({ stage: 'connect', locale: 'es', firstName: null, domain: 'x.co', projectId: P1, origin: 'https://app.example.com', token }).html))
  check('D8: each stage has its own screen', actionPathFor('connect', P1).startsWith('/settings') && actionPathFor('publish', P1).startsWith('/content'))

  // ── E) the copy ───────────────────────────────────────────────────────────
  console.log('\nE) The copy')
  for (const locale of PUBLIC_LOCALES) {
    const d = getDashboardDictionary(locale)
    check(`E1: ${locale} has every setup-email key`,
      Object.keys(d.onboardingEmails).sort().join() === Object.keys(getDashboardDictionary('he').onboardingEmails).sort().join()
      && d.onboardingEmails.connect.bullets.length === 3 && d.onboardingEmails.publish.bullets.length === 3)
  }
  for (const locale of PUBLIC_LOCALES) {
    const d = getDashboardDictionary(locale)
    const text = d.reminders.settingsDescription + d.reminders.unsubscribePage.body
    const marker = { he: 'מיילי התחלה', en: 'setup email', es: 'puesta en marcha', 'pt-BR': 'e-mails de início' }[locale]
    check(`E2: ${locale} says the one switch and the one link cover the setup emails too`,
      text.toLowerCase().includes(marker.toLowerCase()), marker)
  }
  for (const locale of PUBLIC_LOCALES) {
    const d = getDashboardDictionary(locale)
    check(`E2b: ${locale}'s setup email offers the narrow stop, not "unsubscribe from everything"`,
      String(d.onboardingEmails.unsubscribe) !== String(d.reminders.email.unsubscribe) && d.onboardingEmails.unsubscribe.length > 10)
  }
  check('E3: the email never promises anything about schema or a guide page that does not exist',
    !/schema|JSON-LD/i.test(JSON.stringify(getDashboardDictionary('en').onboardingEmails)))

  // ── F) the cron ───────────────────────────────────────────────────────────
  console.log('\nF) The cron')
  const route = strip(code('app/api/content/automation/cron/route.ts'))
  const iRunner = route.indexOf('runAutomation(')
  const iRem = route.indexOf('runIsolatedReminders()')
  const iOnb = route.indexOf('runIsolatedOnboardingEmails()')
  check('F1: the setup step runs last, after the runner and after the reminder', iRunner > 0 && iRem > iRunner && iOnb > iRem)
  check('F2: the cron reaches the setup emails only through the isolated wrapper',
    /runIsolatedOnboardingEmails/.test(route) && !/runOnboardingEmails\(/.test(route) && !/liveOnboardingDeps/.test(route))
  const thrown = await runIsolatedOnboardingEmails(async () => { throw new Error('boom') }, { env: fullEnv, now: () => now })
  check('F3: a throwing run is caught', thrown.status === 'error')
  const hung = await runIsolatedOnboardingEmails(() => new Promise(() => undefined), { env: fullEnv, now: () => now, capMs: 30 })
  check('F4: a hanging run hits the time cap', hung.status === 'time_cap')
  let called = 0
  const gatedOff = await runIsolatedOnboardingEmails(async () => { called++; return { status: 'done', considered: 0, sent: 0, failed: 0 } },
    { env: { ...fullEnv, ONBOARDING_EMAILS_ENABLED: undefined }, now: () => now })
  check('F5: with the flag off the wrapper constructs nothing', gatedOff.status === 'off' && called === 0)
  check('F6: only the live deps import the provider',
    /import\('resend'\)/.test(strip(code('lib/onboarding-emails/live.ts')))
    && !/resend/i.test(strip(code('lib/onboarding-emails/run.ts')).replace(/RESEND_[A-Z_]+/g, ''))
    && !/resend/i.test(strip(code('lib/onboarding-emails/email.ts')))
    && !/resend/i.test(strip(code('lib/onboarding-emails/cadence.ts'))))
  await withMutant<{ runIsolatedOnboardingEmails: typeof runIsolatedOnboardingEmails }, void>(
    'lib/onboarding-emails/isolated.ts',
    [[/  \} catch \{\n    console\.error\('\[onboarding-emails\] failed', \{ reason: 'threw' \}\)\n    return \{ status: 'error' \}\n  \}/, '  } catch (e) {\n    throw e\n  }']],
    async (mod) => {
      let threw = false
      await mod.runIsolatedOnboardingEmails(async () => { throw new Error('boom') }, { env: fullEnv, now: () => now }).catch(() => { threw = true })
      check('F-MUT: without the catch the cron would see the failure', threw)
    },
  )

  // ── G) the two scopes ─────────────────────────────────────────────────────
  console.log('\nG) The two scopes')
  {
    const env = { CRON_SECRET: SECRET }
    const tok = makeUnsubscribeToken(P1, OWNER, env)!
    const scopedWorld = () => new FakeAdmin({
      projects: [{ id: P1, user_id: OWNER }],
      project_reminder_state: [{ project_id: P1, user_id: OWNER, reminders_enabled: true, onboarding_opt_out: false, updated_at: before(30 * D) }],
      project_report_preferences: [{ project_id: P1, user_id: OWNER, weekly_email_summary: true }],
    })
    const deps = (admin: FakeAdmin, user: string | null = null) =>
      ({ userId: async () => user, admin: () => admin as unknown as ServiceRoleClient, now: () => now, env })
    const link = (extra = '') => `https://app.example.com/api/reminders/unsubscribe?t=${encodeURIComponent(tok)}${extra}`
    const state = (a: FakeAdmin) => (a.tables.project_reminder_state ?? []).find((r) => r.project_id === P1)
    const weekly = (a: FakeAdmin) => (a.tables.project_report_preferences ?? []).find((r) => r.project_id === P1)

    const setupMail = buildOnboardingEmail({ stage: 'connect', locale: 'he', firstName: null, domain: 'x.co', projectId: P1, origin: 'https://app.example.com', token: tok })
    check('G1: a setup email asks for the narrow stop, a reminder asks for all of it',
      setupMail.unsubscribeUrl.includes(`&s=${SETUP_UNSUBSCRIBE_SCOPE}`)
      && !unsubscribeUrlFor('https://app.example.com', tok, 'he').includes('&s='), setupMail.unsubscribeUrl)
    check('G2: only the one known value narrows anything',
      unsubscribeScope('setup') === 'setup'
      && (['all', 'SETUP', '', 'weekly', null, undefined, 1, {}] as unknown[]).every((v) => unsubscribeScope(v) === 'all'))

    const narrow = scopedWorld()
    const rNarrow = await handleUnsubscribe(new Request(link('&lang=he&s=setup')), deps(narrow))
    const narrowPage = await rNarrow.text()
    check('G3: the narrow click stops the setup emails and NOTHING else',
      rNarrow.status === 200 && state(narrow)?.onboarding_opt_out === true
      && state(narrow)?.reminders_enabled === true && weekly(narrow)?.weekly_email_summary === true,
      { optOut: state(narrow)?.onboarding_opt_out, reminders: state(narrow)?.reminders_enabled })
    check('G4: its page says what stopped and offers one click for the rest',
      narrowPage.includes(getDashboardDictionary('he').reminders.unsubscribePage.setupTitle)
      && narrowPage.includes(`?t=${encodeURIComponent(tok)}&amp;lang=he`) && !/s=setup/.test(narrowPage))

    const all = scopedWorld()
    const rAll = await handleUnsubscribe(new Request(link('&lang=he')), deps(all))
    check('G5: the wide click still stops everything',
      rAll.status === 200 && state(all)?.reminders_enabled === false && weekly(all)?.weekly_email_summary === false)

    const posted = scopedWorld()
    const rPost = await handleUnsubscribe(new Request(link('&s=setup'), { method: 'POST', body: 'List-Unsubscribe=One-Click', headers: { 'content-type': 'application/x-www-form-urlencoded' } }), deps(posted))
    check('G6: a mail client\'s one-click on a setup email works and stays narrow',
      rPost.status === 200 && state(posted)?.onboarding_opt_out === true && state(posted)?.reminders_enabled === true)

    check('G7: an owner who stopped the setup emails gets none, whatever the stage',
      dec(real, facts(), st({ optedOut: true })).send === false
      && dec(real, facts({ connected: true }), st({ optedOut: true })).send === false)

    const stopped = scopedWorld()
    await handleUnsubscribe(new Request(link('&s=setup')), deps(stopped))
    const back = await handlePreferencesPut(new Request('https://x', { method: 'PUT', body: JSON.stringify({ projectId: P1, enabled: true }) }), deps(stopped, OWNER))
    check('G8: turning the switch back on in settings undoes the narrow stop, so the one switch is the whole truth',
      back.status === 200 && state(stopped)?.onboarding_opt_out === false && state(stopped)?.reminders_enabled === true)

    const runOptedOut = new FakeAdmin({
      projects: [{ id: P1, user_id: OWNER, created_at: before(10 * D), target_domain: 'x.co', is_active: true }],
      project_reminder_state: [{ project_id: P1, user_id: OWNER, reminders_enabled: true, onboarding_opt_out: true, updated_at: before(30 * D) }],
    })
    const outbox: OutgoingOnboarding[] = []
    const runRes = await runOnboardingEmails({
      admin: runOptedOut as unknown as ServiceRoleClient, env: fullEnv, now: () => now,
      owner: async () => ({ email: 'owner@example.com', locale: 'he', firstName: null, shopify: false }),
      send: async (m) => { outbox.push(m); return { ok: true } },
    })
    check('G9: the run itself sends nothing to that owner', runRes.status === 'done' && outbox.length === 0, runRes)

    for (const locale of ['he', 'en'] as const) {
      const d = getDashboardDictionary(locale).reminders.unsubscribePage
      check(`G10: ${locale} has the narrow page\'s own words, and they do not claim everything stopped`,
        d.setupTitle.length > 5 && d.setupBody.length > 30 && d.stopAll.length > 5 && String(d.setupBody) !== String(d.body))
    }

    await withMutant<{ handleUnsubscribe: typeof handleUnsubscribe }, void>(
      'lib/reminders/http.ts', [["if (scope === 'setup') {", 'if (false) {']],
      async (mod) => {
        const broken = scopedWorld()
        await mod.handleUnsubscribe(new Request(link('&s=setup')), deps(broken))
        check('G-MUT: ignoring the scope turns the paid-for reminder off behind the owner\'s back (G3 would fail)',
          (broken.tables.project_reminder_state ?? []).find((r) => r.project_id === P1)?.reminders_enabled === false)
      },
    )
    await withMutant<{ decideOnboardingEmail: typeof decideOnboardingEmail }, void>(
      'lib/onboarding-emails/cadence.ts', [['if (!state.enabled || state.optedOut)', 'if (!state.enabled)']],
      async (mod) => check('G-MUT2: ignoring the stop keeps nudging an owner who asked us not to (G7 would fail)',
        mod.decideOnboardingEmail({ now, facts: facts(), state: st({ optedOut: true }) }).send === true),
    )
  }

  console.log(`\n${pass} passed, ${fail} failed`)
  if (fail > 0) process.exitCode = 1
}

void main()

export {}
