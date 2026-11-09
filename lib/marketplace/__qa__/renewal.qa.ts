/**
 * A MARKETPLACE RENEWAL, END TO END.
 *
 * What it covers: the two shapes a renewal arrives in (Digistore24 charges
 * the same order item again; JVZoo gives the rebill its own id), the
 * transition's answer in every state the receipt can be in, and the two
 * refusals that must never quietly restore access — a charge on a withdrawn
 * order, and a claimed receipt with no entitlement carrying it.
 *
 * WHY IT MATTERS: before this existed, a buyer who kept paying lost access at
 * the end of the first month they bought. On Digistore24 the renewal looked
 * exactly like a redelivered webhook; on JVZoo it inserted a second receipt
 * and mailed a second claim link, leaving the entitlement they already held
 * to lapse.
 *
 * MUTATION CONTROLS throughout: every source guard is also run against the
 * broken version of what it protects and must fail there.
 *
 * Run: npx tsx lib/marketplace/__qa__/renewal.qa.ts
 */
import { readFileSync } from 'fs'

// The product map is configuration, so the two providers this suite exercises
// are configured here before the module under test reads it.
for (const key of Object.keys(process.env)) if (key.startsWith('MARKETPLACE_')) delete process.env[key]
process.env.MARKETPLACE_DIGISTORE24_PRODUCT_ADVANCED = 'PROD-ADV'
process.env.MARKETPLACE_JVZOO_PRODUCT_ADVANCED = 'PROD-ADV'

import { FakeAdmin } from '../../__qa__/_fake-admin'
import {
  httpStatusForMarketplaceOutcome,
  parseJvzooIpnV2,
  recordMarketplaceOrder,
  type MarketplaceOrderEvent,
} from '../intake'

let pass = 0, fail = 0
function check(name: string, cond: boolean, detail?: string) {
  if (cond) { pass++; console.log(`  ✓ ${name}`) } else { fail++; console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`) }
}
const read = (p: string) => readFileSync(p, 'utf8')
/** Comments stripped: a rule must be matched in the CODE, not in a sentence
 *  about the code. */
const code = (p: string) => read(p).replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')

const MIGRATION = 'supabase/migrations/20261109120000_marketplace_renewal.sql'
const INTAKE = 'lib/marketplace/intake.ts'
const ROUTE = 'app/api/marketplace/[provider]/webhook/route.ts'

/** The unique violation the database answers a second insert with. */
const DUPLICATE = { marketplace_orders: { insert: () => ({ message: 'duplicate key value violates unique constraint', code: '23505' }) } }

const FIRST_END = '2026-11-15T00:00:00.000Z'
const NEXT_END = '2026-12-15T00:00:00.000Z'

const paid = (over: Partial<MarketplaceOrderEvent> = {}): MarketplaceOrderEvent => ({
  kind: 'paid',
  externalOrderId: 'A-1',
  externalProductId: 'PROD-ADV',
  buyerEmail: 'buyer@example.com',
  amountMinor: 17900,
  currency: 'USD',
  currentPeriodEnd: NEXT_END,
  taxMinor: 0,
  ...over,
})

const order = (over: Record<string, unknown> = {}) => ({
  id: 'o1',
  provider: 'digistore24',
  external_order_id: 'A-1',
  status: 'paid',
  plan_code: 'advanced',
  current_period_end: FIRST_END,
  ...over,
})

type Rows = Record<string, unknown>[]

async function main() {
  // ── A. Digistore24: the same order item, charged again ─────────────────────
  console.log('A. the same order charged again')

  let admin = new FakeAdmin({ marketplace_orders: [order()] }, DUPLICATE)
  let outcome = await recordMarketplaceOrder(admin, 'digistore24', paid())
  check('A1: a later period end on an order already on file is a RENEWAL',
    outcome.kind === 'renewed', JSON.stringify(outcome))
  check('A2: and the receipt now runs to it',
    (admin.tables.marketplace_orders as Rows)[0].current_period_end === NEXT_END)
  check('A3: no second receipt was written',
    (admin.tables.marketplace_orders as Rows).length === 1)
  check('A4: it answers 200, because the platform has nothing to retry',
    httpStatusForMarketplaceOutcome(outcome) === 200)

  admin = new FakeAdmin({ marketplace_orders: [order()] }, DUPLICATE)
  outcome = await recordMarketplaceOrder(admin, 'digistore24', paid({ currentPeriodEnd: FIRST_END }))
  check('A5: the SAME period end is a redelivery, not a renewal',
    outcome.kind === 'already_recorded', JSON.stringify(outcome))

  admin = new FakeAdmin({ marketplace_orders: [order()] }, DUPLICATE)
  outcome = await recordMarketplaceOrder(admin, 'digistore24', paid({ currentPeriodEnd: '2026-10-01T00:00:00.000Z' }))
  check('A6: an out-of-order delivery NEVER shortens paid access',
    outcome.kind === 'already_recorded'
    && (admin.tables.marketplace_orders as Rows)[0].current_period_end === FIRST_END)

  admin = new FakeAdmin({ marketplace_orders: [order()] }, DUPLICATE)
  outcome = await recordMarketplaceOrder(admin, 'digistore24', paid({ currentPeriodEnd: null }))
  check('A7: a payload with no period end is the retry case, and nothing moves',
    outcome.kind === 'already_recorded'
    && (admin.tables.marketplace_orders as Rows)[0].current_period_end === FIRST_END)

  // ── B. The entitlement moves with the receipt ──────────────────────────────
  console.log('\nB. the entitlement')

  admin = new FakeAdmin({
    marketplace_orders: [order({ status: 'claimed', claimed_by: 'u1', claimed_at: FIRST_END })],
    subscriptions: [{ id: 's1', user_id: 'u1', status: 'active', plan_code: 'advanced', marketplace_order_id: 'o1', current_period_end: FIRST_END }],
  }, DUPLICATE)
  outcome = await recordMarketplaceOrder(admin, 'digistore24', paid())
  check('B1: a claimed order renews, and so does the entitlement it paid for',
    outcome.kind === 'renewed'
    && (admin.tables.subscriptions as Rows)[0].current_period_end === NEXT_END)
  check('B2: an entitlement whose period had lapsed is active again',
    (admin.tables.subscriptions as Rows)[0].status === 'active')
  check('B3: the plan is NOT touched, because an upgrade is a different event',
    (admin.tables.subscriptions as Rows)[0].plan_code === 'advanced')

  admin = new FakeAdmin({
    marketplace_orders: [order({ status: 'claimed', claimed_by: 'u1', claimed_at: FIRST_END })],
    subscriptions: [],
  }, DUPLICATE)
  outcome = await recordMarketplaceOrder(admin, 'digistore24', paid())
  check('B4: a claimed receipt with no entitlement carrying it goes to a person',
    outcome.kind === 'operator_attention' && outcome.why === 'renewal_without_entitlement', JSON.stringify(outcome))
  check('B4b: and the receipt is NOT extended, so no half-state is left behind',
    (admin.tables.marketplace_orders as Rows)[0].current_period_end === FIRST_END)

  for (const status of ['refunded', 'cancelled']) {
    admin = new FakeAdmin({ marketplace_orders: [order({ status })] }, DUPLICATE)
    outcome = await recordMarketplaceOrder(admin, 'digistore24', paid())
    check(`B5/${status}: a later charge on a withdrawn order restores NOTHING`,
      outcome.kind === 'operator_attention' && outcome.why === 'renewal_on_withdrawn_order'
      && (admin.tables.marketplace_orders as Rows)[0].current_period_end === FIRST_END,
      JSON.stringify(outcome))
  }

  // ── C. JVZoo: the rebill with its own id ───────────────────────────────────
  console.log('\nC. the rebill with its own id')

  const jvzoo = (over: Record<string, string> = {}) => new URLSearchParams({
    transaction_type: 'BILL',
    transaction_id: 'JV-500-B001',
    product_id: 'PROD-ADV',
    customer_email: 'buyer@example.com',
    total: '179.00',
    next_payment_date: '2026-12-15',
    ...over,
  }).toString()

  let event = parseJvzooIpnV2(jvzoo(), null)
  check('C1: a BILL names the order it renews, with the -B suffix stripped',
    event?.renewalOfExternalOrderId === 'JV-500', JSON.stringify(event?.renewalOfExternalOrderId))
  event = parseJvzooIpnV2(jvzoo({ transaction_type: 'SALE', transaction_id: 'JV-500' }), null)
  check('C2: a first purchase renews nothing', (event?.renewalOfExternalOrderId ?? null) === null)
  event = parseJvzooIpnV2(jvzoo({ transaction_id: 'JV-500' }), null)
  check('C3: a BILL with no documented suffix invents no parent',
    (event?.renewalOfExternalOrderId ?? null) === null)

  admin = new FakeAdmin({
    marketplace_orders: [order({ provider: 'jvzoo', external_order_id: 'JV-500', status: 'claimed', claimed_by: 'u1', claimed_at: FIRST_END })],
    subscriptions: [{ id: 's1', user_id: 'u1', status: 'active', plan_code: 'advanced', marketplace_order_id: 'o1', current_period_end: FIRST_END }],
  })
  outcome = await recordMarketplaceOrder(admin, 'jvzoo', paid({ externalOrderId: 'JV-500-B001', renewalOfExternalOrderId: 'JV-500' }))
  check('C4: the rebill extends the first receipt instead of becoming a second one',
    outcome.kind === 'renewed' && (admin.tables.marketplace_orders as Rows).length === 1
    && (admin.tables.marketplace_orders as Rows)[0].current_period_end === NEXT_END, JSON.stringify(outcome))
  check('C5: and the entitlement the buyer already holds runs further',
    (admin.tables.subscriptions as Rows)[0].current_period_end === NEXT_END)

  admin = new FakeAdmin({ marketplace_orders: [] })
  outcome = await recordMarketplaceOrder(admin, 'jvzoo', paid({ externalOrderId: 'JV-900-B001', renewalOfExternalOrderId: 'JV-900' }))
  check('C6: a rebill whose first purchase we never saw is RECORDED, never dropped',
    outcome.kind === 'recorded' && (admin.tables.marketplace_orders as Rows).length === 1, JSON.stringify(outcome))

  // ── D. The transition's answer is never guessed ────────────────────────────
  console.log('\nD. an answer this code does not know')

  const rpcAdmin = (answer: unknown, error: { message: string } | null = null) => {
    const a = new FakeAdmin({ marketplace_orders: [order()] }, DUPLICATE)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ;(a as any).rpc = async () => ({ data: answer, error })
    return a
  }
  outcome = await recordMarketplaceOrder(rpcAdmin('something_else'), 'digistore24', paid())
  check('D1: an unrecognised answer is a FAILURE, never a silent success',
    outcome.kind === 'write_failed', JSON.stringify(outcome))
  check('D2: and answers 500 so the platform retries it',
    httpStatusForMarketplaceOutcome(outcome) === 500)
  outcome = await recordMarketplaceOrder(rpcAdmin(null, { message: 'connection refused' }), 'digistore24', paid())
  check('D3: a failed call is reported as one', outcome.kind === 'write_failed')

  // ── E. The migration's own properties ──────────────────────────────────────
  console.log('\nE. the transition in the database')

  const mig = code(MIGRATION)
  check('E1: it is one transaction', /^\s*BEGIN;/m.test(mig) && /COMMIT;\s*$/.test(mig))
  check('E2: SECURITY DEFINER with an empty search_path, like every other transition here',
    /CREATE OR REPLACE FUNCTION public\.renew_marketplace_order[\s\S]*?SECURITY DEFINER[\s\S]*?SET search_path = ''/.test(mig))
  check('E3: the receipt is locked before it is read',
    /FROM public\.marketplace_orders[\s\S]{0,200}FOR UPDATE/.test(mig))
  check('E4: a withdrawn order is refused before anything is written',
    mig.indexOf("IN ('refunded', 'cancelled')") < mig.indexOf('UPDATE public.marketplace_orders'))
  check('E4b: so is a claimed receipt with no entitlement',
    mig.indexOf("RETURN 'entitlement_missing'") < mig.indexOf('UPDATE public.marketplace_orders'))
  check('E5: a period end is never moved backwards',
    /p_period_end <= v_order\.current_period_end[\s\S]{0,80}already_current/.test(mig))
  check('E6: the entitlement update never writes plan_code',
    /UPDATE public\.subscriptions[\s\S]*?WHERE marketplace_order_id/.test(mig)
    && !/UPDATE public\.subscriptions[\s\S]*?plan_code[\s\S]*?WHERE marketplace_order_id/.test(mig))
  check('E7: the server is the only caller',
    /REVOKE ALL ON FUNCTION public\.renew_marketplace_order\(text, text, timestamptz\) FROM PUBLIC, anon, authenticated/.test(mig)
    && /GRANT EXECUTE ON FUNCTION public\.renew_marketplace_order\(text, text, timestamptz\) TO service_role/.test(mig))

  // ── F. The webhook never mails a renewal ───────────────────────────────────
  console.log('\nF. the webhook')

  const routeSrc = code(ROUTE)
  /** The outcome the claim email is gated on: the LAST kind compared before
   *  the call. Anything but `recorded` would mail a link for a payment that
   *  minted no token. */
  const emailGate = (src: string) => {
    // The CALL, not the import: `sendClaimEmail` appears in the import list
    // first, and measuring from there would read no gate at all.
    const before = src.slice(0, src.lastIndexOf('sendClaimEmail('))
    const kinds = [...before.matchAll(/outcome\.kind === '(\w+)'/g)].map((m) => m[1])
    return kinds.at(-1) ?? ''
  }
  check('F1: a renewal sends no claim email', emailGate(routeSrc) === 'recorded', emailGate(routeSrc))
  check('F2: and it is not logged as an error',
    !/outcome\.kind !== 'recorded' && outcome\.kind !== 'already_recorded'\)/.test(routeSrc))
  check('F3: a renewal leaves a line, because nothing else would show it happened',
    /outcome\.kind === 'renewed'[\s\S]{0,300}console\.log/.test(routeSrc))

  const intakeSrc = code(INTAKE)
  check('F4: the renewal is tried BEFORE the insert, not after it',
    intakeSrc.indexOf('renewalOfExternalOrderId?.trim()') < intakeSrc.indexOf('.insert({'))
  check('F5: only `order_unknown` falls through to recording a receipt of its own',
    /renewal\.kind !== 'order_unknown'[\s\S]{0,40}return renewal/.test(intakeSrc))

  // ── MUTATION CONTROLS ──────────────────────────────────────────────────────
  console.log('\nMUT. each guard against the broken version')

  check('MUT-E3: a function without FOR UPDATE would be caught by E3',
    !/FROM public\.marketplace_orders[\s\S]{0,200}FOR UPDATE/.test(mig.replace(/FOR UPDATE/g, '')))
  check('MUT-E5: dropping the not-later comparison would be caught by E5',
    !/p_period_end <= v_order\.current_period_end[\s\S]{0,80}already_current/.test(mig.replace('p_period_end <= v_order.current_period_end', 'false')))
  check('MUT-E6: an entitlement update that moved the plan would be caught by E6',
    /UPDATE public\.subscriptions[\s\S]*?plan_code[\s\S]*?WHERE marketplace_order_id/.test(
      mig.replace('SET current_period_end = p_period_end,', 'SET plan_code = \'premium\', current_period_end = p_period_end,')))
  const checkedLate = mig.replace("RETURN 'entitlement_missing'", 'MOVED') + "\nRETURN 'entitlement_missing';\n"
  check('MUT-E4b: checking the entitlement after the write would be caught by E4b',
    !(checkedLate.indexOf("RETURN 'entitlement_missing'") < checkedLate.indexOf('UPDATE public.marketplace_orders')))
  check('MUT-E7: a function granted to authenticated would be caught by E7',
    !/GRANT EXECUTE ON FUNCTION public\.renew_marketplace_order\(text, text, timestamptz\) TO service_role/.test(
      mig.replace('TO service_role', 'TO authenticated')))
  check('MUT-F1: gating the claim email on a renewal would be caught by F1',
    emailGate(routeSrc.replace(/outcome\.kind === 'recorded'\) \{\n    const orderId/, "outcome.kind === 'renewed') {\n    const orderId")) !== 'recorded')
  // The renewal line moved to AFTER the insert, which is the ordering bug the
  // guard exists to catch.
  const moved = intakeSrc.replace('renewalOfExternalOrderId?.trim()', 'MOVED') + '\nrenewalOfExternalOrderId?.trim()\n'
  check('MUT-F4: trying the renewal after the insert would be caught by F4',
    !(moved.indexOf('renewalOfExternalOrderId?.trim()') < moved.indexOf('.insert({')))

  // The behavioural guards, broken on purpose: a transition that extended a
  // withdrawn order, and one that honoured an earlier period end.
  const broken = new FakeAdmin({ marketplace_orders: [order({ status: 'refunded' })] }, DUPLICATE)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ;(broken as any).rpc = async () => ({ data: 'renewed', error: null })
  const brokenOutcome = await recordMarketplaceOrder(broken, 'digistore24', paid())
  check('MUT-B5: a transition that renewed a refunded order would be caught by B5',
    brokenOutcome.kind === 'renewed')
}

main().then(() => {
  console.log(`\n${pass} passed, ${fail} failed`)
  if (fail > 0) process.exitCode = 1
})

export {}
