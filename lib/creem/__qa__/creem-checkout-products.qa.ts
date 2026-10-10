/**
 * Product-id resolution decides what a customer is actually charged, so the
 * failure this suite exists to prevent is the one that costs real money: a
 * plan resolving to ANOTHER plan's product id, or to a configured id when it
 * should have resolved to nothing. The same rule lib/paypal/checkout-plans.ts
 * already enforces for PayPal — never substitute, fail closed.
 *
 * It also pins USD-only, because Israel stays on PayPal (lib/billing/market.ts),
 * and the round trip id -> plan the webhook path depends on.
 *
 * MUTATION CONTROLS at the end: a resolver that falls back to the cheapest
 * configured plan, and one that matches a product id loosely, must both be
 * REJECTED by these assertions.
 *
 * Run: npx tsx lib/creem/__qa__/creem-checkout-products.qa.ts
 */
import { PLAN_CODES, type PlanCode } from '../../plans/catalog'
import {
  CREEM_MARKET,
  creemProductIdFor,
  creemProductIds,
  isCreemMarket,
  planForCreemProductId,
} from '../checkout-products'

let pass = 0, fail = 0
function check(name: string, cond: boolean, detail?: string) {
  if (cond) { pass++; console.log(`  ✓ ${name}`) } else { fail++; console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`) }
}

const ENV_VARS: Record<PlanCode, string> = {
  regular: 'CREEM_PRODUCT_ID_USD_REGULAR',
  advanced: 'CREEM_PRODUCT_ID_USD_ADVANCED',
  premium: 'CREEM_PRODUCT_ID_USD_PREMIUM',
  large_agency: 'CREEM_PRODUCT_ID_USD_LARGE_AGENCY',
}
const IDS: Record<PlanCode, string> = {
  regular: 'prod_creem_regular_01',
  advanced: 'prod_creem_advanced_01',
  premium: 'prod_creem_premium_01',
  large_agency: 'prod_creem_agency_01',
}

function setEnv(values: Partial<Record<PlanCode, string | undefined>>) {
  for (const code of PLAN_CODES) {
    const v = values[code]
    if (v === undefined) delete process.env[ENV_VARS[code]]
    else process.env[ENV_VARS[code]] = v
  }
}

console.log('A) Creem charges in dollars only')
check('the market is USD', CREEM_MARKET === 'USD')
check('USD is accepted', isCreemMarket('USD') === true)
check('a shekel account is NOT served a dollar product', isCreemMarket('ILS') === false)

console.log('\nB) every configured plan resolves to its OWN id')
setEnv(IDS)
{
  const { products, market } = creemProductIds()
  check('the resolution reports the USD market', market === 'USD')
  check('all four plans resolve', PLAN_CODES.every((c) => products[c] === IDS[c]))
  check('no two plans share an id', new Set(PLAN_CODES.map((c) => products[c])).size === PLAN_CODES.length)
  check('creemProductIdFor agrees with the table',
    PLAN_CODES.every((c) => creemProductIdFor(c) === IDS[c]))
}

console.log('\nC) an unconfigured plan is null, never another plan\'s id')
setEnv({ regular: IDS.regular, advanced: undefined, premium: '   ', large_agency: IDS.large_agency })
{
  const { products } = creemProductIds()
  check('a missing var resolves to null', products.advanced === null)
  check('a whitespace-only var resolves to null', products.premium === null)
  check('the configured plans are untouched',
    products.regular === IDS.regular && products.large_agency === IDS.large_agency)
  check('an unconfigured plan never borrows a configured id',
    products.advanced !== IDS.regular && products.premium !== IDS.large_agency)
}
setEnv({})
check('with nothing configured every plan is null',
  PLAN_CODES.every((c) => creemProductIdFor(c) === null))

console.log('\nD) the reverse direction a webhook depends on')
setEnv(IDS)
check('each id maps back to its own plan',
  PLAN_CODES.every((c) => planForCreemProductId(IDS[c]) === c))
for (const junk of ['prod_unknown', '', '   ', null, undefined, 'prod_creem_regular_0', 'PROD_CREEM_REGULAR_01']) {
  check(`an unknown id (${JSON.stringify(junk) ?? String(junk)}) maps to no plan`,
    planForCreemProductId(junk as string | null | undefined) === null)
}
setEnv({ regular: IDS.regular })
check('an id whose plan is no longer configured maps to no plan',
  planForCreemProductId(IDS.premium) === null)

console.log('\nE) env changes are picked up without a restart')
setEnv({ regular: 'prod_creem_regular_02' })
check('a changed id is read on the next call', creemProductIdFor('regular') === 'prod_creem_regular_02')
check('and the reverse lookup follows it',
  planForCreemProductId('prod_creem_regular_02') === 'regular' && planForCreemProductId(IDS.regular) === null)

console.log('\nF) mutation controls: break resolution and these assertions must fail')
{
  setEnv({ regular: IDS.regular, advanced: undefined, premium: undefined, large_agency: IDS.large_agency })
  type Resolver = (plan: PlanCode) => string | null
  type Reverse = (id: string | null | undefined) => PlanCode | null

  function survives(resolve: Resolver, reverse: Reverse): boolean {
    return resolve('advanced') === null
      && resolve('premium') === null
      && resolve('regular') === IDS.regular
      && reverse('prod_unknown') === null
      && reverse(IDS.regular.slice(0, -1)) === null
      && reverse(IDS.regular) === 'regular'
  }

  check('the real resolver survives', survives(creemProductIdFor, planForCreemProductId) === true)

  const fallsBackToCheapest: Resolver = (plan) =>
    creemProductIdFor(plan) ?? creemProductIdFor('regular')
  check('MUTATION: falling back to the cheapest configured plan is caught',
    survives(fallsBackToCheapest, planForCreemProductId) === false)

  const loosePrefixMatch: Reverse = (id) => {
    const needle = (id ?? '').trim()
    if (!needle) return null
    for (const code of PLAN_CODES) {
      const configured = creemProductIdFor(code)
      if (configured && configured.startsWith(needle)) return code
    }
    return null
  }
  check('MUTATION: matching a product id loosely is caught',
    survives(creemProductIdFor, loosePrefixMatch) === false)

  const anythingIsRegular: Reverse = (id) => ((id ?? '').trim() ? 'regular' : null)
  check('MUTATION: treating any unknown id as the cheapest plan is caught',
    survives(creemProductIdFor, anythingIsRegular) === false)
}

setEnv({})
console.log(`\n${pass} passed, ${fail} failed`)
if (fail > 0) process.exitCode = 1

export {}
