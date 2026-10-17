/**
 * The schema.org offer for Go Top SEO: the real monthly plan range, read from
 * the plan catalog so it can never drift from the prices on the site.
 *
 * IN THE CURRENCY THE READER IS QUOTED. The markup used to be shekels on every
 * language, so an English, Spanish or Portuguese page showed $79 and told a
 * crawler ₪249 — the same page saying two different prices. Israel pays in
 * shekels and everywhere else pays in dollars (lib/plans/catalog.ts), which is
 * exactly what the locale tells us.
 *
 * Used by the SoftwareApplication markup in app/layout.tsx and /api/schema.
 * Guarded by lib/seo/__qa__/honest-structured-data.qa.ts.
 */
import { PLAN_CATALOG, PLAN_CODES } from '@/lib/plans/catalog'
import type { BillingMarket } from '@/lib/billing/market'

function offerFor(currency: 'ILS' | 'USD', prices: number[]) {
  return {
    '@type': 'AggregateOffer',
    priceCurrency: currency,
    lowPrice: String(Math.min(...prices)),
    highPrice: String(Math.max(...prices)),
    offerCount: String(prices.length),
  } as const
}

const ILS_OFFER = offerFor('ILS', PLAN_CODES.map((code) => PLAN_CATALOG[code].priceILS))
const USD_OFFER = offerFor('USD', PLAN_CODES.map((code) => PLAN_CATALOG[code].priceUSD))

/**
 * The shekel offer: the Hebrew site, and `/api/schema`, which has no language
 * of its own and serves the Israeli catalogue.
 */
export const SOFTWARE_OFFER = ILS_OFFER

/** The offer this request is actually quoted, by its billing market. */
export function softwareOffer(market: BillingMarket) {
  return market === 'ILS' ? ILS_OFFER : USD_OFFER
}
