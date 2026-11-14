/**
 * WHERE THE GDPR AND THE UK GDPR ARE THE READER'S OWN LAW.
 *
 * WHY THIS MODULE EXISTS. Art. 27(1) GDPR makes a controller caught by
 * Art. 3(2) designate a representative in the Union, and UK GDPR Art. 27 does
 * the same for the United Kingdom. Art. 27(2)(a) exempts processing that is
 * **occasional**, includes no large-scale special-category or criminal-
 * conviction data, and is unlikely to result in a risk to rights and freedoms.
 * We have no establishment in the Union and, as this is written, not one
 * customer in it: the processing of data about people there is in fact
 * occasional, so the exemption is available and no representative is owed.
 *
 * That is a statement about FACTS, not a reading of the law, and facts move.
 * This module is the machinery that keeps the statement true, and it does two
 * separate jobs for it:
 *
 *   1. IT NARROWS WHAT WE PROCESS. Our measurement and advertising tags are
 *      the one thing that would turn visits from the territory into regular,
 *      deliberate processing of behaviour, which is also the Art. 3(2)(b)
 *      monitoring hook. app/layout.tsx asks this module and does not render
 *      the loaders at all inside the territory. Nothing is withheld from the
 *      visitor: a measurement tag is for us.
 *   2. IT RAISES A HAND WHEN THE FACT CHANGES. The day an account is created
 *      from the territory, "occasional" stops being true and a representative
 *      has to be appointed. lib/compliance/gdpr-territory-alert.ts sends that
 *      the moment it happens, so the decision arrives before the exposure
 *      does rather than at an audit.
 *
 * THE LIST IS NOT lib/consent/eprivacy-territory.ts's LIST, and the difference
 * is deliberate. That one asks where a non-essential tag needs consent, so it
 * carries Switzerland (FADP), Canada (Law 25) and Korea (개인정보 보호법 제15조
 * with 정보통신망법 제22조의2) as well. This one asks where the GDPR or the UK
 * GDPR applies, and it reaches none of those three.
 * `lib/compliance/__qa__/gdpr-territory.qa.ts` asserts that this list is
 * exactly that one minus CH, CA and KR, so adding a country to one and not the
 * other fails a guard instead of quietly widening or narrowing either job.
 *
 * AND IT FAILS IN THE OPPOSITE DIRECTION, on purpose. eprivacy-territory.ts
 * treats an absent or unplaceable country as inside its territory, because
 * there a missing header must never authorise an unconsented write to a
 * device. Here an unknown country is treated as OUTSIDE, because the cost of
 * the two errors is reversed: counting every unplaceable visitor as European
 * would switch measurement off for the markets we actually sell to, and for
 * every local and preview request, where no CDN sets the header at all. The
 * residual is a visitor in the territory whom the CDN could not place: they
 * get the ordinary consent notice and, if they accept, are measured. That is
 * rare and still consent-based, and a handful of such visits does not make
 * processing regular, which is the only thing Art. 27(2)(a) turns on.
 */

/**
 * The country header, repeated rather than imported, for the reason
 * lib/consent/eprivacy-territory.ts gives: this module must stay importable
 * from anywhere, including a pure test with no request. The QA suite asserts
 * it is byte-identical to the one in lib/billing/server-market.ts.
 */
export const GDPR_COUNTRY_HEADER = 'x-vercel-ip-country'

/**
 * The EEA (the 27 member states plus Iceland, Liechtenstein and Norway) and
 * the United Kingdom. Alpha-2, upper case, which is what the CDN sends.
 *
 * Iceland, Liechtenstein and Norway are in because the GDPR was taken into
 * the EEA Agreement (Joint Committee Decision 154/2018) and applies there as
 * it does in a member state. The United Kingdom is in on its own statute, the
 * UK GDPR, whose Art. 27 duty is the same duty with a different addressee.
 */
export const GDPR_TERRITORY_COUNTRIES: readonly string[] = Object.freeze([
  // EU
  'AT', 'BE', 'BG', 'CY', 'CZ', 'DE', 'DK', 'EE', 'ES', 'FI', 'FR', 'GR',
  'HR', 'HU', 'IE', 'IT', 'LT', 'LU', 'LV', 'MT', 'NL', 'PL', 'PT', 'RO',
  'SE', 'SI', 'SK',
  // EEA, non-EU
  'IS', 'LI', 'NO',
  // United Kingdom, under the UK GDPR
  'GB',
])

const IN_TERRITORY = new Set(GDPR_TERRITORY_COUNTRIES)

/**
 * True only for a country we can place inside the territory. Absent, unknown
 * or malformed is FALSE — see the note on the reversed failure direction above.
 */
export function inGdprTerritory(country: string | null | undefined): boolean {
  if (typeof country !== 'string') return false
  const code = country.trim().toUpperCase()
  if (code.length !== 2) return false
  return IN_TERRITORY.has(code)
}

/** The same question, asked of a request's headers. */
export function gdprTerritoryForRequest(h: { get(name: string): string | null }): boolean {
  return inGdprTerritory(h.get(GDPR_COUNTRY_HEADER))
}
