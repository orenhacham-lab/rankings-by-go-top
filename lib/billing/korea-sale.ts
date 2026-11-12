/**
 * WHETHER A PAID SUBSCRIPTION MAY BE SOLD TO A VISITOR PLACED IN KOREA.
 *
 * WHY THIS IS NOT THE KOREAN LOCALE'S QUESTION. The legal thread's ruling of
 * 12.11.2026 (/mnt/project-files/legal/korea-locale-2026-11-12.md) first stated
 * its condition as "no Korean price page before Creem is live for Korea", and
 * corrected it the same day: the billing market is decided by the visitor's
 * COUNTRY (lib/billing/server-market.ts), never by the page's language, so the
 * Korean locale was never what created the exposure. A visitor in Seoul can
 * read the English site, take the seven-day trial and reach the paid step.
 *
 * AND THE TWO ROUTES ARE NOT ONE QUESTION EITHER, which is the whole shape of
 * this module. The ruling splits them by WHO THE SELLER IS:
 *
 *   * OUR OWN-NAME SALE (PayPal today). VAT Act art. 53-2 puts 10% Korean VAT
 *     on a B2C electronic service supplied to a Korean consumer by a foreign
 *     supplier, with no de-minimis threshold, from the first sale, payable
 *     within 20 days of the quarter; 전자상거래법 art. 13 additionally obliges a
 *     mail-order seller to publish a Korean business registration number and a
 *     mail-order notification number, neither of which a company established in
 *     Israel holds. On this route that supplier is US. Accepting Creem's
 *     Merchant Terms does NOTHING for a sale we make in our own name, so this
 *     route does not open with Creem's clause: it opens only if the company is
 *     actually registered for simplified NTS collection, which is what
 *     `koreaOwnSaleEnabled` says and nothing else does.
 *
 *   * CREEM'S SALE (Merchant Terms cl. 3.2 and 3.3.4: Creem is the merchant of
 *     record and calculates, collects and remits the indirect taxes by the
 *     buyer's billing address). That is the route `koreanCheckoutEnabled` was
 *     written for, and it stays shut until the legal thread has accepted the
 *     clause and the cl. 3.7 pre-checkout disclosure is performed in Korean.
 *
 * A single switch over both routes would flatten those two situations and would
 * open our own-name sale on a condition that does not protect it.
 *
 * SO THE BLOCK IS ON THE SALE, AND ONLY ON THE SALE. The trial takes no card:
 * there is nothing to tax during it and nothing to withdraw from, which is
 * exactly why the ruling let the locale go live as a marketing-and-trial site.
 * A Korean visitor keeps the site, the signup and the trial, and is refused
 * only at the step that would conclude a paid contract.
 *
 * THE INDUCEMENT DUTY, WHICH SITS EARLIER THAN THE REFUSAL. 전자상거래법 제21조
 * 제1항 제1호 ([시행 2026. 7. 21.] [법률 제21312호]) is addressed to "전자상거래를
 * 하는 사업자 또는 통신판매업자" — a business carrying on electronic commerce, which
 * we are the moment the Korean site is up, with or without a sale — and the act
 * it forbids includes 유인, inducement, which happens BEFORE any contract. So
 * offering a Korean consumer a trial while knowing the payment at its end will
 * be refused, without saying so first, is the withheld material fact. The
 * disclosure therefore renders on the PRICING pages too (every language, since
 * the duty follows the consumer and not the page), not only on the refusal
 * screen: see `koreaTrialOnlyNoticeForCountry` and its callers.
 *
 * KOREA IS DELIBERATELY NOT IN lib/sanctions/countries.ts: that list is enemy
 * states and comprehensive sanctions programmes, its refusal text says so, and
 * labelling a tax registration gap as a sanction would be false to the visitor.
 *
 * THE RESIDUAL, STATED RATHER THAN HIDDEN. An unplaceable visitor is NOT
 * blocked. This is the opposite direction from lib/consent/eprivacy-territory,
 * and deliberately: there, an unknown country still needs consent, because the
 * cost of a needless gate is a lost statistic. Here, blocking every visitor the
 * CDN could not place would refuse every sale in every country to protect
 * against one, and an unknown country is not evidence of Korea. The second half
 * of that residual is that this reads the CDN's geo header, which fails open by
 * design (lib/sanctions/guard.ts says so), while a country the buyer DECLARES
 * would fail closed. Neither route hands us a declared country today: PayPal's
 * subscription object is verified for its id, status and plan only
 * (lib/paypal/client.ts) and carries no reliable payer country, and Creem
 * reports the billing address at its webhook, after the checkout this module
 * already refuses. So geo is the whole guard for now, and the place a declared
 * country would be checked is named here rather than left implicit.
 */
import { koreanCheckoutEnabled } from '../i18n/korean-site'
import { COUNTRY_HEADER } from './server-market'

/** The one country, and the reason it is one country and not a list. */
export const KOREA_COUNTRY = 'KR'

/** Read from the same CDN header the billing market itself is read from. */
export const KOREA_SALE_COUNTRY_HEADER = COUNTRY_HEADER

function normalizeCountry(value: string | null | undefined): string | null {
  if (typeof value !== 'string') return null
  const code = value.trim().toUpperCase()
  return /^[A-Z]{2}$/.test(code) ? code : null
}

function isKorea(country: string | null | undefined): boolean {
  return normalizeCountry(country) === KOREA_COUNTRY
}

/**
 * Whether the company may conclude a Korean sale IN ITS OWN NAME.
 *
 * This is NOT `koreanCheckoutEnabled`, and the difference is the point: a sale
 * on our own name is lawful only once the company is registered for simplified
 * NTS collection (VAT Act art. 53-2) and can make the 전자상거래법 art. 13
 * disclosures. Build-time, like every NEXT_PUBLIC flag, and off unless the
 * value is exactly 'true'.
 */
export function koreaOwnSaleEnabled(
  value: string | undefined = process.env.NEXT_PUBLIC_KOREA_SELLER_REGISTERED,
): boolean {
  return value === 'true'
}

/** True where WE may not sell to this visitor on our own name (the PayPal path). */
export function koreaOwnSaleBlockedForCountry(
  country: string | null | undefined,
  enabled: boolean = koreaOwnSaleEnabled(),
): boolean {
  if (enabled) return false
  return isKorea(country)
}

/** True where CREEM may not sell to this visitor (the merchant-of-record path). */
export function koreaCreemSaleBlockedForCountry(
  country: string | null | undefined,
  enabled: boolean = koreanCheckoutEnabled(),
): boolean {
  if (enabled) return false
  return isKorea(country)
}

/**
 * True where NEITHER route may sell: the visitor has no way to pay at all, and
 * is the one who must be told so in words.
 */
export function koreaSaleBlockedForCountry(
  country: string | null | undefined,
  ownEnabled: boolean = koreaOwnSaleEnabled(),
  creemEnabled: boolean = koreanCheckoutEnabled(),
): boolean {
  return koreaOwnSaleBlockedForCountry(country, ownEnabled)
    && koreaCreemSaleBlockedForCountry(country, creemEnabled)
}

/** The own-name decision, taken from a request's headers. */
export function koreaOwnSaleBlockedForRequest(
  h: { get(name: string): string | null },
  enabled: boolean = koreaOwnSaleEnabled(),
): boolean {
  return koreaOwnSaleBlockedForCountry(h.get(KOREA_SALE_COUNTRY_HEADER), enabled)
}

/** The Creem decision, taken from a request's headers. */
export function koreaCreemSaleBlockedForRequest(
  h: { get(name: string): string | null },
  enabled: boolean = koreanCheckoutEnabled(),
): boolean {
  return koreaCreemSaleBlockedForCountry(h.get(KOREA_SALE_COUNTRY_HEADER), enabled)
}

/**
 * Whether a PUBLIC page must carry the trial-only disclosure for this visitor:
 * true exactly where no route may sell, which is the fact 제21조 제1항 제1호 says
 * may not be withheld before the trial begins.
 */
export function koreaTrialOnlyNoticeForCountry(
  country: string | null | undefined,
  ownEnabled: boolean = koreaOwnSaleEnabled(),
  creemEnabled: boolean = koreanCheckoutEnabled(),
): boolean {
  return koreaSaleBlockedForCountry(country, ownEnabled, creemEnabled)
}

/** What the refusal is called in a log line and in an API response body. */
export const KOREA_SALE_REFUSAL_REASON = 'korea_checkout_unavailable'
