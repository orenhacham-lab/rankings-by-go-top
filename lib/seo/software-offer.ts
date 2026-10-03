/**
 * The schema.org offer for Go Top SEO: the real monthly plan range in shekels,
 * read from the plan catalog so it can never drift from the prices on the site.
 * Used by the SoftwareApplication markup in app/layout.tsx and /api/schema.
 * Guarded by lib/seo/__qa__/honest-structured-data.qa.ts.
 */
import { PLAN_CATALOG, PLAN_CODES } from '@/lib/plans/catalog'

const prices = PLAN_CODES.map((code) => PLAN_CATALOG[code].priceILS)

export const SOFTWARE_OFFER = {
  '@type': 'AggregateOffer',
  priceCurrency: 'ILS',
  lowPrice: String(Math.min(...prices)),
  highPrice: String(Math.max(...prices)),
  offerCount: String(prices.length),
} as const
