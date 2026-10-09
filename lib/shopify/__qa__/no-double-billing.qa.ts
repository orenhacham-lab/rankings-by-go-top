/**
 * No double billing: PayPal and Shopify can never both bill one account
 * (owner decision, 9 Oct 2026).
 *
 *   A) An account with ANY Shopify store connected (any status, the account's
 *      own row or one on any of its projects) cannot start a PayPal
 *      subscription; admins and accounts without Shopify are unaffected.
 *      Fails closed on an unreadable lookup.
 *   B) A PayPal subscriber who connects a store keeps the period already paid
 *      for: a Shopify plan confirmation inside that period moves nothing and
 *      never contacts PayPal; after it, the migration completes as before.
 *   C) PayPal auto-renewal is stopped without ending access early: the end date
 *      is filled from PayPal first when it is missing, and a past or unknown
 *      date never leads to a cancel.
 *   D) The daily retry: stops renewal still on, retries 'paypal_cancel_failed',
 *      and emails the operator about every row that still fails.
 *   E) Wiring: the PayPal activate route, start-intent, the billing return, the
 *      app home, the daily cron, the billing page and its copy in four
 *      languages (embedded copy English only).
 *
 * Every failure is injected at the database (FakeAdmin hooks) or the PayPal
 * HTTP boundary (stubbed fetch). Each group has a mutation control.
 *
 * Run: npx tsx lib/shopify/__qa__/no-double-billing.qa.ts
 */
import { readFileSync } from 'fs'
import { join } from 'path'
import { FakeAdmin } from '../../__qa__/_fake-admin'
import { getDashboardDictionary } from '../../i18n/dashboard/getDashboardDictionary'
import { PUBLIC_LOCALES } from '../../i18n/locales'
import { isShopifyBillingRequiredForUser, hasAnyShopifyConnectionResult } from '../paypal-block'
import { resolveBillingAuthority } from '../../billing/governance'
import { getActiveMigrationResult, confirmShopifyActiveAndAdvance, cancelPayPalAndCompleteMigration, type MigrationRow } from '../paypal-migration'
import { paidPeriodOf, readMigrationPaidPeriod, stopPayPalRenewalForMigration } from '../paypal-paid-period'
import { retryPayPalMigrations, notifyRefusedPayPalActivation } from '../paypal-migration-retry'
import { getUserEntitlement } from '../../subscription'

let pass = 0, fail = 0
function check(name: string, cond: boolean, detail?: string) {
  if (cond) { pass++; console.log(`  ✓ ${name}`) } else { fail++; console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`) }
}
const ROOT = join(__dirname, '..', '..', '..')
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8')
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1')
type Admin = never
const quiet = () => { const e = console.error, w = console.warn; console.error = () => {}; console.warn = () => {}; return () => { console.error = e; console.warn = w } }

// Synthetic PayPal credentials and ids — never real.
process.env.PAYPAL_CLIENT_ID ||= 'unit-test-paypal-client-id'
process.env.PAYPAL_SECRET ||= 'unit-test-paypal-secret'
process.env.PAYPAL_API_URL ||= 'https://paypal.invalid'

const USER = 'user-paypal'
const SUB = 'I-SYNTHETIC-1'
const NOW = new Date('2026-10-09T12:00:00.000Z')
const FUTURE = '2026-10-30T00:00:00.000Z'
const PAST = '2026-10-01T00:00:00.000Z'
const dbDown = () => ({ code: '08006', message: 'connection refused' })

/** PayPal stub. `calls` counts cancels and subscription reads separately. */
function paypal(opts: { cancelOk?: boolean; nextBillingTime?: string | null } = {}, calls = { cancel: 0, get: 0 }) {
  const fetchImpl = (async (url: string | URL, init?: RequestInit) => {
    const u = String(url)
    if (u.includes('/v1/oauth2/token')) return { ok: true, status: 200, json: async () => ({ access_token: 'unit-test-token' }), text: async () => '' } as unknown as Response
    if (u.endsWith('/cancel')) {
      calls.cancel++
      const ok = opts.cancelOk !== false
      return { ok, status: ok ? 204 : 500, json: async () => ({}), text: async () => '' } as unknown as Response
    }
    if ((init?.method ?? 'GET') === 'GET') {
      calls.get++
      const body = opts.nextBillingTime === null ? { id: SUB, status: 'ACTIVE', billing_info: {} } : { id: SUB, status: 'ACTIVE', billing_info: { next_billing_time: opts.nextBillingTime ?? FUTURE } }
      return { ok: true, status: 200, json: async () => body, text: async () => '' } as unknown as Response
    }
    return { ok: false, status: 404, json: async () => ({}), text: async () => '' } as unknown as Response
  }) as unknown as typeof fetch
  return { fetchImpl, calls }
}

const migrating = (over: { sub?: Record<string, unknown>; mig?: Record<string, unknown> } = {}) => new FakeAdmin({
  profiles: [{ id: USER, role: 'user' }],
  billing_governance: [{ user_id: USER, signup_origin: 'website', billing_authority: 'website', authority_reason: 'shopify_app_store_install_deferred_paypal_migration' }],
  shopify_connections: [{ id: 'conn-1', user_id: USER, project_id: 'proj-1', connection_status: 'connected', archived_at: null }],
  projects: [{ id: 'proj-1', user_id: USER }],
  shopify_billing_migrations: [{ id: 'mig-1', user_id: USER, project_id: 'proj-1', shopify_connection_id: 'conn-1', paypal_subscription_id: SUB, status: 'pending', paypal_cancel_attempts: 0, last_error: null, updated_at: PAST, ...(over.mig ?? {}) }],
  subscriptions: [{ id: 's1', user_id: USER, status: 'active', plan_code: 'advanced', paypal_subscription_id: SUB, current_period_end: FUTURE, created_at: '2026-01-01T00:00:00Z', ...(over.sub ?? {}) }],
})
const mig = (a: FakeAdmin) => a.tables.shopify_billing_migrations[0] as Record<string, unknown>
const sub = (a: FakeAdmin) => a.tables.subscriptions[0] as Record<string, unknown>
const gov = (a: FakeAdmin) => a.tables.billing_governance[0] as Record<string, unknown>

async function main() {
  console.log('No double billing — PayPal and Shopify never both bill one account\n')

  console.log('A) a connected Shopify store blocks a NEW PayPal subscription')
  {
    const base = (tables: Record<string, Record<string, unknown>[]>, hooks: Record<string, Record<string, () => unknown>> = {}) =>
      new FakeAdmin({ profiles: [{ id: 'u', role: 'user' }], billing_governance: [{ user_id: 'u', signup_origin: 'website', billing_authority: 'website' }], shopify_billing_migrations: [], shopify_connections: [], projects: [], ...tables }, hooks as never)
    const noStore = base({ projects: [{ id: 'p', user_id: 'u' }], subscriptions: [{ user_id: 'u', status: 'trial' }] })
    check('A1: no Shopify store (with a connected website project) → PayPal allowed, unchanged', await isShopifyBillingRequiredForUser(noStore as Admin, 'u') === false)
    const own = base({ shopify_connections: [{ id: 'c', user_id: 'u', project_id: 'p', connection_status: 'connected', archived_at: null }] })
    check('A2: a connected store on the account → blocked', await isShopifyBillingRequiredForUser(own as Admin, 'u') === true)
    const viaProject = base({ projects: [{ id: 'p', user_id: 'u' }], shopify_connections: [{ id: 'c', user_id: 'someone-else', project_id: 'p', connection_status: 'connected', archived_at: null }] })
    check('A3: a store row on one of the account\'s PROJECTS → blocked', await isShopifyBillingRequiredForUser(viaProject as Admin, 'u') === true)
    const tombstone = base({ shopify_connections: [{ id: 'c', user_id: 'u', project_id: 'p', connection_status: 'failed', last_error: 'app_uninstalled', archived_at: '2026-10-01T00:00:00Z' }] })
    check('A4: any status, archived/uninstalled included → blocked', await isShopifyBillingRequiredForUser(tombstone as Admin, 'u') === true)
    const otherAccount = base({ projects: [{ id: 'p', user_id: 'u' }], shopify_connections: [{ id: 'c', user_id: 'x', project_id: 'p-x', connection_status: 'connected', archived_at: null }] })
    check('A5: another account\'s store never blocks this one', await isShopifyBillingRequiredForUser(otherAccount as Admin, 'u') === false)
    const admin = base({ profiles: [{ id: 'u', role: 'admin' }], shopify_connections: [{ id: 'c', user_id: 'u', project_id: 'p', connection_status: 'connected', archived_at: null }] })
    check('A6: an administrator with a store is NOT blocked (behaves as before)', await isShopifyBillingRequiredForUser(admin as Admin, 'u') === false)
    const adminShopify = base({ profiles: [{ id: 'u', role: 'admin' }], billing_governance: [{ user_id: 'u', signup_origin: 'shopify_app_store', billing_authority: 'shopify' }] })
    check('A7: …but an administrator billed by Shopify is still blocked, as before', await isShopifyBillingRequiredForUser(adminShopify as Admin, 'u') === true)
    const down = base({}, { shopify_connections: { select: dbDown } })
    check('A8: an unreadable connection lookup fails CLOSED', await isShopifyBillingRequiredForUser(down as Admin, 'u') === true)
    const lookup = await hasAnyShopifyConnectionResult(down as Admin, 'u')
    check('A9: …and is reported as a failed read, not "no store"', lookup.ok === false)
    // MUTATION CONTROL — the rule before this change (authority + migration
    // only) lets the website account with a connected store through.
    const authority = await resolveBillingAuthority(own as Admin, 'u')
    const migration = await getActiveMigrationResult(own as Admin, 'u')
    const oldRule = !authority.ok || (authority.ok && authority.authority === 'shopify') || !migration.ok || !!migration.migration
    check('A-MUT: without the connection rule the same account could start PayPal', oldRule === false)
  }

  console.log('\nB) the paid PayPal period is kept; nothing moves inside it')
  {
    const a = migrating()
    const pp = paypal()
    const r = await confirmShopifyActiveAndAdvance(a as Admin, USER, pp.fetchImpl, () => NOW)
    check('B1: a Shopify confirmation inside the paid period is DEFERRED with the paid-until date', !!r?.deferred && r.deferred.paidUntil === FUTURE, JSON.stringify(r))
    check('B2: PayPal was not contacted at all', pp.calls.cancel === 0 && pp.calls.get === 0)
    check('B3: the migration stays pending and billing authority stays website', mig(a).status === 'pending' && gov(a).billing_authority === 'website')
    const ent = await getUserEntitlement(USER, a as never, () => NOW)
    check('B4: the account keeps its paid plan during the period', ent.plan === 'advanced' && ent.hasActiveSubscription === true, JSON.stringify(ent))
    const stopped = migrating({ sub: { status: 'cancelled' } })
    const r2 = await confirmShopifyActiveAndAdvance(stopped as Admin, USER, pp.fetchImpl, () => NOW)
    check('B5: renewal already stopped, period still running → still deferred', !!r2?.deferred && pp.calls.cancel === 0)
    const over = migrating({ sub: { status: 'cancelled', current_period_end: PAST } })
    const pp3 = paypal()
    const r3 = await confirmShopifyActiveAndAdvance(over as Admin, USER, pp3.fetchImpl, () => NOW)
    check('B6: after the period ends, the confirmation completes the migration as before', r3?.status === 'completed' && mig(over).status === 'completed' && gov(over).billing_authority === 'shopify', JSON.stringify(r3))
    const unknown = migrating({ sub: { current_period_end: null } })
    const r4 = await confirmShopifyActiveAndAdvance(unknown as Admin, USER, pp.fetchImpl, () => NOW)
    check('B7: an ACTIVE row with no end date is treated as inside the paid period (never cancelled on a guess)', !!r4?.deferred && r4.deferred.paidUntil === null && pp.calls.cancel === 0)
    const confirmed = migrating({ mig: { status: 'shopify_confirmed' } })
    const pp5 = paypal()
    const r5 = await confirmShopifyActiveAndAdvance(confirmed as Admin, USER, pp5.fetchImpl, () => NOW)
    check('B8: a row Shopify ALREADY confirmed (pre-change) still stops PayPal — that ends the overlap', r5?.status === 'completed' && pp5.calls.cancel === 1)
    const broken = new FakeAdmin(JSON.parse(JSON.stringify(migrating().tables)), { subscriptions: { select: dbDown } })
    const restore = quiet()
    const r6 = await confirmShopifyActiveAndAdvance(broken as Admin, USER, pp.fetchImpl, () => NOW)
    restore()
    check('B9: an unreadable paid period fails closed: nothing moves, PayPal untouched', r6?.lookupFailed === true && mig(broken).status === 'pending' && pp.calls.cancel === 0)
    // MUTATION CONTROL — the completion step alone (no paid-period check)
    // cancels PayPal inside the paid period.
    const raw = migrating()
    const ppRaw = paypal()
    await cancelPayPalAndCompleteMigration(raw as Admin, USER, { ...(mig(raw) as unknown as MigrationRow) }, ppRaw.fetchImpl)
    check('B-MUT: without the paid-period check PayPal is cancelled and billing moves mid-period', ppRaw.calls.cancel === 1 && gov(raw).billing_authority === 'shopify')
    check('B10: paidPeriodOf follows lib/subscription.ts (cancelled with no end = no period)', paidPeriodOf({ status: 'cancelled', current_period_end: null }, NOW).inPaidPeriod === false && paidPeriodOf({ status: 'expired', current_period_end: FUTURE }, NOW).inPaidPeriod === false)
  }

  console.log('\nC) stopping PayPal auto-renewal keeps access to the period end')
  {
    const a = migrating()
    const pp = paypal()
    const out = await stopPayPalRenewalForMigration(a as Admin, USER, { fetchImpl: pp.fetchImpl, now: () => NOW })
    check('C1: renewal stopped: one PayPal cancel, row mirrored as cancelled, end date unchanged', out === 'stopped' && pp.calls.cancel === 1 && sub(a).status === 'cancelled' && sub(a).current_period_end === FUTURE, out)
    const ent = await getUserEntitlement(USER, a as never, () => NOW)
    check('C2: …and the plan stays active until that date', ent.plan === 'advanced' && ent.hasActiveSubscription === true)
    const later = await getUserEntitlement(USER, a as never, () => new Date('2026-11-01T00:00:00Z'))
    check('C3: …and ends after it', later.hasActiveSubscription === false)
    check('C4: the migration is still pending (billing has not moved)', mig(a).status === 'pending' && gov(a).billing_authority === 'website')
    const again = await stopPayPalRenewalForMigration(a as Admin, USER, { fetchImpl: pp.fetchImpl, now: () => NOW })
    check('C5: idempotent: a second run does not call PayPal again', again === 'already_stopped' && pp.calls.cancel === 1)

    const noEnd = migrating({ sub: { current_period_end: null } })
    const ppN = paypal({ nextBillingTime: FUTURE })
    const outN = await stopPayPalRenewalForMigration(noEnd as Admin, USER, { fetchImpl: ppN.fetchImpl, now: () => NOW })
    check('C6: a missing end date is filled from PayPal\'s next_billing_time BEFORE the cancel', outN === 'stopped' && sub(noEnd).current_period_end === FUTURE && ppN.calls.get === 1 && ppN.calls.cancel === 1, outN)
    const entN = await getUserEntitlement(USER, noEnd as never, () => NOW)
    check('C7: …so the cancelled row still grants the plan', entN.hasActiveSubscription === true)

    const noDate = migrating({ sub: { current_period_end: null } })
    const ppD = paypal({ nextBillingTime: null })
    const outD = await stopPayPalRenewalForMigration(noDate as Admin, USER, { fetchImpl: ppD.fetchImpl, now: () => NOW })
    check('C8: no date from PayPal either → NOT cancelled, failure recorded for the retry', outD === 'period_unknown' && ppD.calls.cancel === 0 && sub(noDate).status === 'active' && String(mig(noDate).last_error).startsWith('renewal_stop_failed:'), outD)
    const pastActive = migrating({ sub: { current_period_end: PAST } })
    const ppP = paypal()
    const outP = await stopPayPalRenewalForMigration(pastActive as Admin, USER, { fetchImpl: ppP.fetchImpl, now: () => NOW })
    check('C9: an ACTIVE row whose date has passed (renewal webhook in flight) is not cancelled', outP === 'period_unknown' && ppP.calls.cancel === 0)
    const failing = migrating()
    const ppF = paypal({ cancelOk: false })
    const outF = await stopPayPalRenewalForMigration(failing as Admin, USER, { fetchImpl: ppF.fetchImpl, now: () => NOW })
    check('C10: a failed PayPal cancel leaves the row active and records attempts + reason', outF === 'failed' && sub(failing).status === 'active' && mig(failing).paypal_cancel_attempts === 1 && mig(failing).status === 'pending', JSON.stringify(mig(failing)))
    const none = new FakeAdmin({ shopify_billing_migrations: [], subscriptions: [] })
    check('C11: an account with no migration is a no-op', await stopPayPalRenewalForMigration(none as Admin, 'nobody', { fetchImpl: paypal().fetchImpl }) === 'no_migration')
    // MUTATION CONTROL — cancelling a row with no end date WITHOUT filling it
    // first is exactly what would end access at once.
    const mutant = migrating({ sub: { current_period_end: null } })
    sub(mutant).status = 'cancelled'
    const entM = await getUserEntitlement(USER, mutant as never, () => NOW)
    check('C-MUT: a cancelled row with no end date has no access — the date must come first', entM.hasActiveSubscription === false)
    const period = await readMigrationPaidPeriod(a as Admin, USER, mig(a) as unknown as MigrationRow, NOW)
    check('C12: readMigrationPaidPeriod reports the stopped renewal and its date', period.ok && period.period.inPaidPeriod && period.period.renewalStopped === true && period.period.paidUntil === FUTURE)
  }

  console.log('\nD) the daily retry and the operator alert')
  {
    const sent: { subject: string; html: string; to: string }[] = []
    const alert = { env: { RESEND_API_KEY: 'unit-test', ADMIN_NOTIFICATION_EMAIL: 'operator@example.invalid' }, send: async (m: { subject: string; html: string; to: string }) => { sent.push(m); return { ok: true } } }
    const a = migrating()
    const failed = migrating({ mig: { id: 'mig-2', user_id: 'user-2', status: 'paypal_cancel_failed', paypal_cancel_attempts: 2, last_error: 'cancel_request_failed' }, sub: { user_id: 'user-2', id: 's2' } })
    a.tables.shopify_billing_migrations.push(mig(failed))
    a.tables.subscriptions.push(sub(failed))
    const ok = paypal()
    const s1 = await retryPayPalMigrations(a as Admin, { fetchImpl: ok.fetchImpl, now: () => NOW, alert })
    check('D1: pending → renewal stopped; paypal_cancel_failed → cancelled and completed', s1.renewalStopped === 1 && s1.completed === 1 && a.tables.shopify_billing_migrations[1].status === 'completed', JSON.stringify(s1))
    check('D2: nothing failed → no email', sent.length === 0 && s1.alert === 'none')

    const b = migrating({ mig: { status: 'paypal_cancel_failed', paypal_cancel_attempts: 3 } })
    const bad = paypal({ cancelOk: false })
    const restore = quiet()
    const s2 = await retryPayPalMigrations(b as Admin, { fetchImpl: bad.fetchImpl, now: () => NOW, alert })
    restore()
    check('D3: a cancellation that keeps failing stays paypal_cancel_failed with attempts counted', mig(b).status === 'paypal_cancel_failed' && mig(b).paypal_cancel_attempts === 4)
    check('D4: …and the operator is emailed, to the operator address only', sent.length === 1 && s2.alert === 'sent' && sent[0].to === 'operator@example.invalid' && /mig-1/.test(sent[0].html) && /paypal_cancel_failed/.test(sent[0].html))
    check('D5: the email carries ids and codes only (no PayPal response text)', !/connection refused|<script/i.test(sent[0].html))
    const c = new FakeAdmin({ shopify_billing_migrations: [] }, { shopify_billing_migrations: { select: dbDown } })
    const restore2 = quiet()
    const s3 = await retryPayPalMigrations(c as Admin, { fetchImpl: ok.fetchImpl, alert })
    restore2()
    check('D6: an unreadable migration table is itself alerted, never silent', s3.ok === false && sent.length === 2)
    // MUTATION CONTROL — the alert kill switch really stops the email: the
    // checks above observe the real send path, not a constant.
    const d = migrating({ mig: { status: 'paypal_cancel_failed' } })
    const restore3 = quiet()
    const s4 = await retryPayPalMigrations(d as Admin, { fetchImpl: bad.fetchImpl, alert: { ...alert, env: { ...alert.env, OPERATOR_ALERTS_DISABLED: 'true' } } })
    restore3()
    check('D-MUT: with alerts disabled the same failure sends nothing', s4.alert === 'not_sent' && sent.length === 2)

    // A refused /api/paypal/activate alerts the operator only for a subscription
    // PayPal itself confirms, so a made-up id cannot flood the inbox.
    const args = { userId: 'user-9', subscriptionId: 'I-FAKE', plan: 'regular', reason: 'shopify_store_connected' }
    const unverified = await notifyRefusedPayPalActivation(args, { ...alert, verify: async () => ({ ok: false, reason: 'paypal_verification_failed' }) as never })
    check('D7: an unverified subscription id sends no alert', unverified === 'unverified' && sent.length === 2)
    const verified = await notifyRefusedPayPalActivation(args, { ...alert, verify: async () => ({ ok: true }) as never })
    check('D8: a PayPal-confirmed subscription is alerted for a manual cancel and refund', verified === 'sent' && sent.length === 3 && /I-FAKE/.test(sent[2].html))
    // MUTATION CONTROL — a verifier that throws is not "verified".
    const threw = await notifyRefusedPayPalActivation(args, { ...alert, verify: async () => { throw new Error('x') } })
    check('D-MUT2: a verifier that throws sends nothing', threw === 'not_sent' && sent.length === 3)
  }

  console.log('\nE) wiring')
  {
    const activate = strip(read('app/api/paypal/activate/route.ts'))
    const activateOk = (src: string) => {
      const gate = src.indexOf('isShopifyBillingRequiredForUser(admin, user.id)')
      const verify = src.indexOf('verifyPayPalActivation(')
      const write = src.indexOf('transitionSubscriptionToActivePlan(')
      return gate > 0 && verify > gate && write > verify && /return refuse\('shopify_store_connected'\)/.test(src) && /notifyRefusedPayPalActivation\(/.test(src)
    }
    check('E1: /api/paypal/activate refuses BEFORE PayPal verification and any write, and alerts the operator', activateOk(activate))
    check('E1-MUT: moving the gate after the write is caught', !activateOk(activate.replace('if (await isShopifyBillingRequiredForUser(admin, user.id)) {', 'if (false) {') ))

    const start = strip(read('app/api/shopify/billing/start-intent/route.ts'))
    const startOk = (src: string) => {
      const paid = src.indexOf('readMigrationPaidPeriod(admin, connection.user_id, migration.migration)')
      const pricing = src.indexOf('buildShopifyPricingUrl(')
      const mint = src.indexOf('createBillingIntent(')
      return paid > 0 && pricing > paid && mint > paid && /website_paid_period_active/.test(src)
    }
    check('E2: start-intent refuses the Shopify pricing page inside the paid period, before any intent is minted', startOk(start))
    check('E2-MUT: dropping the check is caught', !startOk(start.replace('readMigrationPaidPeriod(admin, connection.user_id, migration.migration)', 'null')))

    const ret = strip(read('lib/shopify/billing-return-processing.ts'))
    check('E3: the billing return reports a deferral, never success/cancel', /if \(advanced\?\.deferred\) return result\('migration_deferred'/.test(ret))
    const retRoute = strip(read('app/api/shopify/billing/return/route.ts'))
    check('E3b: …and the return route maps it', /migration_deferred: \{ shopify: 'info', reason: 'website_paid_period_active' \}/.test(retRoute))

    const home = strip(read('app/api/shopify/app-home/route.ts'))
    const homeOk = (src: string) => /const shopifyBills = !billingStateUnavailable && !websitePaidPeriodActive/.test(src) && /websitePaidUntil,/.test(src)
    check('E4: the app home offers no Shopify plan (and makes no Partner billing call) inside the paid period', homeOk(home))
    check('E4-MUT: dropping the paid-period term is caught', !homeOk(home.replace('&& !websitePaidPeriodActive', '')))

    const client = read('app/shopify/app/ConnectorHomeClient.tsx')
    const card = client.slice(client.indexOf('data.websitePaidPeriodActive ?'), client.indexOf("data.billingProvider === 'website' ? ("))
    check('E5: the embedded app tells the merchant, in English, the paid-until date and to choose a Shopify plan after it', /paid through the Go Top SEO website until/.test(card) && /choose a Shopify plan here/.test(card) && !/[֐-׿]/.test(card) && !/startBillingIntent/.test(card))

    const cron = strip(read('app/api/schedule/route.ts'))
    const cronOk = (src: string) => {
      const deny = src.indexOf('if (denied) return denied')
      const retry = src.indexOf('after(() => retryPayPalMigrations(createAdminClient())')
      return src.indexOf("authorizeCronRequest(request, 'Schedule')") > 0 && deny > 0 && retry > deny
    }
    check('E6: the daily retry runs from the existing authenticated cron, after the auth check, in after()', cronOk(cron))
    check('E6-MUT: scheduling it before the auth check is caught', !cronOk(`after(() => retryPayPalMigrations(createAdminClient())\n${cron.replace('after(() => retryPayPalMigrations(createAdminClient())', '')}`))

    const link = strip(read('app/api/shopify/link/complete/route.ts'))
    check('E7: linking a store stops PayPal renewal after the response', /after\(\(\) => stopPayPalRenewalForMigration\(admin, user\.id\)/.test(link))

    const view = strip(read('app/(dashboard)/billing/BillingView.tsx'))
    const storeBranch = view.slice(view.indexOf('{shopifyStoreConnected ? ('), view.indexOf('<BillingClient market={market} />'))
    const viewOk = (src: string, branch: string) => /rel="nofollow noopener noreferrer"/.test(src) && /href=\{SHOPIFY_APP_STORE_URL\}/.test(src)
      && /\{t\.shopify\.storeConnectedTitle\}/.test(branch) && /\) : \(\s*<>/.test(branch)
    check('E8: the billing page shows the Shopify notice with a nofollow App Store link, and the PayPal plans only in the other branch', viewOk(view, storeBranch))
    check('E8-MUT: a followed link is caught', !viewOk(view.replace('rel="nofollow noopener noreferrer"', 'rel="noopener"'), storeBranch))
    const page = strip(read('app/(dashboard)/billing/page.tsx'))
    check('E9: the page passes the store flag from the same server-side lookup the PayPal gate uses', /hasAnyShopifyConnectionResult\(admin, user\.id\)/.test(page) && /shopifyStoreConnected=\{shopifyStoreConnected\}/.test(page))

    const rows = PUBLIC_LOCALES.map((l) => {
      const s = getDashboardDictionary(l).billing.shopify
      return { l, values: [s.storeConnectedTitle, s.storeConnectedDescription, s.appStoreLink, s.paidUntil('X'), s.paidCurrentPeriod, s.renewalOff, s.renewalStopping, s.afterPaidPeriod] }
    })
    const complete = (rs: { values: string[] }[]) => rs.every((r) => r.values.every((v) => typeof v === 'string' && v.trim().length > 0))
    check('E10: every new billing line exists in he, en, es and pt-BR', complete(rows))
    const en = rows.find((r) => r.l === 'en')!
    check('E11: …as real translations (no copy of English), Hebrew in Hebrew', rows.filter((r) => r.l !== 'en').every((r) => r.values[1] !== en.values[1]) && /[֐-׿]/.test(rows.find((r) => r.l === 'he')!.values[1]))
    check('E12: the paid-until line carries the date', rows.every((r) => r.values[3].includes('X')))
    check('E-MUT: an empty translation is caught', !complete([{ values: [' '] }]))
  }

  console.log(`\n${pass} passed, ${fail} failed`)
  if (fail > 0) process.exitCode = 1
}

main()
export {}
