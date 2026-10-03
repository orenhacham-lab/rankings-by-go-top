/**
 * The reminder email for articles waiting for approval (lib/reminders).
 *
 *   A) cadence: 48h, then 5 days, then weekly, at most 3 per batch, never 2 within 72h,
 *      Sun-Thu 09:00 Israel (summer and winter time), stop when nothing waits or switched off
 *   B) the flag: unset / "false" / "1" / "TRUE" send nothing AND read nothing; a missing key,
 *      sender, origin or secret is "not configured"; the run is only ever handed the provider
 *      past every gate
 *   C) the unsubscribe token: signed, bound to project AND owner, constant-time, no secret = no
 *      token, tampering / another project / a changed owner is refused
 *   D) the routes: unsubscribe is public but only the token opens it, idempotent, no redirect;
 *      preferences are owner-only (404 for a stranger)
 *   E) the run: owner filtering, one claim per send, a failed send releases its claim, two ticks
 *      never send twice, a stranger's articles never count
 *   F) the email: both languages, escaped, internal link only, RFC 8058 headers
 *   G) the cron: the reminder step is last, isolated (throwing / hanging cannot reach the cron)
 *
 * Every guard runs against the real code and again against a deliberately broken copy (-MUT).
 * Nothing here talks to Resend or Supabase. Run: npx tsx lib/reminders/__qa__/reminder-emails.qa.ts
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { FakeAdmin } from '@/lib/__qa__/_fake-admin'
import type { ServiceRoleClient } from '@/lib/supabase/admin'
import { decideReminder, inSendWindow, type ReminderState } from '../cadence'
import { makeUnsubscribeToken, verifyUnsubscribeToken } from '../token'
import { buildReminderEmail, safeOrigin } from '../email'
import { reminderGate, runArticleReminders, type OutgoingReminder, type ReminderDeps } from '../run'
import { runIsolatedReminders } from '../isolated'
import { handlePreferencesGet, handlePreferencesPut, handleUnsubscribe, unsubscribeByToken } from '../http'
import { withMutant } from './_mutant'

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
const iso = (d: Date) => d.toISOString()
const before = (now: Date, ms: number) => new Date(now.getTime() - ms).toISOString()

async function main() {
  // ── A) cadence ────────────────────────────────────────────────────────────
  console.log('\nA) Cadence')
  const now = SUN_9
  const oldest = (hoursAgo: number, id = 'art-1') => ({ id, readyAt: before(now, hoursAgo * H) })
  const st = (over: Partial<ReminderState> = {}): ReminderState => ({ batchKey: null, sentCount: 0, lastSentAt: null, enabled: true, ...over })
  const dec = (mod: { decideReminder: typeof decideReminder }, o: ReturnType<typeof oldest> | null, s: ReminderState | null, at = now) => mod.decideReminder({ now: at, oldest: o, state: s })
  const cadenceRules = (mod: { decideReminder: typeof decideReminder }) => {
    const send = (r: ReturnType<typeof decideReminder>) => r.send
    return {
      'A1: not before 48 hours': !send(dec(mod, oldest(47), null)),
      'A2: at 48 hours the first goes': send(dec(mod, oldest(48), null)),
      'A3: the second not before 5 days after the first': !send(dec(mod, oldest(300), st({ batchKey: 'art-1', sentCount: 1, lastSentAt: before(now, 5 * D - H) }))),
      'A4: the second at 5 days': send(dec(mod, oldest(300), st({ batchKey: 'art-1', sentCount: 1, lastSentAt: before(now, 5 * D) }))),
      'A5: the third weekly, not sooner': !send(dec(mod, oldest(600), st({ batchKey: 'art-1', sentCount: 2, lastSentAt: before(now, 6 * D) }))),
      'A6: the third at 7 days': send(dec(mod, oldest(600), st({ batchKey: 'art-1', sentCount: 2, lastSentAt: before(now, 7 * D) }))),
      'A7: never a fourth for the same articles': !send(dec(mod, oldest(900), st({ batchKey: 'art-1', sentCount: 3, lastSentAt: before(now, 30 * D) }))),
      'A8: never two emails within 72 hours, even for a new batch': !send(dec(mod, oldest(100, 'art-9'), st({ batchKey: 'art-1', sentCount: 3, lastSentAt: before(now, 71 * H) }))),
      'A9: a new batch (its oldest article changed) starts its own count after 72h': send(dec(mod, oldest(100, 'art-9'), st({ batchKey: 'art-1', sentCount: 3, lastSentAt: before(now, 73 * H) }))),
      'A10: nothing waiting, nothing sent': !send(dec(mod, null, st({ batchKey: 'art-1', sentCount: 1, lastSentAt: before(now, 6 * D) }))),
      'A11: a switched-off project gets nothing': !send(dec(mod, oldest(500), st({ enabled: false }))),
    } as Record<string, boolean>
  }
  const real = cadenceRules({ decideReminder })
  for (const [k, v] of Object.entries(real)) check(k, v)
  const sendWindow = (d: string) => inSendWindow(new Date(d))
  check('A12: Sunday 09:10 Israel (summer) is in the window', sendWindow('2026-09-27T06:10:00Z'))
  check('A13: Thursday 09:59 Israel is in', sendWindow('2026-10-01T06:59:00Z'))
  check('A14: Friday 09:10 is out', !sendWindow('2026-10-02T06:10:00Z'))
  check('A15: Saturday 09:10 is out', !sendWindow('2026-10-03T06:10:00Z'))
  check('A16: 08:59 and 10:00 are out', !sendWindow('2026-09-27T05:59:00Z') && !sendWindow('2026-09-27T07:00:00Z'))
  check('A17: in winter time (UTC+2) 09:10 is 07:10 UTC, and 06:10 UTC is out', sendWindow('2026-12-06T07:10:00Z') && !sendWindow('2026-12-06T06:10:00Z'))
  const mutCadence = await withMutant<{ decideReminder: typeof decideReminder; inSendWindow: typeof inSendWindow }, boolean>(
    'lib/reminders/cadence.ts',
    [[/MIN_GAP_MS = 72 \* 3_600_000/, 'MIN_GAP_MS = 0'], [/MAX_PER_BATCH = 3/, 'MAX_PER_BATCH = 99'], [/FIRST_AFTER_MS = 48 \* 3_600_000/, 'FIRST_AFTER_MS = 0'], [/\['Sun', 'Mon', 'Tue', 'Wed', 'Thu'\]/, "['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']"]],
    (m) => {
      const r = cadenceRules(m)
      return Object.values(r).some((v) => !v) && m.inSendWindow(new Date('2026-10-02T06:10:00Z'))
    },
  )
  check('A-MUT: a cadence with no 72h gap, no cap, no 48h wait and a Friday window fails the rules above', mutCadence)

  // ── B) the flag and the gates ─────────────────────────────────────────────
  console.log('\nB) The flag: off sends and reads nothing')
  const fullEnv = { REMINDER_EMAILS_ENABLED: 'true', RESEND_API_KEY: 're_test', RESEND_FROM_EMAIL: 'Go Top <hello@mail.example.com>', CRON_SECRET: SECRET, NEXT_PUBLIC_APP_URL: 'https://app.example.com' }
  check('B1: every gate open: go', reminderGate(fullEnv, SUN_9) === 'go')
  for (const v of [undefined, '', 'false', '1', 'TRUE', 'yes', ' true']) {
    check(`B2: REMINDER_EMAILS_ENABLED=${JSON.stringify(v)} is off`, reminderGate({ ...fullEnv, REMINDER_EMAILS_ENABLED: v }, SUN_9) === 'off')
  }
  check('B3: outside the window nothing runs', reminderGate(fullEnv, new Date('2026-10-02T06:10:00Z')) === 'outside_window')
  for (const k of ['RESEND_API_KEY', 'RESEND_FROM_EMAIL', 'CRON_SECRET', 'NEXT_PUBLIC_APP_URL']) {
    check(`B4: without ${k} it is "not configured"`, reminderGate({ ...fullEnv, [k]: undefined }, SUN_9) === 'not_configured')
  }
  check('B5: an http (non-local) origin is not configured', reminderGate({ ...fullEnv, NEXT_PUBLIC_APP_URL: 'http://app.example.com' }, SUN_9) === 'not_configured')

  // A world with one project whose article has waited a week, so a send WOULD happen.
  const world = (over: { articleAge?: number; state?: Record<string, unknown> | null; extraArticles?: Record<string, unknown>[] } = {}) => {
    const readyAt = before(now, (over.articleAge ?? 7 * D))
    return new FakeAdmin({
      projects: [
        { id: P1, user_id: OWNER, target_domain: 'bloom.co.il', business_name: 'Bloom', is_active: true },
        { id: P2, user_id: STRANGER, target_domain: 'other.example', business_name: 'Other', is_active: true },
      ],
      generated_articles: [
        { id: 'art-1', project_id: P1, user_id: OWNER, title: 'How to pick <b>roses</b>', status: 'ready', scheduled_at: null, updated_at: readyAt },
        { id: 'art-2', project_id: P1, user_id: OWNER, title: 'Tulips in spring', status: 'ready', scheduled_at: null, updated_at: before(now, 2 * D) },
        { id: 'art-3', project_id: P1, user_id: OWNER, title: 'Already scheduled', status: 'ready', scheduled_at: '2026-10-05T08:00:00Z', updated_at: readyAt },
        { id: 'art-4', project_id: P1, user_id: OWNER, title: 'A draft', status: 'draft', scheduled_at: null, updated_at: readyAt },
        // A row that says it belongs to the stranger but sits in the owner's project: never counted.
        { id: 'art-5', project_id: P1, user_id: STRANGER, title: 'PLANTED-STRANGER-TITLE', status: 'ready', scheduled_at: null, updated_at: readyAt },
        ...(over.extraArticles ?? []),
      ],
      project_reminder_state: over.state ? [over.state] : [],
    })
  }
  const deps = (admin: FakeAdmin, o: { env?: Record<string, string | undefined>; sent?: OutgoingReminder[]; ok?: boolean; at?: Date; ownerFacts?: Partial<{ email: string | null; locale: 'he' | 'en' | null }> } = {}): ReminderDeps => ({
    admin: admin as unknown as ServiceRoleClient,
    env: o.env ?? fullEnv,
    now: () => o.at ?? now,
    owner: async (id) => (id === OWNER ? { email: 'owner@example.com', locale: 'he', firstName: 'דנה', shopify: false, ...o.ownerFacts } : null),
    send: async (m) => { (o.sent ??= []).push(m); return { ok: o.ok !== false } },
  })
  {
    let touched = 0
    const admin = world()
    const spy = new Proxy(admin, { get: (t, p, r) => { if (p === 'from') touched++; return Reflect.get(t, p, r) } })
    const sent: OutgoingReminder[] = []
    const off = await runArticleReminders({ ...deps(spy as FakeAdmin, { env: { ...fullEnv, REMINDER_EMAILS_ENABLED: undefined }, sent }) })
    check('B6: flag unset: status "off", no table read, nothing sent', off.status === 'off' && touched === 0 && sent.length === 0)
    const ooh = await runArticleReminders({ ...deps(spy as FakeAdmin, { at: new Date('2026-10-02T06:10:00Z'), sent }) })
    check('B7: outside the window: no read, nothing sent', ooh.status === 'outside_window' && touched === 0 && sent.length === 0)
    const on = await runArticleReminders(deps(world(), { sent }))
    check('B8: with everything on, one email is handed to the provider', on.status === 'done' && sent.length === 1, on)
  }
  const offMutant = await withMutant<{ reminderGate: typeof reminderGate }, boolean>(
    'lib/reminders/run.ts', [[/if \(env\[REMINDER_FLAG\] !== 'true'\) return 'off'/, "if (false) return 'off'"]],
    (m) => m.reminderGate({ ...fullEnv, REMINDER_EMAILS_ENABLED: undefined }, SUN_9) === 'go',
  )
  check('B-MUT: a gate that ignores the flag would go, and B2 above would fail', offMutant)
  {
    const src = strip(code('lib/reminders/run.ts'))
    check('B9: the run checks the gate before it builds a query', src.indexOf('reminderGate(deps.env, now)') > 0 && src.indexOf('reminderGate(deps.env, now)') < src.indexOf('admin.from('))
    const live = strip(code('lib/reminders/live.ts'))
    check('B10: the provider is only reached in live.ts, past run.ts', /import\('resend'\)/.test(live) && !/resend/.test(src.replace(/RESEND_[A-Z_]+/g, '')))
    check('B11: the flag is not on in vercel.json or the repo env files', !/REMINDER_EMAILS_ENABLED/.test(code('vercel.json')))
  }

  // ── C) the token ──────────────────────────────────────────────────────────
  console.log('\nC) The unsubscribe token')
  const env = { CRON_SECRET: SECRET }
  const tok = makeUnsubscribeToken(P1, OWNER, env)!
  const tokenRules = (m: { makeUnsubscribeToken: typeof makeUnsubscribeToken; verifyUnsubscribeToken: typeof verifyUnsubscribeToken }) => {
    const t = m.makeUnsubscribeToken(P1, OWNER, env)!
    return {
      'C1: the owner’s token verifies': m.verifyUnsubscribeToken(t, P1, OWNER, env),
      'C2: a bare project id verifies nothing': !m.verifyUnsubscribeToken(P1, P1, OWNER, env),
      'C3: a tampered signature is refused': !m.verifyUnsubscribeToken(t.slice(0, -2) + (t.endsWith('AA') ? 'BB' : 'AA'), P1, OWNER, env),
      'C4: the token of one project does not open another': !m.verifyUnsubscribeToken(t, P2, OWNER, env) && !m.verifyUnsubscribeToken(`${P2}.${t.split('.')[1]}`, P2, OWNER, env),
      'C5: it stops working when the project has another owner': !m.verifyUnsubscribeToken(t, P1, STRANGER, env),
      'C6: no secret configured: none is made and none accepted': m.makeUnsubscribeToken(P1, OWNER, {}) === null && !m.verifyUnsubscribeToken(t, P1, OWNER, {}),
      'C7: another secret does not verify': !m.verifyUnsubscribeToken(t, P1, OWNER, { CRON_SECRET: 'other' }),
    } as Record<string, boolean>
  }
  for (const [k, v] of Object.entries(tokenRules({ makeUnsubscribeToken, verifyUnsubscribeToken }))) check(k, v)
  check('C8: the token is not the raw id and is url-safe', tok.includes('.') && /^[0-9a-f-]{36}\.[A-Za-z0-9_-]{43}$/.test(tok))
  const tokenMut = await withMutant<{ makeUnsubscribeToken: typeof makeUnsubscribeToken; verifyUnsubscribeToken: typeof verifyUnsubscribeToken }, boolean>(
    'lib/reminders/token.ts',
    [[/return got\.length === want\.length && timingSafeEqual\(got, want\)/, 'return true']],
    (m) => Object.values(tokenRules(m)).some((v) => !v),
  )
  check('C-MUT: a verifier that always says yes fails C2-C7', tokenMut)
  const tokenMut2 = await withMutant<{ makeUnsubscribeToken: typeof makeUnsubscribeToken; verifyUnsubscribeToken: typeof verifyUnsubscribeToken }, boolean>(
    'lib/reminders/token.ts',
    [[/\$\{projectId\.toLowerCase\(\)\}:\$\{ownerId\.toLowerCase\(\)\}/, '${projectId.toLowerCase()}']],
    (m) => Object.values(tokenRules(m)).some((v) => !v),
  )
  check('C-MUT2: a signature that leaves the owner out fails C5', tokenMut2)

  // ── D) the routes ─────────────────────────────────────────────────────────
  console.log('\nD) Unsubscribe and preferences routes')
  const routeDeps = (admin: FakeAdmin, user: string | null = null) => ({ userId: async () => user, admin: () => admin as unknown as ServiceRoleClient, now: () => now, env })
  {
    const admin = world()
    const url = (t: string, extra = '') => `https://app.example.com/api/reminders/unsubscribe?t=${encodeURIComponent(t)}${extra}`
    const r1 = await handleUnsubscribe(new Request(url(tok, '&lang=en')), routeDeps(admin))
    const page = await r1.text()
    const row = () => (admin.tables.project_reminder_state ?? []).find((r) => r.project_id === P1)
    check('D1: the link turns reminders off, and says so in the link’s language', r1.status === 200 && row()?.reminders_enabled === false && /You're unsubscribed|You&#39;re unsubscribed/.test(page) && /lang="en" dir="ltr"/.test(page), { s: r1.status })
    const r2 = await handleUnsubscribe(new Request(url(tok, '&lang=en')), routeDeps(admin))
    check('D2: idempotent: a second click is the same answer and one row', r2.status === 200 && (admin.tables.project_reminder_state ?? []).filter((r) => r.project_id === P1).length === 1)
    check('D3: it never redirects', ![301, 302, 303, 307, 308].includes(r1.status) && !r1.headers.get('location') && !/<meta[^>]+refresh/i.test(page))
    const admin2 = world()
    const bad = await handleUnsubscribe(new Request(url(tok.slice(0, -3) + 'xyz')), routeDeps(admin2))
    check('D4: a bad token changes nothing and says the link is not valid', bad.status === 400 && (admin2.tables.project_reminder_state ?? []).length === 0 && (await bad.text()).includes('הקישור לא תקין'))
    const bare = await handleUnsubscribe(new Request(url(P1)), routeDeps(admin2))
    check('D5: the project id alone changes nothing', bare.status === 400 && (admin2.tables.project_reminder_state ?? []).length === 0)
    const post = await handleUnsubscribe(new Request(url(tok), { method: 'POST', body: 'List-Unsubscribe=One-Click', headers: { 'content-type': 'application/x-www-form-urlencoded' } }), routeDeps(world()))
    check('D6: RFC 8058 one-click POST works without a session', post.status === 200)
    const foreign = await unsubscribeByToken(makeUnsubscribeToken(P2, OWNER, env), routeDeps(world()))
    check('D7: a token signed for the wrong owner of a project is refused', foreign === 'invalid')
    const off = await handleUnsubscribe(new Request(url(tok)), routeDeps(new FakeAdmin({ projects: [{ id: P1, user_id: OWNER }] }, { project_reminder_state: { upsert: () => ({ code: '42P01' }) } })))
    check('D8: a missing table is "unavailable", never an error text', off.status === 503 && !/42P01/.test(await off.text()))
    // preferences
    const a3 = world()
    const noSession = await handlePreferencesGet(new Request(`https://x/api/reminders/preferences?projectId=${P1}`), routeDeps(a3, null))
    check('D9: preferences need a session', noSession.status === 401)
    const stranger = await handlePreferencesGet(new Request(`https://x/api/reminders/preferences?projectId=${P1}`), routeDeps(a3, STRANGER))
    const strangerPut = await handlePreferencesPut(new Request('https://x', { method: 'PUT', body: JSON.stringify({ projectId: P1, enabled: false }) }), routeDeps(a3, STRANGER))
    check('D10: a stranger gets 404 (not 403) on read and write, and nothing is written', stranger.status === 404 && strangerPut.status === 404 && (a3.tables.project_reminder_state ?? []).length === 0)
    const own = await handlePreferencesGet(new Request(`https://x/api/reminders/preferences?projectId=${P1}`), routeDeps(a3, OWNER))
    const ownBody = await own.json()
    check('D11: the owner reads "on" by default', own.status === 200 && ownBody.enabled === true && ownBody.available === true)
    const put = await handlePreferencesPut(new Request('https://x', { method: 'PUT', body: JSON.stringify({ projectId: P1, enabled: false }) }), routeDeps(a3, OWNER))
    check('D12: the owner turns it off', put.status === 200 && (a3.tables.project_reminder_state ?? [])[0]?.reminders_enabled === false)
    const junk = await handlePreferencesPut(new Request('https://x', { method: 'PUT', body: JSON.stringify({ projectId: P1, enabled: 'no' }) }), routeDeps(a3, OWNER))
    check('D13: a non-boolean is refused', junk.status === 400)
    const mutRoutes = await withMutant<{ handlePreferencesGet: typeof handlePreferencesGet }, boolean>(
      'lib/reminders/http.ts', [[".eq('id', projectId).eq('user_id', userId).maybeSingle()", ".eq('id', projectId).maybeSingle()"], ['return !error && !!row && row.user_id === userId', 'return !error && !!row']],
      async (m) => (await m.handlePreferencesGet(new Request(`https://x/api/reminders/preferences?projectId=${P1}`), routeDeps(world(), STRANGER))).status === 200,
    )
    check('D-MUT: dropping the owner filter lets a stranger read the switch (D10 would fail)', mutRoutes)
    const routeSrc = strip(code('app/api/reminders/unsubscribe/route.ts'))
    check('D14: the unsubscribe route authenticates through its token only and has no redirect', /handleUnsubscribe/.test(routeSrc) && !/redirect|NextResponse/.test(routeSrc + strip(code('lib/reminders/http.ts'))))
  }

  // ── E) the run ────────────────────────────────────────────────────────────
  console.log('\nE) The run')
  {
    const sent: OutgoingReminder[] = []
    const admin = world()
    const r = await runArticleReminders(deps(admin, { sent }))
    const st1 = (admin.tables.project_reminder_state ?? [])[0]
    check('E1: one email to the owner of the project that waits', r.status === 'done' && sent.length === 1 && sent[0].to === 'owner@example.com', r)
    check('E2: it lists this owner’s waiting articles only (2), none scheduled, drafted or planted', sent[0].email.text.includes('Tulips in spring') && !/scheduled|A draft|PLANTED/.test(sent[0].email.text) && /2 מאמרים/.test(sent[0].email.subject))
    check('E3: the sent-log holds the batch, count 1, and the time', st1?.batch_key === 'art-1' && st1?.sent_count === 1 && st1?.last_sent_at === iso(now) && st1?.user_id === OWNER)
    const again = await runArticleReminders(deps(admin, { sent, at: new Date(now.getTime() + 15 * 60_000) }))
    check('E4: the next 15-minute tick sends nothing (72h gap)', again.status === 'done' && sent.length === 1)
    const failing: OutgoingReminder[] = []
    const a2 = world()
    const failed = await runArticleReminders(deps(a2, { sent: failing, ok: false }))
    check('E5: a refused send releases its claim so the next tick may retry', failed.status === 'done' && failed.failed === 1 && !(a2.tables.project_reminder_state ?? []).some((r) => r.sent_count === 1 && r.last_sent_at))
    const throwing = await runArticleReminders({ ...deps(world()), send: async () => { throw new Error('provider exploded: secret-text') } })
    check('E6: a throwing provider is a failed count, not an exception', throwing.status === 'done' && (throwing as { failed: number }).failed === 1)
    // a lost claim (someone wrote the row between read and claim) sends nothing
    const racing = world({ state: { project_id: P1, user_id: OWNER, reminders_enabled: true, batch_key: null, sent_count: 0, last_sent_at: null, updated_at: '2026-09-01T00:00:00.000Z' } })
    const rSent: OutgoingReminder[] = []
    const racingDeps = deps(racing, { sent: rSent })
    const origOwner = racingDeps.owner
    racingDeps.owner = async (id) => { const t = racing.tables.project_reminder_state[0]; t.updated_at = '2026-09-27T06:09:00.000Z'; return origOwner(id) }
    const lost = await runArticleReminders(racingDeps)
    check('E7: a row changed since it was read (a second tick, an unsubscribe): no email', lost.status === 'done' && rSent.length === 0)
    const switchedOff = await runArticleReminders(deps(world({ state: { project_id: P1, user_id: OWNER, reminders_enabled: false, batch_key: null, sent_count: 0, last_sent_at: null, updated_at: '2026-09-01T00:00:00.000Z' } }), { sent: rSent }))
    check('E8: an unsubscribed project is never mailed', switchedOff.status === 'done' && rSent.length === 0)
    const youngSent: OutgoingReminder[] = []
    const aYoung = world()
    aYoung.tables.generated_articles = [{ id: 'y1', project_id: P1, user_id: OWNER, title: 'Young', status: 'ready', scheduled_at: null, updated_at: before(now, 47 * H) }]
    const young = await runArticleReminders(deps(aYoung, { sent: youngSent }))
    check('E9: articles that waited under 48 hours are not mailed', young.status === 'done' && youngSent.length === 0)
    const strangerSent: OutgoingReminder[] = []
    const a4 = world()
    a4.tables.generated_articles = [{ id: 'x1', project_id: P1, user_id: STRANGER, title: 'PLANTED', status: 'ready', scheduled_at: null, updated_at: before(now, 9 * D) }]
    await runArticleReminders(deps(a4, { sent: strangerSent }))
    check('E10: an article whose owner is not the project’s owner never triggers or fills an email', strangerSent.length === 0)
    const noEmailSent: OutgoingReminder[] = []
    const noEmail = await runArticleReminders(deps(world(), { sent: noEmailSent, ownerFacts: { email: null } }))
    check('E11: an owner without a readable address is skipped', noEmail.status === 'done' && noEmailSent.length === 0)
    const en: OutgoingReminder[] = []
    await runArticleReminders(deps(world(), { sent: en, ownerFacts: { locale: 'en' } }))
    check('E12: the owner’s dashboard language decides the email', /articles are waiting for your OK on bloom\.co\.il/.test(en[0].email.subject))
    const niSent: OutgoingReminder[] = []
    const notInstalled = await runArticleReminders(deps(new FakeAdmin({ projects: [{ id: P1, user_id: OWNER, target_domain: 'a.co', is_active: true }], generated_articles: [{ id: 'a', project_id: P1, user_id: OWNER, title: 't', status: 'ready', scheduled_at: null, updated_at: before(now, 9 * D) }] }, { project_reminder_state: { select: () => ({ code: '42P01' }) } }), { sent: niSent }))
    check('E13: the sent-log table not installed yet: nothing is sent', notInstalled.status === 'not_installed' && niSent.length === 0)
    const ownerMut = await withMutant<{ runArticleReminders: typeof runArticleReminders }, boolean>(
      'lib/reminders/run.ts', [[".eq('project_id', projectId).eq('user_id', ownerId)\n        .eq('status', 'ready')", ".eq('project_id', projectId)\n        .eq('status', 'ready')"]],
      async (m) => { const s: OutgoingReminder[] = []; await m.runArticleReminders(deps(world(), { sent: s })); return s.some((x) => x.email.text.includes('PLANTED-STRANGER-TITLE')) },
    )
    check('E-MUT: dropping the owner filter puts a stranger’s title in the email (E2 would fail)', ownerMut)
    const claimMut = await withMutant<{ runArticleReminders: typeof runArticleReminders }, boolean>(
      'lib/reminders/run.ts', [[/if \(!won\) continue/, 'void won']],
      async (m) => { const s: OutgoingReminder[] = []; const racing2 = world({ state: { project_id: P1, user_id: OWNER, reminders_enabled: true, batch_key: null, sent_count: 0, last_sent_at: null, updated_at: '2026-09-01T00:00:00.000Z' } }); const d = deps(racing2, { sent: s }); const o = d.owner; d.owner = async (id) => { racing2.tables.project_reminder_state[0].updated_at = 'x'; return o(id) }; await m.runArticleReminders(d); return s.length === 1 },
    )
    check('E-MUT2: ignoring a lost claim would send anyway (E7 would fail)', claimMut)
  }

  // ── F) the email ──────────────────────────────────────────────────────────
  console.log('\nF) The email')
  {
    const base = { firstName: 'דנה', domain: 'bloom.co.il', titles: ['How to pick <b>roses</b>', 'Tulips', 'Peonies', 'Fourth'], total: 6, origin: 'https://app.example.com', token: tok }
    const he = buildReminderEmail({ ...base, locale: 'he' })
    check('F1: Hebrew subject', he.subject === '6 מאמרים מחכים לאישור שלכם ב-bloom.co.il')
    check('F2: Hebrew is right-to-left with the exact copy', /dir="rtl"/.test(he.html) && he.html.includes('שלום דנה,') && he.html.includes('כתבנו 6 מאמרים חדשים לאתר bloom.co.il, והם מחכים רק לאישור שלכם:') && he.html.includes('אחרי האישור הם יעלו לאתר בתאריכים שבתוכנית. עד שתאשרו, שום דבר לא מתפרסם.') && he.html.includes('לאישור המאמרים') && he.html.includes('054-9489377') && he.html.includes('צוות Go Top') && he.html.includes('Go Top SEO · oren@gotop.co.il'))
    check('F3: three titles and "(ועוד 3)"; the fourth title is not listed', he.html.includes('(ועוד 3)') && !he.html.includes('Fourth'))
    check('F4: a title is escaped', !he.html.includes('<b>roses</b>') && he.html.includes('&lt;b&gt;roses&lt;/b&gt;'))
    check('F5: singular subject', buildReminderEmail({ ...base, locale: 'he', titles: ['A'], total: 1 }).subject === 'מאמר אחד מחכה לאישור שלכם ב-bloom.co.il')
    const en = buildReminderEmail({ ...base, locale: 'en', firstName: null })
    check('F6: English subject, copy, and no name', en.subject === '6 articles are waiting for your OK on bloom.co.il' && /dir="ltr"/.test(en.html) && en.html.includes('Hi,') && en.html.includes('We wrote 6 new articles for bloom.co.il, and they only need your OK:') && en.html.includes('(and 3 more)') && en.html.includes('Review articles') && en.html.includes('+972 54-948-9377') && en.html.includes('The Go Top SEO team'))
    check('F7: English singular subject', buildReminderEmail({ ...base, locale: 'en', titles: ['A'], total: 1 }).subject === '1 article is waiting for your OK on bloom.co.il')
    check('F8: the button is the app login with an internal next; English carries lang', he.reviewUrl === 'https://app.example.com/login?next=%2Fcontent%3Fstatus%3Dready' && en.reviewUrl.endsWith('&lang=en'))
    const hrefs = [...he.html.matchAll(/href="([^"]+)"/g)].map((m) => m[1].replace(/&amp;/g, '&'))
    check('F9: every link is on the app origin, none external', hrefs.length === 2 && hrefs.every((h) => h.startsWith('https://app.example.com/')))
    check('F10: RFC 8058 headers', he.headers['List-Unsubscribe'] === `<${he.unsubscribeUrl}>` && he.headers['List-Unsubscribe-Post'] === 'List-Unsubscribe=One-Click' && he.unsubscribeUrl.includes('/api/reminders/unsubscribe?t='))
    check('F11: the unsubscribe link is in the footer and the preheader is set', he.html.includes('הסרה בלחיצה אחת, בלי להתחבר') && he.html.includes('כמה דקות של קריאה, ולחיצה אחת כדי שיעלו לאתר.'))
    check('F12: plain-text part carries both links', he.text.includes(he.reviewUrl) && he.text.includes(he.unsubscribeUrl))
    check('F13: an origin must be https (or local) and bare', safeOrigin('https://app.example.com/path?x=1') === 'https://app.example.com' && safeOrigin('javascript:alert(1)') === null && safeOrigin('http://evil.example') === null && safeOrigin('https://u:p@x.com') === null && safeOrigin('http://localhost:3000') === 'http://localhost:3000')
    const escMut = await withMutant<{ buildReminderEmail: typeof buildReminderEmail }, boolean>(
      'lib/reminders/email.ts', [[/const e = escapeEmailHtml/, 'const e = (v: unknown) => String(v)']],
      (m) => m.buildReminderEmail({ ...base, locale: 'he' }).html.includes('<b>roses</b>'),
    )
    check('F-MUT: an email that does not escape titles fails F4', escMut)
  }

  // ── G) the cron hook ──────────────────────────────────────────────────────
  console.log('\nG) The cron hook is last and isolated')
  {
    let called = 0
    const offRun = await runIsolatedReminders(async () => { called++; return { status: 'done', considered: 0, sent: 0, failed: 0 } }, { env: { ...fullEnv, REMINDER_EMAILS_ENABLED: undefined }, now: () => now })
    check('G1: with the flag off the run is not even called', called === 0 && offRun.status === 'off')
    const thrown = await runIsolatedReminders(async () => { throw new Error('boom') }, { env: fullEnv, now: () => now })
    check('G2: a throwing run resolves as an error and never rejects', thrown.status === 'error')
    const hung = await runIsolatedReminders(() => new Promise(() => undefined), { env: fullEnv, now: () => now, capMs: 30 })
    check('G3: a hanging run is abandoned at its time cap', hung.status === 'time_cap')
    const route = strip(code('app/api/content/automation/cron/route.ts'))
    const iRunner = route.indexOf('runAutomation('), iSeed = route.indexOf('startIsolatedSeedResume('), iRem = route.indexOf('runIsolatedReminders()')
    check('G4: the reminder step comes after the runner and the seed resume, inside the same after()', iRunner > 0 && iSeed > iRunner && iRem > iSeed && route.indexOf('return Response.json({ ok: true, accepted: true') > iRem)
    check('G5: the route still authenticates first and answers 202 before any work', route.indexOf('authorizeCronRequest(request') > 0 && route.indexOf('authorizeCronRequest(request') < route.indexOf('after(') && /status: 202/.test(route))
    const mutHook = await withMutant<{ runIsolatedReminders: typeof runIsolatedReminders }, boolean>(
      'lib/reminders/isolated.ts', [[/  \} catch \{\n    console\.error\('\[reminders\] failed', \{ reason: 'threw' \}\)\n    return \{ status: 'error' \}\n  \}/, "  } catch (e) {\n    throw e\n  }"]],
      async (m) => { try { await m.runIsolatedReminders(async () => { throw new Error('boom') }, { env: fullEnv, now: () => now }); return false } catch { return true } },
    )
    check('G-MUT: a hook that rethrows would reach the cron (G2 would fail)', mutHook)
  }

  console.log(`\n${pass} passed, ${fail} failed`)
  if (fail > 0) process.exit(1)
}
main().catch((e) => { console.error(e); process.exit(1) })
export {}
