/**
 * w17 — the billing market (the currency an account pays in), as DATA.
 *
 * Owner's decision (2026-10-02): Israel pays in shekels, everyone else in
 * dollars, decided automatically by the visitor's country — no switcher. The
 * currency locks at the first PayPal payment.
 *
 * Everything market-specific lives in the tables below, so a third currency
 * (e.g. EUR for EU countries) is added by DATA, not by editing call sites:
 *   1. a row in BILLING_MARKETS (symbol + which catalog price it reads),
 *   2. the catalog price field in lib/plans/catalog.ts,
 *   3. its countries in COUNTRY_MARKET,
 *   4. its PayPal plan ids row in lib/paypal/checkout-plans.ts (typed by
 *      BillingMarket, so the compiler asks for it),
 *   5. its currency name in the two dashboard dictionaries (also typed).
 *
 * PURE: no request, env or database access. Safe to import from client code.
 */

import type { PlanCatalogEntry } from '@/lib/plans/catalog'

/** A catalog price field (priceILS, priceUSD, ...). */
type CatalogPriceField = Extract<keyof PlanCatalogEntry, `price${string}`>

export const BILLING_MARKETS = {
  ILS: { symbol: '₪', priceField: 'priceILS' },
  USD: { symbol: '$', priceField: 'priceUSD' },
} as const satisfies Record<string, { symbol: string; priceField: CatalogPriceField }>

export type BillingMarket = keyof typeof BILLING_MARKETS

export const BILLING_MARKET_CODES = Object.keys(BILLING_MARKETS) as BillingMarket[]

/** Countries (ISO 3166-1 alpha-2, as Vercel's x-vercel-ip-country sends them)
 *  that pay in a market other than the default. Anything not listed, and an
 *  unknown or missing country, pays in DEFAULT_MARKET. */
export const COUNTRY_MARKET: Readonly<Partial<Record<string, BillingMarket>>> = Object.freeze({
  IL: 'ILS',
})

export const DEFAULT_MARKET: BillingMarket = 'USD'

export function isBillingMarket(value: unknown): value is BillingMarket {
  return typeof value === 'string' && Object.prototype.hasOwnProperty.call(BILLING_MARKETS, value)
}

/** A two-letter country code, upper-cased, or null for anything else. */
export function normalizeCountry(country: string | null | undefined): string | null {
  const c = (country ?? '').trim().toUpperCase()
  return /^[A-Z]{2}$/.test(c) ? c : null
}

/** The ONE country -> market rule: IL -> ILS, anything else or unknown -> USD. */
export function marketForCountry(country: string | null | undefined): BillingMarket {
  const c = normalizeCountry(country)
  const m = c ? COUNTRY_MARKET[c] : undefined
  return m && isBillingMarket(m) ? m : DEFAULT_MARKET
}

/** A plan's monthly price in a market, from the plan catalog. */
export function planPriceIn(entry: PlanCatalogEntry, market: BillingMarket): number {
  return entry[BILLING_MARKETS[market].priceField]
}

/** The same formatting the pricing pages and the billing screen use: the
 *  market's symbol, then the amount grouped for the page's number locale. */
export function formatPlanPrice(amount: number, market: BillingMarket, numberLocale: string): string {
  return `${BILLING_MARKETS[market].symbol}${amount.toLocaleString(numberLocale)}`
}
