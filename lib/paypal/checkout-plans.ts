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

export type BillingMarket = 'ILS' | 'USD'

export interface CheckoutPlanResolution {
  market: BillingMarket
  /** planId is null for a plan whose market-specific env var isn't set —
   *  the caller MUST show an "unavailable" state for that plan, never fall
   *  back to another id. */
  plans: Record<PlanCode, string | null>
}

function envPlanId(market: BillingMarket, code: PlanCode): string | undefined {
  const suffix = code.toUpperCase()
  const name = `NEXT_PUBLIC_PAYPAL_PLAN_ID_${market}_${suffix}`
  // process.env.X must be a static, literal property access for Next.js to
  // inline NEXT_PUBLIC_* vars at build time — a computed/dynamic key (as
  // used above for logging only) would NOT be inlined and would always read
  // undefined in the browser bundle. The explicit switch below is what
  // actually resolves the value; `name` exists only for diagnostics.
  void name
  switch (market) {
    case 'ILS':
      switch (code) {
        case 'regular': return process.env.NEXT_PUBLIC_PAYPAL_PLAN_ID_ILS_REGULAR
        case 'advanced': return process.env.NEXT_PUBLIC_PAYPAL_PLAN_ID_ILS_ADVANCED
        case 'premium': return process.env.NEXT_PUBLIC_PAYPAL_PLAN_ID_ILS_PREMIUM
        case 'large_agency': return process.env.NEXT_PUBLIC_PAYPAL_PLAN_ID_ILS_LARGE_AGENCY
      }
      break
    case 'USD':
      switch (code) {
        case 'regular': return process.env.NEXT_PUBLIC_PAYPAL_PLAN_ID_USD_REGULAR
        case 'advanced': return process.env.NEXT_PUBLIC_PAYPAL_PLAN_ID_USD_ADVANCED
        case 'premium': return process.env.NEXT_PUBLIC_PAYPAL_PLAN_ID_USD_PREMIUM
        case 'large_agency': return process.env.NEXT_PUBLIC_PAYPAL_PLAN_ID_USD_LARGE_AGENCY
      }
      break
  }
  return undefined
}

/** Resolve the 4 checkout plan IDs for ONE billing market. Never reads the
 *  legacy bare env vars, never falls back across markets. */
export function resolveCheckoutPlans(market: BillingMarket): CheckoutPlanResolution {
  const codes: PlanCode[] = ['regular', 'advanced', 'premium', 'large_agency']
  const plans = {} as Record<PlanCode, string | null>
  for (const code of codes) {
    plans[code] = envPlanId(market, code) || null
  }
  return { market, plans }
}

/** Hebrew site routes -> ILS; /en routes -> USD; this maps the persisted
 *  billing-market signal (never a mutable UI toggle) to a market. */
export function billingMarketFromLocale(locale: string | null | undefined): BillingMarket | null {
  if (locale === 'he') return 'ILS'
  if (locale === 'en') return 'USD'
  return null
}
