/**
 * Operator alerts (lib/notifications/*): who signed up and which site they scanned.
 *
 *  1. the signup email carries the site and how the account was opened, for the
 *     free-check claim, the signup form and the first project; it is sent after
 *     the client step, through every door (callback + Google direct);
 *  2. one email per completed pre-sign-up scan, once per domain per 24h, after the
 *     response, never failing the scan;
 *  3. one email when a non-admin user adds a site, not for admins and not for the
 *     claim's own project;
 *  and for all of them: the kill switch, escaping, the operator as the only recipient.
 * Every guard has a mutation control.
 *
 * Run: npx tsx lib/notifications/__qa__/operator-alerts.qa.ts
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { readFileSync } from 'fs'
import { join } from 'path'
import { FakeAdmin } from '../../__qa__/_fake-admin'
import { hashClaimToken } from '../../free-check/claim'
import {
  buildFreeCheckAlertHtml, buildProjectAddedAlertHtml, deliverOperatorEmail, notifyFreeCheckCompleted, notifyProjectAdded,
  notifyReportRequested, safeDomain, type OperatorMessage,
} from '../operator-alerts'
import { buildSignupNotificationHtml, sendSignupNotification } from '../signup-email'
import { resolveSignupSite } from '../signup-site'
import { runAfterResponse } from '../after-response'

let pass = 0, fail = 0
function check(name: string, cond: boolean, detail?: string) {
  if (cond) { pass++; console.log(`  ✓ ${name}`) } else { fail++; console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`) }
}
const ROOT = join(__dirname, '..', '..', '..')
const read = (rel: string) => readFileSync(join(ROOT, rel), 'utf8')
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/.*$/gm, '$1')

const NOW = new Date('2026-10-02T09:00:00.000Z')
const ENV = { RESEND_API_KEY: 're_test_stub', ADMIN_NOTIFICATION_EMAIL: 'owner@example.com' }
const hoursAgo = (h: number) => new Date(NOW.getTime() - h * 3600_000).toISOString()

function inbox(env: Record<string, string | undefined> = ENV, failing = false) {
  const sent: OperatorMessage[] = []
  return {
    sent,
    deps: {
      env, now: () => NOW,
      send: async (m: OperatorMessage) => { if (failing) throw new Error('boom'); sent.push(m); return { ok: true } },
    },
  }
}

const TOKEN = 'a'.repeat(64)
function claimTables(domain = 'shop.example.co.il') {
  return {
    free_site_checks: [{ id: 'chk-claim', domain, url: `https://${domain}/`, locale: 'he', created_at: hoursAgo(1) }],
    free_site_check_claims: [{ token_hash: hashClaimToken(TOKEN), check_id: 'chk-claim', consumed_at: null, created_at: hoursAgo(1) }],
    projects: [] as any[],
  }
}
const freshGoogle = { id: 'u1', email: 'dana@gmail.com', created_at: hoursAgo(0.05), app_metadata: { provider: 'google', providers: ['google'] }, user_metadata: { full_name: 'Dana Levi' } } as any
const freshEmail = { id: 'u2', email: 'ron@corp.co.il', created_at: hoursAgo(0.05), app_metadata: { provider: 'email', providers: ['email'] }, user_metadata: { full_name: 'Ron', company_name: 'Corp', phone: '0501234567' } } as any

async function main() {
  console.log('1. Signup email: the site and how they signed up')
  {
    const admin = new FakeAdmin(claimTables()) as any
    const site = await resolveSignupSite({ user: freshGoogle, claimCookie: TOKEN, admin, now: NOW })
    check('claim cookie -> the scanned domain, source claim', site.domain === 'shop.example.co.il' && site.source === 'claim', JSON.stringify(site))
    const g = inbox()
    const r = await sendSignupNotification(freshGoogle, site, g.deps)
    check('Google sign-up with a claim: email carries the domain and "Google"', r.sent && g.sent[0].html.includes('shop.example.co.il') && g.sent[0].html.includes('Google'))
    check('subject is Hebrew and carries the domain', /^חשבון חדש נפתח: shop\.example\.co\.il/.test(g.sent[0].subject), g.sent[0].subject)
    check('RTL, same style as before', g.sent[0].html.includes('dir="rtl"') && g.sent[0].html.includes('חשבון חדש נפתח ב-Go Top SEO'))

    const e = inbox()
    await sendSignupNotification(freshEmail, { domain: 'corp.co.il', source: 'signup_form' }, e.deps)
    check('email sign-up: "דוא״ל וסיסמה" and the site', e.sent[0].html.includes('דוא״ל וסיסמה') && e.sent[0].html.includes('corp.co.il') && !e.sent[0].html.includes('>Google<'))

    const noSite = buildSignupNotificationHtml(freshGoogle, NOW)
    check('no site known: says so instead of an empty value', noSite.includes('לא ידוע עדיין'))

    const form = await resolveSignupSite({ user: { id: 'u3', user_metadata: { website: 'https://www.Acme.com/path?x=1' } }, claimCookie: undefined, admin: new FakeAdmin({ projects: [] }) as any })
    check('no claim: the signup form website', form.domain === 'acme.com' && form.source === 'signup_form', JSON.stringify(form))
    const proj = await resolveSignupSite({ user: { id: 'u4', user_metadata: {} }, claimCookie: undefined, admin: new FakeAdmin({ projects: [{ user_id: 'u4', target_domain: 'first.io', created_at: hoursAgo(2) }, { user_id: 'u9', target_domain: 'other.io', created_at: hoursAgo(5) }] }) as any })
    check('no claim, no form: the account\'s own first project (owner-filtered)', proj.domain === 'first.io' && proj.source === 'first_project', JSON.stringify(proj))
    const bad = await resolveSignupSite({ user: { id: 'u5', user_metadata: {} }, claimCookie: 'not-a-token', admin: new FakeAdmin({}) as any })
    check('a malformed claim cookie is ignored', bad.domain === null)
    const spent = claimTables(); spent.free_site_check_claims[0].consumed_at = hoursAgo(0.5) as any
    const sp = await resolveSignupSite({ user: { id: 'u6', user_metadata: {} }, claimCookie: TOKEN, admin: new FakeAdmin(spent) as any, now: NOW })
    check('a spent claim does not name a site', sp.domain === null)

    const old = { ...freshGoogle, created_at: hoursAgo(3) }
    const o = inbox()
    check('an old account is not announced again', !(await sendSignupNotification(old, site, o.deps)).sent && o.sent.length === 0)

    const cb = strip(read('app/api/auth/callback/route.ts'))
    const body = cb.slice(cb.indexOf('async function signedIn'), cb.indexOf('function supabaseFor'))
    const order = (src: string) => [src.indexOf('ensureDefaultClient(supabase'), src.indexOf('resolveSignupSite('), src.indexOf('sendSignupNotification(')]
    const ordered = (src: string) => { const [a, b, c] = order(src); return a > -1 && a < b && b < c }
    check('callback: signup email is sent after the client step and the site lookup', ordered(body))
    check('callback: still wrapped so an email failure never fails the sign-in', /try\s*\{[\s\S]*sendSignupNotification\([\s\S]*\}\s*catch/.test(body))
    check('callback: email-confirmation, Supabase OAuth and Google direct all end in signedIn', (cb.match(/return signedIn\(/g) ?? []).length >= 2)
    check('mutation control: a send placed before the client step fails the order guard', !ordered('await sendSignupNotification(user, site)\n' + body))
    check('mutation control: a builder that drops the site fails the domain check', !buildSignupNotificationHtml(freshGoogle, NOW).includes('shop.example.co.il'))
  }

  console.log('2. Free check: one email per domain per 24h, never blocks the scan')
  {
    const result = { counters: { geoPassed: 4, geoTotal: 7 }, findings: [{}, {}, {}] }
    const rows = () => ({ free_site_checks: [{ id: 'new', domain: 'shop.example.co.il', created_at: NOW.toISOString() }], free_check_report_requests: [] as any[] })
    const a = inbox()
    const r1 = await notifyFreeCheckCompleted({ admin: new FakeAdmin(rows()) as any, checkId: 'new', domain: 'shop.example.co.il', locale: 'he', result }, a.deps)
    check('first scan of a domain -> one email', r1.sent && a.sent.length === 1)
    const m = a.sent[0]
    check('email: domain, Jerusalem time, language, score', m.html.includes('shop.example.co.il') && m.html.includes('עברית') && m.html.includes('4 מתוך 7') && /\d{1,2}[./]\d{1,2}[./]\d{4}/.test(m.html) && /12:00/.test(m.html), m.html.slice(0, 400))
    check('email: no report address when the visitor gave none', !m.html.includes('דוא״ל לשליחת הדוח'))
    check('subject: Hebrew with the domain', m.subject === 'נסרק אתר בבדיקה החינמית: shop.example.co.il', m.subject)

    const withEmail = rows(); withEmail.free_check_report_requests.push({ check_id: 'new', email: 'visitor@mail.com' })
    const b = inbox()
    await notifyFreeCheckCompleted({ admin: new FakeAdmin(withEmail) as any, checkId: 'new', domain: 'shop.example.co.il', locale: 'en', result }, b.deps)
    check('visitor gave an address with consent -> shown, with the marketing consent', b.sent[0].html.includes('visitor@mail.com') && b.sent[0].html.includes('אישר/ה דיוור שיווקי') && b.sent[0].html.includes('English'))

    const within = rows(); within.free_site_checks.push({ id: 'earlier', domain: 'shop.example.co.il', created_at: hoursAgo(10) })
    const c = inbox()
    const r3 = await notifyFreeCheckCompleted({ admin: new FakeAdmin(within) as any, checkId: 'new', domain: 'shop.example.co.il', locale: 'he', result }, c.deps)
    check('a scan of the same domain 10h earlier -> no second email', !r3.sent && c.sent.length === 0)
    const outside = rows(); outside.free_site_checks.push({ id: 'old', domain: 'shop.example.co.il', created_at: hoursAgo(25) })
    const d = inbox()
    check('the earlier scan was 25h ago -> email again', (await notifyFreeCheckCompleted({ admin: new FakeAdmin(outside) as any, checkId: 'new', domain: 'shop.example.co.il', locale: 'he', result }, d.deps)).sent)
    const other = rows(); other.free_site_checks.push({ id: 'x', domain: 'another.com', created_at: hoursAgo(1) })
    const e = inbox()
    check('another domain scanned recently does not suppress this one', (await notifyFreeCheckCompleted({ admin: new FakeAdmin(other) as any, checkId: 'new', domain: 'shop.example.co.il', locale: 'he', result }, e.deps)).sent)
    const unreadable = new FakeAdmin(rows(), { free_site_checks: { select: () => ({ code: '500' }) } }) as any
    const f = inbox()
    check('ledger unreadable -> no email (fails closed, never spams)', !(await notifyFreeCheckCompleted({ admin: unreadable, checkId: 'new', domain: 'shop.example.co.il', locale: 'he', result }, f.deps)).sent && f.sent.length === 0)
    // mutation control: a ledger that hides the earlier row lets a second email through
    const hidden = rows(); hidden.free_site_checks.push({ id: 'earlier', domain: 'shop.example.co.il', created_at: hoursAgo(10) })
    hidden.free_site_checks[1].domain = 'hidden.example'
    const g = inbox()
    check('mutation control: with the earlier row hidden, the dedupe guard (above) would fail', (await notifyFreeCheckCompleted({ admin: new FakeAdmin(hidden) as any, checkId: 'new', domain: 'shop.example.co.il', locale: 'he', result }, g.deps)).sent)

    const failing = inbox(ENV, true)
    let threw = false
    try { await notifyFreeCheckCompleted({ admin: new FakeAdmin(rows()) as any, checkId: 'new', domain: 'shop.example.co.il', locale: 'he', result }, failing.deps) } catch { threw = true }
    check('a failing mail provider never throws out of the alert', !threw)
    let afterThrew = false
    try { runAfterResponse(async () => { throw new Error('x') }); await new Promise((r) => setTimeout(r, 20)) } catch { afterThrew = true }
    check('runAfterResponse swallows a failing job', !afterThrew)

    const rep = inbox()
    await notifyReportRequested({ admin: new FakeAdmin({ free_site_checks: [{ id: 'new', domain: 'shop.example.co.il' }] }) as any, checkId: 'new', email: 'v@mail.com', locale: 'he' }, rep.deps)
    check('report request -> email to the operator with address, consent and domain', rep.sent[0].html.includes('v@mail.com') && rep.sent[0].html.includes('shop.example.co.il') && rep.sent[0].html.includes('אישר/ה דיוור שיווקי'))

    const route = strip(read('app/api/free-check/route.ts'))
    const routeGuard = (src: string) => /runAfterResponse\(\(\) => notifyFreeCheckCompleted\(/.test(src) && !/await notifyFreeCheckCompleted/.test(src) && src.indexOf('recordRun(') < src.indexOf('notifyFreeCheckCompleted(')
    check('route: the alert runs through runAfterResponse (not awaited), after the ledger write', routeGuard(route))
    check('mutation control: an awaited alert fails the route guard', !routeGuard(route.replace('runAfterResponse(() => notifyFreeCheckCompleted(', 'await notifyFreeCheckCompleted(')))
    const research = strip(read('app/api/free-check/research/route.ts')) + strip(read('lib/presignup/http.ts'))
    check('research: alert wired through afterRecorded (fire and forget, try/catch)', /afterRecorded: \(/.test(research) && /try \{\s*deps\.afterRecorded\?\.\(/.test(research))
  }

  console.log('3. A user adds a site')
  {
    const user = { id: 'u7', email: 'noa@biz.co.il', user_metadata: { full_name: 'Noa Katz' } }
    const ent = { plan: 'starter', trialActive: true, trialEndsAt: '2026-10-09T00:00:00Z', hasActiveSubscription: false }
    const a = inbox()
    const r = await notifyProjectAdded({ user, isAdmin: false, domain: 'newsite.com', claimDomain: null, entitlement: ent }, a.deps)
    check('non-admin adds a site -> email', r.sent && a.sent.length === 1)
    const h = a.sent[0].html
    check('email: name, email, domain, plan + trial, time', h.includes('Noa Katz') && h.includes('noa@biz.co.il') && h.includes('newsite.com') && h.includes('starter') && h.includes('תקופת ניסיון') && h.includes('12:00'))
    check('subject: Hebrew with the domain', a.sent[0].subject === 'משתמש הוסיף אתר: newsite.com', a.sent[0].subject)
    const adm = inbox()
    check('administrator -> skipped', !(await notifyProjectAdded({ user, isAdmin: true, domain: 'newsite.com', entitlement: ent }, adm.deps)).sent && adm.sent.length === 0)
    const cl = inbox()
    check('the project made from the sign-up claim -> skipped (the signup email covers it)', !(await notifyProjectAdded({ user, isAdmin: false, domain: 'www.Shop.example.co.il', claimDomain: 'shop.example.co.il', entitlement: ent }, cl.deps)).sent)
    const other = inbox()
    check('a different site while a claim cookie lingers -> still sent', (await notifyProjectAdded({ user, isAdmin: false, domain: 'second.com', claimDomain: 'shop.example.co.il', entitlement: ent }, other.deps)).sent)
    check('mutation control: ignoring isAdmin would email for an admin (the guard above would fail)', buildProjectAddedAlertHtml({ name: 'x', email: 'a@b.co', domain: 'a.com', plan: 'pro', trialActive: false, trialEndsAt: null, hasActiveSubscription: true, when: NOW }).includes('מנוי פעיל'))

    const create = strip(read('app/api/projects/create/route.ts'))
    const createGuard = (src: string) =>
      src.indexOf('.insert(data)') > -1 && src.indexOf('.insert(data)') < src.indexOf('runAfterResponse(') &&
      /isAdminUser\(admin, user\.id\)/.test(src) && /peekSeedClaim\(/.test(src) && /notifyProjectAdded\(\{[^}]*claimDomain/.test(src) && !/await notifyProjectAdded/.test(src.replace(/runAfterResponse\(async \(\) => \{[\s\S]*?\n    \}\)/, ''))
    check('create route: alert after the insert, after the response, with the admin check and the claim peek', createGuard(create))
    check('mutation control: dropping the admin check fails the create guard', !createGuard(create.replace('isAdminUser(admin, user.id)', 'false')))
    check('mutation control: an alert before the insert fails the create guard', !createGuard('runAfterResponse(' + create))
  }

  console.log('4. Kill switch, escaping, recipient')
  {
    for (const [label, send] of [
      ['signup', (d: any) => sendSignupNotification(freshGoogle, { domain: 'a.com', source: 'claim' }, d)],
      ['free check', (d: any) => notifyFreeCheckCompleted({ admin: new FakeAdmin({ free_site_checks: [{ id: 'n', domain: 'a.com', created_at: NOW.toISOString() }] }) as any, checkId: 'n', domain: 'a.com', locale: 'he' }, d)],
      ['project', (d: any) => notifyProjectAdded({ user: { id: 'u' }, isAdmin: false, domain: 'a.com', entitlement: {} }, d)],
      ['report', (d: any) => notifyReportRequested({ admin: new FakeAdmin({}) as any, checkId: 'n', email: 'v@m.co', locale: 'he' }, d)],
    ] as const) {
      const on = inbox(); await send(on.deps)
      const off = inbox({ ...ENV, OPERATOR_ALERTS_DISABLED: 'true' }); await send(off.deps)
      const offCase = inbox({ ...ENV, OPERATOR_ALERTS_DISABLED: ' TRUE ' }); await send(offCase.deps)
      check(`${label}: on by default, silent with OPERATOR_ALERTS_DISABLED=true`, on.sent.length === 1 && off.sent.length === 0 && offCase.sent.length === 0)
    }
    const noKey = inbox({ ADMIN_NOTIFICATION_EMAIL: 'owner@example.com' })
    check('no Resend key -> nothing is sent, nothing thrown', (await deliverOperatorEmail({ subject: 's', html: 'h' }, noKey.deps)).sent === false)
    const notTrue = inbox({ ...ENV, OPERATOR_ALERTS_DISABLED: 'false' }); await deliverOperatorEmail({ subject: 's', html: 'h' }, notTrue.deps)
    check('mutation control: any value other than "true" leaves alerts on', notTrue.sent.length === 1)

    const evil = '<img src=x onerror=alert(1)>"\'&'
    const html = [
      buildSignupNotificationHtml({ email: evil, user_metadata: { full_name: evil, company_name: evil, phone: evil } }, NOW, { domain: evil, source: 'claim' }),
      buildFreeCheckAlertHtml({ domain: evil, locale: evil, when: NOW, reportEmail: evil, consentedMarketing: true, geoPassed: 1, geoTotal: 2, findings: 1 }),
      buildProjectAddedAlertHtml({ name: evil, email: evil, domain: evil, plan: evil, trialActive: true, trialEndsAt: evil, hasActiveSubscription: false, when: NOW }),
    ].join('')
    check('escaping: hostile values never appear as markup in any email', !/<img/i.test(html) && !html.includes('onerror=alert(1)>') && html.includes('&lt;img'))
    check('escaping: a hostile domain is rejected outright (not a bare host)', safeDomain(evil) === null && safeDomain('exa mple.com') === null && safeDomain('a.com/../x') === 'a.com')
    const raw = '<b>'.repeat(300)
    check('values are truncated', !buildFreeCheckAlertHtml({ domain: 'a.com', locale: 'he', when: NOW, reportEmail: raw }).includes(raw.slice(0, 900)))
    check('mutation control: an unescaped template would fail the escaping guard', /<img/i.test(`<p>${evil}</p>`))

    const subjects = inbox(); await sendSignupNotification(freshGoogle, { domain: 'ok.com\r\nBcc: x@y.z', source: 'claim' }, subjects.deps)
    check('a subject can never carry a header injection', !/[\r\n]/.test(subjects.sent[0].subject) && !subjects.sent[0].subject.includes('Bcc'))

    const src = strip(read('lib/notifications/operator-alerts.ts'))
    const recipientGuard = (code: string) => /to: operatorRecipient\(env\)/.test(code) && !/\bto: (?!string\b|operatorRecipient\(env\))/.test(code)
    check('recipient: the only `to:` set is the operator address', recipientGuard(src))
    const m = inbox({ ...ENV }); await notifyProjectAdded({ user: { id: 'u', email: 'customer@shop.com' }, isAdmin: false, domain: 'a.com', entitlement: {} }, m.deps)
    check('recipient: the customer address is never the recipient', m.sent[0].to === 'owner@example.com' && !JSON.stringify({ to: m.sent[0].to }).includes('customer@'))
    const dflt = inbox({ RESEND_API_KEY: 'k' }); await deliverOperatorEmail({ subject: 's', html: 'h' }, dflt.deps)
    check('recipient: default is orenhacham@gmail.com', dflt.sent[0].to === 'orenhacham@gmail.com')
    check('mutation control: a recipient taken from data fails the recipient guard', !recipientGuard(src.replace('to: operatorRecipient(env)', 'to: content.subject')))
    check('signup email no longer talks to Resend directly', !/new Resend|emails\.send/.test(strip(read('lib/notifications/signup-email.ts'))))
  }

  console.log(`\n${pass} passed, ${fail} failed`)
  process.exit(fail ? 1 : 0)
}
main()

export {}
