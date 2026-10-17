/**
 * Phase 3 — NEW-checkout plan-ID selection, strictly currency-scoped.
 *
 * This is DELIBERATELY separate from lib/paypal/client.ts's
 * `resolvePlanCodeFromPayPalPlanId` (which recognizes legacy + ILS + USD
 * plan IDs so ANY existing subscription still verifies/renews correctly).
 * This module is the other direction — "which plan ID should a NEW checkout
 * button use" — and answers that ONLY from the explicit market-specific env
 * vars. The legacy bare vars (NEXT_PUBLIC_PAYPAL_PLAN_ID_REGULAR etc.) are
 * NEVER consulted here: they hold the OLD prices, and falling back to them
 * would let the new pricing page display ₪249 while PayPal actually charges
 * the old ₪79. A market whose plan IDs aren't configured fails closed —
 * never silently substitutes a legacy ID or the other currency's ID.
 */

import type { PlanCode } from '@/lib/plans/catalog'
import { PLAN_CODES } from '@/lib/plans/catalog'
import type { BillingMarket } from '@/lib/billing/market'

export type { BillingMarket } from '@/lib/billing/market'

export interface CheckoutPlanResolution {
  market: BillingMarket
  /** planId is null for a plan whose market-specific env var isn't set —
   *  the caller MUST show an "unavailable" state for that plan, never fall
   *  back to another id. */
  plans: Record<PlanCode, string | null>
}

/**
 * The market-specific PayPal plan ids, as DATA (w17): one row per billing
 * market, typed by BillingMarket so a new market (e.g. EUR) cannot be added
 * without its row. Built in a function so each call reads the env afresh.
 *
 * process.env.X must be a static, literal property access for Next.js to
 * inline NEXT_PUBLIC_* vars at build time — a computed/dynamic key would NOT
 * be inlined and would always read undefined in the browser bundle. Hence
 * the literal accesses below. The legacy bare vars are deliberately absent.
 */
function checkoutPlanIdTable(): Record<BillingMarket, Record<PlanCode, string | undefined>> {
  return {
    ILS: {
      regular: process.env.NEXT_PUBLIC_PAYPAL_PLAN_ID_ILS_REGULAR,
      advanced: process.env.NEXT_PUBLIC_PAYPAL_PLAN_ID_ILS_ADVANCED,
      premium: process.env.NEXT_PUBLIC_PAYPAL_PLAN_ID_ILS_PREMIUM,
      large_agency: process.env.NEXT_PUBLIC_PAYPAL_PLAN_ID_ILS_LARGE_AGENCY,
    },
    USD: {
      regular: process.env.NEXT_PUBLIC_PAYPAL_PLAN_ID_USD_REGULAR,
      advanced: process.env.NEXT_PUBLIC_PAYPAL_PLAN_ID_USD_ADVANCED,
      premium: process.env.NEXT_PUBLIC_PAYPAL_PLAN_ID_USD_PREMIUM,
      large_agency: process.env.NEXT_PUBLIC_PAYPAL_PLAN_ID_USD_LARGE_AGENCY,
    },
  }
}

/** Resolve the 4 checkout plan IDs for ONE billing market. Never reads the
 *  legacy bare env vars, never falls back across markets. */
export function resolveCheckoutPlans(market: BillingMarket): CheckoutPlanResolution {
  const row = checkoutPlanIdTable()[market]
  const plans = {} as Record<PlanCode, string | null>
  for (const code of PLAN_CODES) {
    plans[code] = row?.[code] || null
  }
  return { market, plans }
}

/** Which market a PayPal plan id belongs to (w17: the currency PayPal really
 *  charges, recorded as the account's market at the first checkout). A
 *  legacy bare plan id, or an unknown one, belongs to no market: null. */
export function marketForPayPalPlanId(planId: string | null | undefined): BillingMarket | null {
  if (!planId) return null
  const table = checkoutPlanIdTable()
  for (const market of Object.keys(table) as BillingMarket[]) {
    if (Object.values(table[market]).some((id) => !!id && id === planId)) return market
  }
  return null
}
