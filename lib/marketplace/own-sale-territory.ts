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
 * Unset, it is the four countries in DEFAULT_OWN_SALE_COUNTRIES below, each
 * with the figure and the authority it was cleared on beside it.
 *
 * THREE OF THE FOUR ARE THRESHOLDS, NOT EXEMPTIONS. Canada, Japan and
 * Australia owe nothing until a revenue figure is passed, and passing it
 * creates a registration duty rather than a penalty. At zero sales that is
 * theoretical; the FIRST PAYING CUSTOMER in any of them makes it real, and
 * somebody then has to watch the revenue against the number. The United States
 * is not a threshold in the same sense — see its entry.
 *
 * SWITZERLAND IS DELIBERATELY ABSENT, and it is the one that would have bitten.
 * Its CHF 100,000 figure is not Swiss turnover but WORLDWIDE turnover (FTA,
 * "VAT liability: foreign companies"; revised VAT Act art. 10 para. 2 let. b
 * item 2), so the company's Israeli revenue counts toward the Swiss test and a
 * single $79 Swiss sale can trigger a registration — which is not even possible
 * without appointing a Swiss tax representative, a recurring cost. It enters
 * only after the accountant states the worldwide figure and someone has priced
 * a representative.
 *
 * THE EU IS ABSENT BECAUSE OF THE LAW, NOT CAUTION: a non-EU supplier of
 * electronic services to consumers there owes from the first euro, with no
 * threshold at all.
 *
 * THE OPEN LEVER, WORTH MORE THAN THE LIST. Canada, Japan (from 1.4.2025) and
 * Australia each move the duty off the vendor and onto the platform where the
 * platform is registered as a distribution platform operator, a specified
 * platform business or an EDP operator, and those rules override the contract
 * s.5.2 describes. JVZooPay collects the money, so the duty may already be
 * JVZoo's in those three. That turns on JVZoo stating IN WRITING which
 * jurisdictions it is registered in and whether it remits — never inferred
 * from the fact that it collects. Unanswered as of 13.11.2026.
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

/**
 * The countries cleared for a sale in our own name, each on a stated basis.
 * Cleared by the legal thread 13.11.2026 against each revenue authority's own
 * published guidance. A country is added here only the same way.
 *
 * - 'US' — NOT a threshold: no federal tax follows a foreign supplier of a
 *   digital service at all, which is structural. What makes the states safe is
 *   that economic nexus is per state and we have zero sales, so no state's test
 *   is met. The common figure is USD 100,000 but it is not uniform (Connecticut
 *   pairs it with 200 transactions, California's is far higher) and whether a
 *   SaaS subscription is taxable varies by state. READ THIS ENTRY AS A FINDING
 *   ABOUT OUR VOLUME, NOT ABOUT AMERICA: the review trigger is approaching any
 *   single state's threshold, not a date.
 * - 'CA' — simplified GST/HST registration for non-resident vendors of digital
 *   products once applicable revenues exceed CAD 30,000 over any 12 months
 *   beginning on or after 1.7.2021; registration takes effect the day it is
 *   exceeded. Below it, nothing is owed and nothing is filed. (canada.ca,
 *   GST/HST for digital-economy businesses.)
 * - 'JP' — a foreign business is exempt where its taxable sales in the base
 *   period are JPY 10,000,000 or less, and for a foreign provider only B2C
 *   sales count toward that figure. (NTA, cross-border supplies guidance.)
 * - 'AU' — a non-resident registers once GST turnover from sales connected with
 *   Australia reaches AUD 75,000; a simplified regime exists for non-residents.
 *   (ato.gov.au, GST for non-resident businesses.)
 */
export const DEFAULT_OWN_SALE_COUNTRIES = Object.freeze(['US', 'CA', 'JP', 'AU'])

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
