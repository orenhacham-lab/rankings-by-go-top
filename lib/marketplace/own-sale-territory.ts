/**
 * WHERE A SALE MADE IN OUR OWN NAME MAY BE CONCLUDED THROUGH A MARKETPLACE.
 *
 * WHY THIS IS NARROWER THAN THE REST OF THE SITE. On our own checkout the
 * seller of record is Creem, which calculates, collects and remits the buyer's
 * indirect tax by the billing address (Merchant Terms cl. 3.2, 3.3.4), and on
 * ClickBank and Digistore24 the reseller does the same. On JVZoo it does not:
 * `lib/marketplace/config.ts` marks it `sellerOfRecord: false` because its
 * Terms s.5.2 put the purchase contract between the customer and the vendor
 * while s.7 charges a 5% network commission. So a JVZoo sale is OUR sale, and
 * it carries the buyer country's registration and remittance duties on a
 * company established in Israel.
 *
 * AN ALLOW LIST, NOT A BLOCK LIST, AND THE REASON IS THE DIRECTION OF THE
 * MISTAKE. Most countries that tax a foreign supplier of digital services did
 * it with NO de-minimis threshold, and the list keeps growing. Under a block
 * list every country that passes such a law becomes a silent exposure here
 * until somebody notices; under an allow list a country enters only after it
 * has been looked at. The owner chose the allow list on 12.11.2026 after being
 * shown both.
 *
 * IT IS CONFIGURATION, NOT CODE. `MARKETPLACE_OWN_SALE_COUNTRIES` is a
 * comma-separated list of ISO country codes, so the legal thread clearing a
 * country is one environment change and a redeploy, with nothing here edited.
 * Unset, it is the United States alone: the one market where no federal tax on
 * a digital service follows the foreign seller, and where the state-level
 * thresholds are far above this channel's zero sales to date.
 *
 * THE RESIDUAL, AND WHY IT POINTS THE OTHER WAY FROM lib/billing/korea-sale.
 * There, an unplaceable visitor is NOT blocked, because refusing every visitor
 * the CDN could not place would refuse every sale in every country to protect
 * against one. Here the refusal costs the buyer nothing: this page is one of
 * several ways to the same plan, and a visitor who is turned away is sent to
 * our own checkout, where a seller of record exists. So an unknown country
 * fails CLOSED, which is the cheap direction on this page and the expensive
 * one on that one.
 */

/** Unset means the United States alone. */
export const DEFAULT_OWN_SALE_COUNTRIES = Object.freeze(['US'])

function normalizeCountry(value: string | null | undefined): string | null {
  if (typeof value !== 'string') return null
  const code = value.trim().toUpperCase()
  return /^[A-Z]{2}$/.test(code) ? code : null
}

/** The cleared countries, from configuration, normalized and de-duplicated. */
export function ownSaleCountries(
  value: string | undefined = process.env.MARKETPLACE_OWN_SALE_COUNTRIES,
): string[] {
  const configured = (value ?? '')
    .split(',')
    .map((code) => normalizeCountry(code))
    .filter((code): code is string => !!code)
  return configured.length > 0 ? [...new Set(configured)] : [...DEFAULT_OWN_SALE_COUNTRIES]
}

/**
 * True where we may conclude a sale in our own name through a marketplace.
 * An unknown or unreadable country is NOT allowed, for the reason above.
 */
export function ownSaleAllowedForCountry(
  country: string | null | undefined,
  countries: string[] = ownSaleCountries(),
): boolean {
  const code = normalizeCountry(country)
  return !!code && countries.includes(code)
}

/** The same decision, taken from a request's headers. */
export function ownSaleAllowedForRequest(
  h: { get(name: string): string | null },
  header: string,
  countries: string[] = ownSaleCountries(),
): boolean {
  return ownSaleAllowedForCountry(h.get(header), countries)
}
