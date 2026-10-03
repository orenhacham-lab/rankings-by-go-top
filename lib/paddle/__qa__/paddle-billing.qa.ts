/**
 * w21 — Paddle Billing as a second checkout behind an OFF switch. Run:
 *   npx tsx lib/paddle/__qa__/paddle-billing.qa.ts
 *
 *  A) config: flag off / any missing value = off; only exactly "true" + all values = on
 *  B) plan_code comes from the server-side price-id map; unknown ids map to nothing
 *  C) webhook signature: valid accepted (computed here), missing/bad/stale/future/tampered refused
 *  D) webhook processing (FakeAdmin + injected Paddle API): link, plan from price id,
 *     unknown price ignored, unknown user ignored, Shopify-governed refused,
 *     idempotent replay, order-safety, status mapping, market lock, failures non-2xx
 *  E) billing screen render: flag off = PayPal containers and no Paddle; flag on = Paddle buttons
 *  F) source guards: script only mounted when on, routes self-authenticate, signature
 *     before parse/DB, owner-filtered portal, no raw provider errors, no hard-coded prices
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { readFileSync, readdirSync, statSync } from 'fs'
import { join } from 'path'
import { createHmac } from 'crypto'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { FakeAdmin } from '../../__qa__/_fake-admin'
import { resolvePaddleConfig, planCodeForPaddlePriceId, type PaddleEnvSnapshot } from '../config'
import { computePaddleSignature, verifyPaddleSignature } from '../signature'
import { processVerifiedPaddleEvent, httpStatusForPaddleOutcome, type PaddleSubscription, type PaddleProcessDeps } from '../webhook-processing'
import { isPaddlePortalUrl } from '../api'
import { PLAN_CATALOG } from '../../plans/catalog'
import BillingView from '../../../app/(dashboard)/billing/BillingView'
import { DashboardLanguageProvider } from '../../i18n/dashboard/useDashboardLanguage'
import { dashboardHe } from '../../i18n/dashboard/he'

let pass = 0, fail = 0
function check(name: string, cond: boolean, detail?: string) {
  if (cond) { pass++; console.log(`  ✓ ${name}`) } else { fail++; console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`) }
}
const ROOT = join(__dirname, '..', '..', '..')
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8')
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1')

const PRICES = { regular: 'pri_01regular0000000000000000', advanced: 'pri_01advanced000000000000000', premium: 'pri_01premium00000000000000000', large_agency: 'pri_01agency000000000000000000' }
const FULL: PaddleEnvSnapshot = { enabled: 'true', environment: 'sandbox', clientToken: 'test_clienttoken', apiKey: 'pdl_apikey', webhookSecret: 'pdl_ntfset_secret', prices: { ...PRICES } }

async function main() {
  console.log('w21 — Paddle Billing (flag OFF by default) QA\n')

  console.log('A) Config fails closed')
  {
    check('all values + "true" = on', resolvePaddleConfig(FULL).enabled === true)
    check('flag unset = off', resolvePaddleConfig({ ...FULL, enabled: undefined }).enabled === false)
    for (const v of ['false', 'TRUE', '1', 'yes', ' ', 'on']) check(`flag "${v}" = off`, resolvePaddleConfig({ ...FULL, enabled: v }).enabled === false)
    check('environment missing = off', resolvePaddleConfig({ ...FULL, environment: undefined }).enabled === false)
    check('environment "live" = off', resolvePaddleConfig({ ...FULL, environment: 'live' }).enabled === false)
    check('client token missing = off', resolvePaddleConfig({ ...FULL, clientToken: '' }).enabled === false)
    check('API key missing = off', resolvePaddleConfig({ ...FULL, apiKey: undefined }).enabled === false)
    check('webhook secret missing = off', resolvePaddleConfig({ ...FULL, webhookSecret: undefined }).enabled === false)
    for (const code of Object.keys(PRICES) as (keyof typeof PRICES)[]) {
      check(`price ${code} missing = off`, resolvePaddleConfig({ ...FULL, prices: { ...PRICES, [code]: undefined } }).enabled === false)
    }
    check('two plans sharing one price id = off', resolvePaddleConfig({ ...FULL, prices: { ...PRICES, premium: PRICES.regular } }).enabled === false)
    const on = resolvePaddleConfig(FULL)
    check('the browser config carries no secret', on.enabled && !JSON.stringify(on.checkout).includes('pdl_apikey') && !JSON.stringify(on.checkout).includes('pdl_ntfset_secret'))
    // The live environment of this QA run has no Paddle values: off.
    for (const k of Object.keys(process.env)) if (k.includes('PADDLE')) delete process.env[k]
    const { paddleEnvSnapshot } = await import('../config')
    check('this environment (no Paddle env) = off', resolvePaddleConfig(paddleEnvSnapshot()).enabled === false)
  }

  console.log('\nB) plan_code from the server-side price-id map')
  {
    check('regular price -> regular', planCodeForPaddlePriceId(PRICES.regular, PRICES) === 'regular')
    check('large_agency price -> large_agency', planCodeForPaddlePriceId(PRICES.large_agency, PRICES) === 'large_agency')
    check('unknown price -> null', planCodeForPaddlePriceId('pri_01unknown0000000000000000', PRICES) === null)
    check('empty / non-string -> null', planCodeForPaddlePriceId('', PRICES) === null && planCodeForPaddlePriceId(undefined, PRICES) === null && planCodeForPaddlePriceId(42, PRICES) === null)
    check('unset env never matches', planCodeForPaddlePriceId('x', { regular: undefined, advanced: undefined, premium: undefined, large_agency: undefined }) === null)
    check('a plan code string is not a price id', planCodeForPaddlePriceId('premium', PRICES) === null)
  }

  console.log('\nC) Paddle-Signature verification')
  {
    const secret = 'pdl_ntfset_qa_secret'
    const body = JSON.stringify({ event_id: 'evt_1', event_type: 'subscription.created', data: { id: 'sub_01aaaaaaaaaaaaaaaaaaaaaaaaaa' } })
    const now = Date.UTC(2026, 9, 3, 12, 0, 0)
    const ts = Math.floor(now / 1000)
    const good = `ts=${ts};h1=${computePaddleSignature(secret, ts, body)}`
    check('valid signature accepted', verifyPaddleSignature(body, good, secret, now).ok === true)
    check('valid signature accepted 4 minutes later', verifyPaddleSignature(body, good, secret, now + 4 * 60_000).ok === true)
    const r = (h: string | null, s: string | null = secret, b = body, n = now) => { const v = verifyPaddleSignature(b, h, s, n); return v.ok ? 'ok' : v.reason }
    check('missing header refused', r(null) === 'missing_header')
    check('missing secret refused (fail closed)', r(good, '') === 'not_configured' && r(good, null) === 'not_configured')
    check('malformed header refused', r('garbage') === 'malformed_header' && r(`ts=${ts}`) === 'malformed_header' && r(`h1=${'a'.repeat(64)}`) === 'malformed_header')
    check('wrong secret refused', r(`ts=${ts};h1=${computePaddleSignature('other', ts, body)}`) === 'bad_signature')
    check('tampered body refused', r(good, secret, body.replace('evt_1', 'evt_2')) === 'bad_signature')
    check('stale timestamp (> 5 min) refused', r(good, secret, body, now + 6 * 60_000) === 'stale_timestamp')
    check('future timestamp (> 5 min) refused', r(good, secret, body, now - 6 * 60_000) === 'stale_timestamp')
    const oldTs = ts - 3600
    check('re-signed old timestamp still stale', r(`ts=${oldTs};h1=${computePaddleSignature(secret, oldTs, body)}`) === 'stale_timestamp')
    check('rotation: any one valid h1 accepted', r(`ts=${ts};h1=${'0'.repeat(64)};h1=${computePaddleSignature(secret, ts, body)}`) === 'ok')
    check('signature over body alone (no ts) refused', r(`ts=${ts};h1=${createHmac('sha256', secret).update(body).digest('hex')}`) === 'bad_signature')
  }

  console.log('\nD) Webhook processing')
  const USER = '11111111-1111-4111-8111-111111111111'
  const OTHER = '22222222-2222-4222-8222-222222222222'
  const SUB = 'sub_01paddlesub000000000000000'
  const live = (over: Partial<PaddleSubscription> = {}): PaddleSubscription => ({
    id: SUB, status: 'active', customer_id: 'ctm_01customer00000000000000', currency_code: 'ILS',
    current_billing_period: { starts_at: '2026-10-03T10:00:00Z', ends_at: '2026-11-03T10:00:00Z' },
    scheduled_change: null, items: [{ price: { id: PRICES.regular } }],
    custom_data: { user_id: USER, plan_code: 'large_agency' }, ...over,
  })
  const makeDeps = (sub: PaddleSubscription | (() => PaddleSubscription) | null, opts: { shopify?: boolean } = {}) => {
    const locks: { userId: string; market: string }[] = []
    let fetches = 0
    const deps: PaddleProcessDeps = {
      fetchSubscription: async () => { fetches++; const s = typeof sub === 'function' ? sub() : sub; return s ? { ok: true, subscription: s } : { ok: false, reason: 'http_500' } },
      planCodeForPriceId: (id) => planCodeForPaddlePriceId(id, PRICES),
      isShopifyGoverned: async () => !!opts.shopify,
      lockMarket: async (userId, market) => { locks.push({ userId, market }); return { kind: 'persisted' } },
    }
    return { deps, locks, fetches: () => fetches }
  }
  const seed = () => new FakeAdmin({
    profiles: [{ id: USER }, { id: OTHER }],
    subscriptions: [{ id: 'row-trial', user_id: USER, status: 'trial', plan_code: 'trial', trial_ends_at: '2026-10-10T00:00:00Z', created_at: '2026-10-03T00:00:00Z' }],
  })
  const ev = (type: string, data: Record<string, unknown> = { id: SUB }) => ({ event_id: 'evt_1', event_type: type, data })
  // Count writes by wrapping update/insert.
  const spy = (admin: FakeAdmin) => {
    const counter = { writes: 0 }
    const orig = admin.from.bind(admin)
    ;(admin as any).from = (t: string) => {
      const q: any = orig(t)
      for (const m of ['update', 'insert', 'upsert', 'delete']) { const f = q[m].bind(q); q[m] = (...a: unknown[]) => { counter.writes++; return f(...a) } }
      return q
    }
    return counter
  }

  {
    const admin = seed(); const w = spy(admin); const { deps, locks } = makeDeps(live())
    const o = await processVerifiedPaddleEvent(admin, ev('subscription.created', { id: SUB, custom_data: { user_id: USER } }), deps)
    const row = admin.tables.subscriptions.find((r) => r.id === 'row-trial') as any
    check('first event links the trial row IN PLACE', o.kind === 'linked' && admin.tables.subscriptions.length === 1, JSON.stringify(o))
    check('plan_code from the PRICE id (custom_data says large_agency, price is regular)', row.plan_code === 'regular')
    check('status active, paddle ids stored', row.status === 'active' && row.paddle_subscription_id === SUB && row.paddle_customer_id === 'ctm_01customer00000000000000')
    check('period from Paddle', row.current_period_start === '2026-10-03T10:00:00.000Z' && row.current_period_end === '2026-11-03T10:00:00.000Z')
    check('market locked from the charged currency (ILS)', locks.length === 1 && locks[0].market === 'ILS' && locks[0].userId === USER)
    check('200', httpStatusForPaddleOutcome(o) === 200)
    const before = w.writes
    const again = await processVerifiedPaddleEvent(admin, ev('subscription.created', { id: SUB, custom_data: { user_id: USER } }), deps)
    check('replay of the same event: unchanged, no write', again.kind === 'unchanged' && w.writes === before, JSON.stringify(again))
    const activated = await processVerifiedPaddleEvent(admin, ev('subscription.activated'), deps)
    check('subscription.activated after created: unchanged, no write', activated.kind === 'unchanged' && w.writes === before)
    check('still exactly one row', admin.tables.subscriptions.length === 1)
    const tx = await processVerifiedPaddleEvent(admin, ev('transaction.completed', { id: 'txn_01x', subscription_id: SUB, currency_code: 'ILS', custom_data: { user_id: OTHER } }), deps)
    check('transaction.completed on a linked row: custom_data user_id NOT re-read', tx.kind === 'unchanged' && (admin.tables.subscriptions[0] as any).user_id === USER)
  }
  {
    const admin = seed(); const { deps, locks } = makeDeps(live({ currency_code: 'USD' }))
    const o = await processVerifiedPaddleEvent(admin, ev('transaction.completed', { id: 'txn_01y', subscription_id: SUB, currency_code: 'USD', custom_data: { user_id: USER } }), deps)
    check('transaction.completed can link; market USD locked from the transaction currency', o.kind === 'linked' && locks[0]?.market === 'USD', JSON.stringify(o))
  }
  {
    const admin = seed(); const w = spy(admin); const { deps, locks } = makeDeps(live({ items: [{ price: { id: 'pri_01unknown0000000000000000' } }] }))
    const o = await processVerifiedPaddleEvent(admin, ev('subscription.created'), deps)
    check('unknown price id: ignored, nothing written, no lock', o.kind === 'ignored_unknown_price' && w.writes === 0 && locks.length === 0 && (admin.tables.subscriptions[0] as any).status === 'trial')
  }
  {
    const admin = seed(); const w = spy(admin); const { deps } = makeDeps(live({ items: [{ price: { id: PRICES.regular } }, { price: { id: PRICES.premium } }] }))
    const o = await processVerifiedPaddleEvent(admin, ev('subscription.created'), deps)
    check('two plan prices on one subscription: ignored', o.kind === 'ignored_unknown_price' && w.writes === 0)
  }
  {
    const admin = seed(); const w = spy(admin); const { deps } = makeDeps(live({ custom_data: { user_id: '99999999-9999-4999-8999-999999999999' } }))
    const o = await processVerifiedPaddleEvent(admin, ev('subscription.created'), deps)
    check('user_id of no existing user: ignored, nothing written', o.kind === 'ignored_unlinkable' && (o as any).reason === 'unknown_user' && w.writes === 0)
  }
  {
    const admin = seed(); const w = spy(admin); const { deps } = makeDeps(live({ custom_data: { user_id: "x' or 1=1" } }))
    const o = await processVerifiedPaddleEvent(admin, ev('subscription.created'), deps)
    check('malformed user_id: ignored', o.kind === 'ignored_unlinkable' && (o as any).reason === 'no_user_id' && w.writes === 0)
  }
  {
    const admin = seed(); const w = spy(admin); const { deps, locks } = makeDeps(live(), { shopify: true })
    const o = await processVerifiedPaddleEvent(admin, ev('subscription.created'), deps)
    check('Shopify-governed account: refused, nothing written, no lock', o.kind === 'refused_shopify_governed' && w.writes === 0 && locks.length === 0)
  }
  {
    const admin = new FakeAdmin({ profiles: [{ id: USER }], subscriptions: [{ id: 'row-pp', user_id: USER, status: 'active', plan_code: 'premium', paypal_subscription_id: 'I-PAYPAL1', current_period_end: '2026-10-20T00:00:00Z', created_at: '2026-09-20T00:00:00Z' }] })
    const w = spy(admin); const { deps } = makeDeps(live())
    const o = await processVerifiedPaddleEvent(admin, ev('subscription.created'), deps)
    check('active PayPal row: Paddle never overwrites it (refused, nothing written)', o.kind === 'refused_other_paid_subscription' && w.writes === 0 && (admin.tables.subscriptions[0] as any).plan_code === 'premium')
  }
  {
    // Out of order: the body says "activated" but Paddle's CURRENT state is canceled.
    const admin = seed(); const { deps: d1 } = makeDeps(live())
    await processVerifiedPaddleEvent(admin, ev('subscription.created'), d1)
    const { deps: d2 } = makeDeps(live({ status: 'canceled', canceled_at: '2026-10-20T00:00:00Z', current_billing_period: null }))
    const late = await processVerifiedPaddleEvent(admin, { event_type: 'subscription.activated', data: { id: SUB, status: 'active' } }, d2)
    const row = admin.tables.subscriptions[0] as any
    check('late "activated" after cancel converges on Paddle\'s current state (expired)', late.kind === 'updated' && row.status === 'expired' && row.current_period_end === '2026-10-20T00:00:00.000Z', JSON.stringify(row))
  }
  {
    const admin = seed(); const { deps: d1 } = makeDeps(live()); await processVerifiedPaddleEvent(admin, ev('subscription.created'), d1)
    const status = async (s: Partial<PaddleSubscription>) => { const { deps } = makeDeps(live(s)); await processVerifiedPaddleEvent(admin, ev('subscription.updated'), deps); return (admin.tables.subscriptions[0] as any).status }
    check('scheduled cancel -> cancelled (access to period end)', await status({ scheduled_change: { action: 'cancel', effective_at: '2026-11-03T10:00:00Z' } }) === 'cancelled')
    check('past_due -> inactive', await status({ status: 'past_due' }) === 'inactive')
    check('paused -> inactive', await status({ status: 'paused' }) === 'inactive')
    check('resumed (active) -> active', await status({ status: 'active' }) === 'active')
    const { deps } = makeDeps(live({ items: [{ price: { id: PRICES.premium } }] }))
    await processVerifiedPaddleEvent(admin, ev('subscription.updated'), deps)
    check('plan change in Paddle -> plan_code from the new price id', (admin.tables.subscriptions[0] as any).plan_code === 'premium')
  }
  {
    const admin = seed(); const w = spy(admin); const { deps } = makeDeps(live({ status: 'trialing' }))
    const o = await processVerifiedPaddleEvent(admin, ev('subscription.created'), deps)
    check('a Paddle trial is never turned into entitlement', o.kind === 'ignored_unsupported_status' && w.writes === 0)
  }
  {
    const admin = seed(); const { deps } = makeDeps(null)
    const o = await processVerifiedPaddleEvent(admin, ev('subscription.created'), deps)
    check('Paddle API unavailable: non-2xx (retry), nothing written', o.kind === 'subscription_unavailable' && httpStatusForPaddleOutcome(o) >= 500)
  }
  {
    const admin = new FakeAdmin({ profiles: [{ id: USER }], subscriptions: [] }, { subscriptions: { select: () => ({ message: 'db down' }) } })
    const { deps } = makeDeps(live())
    const o = await processVerifiedPaddleEvent(admin, ev('subscription.created'), deps)
    check('DB lookup error: 500 (retry)', o.kind === 'lookup_failed' && httpStatusForPaddleOutcome(o) === 500)
  }
  {
    const admin = seed(); const { deps } = makeDeps(live())
    check('unhandled event type: ignored 200', (await processVerifiedPaddleEvent(admin, ev('customer.updated'), deps)).kind === 'ignored_unhandled_event')
    check('one-off transaction (no subscription): ignored', (await processVerifiedPaddleEvent(admin, ev('transaction.completed', { id: 'txn_1' }), deps)).kind === 'ignored_no_subscription')
    check('malformed event: ignored', (await processVerifiedPaddleEvent(admin, { event_type: 'subscription.created' } as any, deps)).kind === 'ignored_malformed_event')
  }
  {
    const admin = new FakeAdmin({ profiles: [{ id: USER }], subscriptions: [] }); const { deps } = makeDeps(live())
    const o = await processVerifiedPaddleEvent(admin, ev('subscription.created'), deps)
    check('no prior row: a fresh row is inserted for the user', o.kind === 'linked' && admin.tables.subscriptions.length === 1 && (admin.tables.subscriptions[0] as any).user_id === USER)
  }
  check('portal URL must be https on paddle.com', isPaddlePortalUrl('https://customer-portal.paddle.com/cpl_1') && isPaddlePortalUrl('https://sandbox-customer-portal.paddle.com/x') && !isPaddlePortalUrl('https://evil.com/paddle.com') && !isPaddlePortalUrl('https://paddle.com.evil.com/') && !isPaddlePortalUrl('http://customer-portal.paddle.com/'))

  console.log('\nE) Billing screen')
  {
    const base: any = { plan: 'trial', hasActiveSubscription: false, trialActive: true, trialEndsAt: '2026-10-10T00:00:00Z', subscriptionEndsAt: null, hasPaypalSubscriptionId: false, renewalCancelled: false, shopifyConnected: false, shopifyMigrationStatus: null, market: 'ILS', marketLocked: false, planPrices: { trial: 0, regular: 249, advanced: 549, premium: 999, large_agency: 1999 } }
    const render = (p: any) => renderToStaticMarkup(createElement(DashboardLanguageProvider, { initialLocale: 'he' } as any, createElement(BillingView, p)))
    const off = render(base)
    check('flag off: the 4 PayPal containers render', ['regular', 'advanced', 'premium', 'large_agency'].every((c) => off.includes(`id="paypal-button-${c}"`)))
    check('flag off: nothing Paddle in the markup', !/paddle/i.test(off))
    check('flag off: paddle={null} renders byte-for-byte the same as no prop', render({ ...base, paddle: null }) === off)
    const cfg = { environment: 'sandbox', clientToken: 'test_x', prices: PRICES, userId: USER, email: 'a@b.co' }
    const on = render({ ...base, paddle: cfg })
    check('flag on: 4 Paddle buttons', ['regular', 'advanced', 'premium', 'large_agency'].every((c) => on.includes(`data-paddle-plan="${c}"`)))
    check('flag on: no PayPal container', !on.includes('paypal-button-'))
    check('flag on: the PayPal client (SDK loader) is not mounted', !on.includes(dashboardHe.billing.paypal.loading) && off.includes(dashboardHe.billing.paypal.loading))
    check('flag on: Hebrew tax note shown', on.includes(dashboardHe.billing.paddle.taxNote))
    check('flag on: prices still from the catalog', on.includes('249') && on.includes('1,999'))
    const sub = render({ ...base, paddle: cfg, plan: 'regular', hasActiveSubscription: true, trialActive: false, hasPaddleSubscription: true, subscriptionEndsAt: '2026-11-03T00:00:00Z' })
    check('Paddle subscriber: no second checkout, manage button shown', !sub.includes('data-paddle-plan') && sub.includes('data-paddle-manage') && sub.includes(dashboardHe.billing.paddle.changePlan))
    const shop = render({ ...base, paddle: cfg, shopifyConnected: true })
    check('Shopify-governed: no Paddle and no PayPal at all', !/paddle/i.test(shop) && !shop.includes('paypal-button-'))
    const unavailable = render({ ...base, paddle: cfg, billingStateUnavailable: true })
    check('governance unreadable: no Paddle', !/data-paddle/i.test(unavailable))
  }

  console.log('\nF) Source guards')
  {
    const view = strip(read('app/(dashboard)/billing/BillingView.tsx'))
    const page = strip(read('app/(dashboard)/billing/page.tsx'))
    const checkout = strip(read('app/(dashboard)/billing/paddle-checkout.tsx'))
    const hook = strip(read('app/api/paddle/webhook/route.ts'))
    const portal = strip(read('app/api/paddle/portal/route.ts'))
    check('view: Paddle provider only in the paddle branch, PayPal client only in the other', /\{paddle \? \(\s*<PaddleCheckoutProvider[\s\S]*?\) : \(\s*<>\s*\{planGrid\}\s*<BillingClient market=\{market\} \/>/.test(view))
    const providerBlock = view.slice(view.indexOf('<PaddleCheckoutProvider'), view.indexOf('</PaddleCheckoutProvider>'))
    check('view: the Paddle branch never mounts the PayPal client', providerBlock.length > 0 && !providerBlock.includes('BillingClient'))
    check('view: no action at all when paddle is null', /if \(!paddle\) return undefined/.test(view))
    check('script injected only by paddle-checkout.tsx', checkout.includes('PADDLE_JS_SRC') && !view.includes('cdn.paddle.com') && !page.includes('cdn.paddle.com'))
    check('page: admin returns before any Paddle decision is used', page.indexOf('entitlement.isAdmin') > -1 && page.indexOf('entitlement.isAdmin') < page.indexOf('const paddle ='))
    check('page: Paddle requires enabled config, no Shopify, readable governance, no PayPal row', /paddleConfig\.enabled && !governanceUnavailable && !shopifyConnected && !currentSub\?\.paypal_subscription_id/.test(page))
    check('page: flag off selects exactly the pre-Paddle columns', page.includes(": 'status, paypal_subscription_id')"))
    check('webhook: signature verified before JSON.parse and before the DB client', hook.indexOf('verifyPaddleSignature(') > -1 && hook.indexOf('verifyPaddleSignature(') < hook.indexOf('JSON.parse') && hook.indexOf('verifyPaddleSignature(') < hook.indexOf('createAdminClient()'))
    check('webhook: a failed signature returns 401 before anything else', /if \(!verified\.ok\) \{[\s\S]{0,240}?return Response\.json\(\{ error: 'invalid_signature' \}, \{ status: 401 \}\)/.test(hook))
    check('webhook: market lock reuses lockBillingMarket into app_metadata', hook.includes('lockBillingMarket(') && hook.includes('app_metadata: { [STORED_MARKET_KEY]: m }'))
    check('portal: authenticates and filters by the signed-in owner', portal.includes('auth.getUser()') && portal.includes(".eq('user_id', user.id)"))
    const bodies = [...hook.matchAll(/Response\.json\(([^\n]*)/g), ...portal.matchAll(/Response\.json\(([^\n]*)/g)].map((m) => m[1])
    check('routes never return provider text (no message/reason in a response body)', bodies.length > 0 && bodies.every((b) => !/\.message|\.reason|statusText|text\(\)/.test(b)), bodies.find((b) => /\.message|\.reason/.test(b)))
    check('client never shows a raw error to the merchant', !/setMessage\(\{[^}]*(err|error)\.message/.test(checkout) && !/\{(err|error)\.message\}/.test(checkout))
    // No hard-coded prices anywhere in the Paddle code.
    const files: string[] = []
    const walk = (d: string) => { for (const f of readdirSync(join(ROOT, d))) { const p = join(d, f); if (statSync(join(ROOT, p)).isDirectory()) { if (f !== '__qa__') walk(p) } else files.push(p) } }
    walk('lib/paddle'); walk('app/api/paddle'); files.push('app/(dashboard)/billing/paddle-checkout.tsx')
    const amounts = Object.values(PLAN_CATALOG).flatMap((p) => [p.priceILS, p.priceUSD])
    const offenders = files.filter((f) => amounts.some((a) => new RegExp(`(?<![\\w.])${a}(?![\\w.])`).test(strip(read(f)))))
    check('no plan price literal in Paddle code (catalog is the single source)', offenders.length === 0, offenders.join(', '))
    check('no "next" redirect parameter in Paddle code', files.every((f) => !/[?&]next=/.test(read(f))))
  }

  console.log(`\n${pass} passed, ${fail} failed`)
  if (fail > 0) process.exitCode = 1
}
main()
export {}
