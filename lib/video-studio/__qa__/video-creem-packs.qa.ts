/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Credit packs through Creem (USD): the product and price are ours, the grant comes only from
 * Creem's own read-back of the checkout, and the return page and the webhook cannot double-pay.
 * Mutation controls included.
 * Run: npx tsx lib/video-studio/__qa__/video-creem-packs.qa.ts
 */
import { readFileSync } from 'fs'
import { join } from 'path'
import { createPackCheckout, confirmPackCheckout, type CreemPackDeps } from '../creem-packs'
import { isVideoCreditCheckoutEvent } from '../creem-webhook'
import { creemPackProductId, packForCreemProductId } from '../creem-products'

let passed = 0, failed = 0
const ok = (c: boolean, m: string) => { if (c) passed++; else { failed++; console.log('FAIL:', m) } }
const U = 'user-1'
const P30 = 'prod_1xw6wulXfUT5P4ibFpp1Ur'
const P100 = 'prod_y2rlPAtrCIIXpgU4zrvYf'

const snap = (over: any = {}) => ({ id: 'ch_abc123', status: 'completed', productId: P30, requestId: U, metadata: { user_id: U, pack: 'p30', kind: 'video_credits' }, orderId: 'ord_1', orderStatus: 'paid', currency: 'USD', amount: 900, ...over })
function deps(checkout: any, booked = new Set<string>()) {
  const created: any[] = []; const grants: any[] = []
  const d: CreemPackDeps = {
    createCheckout: async (p) => { created.push(p); return { ok: true, value: { id: 'ch_new', checkoutUrl: 'https://creem.io/pay/x' } } },
    readCheckout: async () => (checkout === null ? { ok: false, reason: 'network' } as any : { ok: true, value: checkout }),
    grant: async (g) => { grants.push(g); if (booked.has(g.ref)) return false; booked.add(g.ref); return true },
  }
  return { d, created, grants }
}

async function main() {
  process.env.CREEM_MODE = 'live'
  delete process.env.CREEM_VIDEO_PRODUCT_P30; delete process.env.CREEM_VIDEO_PRODUCT_P100
  ok(creemPackProductId('p30') === P30 && creemPackProductId('p100') === P100, 'A1 live mode uses the products created in Creem')
  ok(packForCreemProductId(P100) === 'p100' && packForCreemProductId('prod_other') === null && packForCreemProductId(null) === null, 'A2 product id maps back to a pack, unknown to none')
  process.env.CREEM_MODE = 'test'
  ok(creemPackProductId('p30') === null, 'A3 test mode has no default id (live ids never used in sandbox)')
  process.env.CREEM_VIDEO_PRODUCT_P30 = 'prod_test_30'
  ok(creemPackProductId('p30') === 'prod_test_30' && packForCreemProductId('prod_test_30') === 'p30', 'A4 env override works')
  delete process.env.CREEM_VIDEO_PRODUCT_P30
  process.env.CREEM_MODE = 'live'

  { const { d, created } = deps(snap()); const r = await createPackCheckout(d, { id: U, email: 'a@b.c' }, 'p100')
    ok(r.ok && created[0].productId === P100 && created[0].requestId === U && created[0].metadata.kind === 'video_credits' && created[0].metadata.pack === 'p100', 'B1 checkout opens for OUR product, tagged with user and pack') }
  for (const bad of ['p9999', undefined, '__proto__', 30]) {
    const { d, created } = deps(snap()); const r = await createPackCheckout(d, { id: U }, bad)
    ok(!r.ok && created.length === 0, `B2 invalid pack ${String(bad)} never reaches Creem`)
  }
  { process.env.CREEM_MODE = 'test'; const { d, created } = deps(snap()); const r = await createPackCheckout(d, { id: U }, 'p30')
    ok(!r.ok && r.error === 'not_configured' && created.length === 0, 'B3 sandbox with no configured product is unavailable, not guessed'); process.env.CREEM_MODE = 'live' }

  { const { d, grants } = deps(snap()); const r = await confirmPackCheckout(d, U, 'ch_abc123')
    ok(r.ok && r.credits === 30 && !r.alreadyBooked && grants[0].ref === 'ch_abc123' && grants[0].currency === 'USD' && grants[0].amountMinor === 900, 'C1 a completed matching checkout grants the pack') }
  { const booked = new Set<string>(); await confirmPackCheckout(deps(snap(), booked).d, U, 'ch_abc123')
    const r = await confirmPackCheckout(deps(snap(), booked).d, null, 'ch_abc123')
    ok(r.ok && r.alreadyBooked && booked.size === 1, 'C2 return page then webhook (or twice) books once') }
  { const { d, grants } = deps(snap({ productId: P100, metadata: { user_id: U, pack: 'p100', kind: 'video_credits' }, amount: 2700 })); const r = await confirmPackCheckout(d, U, 'ch_abc123')
    ok(r.ok && r.credits === 100 && grants[0].amountMinor === 2700, 'C3 the big pack grants 100') }
  { const { d, grants } = deps(snap({ amount: 1100 })); const r = await confirmPackCheckout(d, U, 'ch_abc123')
    ok(r.ok && grants.length === 1, 'C4 an amount above the price (tax shown) still grants') }
  const refuse: [string, any, string, string | null][] = [
    ['not completed', snap({ status: 'pending' }), 'not_completed', U],
    ['order not paid', snap({ orderStatus: 'unpaid' }), 'not_completed', U],
    ['unknown product', snap({ productId: 'prod_sub_plan' }), 'mismatch', U],
    ['another user (caller differs)', snap({ requestId: 'user-2', metadata: { user_id: 'user-2', pack: 'p30' } }), 'mismatch', U],
    ['request id vs metadata disagree', snap({ requestId: 'user-2' }), 'mismatch', null],
    ['pack metadata vs product disagree', snap({ metadata: { user_id: U, pack: 'p100' } }), 'mismatch', U],
    ['underpaid', snap({ amount: 100 }), 'mismatch', U],
    ['wrong currency', snap({ currency: 'EUR' }), 'mismatch', U],
    ['no owner', snap({ requestId: null, metadata: null }), 'mismatch', null],
  ]
  for (const [n, body, code, exp] of refuse) {
    const { d, grants } = deps(body); const r = await confirmPackCheckout(d, exp, 'ch_abc123')
    ok(!r.ok && r.error === code && grants.length === 0, `D ${n}: refused, nothing granted`)
  }
  { const { d, grants } = deps(null); const r = await confirmPackCheckout(d, U, 'ch_abc123'); ok(!r.ok && r.error === 'provider_failed' && grants.length === 0, 'D10 Creem unreachable grants nothing') }
  { const { d, grants } = deps(snap()); const r = await confirmPackCheckout(d, U, '../../x'); ok(!r.ok && grants.length === 0, 'D11 a path-like checkout id is refused') }
  { const d: CreemPackDeps = { createCheckout: async () => { throw new Error('raw provider text') }, readCheckout: async () => { throw new Error('raw provider text') }, grant: async () => true }
    const a = await createPackCheckout(d, { id: U }, 'p30'); const b = await confirmPackCheckout(d, U, 'ch_abc123')
    ok(!a.ok && !b.ok && !JSON.stringify([a, b]).includes('raw'), 'D12 provider errors never leak') }
  { const d = { ...deps(snap()).d, grant: async () => null }; const r = await confirmPackCheckout(d, U, 'ch_abc123'); ok(!r.ok && r.error === 'unexpected', 'D13 a database failure is an error, not a silent success') }
  { process.env.CREEM_MODE = 'test'; process.env.CREEM_VIDEO_PRODUCT_P30 = P30; delete process.env.CREEM_TEST_ACCOUNT_IDS
    const { d, grants } = deps(snap()); const r = await confirmPackCheckout(d, U, 'ch_abc123')
    ok(!r.ok && grants.length === 0, 'D14 sandbox payment cannot credit a non-test account'); process.env.CREEM_MODE = 'live'; delete process.env.CREEM_VIDEO_PRODUCT_P30 }

  // webhook recognition
  const ev = (o: any = {}) => ({ eventType: 'checkout.completed', object: { id: 'ch_abc123', metadata: { kind: 'video_credits' }, ...o } })
  ok(isVideoCreditCheckoutEvent(ev())?.checkoutId === 'ch_abc123', 'E1 webhook recognises a credit checkout')
  ok(isVideoCreditCheckoutEvent({ event_type: 'checkout.completed', object: { id: 'c1', metadata: { kind: 'video_credits' } } })?.checkoutId === 'c1', 'E2 snake_case event type too')
  ok(isVideoCreditCheckoutEvent({ ...ev(), eventType: 'subscription.paid' }) === null, 'E3 other events are not credit checkouts')
  ok(isVideoCreditCheckoutEvent(ev({ metadata: { kind: 'plan' } })) === null && isVideoCreditCheckoutEvent(ev({ metadata: null })) === null, 'E4 plan checkouts keep the subscription path')
  ok(isVideoCreditCheckoutEvent(null) === null && isVideoCreditCheckoutEvent('x') === null, 'E5 junk is ignored')

  const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
  const read = (p: string) => strip(readFileSync(join(__dirname, p), 'utf8'))
  const lib = read('../creem-packs.ts'), gate = read('../pack-gate.ts'), deps2 = read('../pack-deps.ts')
  const hook = strip(readFileSync(join(__dirname, '../../../app/api/creem/webhook/route.ts'), 'utf8'))
  ok(!/body\??\.(amount|price|productId|product_id)/.test(lib) && /creemPackProductId\(pack\)/.test(lib), 'F1 product and price come from our config, not the caller')
  ok(/creemMayWriteToAccount/.test(lib) && /creemMayWriteToAccount/.test(gate), 'F2 sandbox account guard on confirm and gate')
  ok(/restrictionForRequest/.test(gate) && /koreaOwnSaleBlockedForRequest/.test(gate) && /isShopifyBillingRequiredForUser/.test(gate) && /isCreemEnabled/.test(gate), 'F3 gate keeps sanctions, Korea, Shopify and the Creem flag')
  ok(/successUrl:\s*`\$\{creemReturnOrigin\(\)\}\/video-studio/.test(deps2), 'F4 return URL is our own origin and a fixed path')
  ok(/isVideoCreditCheckoutEvent/.test(hook) && hook.indexOf('isVideoCreditCheckoutEvent') > hook.indexOf('verifyCreemSignature'), 'F5 webhook handles credit checkouts only after the signature check')
  ok(!/console\./.test(lib), 'F6 no logging in the purchase logic')

  // Mutation controls
  { const { d, grants } = deps(snap({ status: 'pending' })); await confirmPackCheckout(d, U, 'ch_abc123'); ok(grants.length === 0, 'M1 an unpaid checkout is not granted (if it were, this would fail)') }
  ok(!/creemMayWriteToAccount/.test(lib.replaceAll('creemMayWriteToAccount', 'x')), 'M2 removing the sandbox guard fails F2')
  ok(!/isVideoCreditCheckoutEvent/.test(hook.replaceAll('isVideoCreditCheckoutEvent', 'x')), 'M3 removing the webhook hook fails F5')
  console.log(`${passed} passed, ${failed} failed`)
  if (failed) process.exit(1)
}
main()
export {}
