/**
 * Website user → Shopify App Store install → the plan chosen in Shopify
 * governs THEIR account (owner, 5 Oct 2026).
 *
 *   A) The in-app connect panel sends the merchant to the App Store listing and
 *      says, in all four dashboard languages, to sign in with this same account.
 *      The manual shop-domain flow is gone from the panel and from its guide.
 *   B) An embedded app load that finds the Shopify plan live finishes a pending
 *      PayPal→Shopify migration — once, only after an independent Admin API
 *      ACTIVE confirmation, never for an admin, never for another store's
 *      migration, and never twice under concurrent loads.
 *   C) The Admin API reader treats anything but an ACTIVE status, and every
 *      failure, as "not confirmed".
 *
 * Every failure in B is injected at the DATABASE or the PayPal / Admin API HTTP
 * boundary (FakeAdmin + stubbed fetch). Each group has a mutation control.
 *
 * Run: npx tsx lib/shopify/__qa__/app-store-connect.qa.ts
 */
import { readFileSync } from 'fs'
import { join } from 'path'
import { FakeAdmin } from '../../__qa__/_fake-admin'
import { getDashboardDictionary } from '../../i18n/dashboard/getDashboardDictionary'
import { PUBLIC_LOCALES } from '../../i18n/locales'
import { advancePayPalMigrationOnAppLoad, APP_LOAD_MIGRATION_LEASE_MS, isActiveConfirmation } from '../app-load-billing-sync'
import { confirmShopifyActiveAndAdvance, type MigrationRow } from '../paypal-migration'
import { getActiveAppSubscriptionStatuses } from '../client'

let pass = 0, fail = 0
function check(name: string, cond: boolean, detail?: string) {
  if (cond) { pass++; console.log(`  ✓ ${name}`) } else { fail++; console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`) }
}
const ROOT = join(__dirname, '..', '..', '..')
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8')
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1')

// Synthetic PayPal credentials — never real.
process.env.PAYPAL_CLIENT_ID ||= 'unit-test-paypal-client-id'
process.env.PAYPAL_SECRET ||= 'unit-test-paypal-secret'
process.env.PAYPAL_API_URL ||= 'https://paypal.invalid'

const USER = 'user-web-signup'
const CONN = 'conn-1'
const PROJECT = 'proj-1'
const SUB = 'I-SYNTHETIC-PAYPAL'
const NOW = Date.parse('2026-10-09T12:00:00.000Z')
const OLD = '2026-10-09T11:00:00.000Z'

const migrationRow = (over: Record<string, unknown> = {}) => ({
  id: 'mig-1', user_id: USER, project_id: PROJECT, shopify_connection_id: CONN,
  paypal_subscription_id: SUB, status: 'pending', paypal_cancel_attempts: 0, updated_at: OLD, ...over,
})
const seed = (over: Record<string, unknown> = {}) => new FakeAdmin({
  shopify_billing_migrations: [migrationRow(over)],
  subscriptions: [{ id: 's1', user_id: USER, status: 'active', paypal_subscription_id: SUB, created_at: '2026-01-01T00:00:00Z' }],
  billing_governance: [{ user_id: USER, signup_origin: 'website', billing_authority: 'website', authority_reason: 'shopify_app_store_install_deferred_paypal_migration' }],
})
/** The caller's snapshot of the row, as app-home's getActiveMigrationResult read it. */
const snapshot = (admin: FakeAdmin) => ({ ...(admin.tables.shopify_billing_migrations[0] as object) }) as unknown as MigrationRow

/** PayPal stub; `calls.n` counts only the CANCEL request. */
function paypalStub(cancelOk: boolean, calls: { n: number }) {
  return (async (url: string | URL) => {
    if (String(url).includes('/v1/oauth2/token')) {
      return { ok: true, status: 200, json: async () => ({ access_token: 'unit-test-paypal-token' }), text: async () => '' } as unknown as Response
    }
    calls.n++
    return { ok: cancelOk, status: cancelOk ? 204 : 500, json: async () => ({}), text: async () => '' } as unknown as Response
  }) as unknown as typeof fetch
}

const baseArgs = (admin: FakeAdmin, over: Partial<Parameters<typeof advancePayPalMigrationOnAppLoad>[1]> = {}) => ({
  isAdmin: false, userId: USER, connectionId: CONN, projectId: PROJECT,
  migration: snapshot(admin), shopifyPlanActive: true, ...over,
})
const deps = (calls: { n: number }, adminApi: boolean | 'throw' = true, cancelOk = true, adminApiCalls?: { n: number }) => ({
  fetchImpl: paypalStub(cancelOk, calls),
  now: () => NOW,
  confirmAdminApiActive: async () => {
    if (adminApiCalls) adminApiCalls.n++
    if (adminApi === 'throw') throw new Error('admin api down')
    return adminApi
  },
})
const mig = (admin: FakeAdmin) => admin.tables.shopify_billing_migrations[0] as Record<string, unknown>
const gov = (admin: FakeAdmin) => admin.tables.billing_governance[0] as Record<string, unknown>
const sub = (admin: FakeAdmin) => admin.tables.subscriptions[0] as Record<string, unknown>

async function main() {
  console.log('Shopify App Store connect — website account, Shopify plan\n')

  console.log('A) the in-app panel sends the merchant to the App Store')
  {
    const panel = strip(read('components/content/ShopifyConnectionPanel.tsx'))
    const panelOk = (src: string) => /href=\{SHOPIFY_APP_STORE_URL\}/.test(src)
      && /rel="nofollow noopener noreferrer"/.test(src) && /target="_blank"/.test(src)
      && /\{t\.appStoreExplain\}/.test(src) && /\{t\.installFromAppStore\}/.test(src)
      && !/<Input\b/.test(src) && !/setShopDomain|\/api\/shopify\/oauth\/start/.test(src)
    check('A1: the not-connected state links to the listing (nofollow, new tab) with the sign-in note, and has no domain field', panelOk(panel))
    check('A1-MUT: a reinstated shop-domain field is caught',
      !panelOk(panel.replace('{t.installFromAppStore}', '{t.installFromAppStore}<Input label={t.shopDomain} />')))

    const texts = PUBLIC_LOCALES.map((l) => {
      const s = getDashboardDictionary(l).projectDetail.contentSection.shopify
      return { l, note: s.appStoreExplain, cta: s.installFromAppStore, none: s.appStoreUnavailable, steps: s.guide.steps.join(' '), warn: s.guide.warnings.join(' ') }
    })
    const complete = (rows: { note: string; cta: string; none: string }[]) => rows.every((r) => [r.note, r.cta, r.none].every((v) => typeof v === 'string' && v.trim().length > 0))
    check('A2: the note, the button and the no-listing line exist in he, en, es and pt-BR', complete(texts), JSON.stringify(texts.map((r) => r.l)))
    check('A3: …and are real translations, not copies of English',
      texts.filter((r) => r.l !== 'en').every((r) => r.note !== texts.find((x) => x.l === 'en')!.note))
    check('A4: every note says to sign in with the same account', texts.every((r) => /same account|החשבון הזה עצמו|misma cuenta|mesma conta/i.test(r.note)))
    check('A5: the guide no longer tells anyone to type a .myshopify.com domain', texts.every((r) => !/myshopify\.com/.test(r.steps) && !/myshopify\.com/.test(r.warn)))
    check('A6: the Hebrew dashboard copy carries Hebrew (the panel follows the user\'s language)', /[֐-׿]/.test(texts.find((r) => r.l === 'he')!.note))
    check('A-MUT: an empty translation is caught', !complete([{ ...texts[0], note: ' ' }]))
  }

  console.log('\nB) an app load with a live plan finishes the PayPal migration')
  {
    // B1 — the happy path.
    const admin = seed()
    const calls = { n: 0 }
    const r = await advancePayPalMigrationOnAppLoad(admin as never, baseArgs(admin), deps(calls))
    check('B1a: completed', r.outcome === 'completed' && r.migrationStatus === 'completed', JSON.stringify(r))
    check('B1b: PayPal was cancelled exactly once', calls.n === 1, String(calls.n))
    check('B1c: the migration row is completed', mig(admin).status === 'completed')
    check('B1d: billing authority moved to Shopify for THIS account', gov(admin).billing_authority === 'shopify' && gov(admin).user_id === USER)
    check('B1e: the local PayPal mirror is cancelled', sub(admin).status === 'cancelled')

    // B2 — idempotent: the next load (fresh read: no active migration) and a
    // replay of the stale snapshot both do nothing.
    const again = await advancePayPalMigrationOnAppLoad(admin as never, baseArgs(admin, { migration: null }), deps(calls))
    check('B2a: the next load is a no-op', again.outcome === 'no_migration' && calls.n === 1)
    const stale = await advancePayPalMigrationOnAppLoad(admin as never,
      baseArgs(admin, { migration: { ...snapshot(admin), status: 'pending', updated_at: OLD } as unknown as MigrationRow }), deps(calls))
    check('B2b: a replayed stale snapshot never cancels again', stale.outcome === 'in_flight_elsewhere' && calls.n === 1, JSON.stringify(stale))
  }
  {
    // B3 — admin first.
    const admin = seed(); const calls = { n: 0 }; const apiCalls = { n: 0 }
    const r = await advancePayPalMigrationOnAppLoad(admin as never, baseArgs(admin, { isAdmin: true }), deps(calls, true, true, apiCalls))
    check('B3: an admin account is skipped before anything is read or called',
      r.outcome === 'admin_skipped' && calls.n === 0 && apiCalls.n === 0 && mig(admin).status === 'pending' && mig(admin).updated_at === OLD)
  }
  {
    const admin = seed(); const calls = { n: 0 }
    const r = await advancePayPalMigrationOnAppLoad(admin as never, baseArgs(admin, { shopifyPlanActive: false }), deps(calls))
    check('B4: no live Shopify plan → PayPal untouched', r.outcome === 'plan_not_active' && calls.n === 0 && sub(admin).status === 'active')
  }
  {
    const admin = seed({ shopify_connection_id: 'another-store' }); const calls = { n: 0 }
    const r = await advancePayPalMigrationOnAppLoad(admin as never, baseArgs(admin), deps(calls))
    check('B5: a migration that belongs to another store is not advanced by this one', r.outcome === 'other_connection' && calls.n === 0)
  }
  {
    const admin = seed(); const calls = { n: 0 }
    const r = await advancePayPalMigrationOnAppLoad(admin as never, baseArgs(admin), deps(calls, false))
    check('B6a: Admin API not ACTIVE → PayPal untouched, authority unchanged',
      r.outcome === 'admin_api_not_active' && calls.n === 0 && gov(admin).billing_authority === 'website' && mig(admin).status === 'pending')
    const admin2 = seed(); const calls2 = { n: 0 }
    const r2 = await advancePayPalMigrationOnAppLoad(admin2 as never, baseArgs(admin2), deps(calls2, 'throw'))
    check('B6b: an Admin API failure is "not confirmed", never a pass', r2.outcome === 'admin_api_not_active' && calls2.n === 0)
  }
  {
    const admin = seed({ updated_at: new Date(NOW - APP_LOAD_MIGRATION_LEASE_MS / 2).toISOString() }); const calls = { n: 0 }
    const r = await advancePayPalMigrationOnAppLoad(admin as never, baseArgs(admin), deps(calls))
    check('B7: a migration touched inside the lease is left to whoever touched it', r.outcome === 'in_flight_elsewhere' && calls.n === 0)
  }
  {
    // B8 — two concurrent loads read the same row: exactly one cancellation.
    const admin = seed(); const calls = { n: 0 }
    const snap = snapshot(admin)
    const [a, b] = await Promise.all([
      advancePayPalMigrationOnAppLoad(admin as never, baseArgs(admin, { migration: snap }), deps(calls)),
      advancePayPalMigrationOnAppLoad(admin as never, baseArgs(admin, { migration: snap }), deps(calls)),
    ])
    check('B8a: concurrent loads cancel PayPal exactly once', calls.n === 1, `${calls.n} (${a.outcome}, ${b.outcome})`)
    check('B8b: one completes, the other stands down', [a.outcome, b.outcome].sort().join(',') === 'completed,in_flight_elsewhere')
    // MUTATION CONTROL — the same race against the state machine WITHOUT the
    // app-load claim double-calls PayPal, so B8a is a real detector.
    const raw = seed({ status: 'shopify_confirmed' }); const rawCalls = { n: 0 }
    await Promise.all([
      confirmShopifyActiveAndAdvance(raw as never, USER, paypalStub(true, rawCalls)),
      confirmShopifyActiveAndAdvance(raw as never, USER, paypalStub(true, rawCalls)),
    ])
    check('B8-MUT: without the claim the same race calls PayPal twice', rawCalls.n === 2, String(rawCalls.n))
  }
  {
    const admin = seed(); const calls = { n: 0 }
    const r = await advancePayPalMigrationOnAppLoad(admin as never, baseArgs(admin), deps(calls, true, false))
    check('B9: a failed PayPal cancellation is reported incomplete, never success; authority stays',
      r.outcome === 'incomplete' && r.migrationStatus === 'paypal_cancel_failed' && gov(admin).billing_authority === 'website' && sub(admin).status === 'active')
  }
  {
    // B10 — the claim write itself fails: nothing is called.
    const admin = new FakeAdmin(seed().tables, { shopify_billing_migrations: { update: () => ({ message: 'db down', code: '08006' }) } })
    const calls = { n: 0 }; const apiCalls = { n: 0 }
    const r = await advancePayPalMigrationOnAppLoad(admin as never, baseArgs(admin), deps(calls, true, true, apiCalls))
    check('B10: a failed claim write stops before the Admin API and PayPal', r.outcome === 'in_flight_elsewhere' && calls.n === 0 && apiCalls.n === 0)
  }
  {
    // MUTATION CONTROL for B6 — the state machine alone (no Admin API gate)
    // DOES cancel, so the B6 "PayPal untouched" assertion would catch a removed gate.
    const raw = seed(); const rawCalls = { n: 0 }
    await confirmShopifyActiveAndAdvance(raw as never, USER, paypalStub(true, rawCalls))
    check('B6-MUT: without the Admin API gate PayPal would have been cancelled', rawCalls.n === 1)
  }

  console.log('\nC) the Admin API reader')
  {
    const creds = { shopDomain: 's.myshopify.com', accessToken: 'unit-test-token', apiVersion: '2026-07' }
    const realFetch = globalThis.fetch
    const answer = (body: unknown, status = 200) => {
      globalThis.fetch = (async () => ({
        status, ok: status >= 200 && status < 300,
        headers: { get: () => null }, json: async () => body, text: async () => JSON.stringify(body),
      })) as unknown as typeof fetch
    }
    try {
      answer({ data: { currentAppInstallation: { activeSubscriptions: [{ status: 'ACTIVE' }] } } })
      const ok = await getActiveAppSubscriptionStatuses(creds)
      const confirms = isActiveConfirmation
      check('C1: an ACTIVE subscription confirms', confirms(ok))
      answer({ data: { currentAppInstallation: { activeSubscriptions: [{ status: 'PENDING' }] } } })
      check('C2: PENDING does not', !confirms(await getActiveAppSubscriptionStatuses(creds)))
      answer({ data: { currentAppInstallation: { activeSubscriptions: [] } } })
      check('C3: no subscription does not', !confirms(await getActiveAppSubscriptionStatuses(creds)))
      answer({}, 401)
      const denied = await getActiveAppSubscriptionStatuses(creds)
      check('C4: a refused token is ok:false', !denied.ok)
      answer({ data: { currentAppInstallation: null } })
      check('C5: a malformed answer is ok:false', !(await getActiveAppSubscriptionStatuses(creds)).ok)
      // MUTATION CONTROL — a confirmation that only checked "the query answered"
      // passes PENDING, so C2 detects a weakened gate.
      answer({ data: { currentAppInstallation: { activeSubscriptions: [{ status: 'PENDING' }] } } })
      const pending = await getActiveAppSubscriptionStatuses(creds)
      const weakened = (r: typeof pending) => r.ok
      check('C-MUT: a gate that ignored the status would have confirmed PENDING', weakened(pending) && !confirms(pending))
    } finally {
      globalThis.fetch = realFetch
    }
  }

  console.log(`\n${pass} passed, ${fail} failed`)
  if (fail) process.exit(1)
}

main().catch((err) => { console.error(err); process.exit(1) })

export {}
