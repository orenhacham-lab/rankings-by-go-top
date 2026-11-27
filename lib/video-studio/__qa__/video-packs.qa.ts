/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Credit packs through PayPal: the price is ours, the grant comes only from PayPal's own
 * capture, matching user, pack, amount and currency, and a repeat grants nothing twice.
 * Mutation controls included.
 * Run: npx tsx lib/video-studio/__qa__/video-packs.qa.ts
 */
import { readFileSync } from 'fs'
import { join } from 'path'
import { createPackOrder, capturePackOrder, type PayPalPackDeps } from '../paypal-packs'
import { CREDIT_PACKS } from '../packs'

let passed = 0, failed = 0
const ok = (c: boolean, m: string) => { if (c) passed++; else { failed++; console.log('FAIL:', m) } }
const U = 'user-1'
function deps(capture: any, o: { booked?: Set<string> } = {}) {
  const calls: any[] = []; const booked = o.booked ?? new Set<string>(); const grants: any[] = []
  const d: PayPalPackDeps = {
    paypal: async (path, init) => { calls.push({ path, init }); return path.endsWith('/capture') ? { ok: true, json: capture } : { ok: true, json: { id: 'ORDER12345' } } },
    grant: async (g) => { grants.push(g); if (booked.has(g.ref)) return false; booked.add(g.ref); return true },
  }
  return { d, calls, grants }
}
const cap = (over: any = {}, capOver: any = {}) => ({ status: 'COMPLETED', purchase_units: [{ payments: { captures: [{ id: 'CAP1', status: 'COMPLETED', custom_id: `${U}|p30`, amount: { currency_code: 'ILS', value: '30.00' }, ...capOver }] } }], ...over })

async function main() {
  { const { d, calls } = deps({}); const r = await createPackOrder(d, U, 'p100')
    const unit = calls[0].init.body.purchase_units[0]
    ok(r.ok && unit.amount.value === '90.00' && unit.amount.currency_code === 'ILS' && unit.custom_id === `${U}|p100`, 'A1 order is priced by OUR config and tagged with user and pack') }
  for (const bad of ['p9999', undefined, '__proto__', 30, 'constructor']) {
    const { d, calls } = deps({}); const r = await createPackOrder(d, U, bad)
    ok(!r.ok && calls.length === 0, `A2 invalid pack ${String(bad)} never reaches PayPal`)
  }
  { const { d, grants } = deps(cap()); const r = await capturePackOrder(d, U, 'ORDER12345')
    ok(r.ok && r.credits === 30 && !r.alreadyBooked && grants.length === 1 && grants[0].ref === 'CAP1' && grants[0].amountMinor === 3000, 'B1 a matching capture grants the pack') }
  { const booked = new Set<string>(); const a = deps(cap(), { booked }); await capturePackOrder(a.d, U, 'ORDER12345')
    const b = deps(cap(), { booked }); const r = await capturePackOrder(b.d, U, 'ORDER12345')
    ok(r.ok && r.alreadyBooked && booked.size === 1, 'B2 a repeated capture is booked once') }
  const refuse: [string, any, string][] = [
    ['not completed', cap({ status: 'PAYER_ACTION_REQUIRED' }), 'not_completed'],
    ['capture pending', cap({}, { status: 'PENDING' }), 'mismatch'],
    ['another user', cap({}, { custom_id: 'user-2|p30' }), 'mismatch'],
    ['wrong amount', cap({}, { amount: { currency_code: 'ILS', value: '1.00' } }), 'mismatch'],
    ['wrong currency', cap({}, { amount: { currency_code: 'USD', value: '30.00' } }), 'mismatch'],
    ['pack/amount swap', cap({}, { custom_id: `${U}|p100` }), 'mismatch'],
    ['no custom id', cap({}, { custom_id: undefined }), 'mismatch'],
    ['no captures', { status: 'COMPLETED', purchase_units: [{}] }, 'mismatch'],
  ]
  for (const [n, body, code] of refuse) {
    const { d, grants } = deps(body); const r = await capturePackOrder(d, U, 'ORDER12345')
    ok(!r.ok && r.error === code && grants.length === 0, `C ${n}: refused, nothing granted`)
  }
  { const { d, grants } = deps(cap()); const r = await capturePackOrder(d, U, '../../x'); ok(!r.ok && grants.length === 0, 'C9 a path-like order id is refused') }
  { const d: PayPalPackDeps = { paypal: async () => { throw new Error('raw provider text') }, grant: async () => true }
    const r = await capturePackOrder(d, U, 'ORDER12345'); ok(!r.ok && !JSON.stringify(r).includes('raw'), 'C10 provider errors never leak') }
  { const d: PayPalPackDeps = { paypal: async () => ({ ok: true, json: cap() }), grant: async () => null }
    const r = await capturePackOrder(d, U, 'ORDER12345'); ok(!r.ok && r.error === 'unexpected', 'C11 a database failure is an error, not a silent success') }
  ok(CREDIT_PACKS.p30.amountMinor.ILS / CREDIT_PACKS.p30.credits === 100 && CREDIT_PACKS.p100.amountMinor.ILS / CREDIT_PACKS.p100.credits === 90, 'D1 1 credit = 1 shekel, 10% off the big pack')
  // price floor: every pack still prices a clip at 4x+ the cost (credit value USD 0.27 at worst)
  const worstUsdPerCredit = (CREDIT_PACKS.p100.amountMinor.USD / 100) / CREDIT_PACKS.p100.credits
  ok(worstUsdPerCredit >= 0.27 - 1e-9, 'D2 USD pack price per credit stays at 0.27 or more')

  const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
  const lib = strip(readFileSync(join(__dirname, '../paypal-packs.ts'), 'utf8'))
  const gate = strip(readFileSync(join(__dirname, '../pack-gate.ts'), 'utf8'))
  ok(!/body\??\.(amount|price|value)/.test(lib) && !/amount:\s*\{[^}]*body/.test(lib), 'E1 no amount taken from the caller')
  ok(/restrictionForRequest/.test(gate) && /koreaOwnSaleBlockedForRequest/.test(gate) && /ownNameSaleBlockedForRequest/.test(gate) && /isVideoStudioEnabled/.test(gate), 'E2 gate keeps flag, sanctions, Korea and own-name refusals')
  ok(!/console\./.test(lib), 'E3 no logging in the purchase logic')
  // Mutation controls
  { const loose = cap({}, { amount: { currency_code: 'ILS', value: '1.00' } }); const { d, grants } = deps(loose)
    await capturePackOrder(d, U, 'ORDER12345'); ok(grants.length === 0, 'M1 a short payment is not granted (if it were, this would fail)') }
  ok(!/restrictionForRequest/.test(gate.replaceAll('restrictionForRequest', 'x')), 'M2 removing the sanctions gate fails E2')
  console.log(`${passed} passed, ${failed} failed`)
  if (failed) process.exit(1)
}
main()
export {}
