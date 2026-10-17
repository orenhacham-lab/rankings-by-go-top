/**
 * Billing-market write safety. Phase 3 pinned POST /api/billing-market/select
 * (a client-chosen currency written into user_metadata.locale). w17 retired
 * that: the market is decided on the server and LOCKS at the first PayPal
 * checkout (lib/billing/billing-market-selection.ts lockBillingMarket, wired
 * in app/api/paypal/activate). The Phase-3 invariants are kept, re-pinned on
 * the new writer: only a known market is written, an established market is
 * never overwritten, Shopify-governed accounts are refused, the first write
 * is atomic (claim gate) and a failed write releases the claim; plus the
 * retired route never writes anything. Run:
 *   npx tsx lib/billing/__qa__/billing-market-selection.qa.ts
 */
import { readFileSync } from 'fs'
import { join } from 'path'
import { lockBillingMarket, type BillingMarketLockDeps } from '../billing-market-selection'

let pass = 0, fail = 0
function check(name: string, cond: boolean, detail?: string) {
  if (cond) { pass++; console.log(`  ✓ ${name}`) } else { fail++; console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`) }
}
const ROOT = join(__dirname, '..', '..', '..')
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')
const read = (rel: string) => strip(readFileSync(join(ROOT, rel), 'utf8'))

/** The claim gate's semantics (a conditional UPDATE only one caller wins),
 *  shared across deps() instances through `claimedRef`. */
function deps(overrides: Partial<BillingMarketLockDeps> = {}, claimedRef: { claimed: boolean } = { claimed: false }): BillingMarketLockDeps & { persistCalls: string[]; releaseCalls: number } {
  const persistCalls: string[] = []
  let releaseCalls = 0
  return {
    persistCalls,
    get releaseCalls() { return releaseCalls },
    isShopifyGoverned: async () => false,
    claimSelectionSlot: async () => {
      if (claimedRef.claimed) return { ok: true, wonClaim: false }
      claimedRef.claimed = true
      return { ok: true, wonClaim: true }
    },
    releaseSelectionSlot: async () => { releaseCalls++; claimedRef.claimed = false },
    persistMarket: async (market) => { persistCalls.push(market); return { ok: true } },
    ...overrides,
  }
}

async function main() {
  console.log('Billing-market lock (first PayPal checkout) safety QA\n')

  console.log('1) Only a known market is ever written')
  {
    const d = deps()
    check('an unknown market is refused', (await lockBillingMarket(null, 'EUR' as never, d)).kind === 'unknown_market')
    check('no market (a legacy plan id) is refused', (await lockBillingMarket(null, null, d)).kind === 'unknown_market')
    check('lowercase is refused — no coercion', (await lockBillingMarket(null, 'ils' as never, d)).kind === 'unknown_market')
    check('nothing was written', d.persistCalls.length === 0)
  }

  console.log('\n2) A first checkout locks the market it paid in')
  {
    const d = deps()
    const r = await lockBillingMarket(null, 'ILS', d)
    check('ILS is persisted', r.kind === 'persisted' && r.market === 'ILS' && d.persistCalls[0] === 'ILS')
    const d2 = deps()
    const r2 = await lockBillingMarket(undefined, 'USD', d2)
    check('USD is persisted', r2.kind === 'persisted' && r2.market === 'USD')
  }

  console.log('\n3) An established market is never overwritten (one-time lock, not a switcher)')
  {
    const d = deps()
    check('stored ILS refuses a USD lock', (await lockBillingMarket('ILS', 'USD', d)).kind === 'already_set')
    check('stored USD refuses an ILS lock', (await lockBillingMarket('USD', 'ILS', d)).kind === 'already_set')
    check('nothing was written', d.persistCalls.length === 0)
  }

  console.log('\n4) Concurrent first checkouts: exactly one write')
  {
    const claimedRef = { claimed: false }
    const dA = deps({}, claimedRef), dB = deps({}, claimedRef)
    const [a, b] = await Promise.all([lockBillingMarket(null, 'ILS', dA), lockBillingMarket(null, 'USD', dB)])
    const kinds = [a.kind, b.kind].sort()
    check('one persisted, one already_set', kinds[0] === 'already_set' && kinds[1] === 'persisted', kinds.join(','))
    check('exactly one write in total', dA.persistCalls.length + dB.persistCalls.length === 1)
  }

  console.log('\n5) A failed write releases the claim; a success keeps it')
  {
    const claimedRef = { claimed: false }
    const d = deps({ persistMarket: async () => ({ ok: false, message: 'connection reset' }) }, claimedRef)
    const r = await lockBillingMarket(null, 'ILS', d)
    check('persist_failed carries the message', r.kind === 'persist_failed' && r.message === 'connection reset')
    check('the claim was released once', claimedRef.claimed === false && d.releaseCalls === 1)
    check('a later checkout can still lock', (await lockBillingMarket(null, 'ILS', deps({}, claimedRef))).kind === 'persisted')
    const ok = deps()
    await lockBillingMarket(null, 'USD', ok)
    check('success never releases', ok.releaseCalls === 0)
    const cf = deps({ claimSelectionSlot: async () => ({ ok: false, message: 'db down' }) })
    const c = await lockBillingMarket(null, 'USD', cf)
    check('a failed claim is surfaced and writes nothing', c.kind === 'claim_failed' && cf.persistCalls.length === 0)
  }

  console.log('\n6) A Shopify-governed account is never locked to a PayPal market')
  {
    const d = deps({ isShopifyGoverned: async () => true })
    check('shopify_governed, nothing written', (await lockBillingMarket(null, 'USD', d)).kind === 'shopify_governed' && d.persistCalls.length === 0)
  }

  console.log('\n7) New checkout never falls back to the legacy bare plan ids (lib/paypal/checkout-plans.ts)')
  {
    const src = read('lib/paypal/checkout-plans.ts')
    check('reads the market-specific ILS and USD vars', /NEXT_PUBLIC_PAYPAL_PLAN_ID_ILS_REGULAR/.test(src) && /NEXT_PUBLIC_PAYPAL_PLAN_ID_USD_REGULAR/.test(src))
    check('never reads a bare NEXT_PUBLIC_PAYPAL_PLAN_ID_REGULAR', !/process\.env\.NEXT_PUBLIC_PAYPAL_PLAN_ID_REGULAR\b/.test(src))
    check('a missing id resolves to null, not a fallback', /plans\[code\] = row\?\.\[code\] \|\| null/.test(src))
  }

  console.log('\nSOURCE) the lock is wired in the activation route: after verification and the entitlement, from the VERIFIED plan id, into app_metadata')
  {
    const route = read('app/api/paypal/activate/route.ts')
    check('requires an authenticated user', /if \(!user\) \{\s*return Response\.json\(\{ error: 'Unauthorized' \}, \{ status: 401 \}\)/.test(route))
    check('the paid market comes from the verified plan id', /marketForPayPalPlanId\(verified\.planId\)/.test(route))
    check('the lock runs after verification and after the entitlement write', route.indexOf('verifyPayPalActivation(') < route.indexOf('transitionSubscriptionToActivePlan(') && route.indexOf('transitionSubscriptionToActivePlan(') < route.indexOf('lockBillingMarket('))
    check('the existing market is the live stored one', /lockBillingMarket\(storedMarketOf\(user\), paidMarket,/.test(route))
    check('the claim is a CONDITIONAL update', /\.is\('billing_market_claimed_at', null\)/.test(route))
    check('the release clears the claim', /billing_market_claimed_at: null \}\)/.test(route))
    check('the market is written to app_metadata', /updateUserById\(user\.id, \{ app_metadata: \{ \[STORED_MARKET_KEY\]: market \} \}\)/.test(route))
    check('the route never writes user_metadata', !/user_metadata/.test(route))
    check('Shopify governance is wired from both signals', /hasPendingShopifyLinkCookie\(request\) \|\| await isShopifyBillingRequiredForUser\(admin, user\.id\)/.test(route))
  }

  console.log('\nSOURCE) the retired select route: POST only, never reads a body, never writes')
  {
    const route = read('app/api/billing-market/select/route.ts')
    check('exports ONLY POST', /export async function POST/.test(route) && !/export async function (GET|PUT|DELETE|PATCH)/.test(route))
    check('still requires an authenticated user', /if \(!user\) return Response\.json\(\{ error: 'Unauthorized' \}, \{ status: 401 \}\)/.test(route))
    check('answers 410 Gone', /status: 410/.test(route))
    check('never reads the body (no client market)', !/request\.json\(\)|body\.market/.test(route))
    check('never writes (no updateUserById, no profiles update)', !/updateUserById|\.update\(|createAdminClient/.test(route))
  }

  console.log('\nSOURCE) the atomic-claim migration exists and matches the column name')
  {
    const migration = readFileSync(join(ROOT, 'supabase/migrations/20260828180000_add_billing_market_claim_gate.sql'), 'utf8')
    check('adds billing_market_claimed_at to public.profiles', /ALTER TABLE public\.profiles\s+ADD COLUMN IF NOT EXISTS billing_market_claimed_at timestamptz/.test(migration))
    check('no data-migrating UPDATE/DELETE', !/\bUPDATE\s+\S+\s+SET\b/i.test(migration) && !/\bDELETE\s+FROM\b/i.test(migration))
  }

  console.log(`\n${pass} passed, ${fail} failed`)
  if (fail > 0) process.exitCode = 1
}
main()
export {}
