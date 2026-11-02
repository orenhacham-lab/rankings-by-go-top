/**
 * THE SOFTWARE, AS ONE NODE — the entity record for the product itself.
 *
 * Two surfaces publish a SoftwareApplication for Go Top SEO: app/layout.tsx on
 * every public page, and /api/schema. Until now each one wrote its own object
 * literal, and neither gave it an `@id`.
 *
 * Both halves of that cost us the same thing. An `@id`-less node is anonymous,
 * so a resolver reading both surfaces has no way to know they describe one
 * product — it sees two unrelated SoftwareApplications that merely share a
 * name, exactly the ambiguity `lib/seo/organization.ts` was written to remove
 * for the company. And two literals drifted, as two literals do: the page's
 * node carried `operatingSystem` and `author` and the endpoint's did not, the
 * endpoint described the product in a hand-written English sentence that
 * appears nowhere on the site, and nothing tied either of them to the Shopify
 * and WordPress.org records that ARE this software elsewhere.
 *
 * One builder, one `@id`, read by both. The fields are the ones we can show to
 * be true:
 *
 * - `sameAs` — the two first-party platform records OF THE SOFTWARE. The
 *   company's own profiles stay on the Organization (BRAND_PROFILES); these two
 *   are the product's listings on the platforms it publishes to, and both were
 *   fetched and returned 200 on 2 Nov 2026.
 * - `inLanguage` — the live locales, from the same gate the site routes on.
 * - `applicationSubCategory` — the plain label for what it is. No `featureList`:
 *   a feature list here would be copy that no page shows.
 * - no `aggregateRating`, ever: there are no collected reviews to describe
 *   (Google's review-snippet policy, the FTC fake-review rule).
 *
 * Guarded by lib/seo/__qa__/honest-structured-data.qa.ts.
 */
import type { BillingMarket } from '@/lib/billing/market'
import { BRAND_REF, SITE_URL } from './organization'
import { publicSiteLanguages } from './site-languages'
import { softwareOffer } from './software-offer'

/** The product node every surface names, so the surfaces name ONE product. */
export const SOFTWARE_ID = `${SITE_URL}/#software`

/**
 * The software's own records on the platforms it publishes to. Verified live
 * (HTTP 200, page names the product) on 2 Nov 2026. A `sameAs` pointing at a
 * 404 is the one claim a resolver can cheaply disprove, so an entry goes in
 * only once its page is up.
 */
export const PLATFORM_LISTINGS = [
  'https://apps.shopify.com/go-top-seo',
  'https://wordpress.org/plugins/go-top-seo-bridge/',
] as const

export function softwareApplicationSchema(options: {
  /** The page the reader is on — the locale home, not always the Hebrew root. */
  url: string
  /** The market whose prices the reader is quoted (lib/billing/market.ts). */
  market: BillingMarket
  /** The description the page itself shows, in the page's own language. */
  description: string
}) {
  return {
    '@context': 'https://schema.org',
    '@type': 'SoftwareApplication',
    '@id': SOFTWARE_ID,
    name: 'Go Top SEO',
    alternateName: ['Rankings by Go Top'],
    // By reference to the Organization node, not a second copy of it.
    publisher: BRAND_REF,
    brand: BRAND_REF,
    author: BRAND_REF,
    description: options.description,
    url: options.url,
    sameAs: [...PLATFORM_LISTINGS],
    applicationCategory: 'BusinessApplication',
    applicationSubCategory: 'SEO Software',
    operatingSystem: 'Web',
    inLanguage: publicSiteLanguages(),
    offers: softwareOffer(options.market),
  }
}
