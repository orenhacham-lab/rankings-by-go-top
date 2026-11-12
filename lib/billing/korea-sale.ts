/**
 * WHETHER A PAID SUBSCRIPTION MAY BE SOLD TO A VISITOR PLACED IN KOREA.
 *
 * WHY THIS IS NOT THE KOREAN LOCALE'S QUESTION. The legal thread's ruling of
 * 12.11.2026 (/mnt/project-files/legal/korea-locale-2026-11-12.md) states its
 * first condition as "no Korean price page before Creem is live for Korea in
 * fact", which reads as a condition on `/ko`. It is not: the billing market is
 * decided by the visitor's COUNTRY (lib/billing/server-market.ts), never by the
 * page's language, so the Korean locale was never what created the exposure. A
 * visitor in Seoul can read the English site, take the seven-day trial and pay
 * — and the path outside Israel is PayPal, where WE are the seller of record.
 *
 * WHAT THAT COSTS. VAT Act art. 53-2 puts 10% Korean VAT on a B2C electronic
 * service supplied to a Korean consumer by a foreign supplier, with no
 * de-minimis threshold, from the first sale, payable within 20 days of the
 * quarter. 전자상거래법 art. 13 additionally obliges a mail-order seller to
 * publish a Korean business registration number and a mail-order notification
 * number, neither of which a company established in Israel holds. Both duties
 * follow the SELLER, so they arrive with the first Korean sale on our own name
 * and not with the first Korean page view.
 *
 * SO THE BLOCK IS ON THE SALE, AND ONLY ON THE SALE. The trial takes no card:
 * there is nothing to tax during it and nothing to withdraw from, which is
 * exactly why the ruling let the locale go live as a marketing-and-trial site.
 * A Korean visitor keeps the site, the signup and the trial, and is refused
 * only at the step that would conclude a paid contract.
 *
 * AND IT IS TIED TO THE FLAG, NOT TO A LIST. `koreanCheckoutEnabled` is the
 * switch the ruling already describes: the day the legal thread accepts Creem's
 * Merchant Terms cl. 3.2/3.3.4 for Korea, or the company registers for
 * simplified NTS collection, that flag flips and this module stops blocking
 * anything. Nothing here is edited on that day. Korea is deliberately NOT in
 * lib/sanctions/countries.ts: that list is enemy states and comprehensive
 * sanctions programmes, its refusal text says so, and labelling a tax
 * registration gap as a sanction would be false to the visitor.
 *
 * THE RESIDUAL, STATED RATHER THAN HIDDEN. An unplaceable visitor is NOT
 * blocked. This is the opposite direction from lib/consent/eprivacy-territory,
 * and deliberately: there, an unknown country still needs consent, because the
 * cost of a needless gate is a lost statistic. Here, blocking every visitor the
 * CDN could not place would refuse every sale in every country to protect
 * against one, and an unknown country is not evidence of Korea. The exposure
 * that remains is a Korean consumer who reaches the paid step behind a VPN or a
 * proxy that strips the header, which is the same residual every geo rule in
 * this repo carries.
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

/**
 * True where a paid subscription may NOT be sold to this visitor.
 *
 * `enabled` is injectable so the guard can be tested both ways without
 * reaching for process.env; in the application it is always the flag.
 */
export function koreaSaleBlockedForCountry(
  country: string | null | undefined,
  enabled: boolean = koreanCheckoutEnabled(),
): boolean {
  if (enabled) return false
  return normalizeCountry(country) === KOREA_COUNTRY
}

/** The same decision, taken from a request's headers. */
export function koreaSaleBlockedForRequest(
  h: { get(name: string): string | null },
  enabled: boolean = koreanCheckoutEnabled(),
): boolean {
  return koreaSaleBlockedForCountry(h.get(KOREA_SALE_COUNTRY_HEADER), enabled)
}

/** What the refusal is called in a log line and in an API response body. */
export const KOREA_SALE_REFUSAL_REASON = 'korea_checkout_unavailable'
