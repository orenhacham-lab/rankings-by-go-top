/**
 * Phase 3 — currency-scoped checkout plan selection: legacy variables are
 * NEVER selected by a new checkout button; ILS/USD markets are fully
 * isolated; a missing market-specific ID fails closed. Run:
 *   npx tsx lib/paypal/__qa__/checkout-plans.qa.ts
 */
import { resolveCheckoutPlans, marketForPayPalPlanId } from '../checkout-plans'
import { resolvePlanCodeFromPayPalPlanId } from '../client'

let pass = 0, fail = 0
function check(name: string, cond: boolean, detail?: string) {
  if (cond) { pass++; console.log(`  ✓ ${name}`) } else { fail++; console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`) }
}

function clearAllPlanIdEnvVars() {
  for (const v of [
    'NEXT_PUBLIC_PAYPAL_PLAN_ID_REGULAR', 'NEXT_PUBLIC_PAYPAL_PLAN_ID_ADVANCED', 'NEXT_PUBLIC_PAYPAL_PLAN_ID_PREMIUM', 'NEXT_PUBLIC_PAYPAL_PLAN_ID_LARGE_AGENCY',
    'NEXT_PUBLIC_PAYPAL_PLAN_ID_ILS_REGULAR', 'NEXT_PUBLIC_PAYPAL_PLAN_ID_ILS_ADVANCED', 'NEXT_PUBLIC_PAYPAL_PLAN_ID_ILS_PREMIUM', 'NEXT_PUBLIC_PAYPAL_PLAN_ID_ILS_LARGE_AGENCY',
    'NEXT_PUBLIC_PAYPAL_PLAN_ID_USD_REGULAR', 'NEXT_PUBLIC_PAYPAL_PLAN_ID_USD_ADVANCED', 'NEXT_PUBLIC_PAYPAL_PLAN_ID_USD_PREMIUM', 'NEXT_PUBLIC_PAYPAL_PLAN_ID_USD_LARGE_AGENCY',
  ]) delete process.env[v]
}

async function main() {
  console.log('Phase 3 — PayPal checkout-plan currency isolation QA\n')

  console.log('1) New Hebrew (ILS) checkout uses ONLY the _ILS_ vars — legacy bare vars are NEVER selected')
  {
    clearAllPlanIdEnvVars()
    process.env.NEXT_PUBLIC_PAYPAL_PLAN_ID_REGULAR = 'LEGACY-OLD-PRICE-REGULAR' // old price, must never be used for new checkout
    process.env.NEXT_PUBLIC_PAYPAL_PLAN_ID_ILS_REGULAR = 'NEW-ILS-REGULAR'
    process.env.NEXT_PUBLIC_PAYPAL_PLAN_ID_ILS_ADVANCED = 'NEW-ILS-ADVANCED'
    process.env.NEXT_PUBLIC_PAYPAL_PLAN_ID_ILS_PREMIUM = 'NEW-ILS-PREMIUM'
    process.env.NEXT_PUBLIC_PAYPAL_PLAN_ID_ILS_LARGE_AGENCY = 'NEW-ILS-AGENCY'
    const r = resolveCheckoutPlans('ILS')
    check('regular resolves to the NEW ILS id, not the legacy id', r.plans.regular === 'NEW-ILS-REGULAR')
    check('advanced/premium/large_agency all resolve to their NEW ILS ids', r.plans.advanced === 'NEW-ILS-ADVANCED' && r.plans.premium === 'NEW-ILS-PREMIUM' && r.plans.large_agency === 'NEW-ILS-AGENCY')
    check('the legacy value never leaks into the resolution', !Object.values(r.plans).includes('LEGACY-OLD-PRICE-REGULAR'))
  }

  console.log('\n2) New English (USD) checkout uses ONLY the _USD_ vars — never ILS, never legacy')
  {
    clearAllPlanIdEnvVars()
    process.env.NEXT_PUBLIC_PAYPAL_PLAN_ID_ILS_REGULAR = 'ILS-REGULAR'
    process.env.NEXT_PUBLIC_PAYPAL_PLAN_ID_USD_REGULAR = 'USD-REGULAR'
    const r = resolveCheckoutPlans('USD')
    check('regular resolves to the USD id', r.plans.regular === 'USD-REGULAR')
    check('never the ILS id', r.plans.regular !== 'ILS-REGULAR')
  }

  console.log('\n3) Missing market-specific ID fails closed — never falls back to a legacy ID or the other currency')
  {
    clearAllPlanIdEnvVars()
    process.env.NEXT_PUBLIC_PAYPAL_PLAN_ID_REGULAR = 'LEGACY-REGULAR'
    process.env.NEXT_PUBLIC_PAYPAL_PLAN_ID_USD_REGULAR = 'USD-REGULAR'
    // ILS_REGULAR is deliberately NOT configured.
    const r = resolveCheckoutPlans('ILS')
    check('regular is null (fails closed) — never the legacy id, never the USD id', r.plans.regular === null)
  }

  console.log('\n4) Legacy plan IDs ARE still recognized by the server-side plan-id -> plan-code resolver (protects an already-started subscription)')
  {
    clearAllPlanIdEnvVars()
    process.env.NEXT_PUBLIC_PAYPAL_PLAN_ID_REGULAR = 'LEGACY-REGULAR-2'
    check('an existing subscriber on the legacy plan id still resolves correctly', resolvePlanCodeFromPayPalPlanId('LEGACY-REGULAR-2') === 'regular')
  }

  console.log('\n5) Both ILS and USD plan IDs map to the SAME internal entitlement codes')
  {
    clearAllPlanIdEnvVars()
    process.env.NEXT_PUBLIC_PAYPAL_PLAN_ID_ILS_PREMIUM = 'ILS-PREM'
    process.env.NEXT_PUBLIC_PAYPAL_PLAN_ID_USD_PREMIUM = 'USD-PREM'
    check('ILS premium -> premium', resolvePlanCodeFromPayPalPlanId('ILS-PREM') === 'premium')
    check('USD premium -> premium (SAME internal code)', resolvePlanCodeFromPayPalPlanId('USD-PREM') === 'premium')
  }

  // w17 — billingMarketFromLocale (he -> ILS, en -> USD) is gone: the market no
  // longer follows the language. Its pre-w17 mapping survives only as legacy
  // data for accounts that already paid (lib/billing/__qa__/w17-billing-market.qa.ts).
  console.log('\n6) marketForPayPalPlanId — the market PayPal really charges, from the verified plan id (w17 lock)')
  {
    clearAllPlanIdEnvVars()
    process.env.NEXT_PUBLIC_PAYPAL_PLAN_ID_REGULAR = 'LEGACY-REG'
    process.env.NEXT_PUBLIC_PAYPAL_PLAN_ID_ILS_ADVANCED = 'ILS-ADV'
    process.env.NEXT_PUBLIC_PAYPAL_PLAN_ID_USD_ADVANCED = 'USD-ADV'
    check('an ILS plan id -> ILS', marketForPayPalPlanId('ILS-ADV') === 'ILS')
    check('a USD plan id -> USD', marketForPayPalPlanId('USD-ADV') === 'USD')
    check('a legacy bare plan id belongs to no market (never guessed)', marketForPayPalPlanId('LEGACY-REG') === null)
    check('unknown / empty / null -> null', marketForPayPalPlanId('NOPE') === null && marketForPayPalPlanId('') === null && marketForPayPalPlanId(null) === null)
    check('an unset env var never matches an empty-ish id', marketForPayPalPlanId(undefined) === null)
  }

  clearAllPlanIdEnvVars()
  console.log(`\n${pass} passed, ${fail} failed`)
  if (fail > 0) process.exitCode = 1
}
main()
