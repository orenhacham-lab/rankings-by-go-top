/**
 * A paid receipt must reach the account its buyer signed up with, and must
 * never reach anyone else.
 *
 * The case this exists for: Digistore24's reviewer bought order 78906016 at
 * 12:00 UTC on 14.11.2026, created an account under the same address a minute
 * later without opening the emailed link, and was left on a 7-day trial. We
 * told them a purchase would attach itself.
 *
 * Every guard here has a mutation control: the fake is changed to the shape the
 * guard forbids, and the suite shows the guard catching it.
 */
import { autoClaimByBuyerEmail, verifiedEmailOf } from '../auto-claim'

let passed = 0
let failed = 0
const check = (name: string, ok: boolean, extra = '') => {
  if (ok) { passed++; console.log(`  ✓ ${name}`) }
  else { failed++; console.log(`  ✗ ${name}${extra ? ` — ${extra}` : ''}`) }
}

type Row = Record<string, unknown>
type FakeOpts = {
  subscriptions?: Row[]
  orders?: Row[]
  rpc?: string
  subError?: boolean
  orderError?: boolean
}

/** The slice of the Supabase client this module uses, and a record of what it asked. */
function fakeAdmin(opts: FakeOpts) {
  const asked: { table?: string; filters: Record<string, unknown>; rpc?: string } = { filters: {} }
  const builder = (table: string) => {
    asked.table = table
    const api: Record<string, unknown> = {}
    const self = () => api as never
    api.select = self
    api.eq = (col: string, val: unknown) => { asked.filters[`${table}.${col}`] = val; return self() }
    api.in = (col: string, vals: unknown[]) => { asked.filters[`${table}.${col}`] = vals; return self() }
    api.is = (col: string, val: unknown) => { asked.filters[`${table}.${col}:is`] = val; return self() }
    api.order = () => self()
    api.limit = () => {
      if (table === 'subscriptions') return Promise.resolve(opts.subError ? { error: { message: 'x' } } : { data: opts.subscriptions ?? [], error: null })
      return Promise.resolve(opts.orderError ? { error: { message: 'x' } } : { data: opts.orders ?? [], error: null })
    }
    return api
  }
  return {
    asked,
    client: {
      from: (table: string) => builder(table),
      rpc: async (_fn: string, _args: unknown) => { asked.rpc = opts.rpc ?? 'claimed'; return { data: opts.rpc ?? 'claimed', error: null } },
    },
  }
}

const buyer = { id: 'u1', email: 'Raven.Pinlac@Gmail.com', email_confirmed_at: '2026-11-14T12:01:00Z' }
const order = [{ claim_token: 'tok_1' }]

async function main() {
  console.log('\nA) The buyer who signed up with the address they paid with')
  {
    const f = fakeAdmin({ subscriptions: [], orders: order })
    const out = await autoClaimByBuyerEmail(f.client, buyer)
    check('A1: the receipt is claimed', out === 'claimed', out)
    check('A2: matched on the address lower-cased, as the table stores it',
      f.asked.filters['marketplace_orders.buyer_email'] === 'raven.pinlac@gmail.com')
    check('A3: only a paid receipt, and only an unclaimed one',
      f.asked.filters['marketplace_orders.status'] === 'paid' && f.asked.filters['marketplace_orders.claimed_at:is'] === null)
  }

  console.log('\nB) An unverified address is never matched')
  {
    const f = fakeAdmin({ subscriptions: [], orders: order })
    const out = await autoClaimByBuyerEmail(f.client, { ...buyer, email_confirmed_at: null })
    check('B1: nothing is claimed', out === 'not_eligible', out)
    check('B2-MUT: and the same fake DOES claim once the address is confirmed',
      (await autoClaimByBuyerEmail(fakeAdmin({ subscriptions: [], orders: order }).client, buyer)) === 'claimed')
    check('B3: verifiedEmailOf refuses an unconfirmed address', verifiedEmailOf({ id: 'u', email: 'a@b.com' }) === null)
    check('B4: and accepts a confirmed one, normalised', verifiedEmailOf({ id: 'u', email: ' A@B.com ', email_confirmed_at: 'now' }) === 'a@b.com')
  }

  console.log('\nC) An account that already pays is left alone')
  {
    for (const status of ['active', 'cancelled']) {
      const f = fakeAdmin({ subscriptions: [{ status }], orders: order })
      const out = await autoClaimByBuyerEmail(f.client, buyer)
      check(`C1-${status}: nothing is claimed over an existing paid plan`, out === 'not_eligible', out)
      check(`C2-${status}: and the receipts were never even read`, f.asked.filters['marketplace_orders.buyer_email'] === undefined)
    }
    check('C3-MUT: with no such row the same input DOES claim',
      (await autoClaimByBuyerEmail(fakeAdmin({ subscriptions: [], orders: order }).client, buyer)) === 'claimed')
  }

  console.log('\nD) Nothing to claim, and failures that must not look like "no"')
  {
    check('D1: no receipt for that address', (await autoClaimByBuyerEmail(fakeAdmin({ subscriptions: [], orders: [] }).client, buyer)) === 'no_order')
    check('D2: a subscription read that failed is `failed`, not `no_order`',
      (await autoClaimByBuyerEmail(fakeAdmin({ subError: true }).client, buyer)) === 'failed')
    check('D3: a receipt read that failed is `failed`',
      (await autoClaimByBuyerEmail(fakeAdmin({ subscriptions: [], orderError: true }).client, buyer)) === 'failed')
    check('D4: the database function\'s own refusal is carried, not swallowed',
      (await autoClaimByBuyerEmail(fakeAdmin({ subscriptions: [], orders: order, rpc: 'order_unavailable' }).client, buyer)) === 'unavailable')
    check('D5: a second load after the first claim says so',
      (await autoClaimByBuyerEmail(fakeAdmin({ subscriptions: [], orders: order, rpc: 'already_claimed_by_this_account' }).client, buyer)) === 'already_claimed')
    check('D6: it never throws on a broken client',
      (await autoClaimByBuyerEmail({ from: () => { throw new Error('boom') } }, buyer)) === 'failed')
  }

  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed > 0) process.exitCode = 1
}

void main()

export {}
