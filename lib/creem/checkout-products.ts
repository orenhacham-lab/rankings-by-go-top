/**
 * Which Creem product a NEW checkout should charge, per plan.
 *
 * The shape deliberately mirrors lib/paypal/checkout-plans.ts, for the same
 * reason that module gives: a checkout must resolve its product id ONLY from
 * explicit, market-scoped configuration, and a plan whose id is not
 * configured must come back null so the caller shows "unavailable". Falling
 * back to another plan's id, or to another market's, is how a pricing page
 * ends up displaying one price while the provider charges another.
 *
 * TWO differences from the PayPal module, both deliberate:
 *
 *  1. USD ONLY. Israel pays in shekels through PayPal and that is not
 *     changing (lib/billing/market.ts, owner's decision). Creem exists here
 *     for customers outside Israel, so there is no ILS row to get wrong.
 *     `creemProductIds` takes a market and refuses anything but USD, rather
 *     than silently serving a shekel account a dollar product.
 *  2. NOT public. PayPal's plan ids are NEXT_PUBLIC_* because its browser
 *     SDK creates the subscription client-side. A Creem checkout session is
 *     created server-side with the secret API key, so the product ids never
 *     need to reach the browser and are read from plain server env vars.
 *     Keeping them server-only also means a changed id takes effect on the
 *     next request rather than needing a rebuild.
 *
 * PURE apart from reading process.env, which it re-reads on every call so a
 * changed value is picked up without a restart.
 */

import type { PlanCode } from '@/lib/plans/catalog'
import { PLAN_CODES } from '@/lib/plans/catalog'
import type { BillingMarket } from '@/lib/billing/market'

/** The one market Creem serves here. Narrowed with `as const` rather than
 *  typed as BillingMarket, so `CreemProductResolution.market` is the literal
 *  'USD' and a future second Creem market cannot be introduced by accident. */
export const CREEM_MARKET = 'USD' as const satisfies BillingMarket

export interface CreemProductResolution {
  market: typeof CREEM_MARKET
  /** null for a plan whose env var is not set — show it as unavailable,
   *  never substitute another id. */
  products: Record<PlanCode, string | null>
}

/**
 * The env var holding one plan's Creem product id. A static map rather than
 * a template string, so a typo is a compile error and every name is
 * greppable in this repo and in the Vercel dashboard.
 */
const PRODUCT_ENV_VAR: Record<PlanCode, string> = {
  regular: 'CREEM_PRODUCT_ID_USD_REGULAR',
  advanced: 'CREEM_PRODUCT_ID_USD_ADVANCED',
  premium: 'CREEM_PRODUCT_ID_USD_PREMIUM',
  large_agency: 'CREEM_PRODUCT_ID_USD_LARGE_AGENCY',
}

/** Resolve the four checkout product ids. Never falls back across plans. */
export function creemProductIds(): CreemProductResolution {
  const products = {} as Record<PlanCode, string | null>
  for (const code of PLAN_CODES) {
    products[code] = process.env[PRODUCT_ENV_VAR[code]]?.trim() || null
  }
  return { market: CREEM_MARKET, products }
}

/** One plan's product id, or null when it is not configured. */
export function creemProductIdFor(plan: PlanCode): string | null {
  return creemProductIds().products[plan]
}

/**
 * Which plan a Creem product id belongs to — the direction a webhook needs,
 * to turn the product on an event into the plan we grant. An unknown id
 * belongs to no plan: null, never a guess.
 */
export function planForCreemProductId(productId: string | null | undefined): PlanCode | null {
  const id = productId?.trim()
  if (!id) return null
  const { products } = creemProductIds()
  for (const code of PLAN_CODES) {
    if (products[code] && products[code] === id) return code
  }
  return null
}

/** True only for the market Creem is allowed to charge. */
export function isCreemMarket(market: BillingMarket): boolean {
  return market === CREEM_MARKET
}
