/**
 * WHETHER A PAID SUBSCRIPTION MAY BE SOLD TO THIS VISITOR IN OUR OWN NAME.
 *
 * WHAT THIS CLOSES. `lib/marketplace/own-sale-territory.ts` already answers this
 * question for the marketplace sales pages, where a JVZoo sale is ours because
 * JVZoo's `sellerOfRecord` is false. It was imported in exactly one file, that
 * page. Our own checkout never got it, so on the PayPal route we were the seller
 * of record to a consumer in any country in the world but Korea: the sanctions
 * guard and `lib/billing/korea-sale.ts` were the only country gates on
 * `app/api/paypal/activate`. This module is the same question, already decided
 * by the owner on 12.11.2026, applied to the second surface it belongs on.
 *
 * WHY THE ANSWER MATTERS MOST IN EUROPE. A non-established supplier of B2C
 * electronic services has NO registration threshold in the EU — the non-Union
 * one-stop-shop scheme starts at the first euro — and the United Kingdom sets
 * none for a non-established supplier either. So an own-name sale to a consumer
 * in any of those 28 countries carries the same shape of duty the legal thread
 * found for Korea under VAT Act art. 53-2, with the distance-selling
 * pre-contractual information on top. Nothing had crystallised when this was
 * written: zero paying customers, so no unregistered sale had happened.
 *
 * IT IS INSURANCE, AND IT SHOULD STAY A NO-OP. When Creem is on, a USD-market
 * account with no PayPal history is sent to Creem, the merchant of record, and
 * the PayPal container is not rendered at all, so nothing here ever fires. The
 * owner states Creem is enabled. Nobody can verify it: `CREEM_ENABLED` is a
 * masked secret in Vercel and revealing a value needs his own second factor, so
 * neither he nor any session can read it back. A condition nobody can read is
 * exactly the condition worth a second gate behind it, which is why this exists
 * rather than resting on the flag.
 *
 * THE COUNTRY LIST IS NOT A SECOND LIST. It is `ownSaleCountries()`, the same
 * `MARKETPLACE_OWN_SALE_COUNTRIES` the marketplace reads, so a country cleared
 * once is cleared for both surfaces and there is no pair to drift. The owner
 * chose an allow list over a block list for the reason that file records: the
 * set of countries taxing a foreign supplier of digital services with no
 * de-minimis keeps growing, so a block list turns every new law into a silent
 * exposure.
 *
 * ISRAEL IS NEVER BLOCKED, AND NOT BY BEING ON THE LIST. The company is
 * established in Israel and charges Israeli VAT, so the question this module
 * asks does not arise there. Reading that off the billing market rather than off
 * a country code keeps it true: `marketForCountry` is the one place that decides
 * who pays in shekels, and an Israeli visitor is precisely the ILS market.
 *
 * THE RESIDUAL, AND WHY IT POINTS THE OTHER WAY FROM THE MARKETPLACE. There, an
 * unplaceable visitor fails CLOSED, on the stated reasoning that the same plan
 * is sold on our own site so the refusal costs the buyer nothing. On our own
 * site that reasoning is gone: a visitor the CDN could not place has nowhere
 * else to buy, and every local request and every preview, where no CDN set the
 * header at all, would be refused. So this fails OPEN for an unknown country,
 * like `lib/billing/korea-sale.ts`, and says so rather than hiding it. The
 * second half of that residual is the same one Korea states: this reads the geo
 * header, which a VPN defeats, while a country the buyer DECLARED would fail
 * closed — and PayPal's subscription object carries no reliable payer country
 * (`lib/paypal/client.ts` verifies its id, status and plan only), so geo is the
 * whole guard for now.
 */
import { ownSaleCountries } from '../marketplace/own-sale-territory'
import { marketForCountry } from './market'
import { COUNTRY_HEADER } from './server-market'

/** Read from the same CDN header the billing market itself is read from. */
export const OWN_NAME_SALE_COUNTRY_HEADER = COUNTRY_HEADER

function normalizeCountry(value: string | null | undefined): string | null {
  if (typeof value !== 'string') return null
  const code = value.trim().toUpperCase()
  return /^[A-Z]{2}$/.test(code) ? code : null
}

/**
 * True where WE may not conclude a paid subscription with this visitor in our
 * own name. Israel and an unreadable country both return false, for the two
 * different reasons above.
 */
export function ownNameSaleBlockedForCountry(
  country: string | null | undefined,
  countries: string[] = ownSaleCountries(),
): boolean {
  const code = normalizeCountry(country)
  if (!code) return false
  if (marketForCountry(code) === 'ILS') return false
  return !countries.includes(code)
}

/** The same decision, taken from a request's headers. */
export function ownNameSaleBlockedForRequest(
  h: { get(name: string): string | null },
  countries: string[] = ownSaleCountries(),
): boolean {
  return ownNameSaleBlockedForCountry(h.get(OWN_NAME_SALE_COUNTRY_HEADER), countries)
}

/** What the refusal is called in a log line and in an API response body. */
export const OWN_NAME_SALE_REFUSAL_REASON = 'own_name_sale_unavailable'
