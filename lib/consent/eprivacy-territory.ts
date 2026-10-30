/**
 * WHERE A NON-ESSENTIAL TAG NEEDS CONSENT BEFORE IT MAY FIRE.
 *
 * WHY THIS MODULE EXISTS AT ALL. /go/jvzoo carries JVZoo's tracking beacon
 * because their compliance review makes it a condition of listing, and it was
 * gated behind the marketing category for every visitor. Their reviewer does
 * not accept cookies, so the beacon was genuinely absent from the page they
 * loaded, and all four products were rejected on that single note — four
 * times, in identical words: "We are not seeing the Jvzoo tracking pixels."
 * A gate that blocks the listing everywhere, to protect visitors in one
 * territory, protects nobody in the other.
 *
 * AND THE BEACON REALLY IS STORAGE, WHICH IS THE WHOLE LEGAL POINT. It was
 * described in this project — including in this file's predecessors' comments
 * — as a 1x1 image that writes nothing to the device and reads nothing back.
 * That was wrong on a checkable fact. `https://i.jvzoo.com/0/<product>/99`
 * answers `content-type: image/gif`, 35 bytes, and three `Set-Cookie`
 * headers: `csrf_protected`, `PHPSESSID` and `jvz_session`, the last a
 * serialised PHP session holding the visitor's IP address and full
 * user-agent, both with Max-Age 7200. An image response may carry Set-Cookie
 * like any other response, and this one does. So ePrivacy Art. 5(3) applies
 * on its own terms: information is stored on the user's terminal equipment.
 * Neither carve-out reaches it — the transmission can plainly happen without
 * it, and a JVZoo session cookie is not strictly necessary to a service the
 * visitor requested, since our page renders identically without it, which is
 * exactly what their reviewer saw. Where Art. 5(3) applies, consent is the
 * condition for the storage itself and Art. 6 GDPR offers no substitute:
 * legitimate interests can justify a purpose, never an unconsented write to a
 * device, and Art. 6(1)(b) fails too because no contract exists at page view
 * (EDPB Opinion 2/2019). Anyone reasoning about this tag again starts here.
 *
 * SO THE RULE IS TERRITORIAL, NOT A WEAKENED GATE. Inside the territory
 * below nothing changes: the tag fires only on a prior affirmative act, and
 * the consent record still governs it. Outside it, the tag fires on page
 * load. This module decides only WHERE, and it is deliberately the only thing
 * in it — what fires, and the gate it goes through inside the territory, stay
 * where they were.
 *
 * TWO CHOICES THAT BOTH ERR TOWARD CONSENT, because the error is not
 * symmetric: a tag withheld from someone who would have allowed it costs a
 * statistic, and a cookie written for someone who was never asked cannot be
 * recalled.
 *
 *   Canada is listed in full, not just Québec. Law 25 requires consent on the
 *   same facts, Québec is a province, and the CDN header carries a country —
 *   carving the province out would mean reading a second, weaker signal and
 *   writing a cookie whenever it read wrong. All of Canada costs us nothing
 *   here: this channel is sold to the United States.
 *
 *   An absent, unknown or malformed country REQUIRES consent. This is the
 *   opposite of lib/sanctions/guard.ts, which fails open on purpose; there a
 *   missing header must not block a lawful customer, and here it must not
 *   authorise a write. Failing open would make every visitor the CDN cannot
 *   place — and every local or preview request, where no CDN set the header
 *   at all — into an unconsented write.
 */

/**
 * The country header, repeated rather than imported, for the reason
 * lib/sanctions/guard.ts gives about `next/headers` and the edge runtime: this
 * module must stay importable from anywhere, including a pure test that has
 * no request. `lib/consent/__qa__/eprivacy-territory.qa.ts` asserts it is byte-identical
 * to `COUNTRY_HEADER` in lib/billing/server-market.ts, so a rename of one
 * without the other fails a guard instead of silently reading a header nobody
 * sets — which here would mean requiring consent everywhere, i.e. the listing
 * blocked again with no error to show why.
 */
export const CONSENT_COUNTRY_HEADER = 'x-vercel-ip-country'

/**
 * EEA (the 27 member states plus Iceland, Liechtenstein and Norway), the
 * United Kingdom, Switzerland and Canada. Alpha-2, upper case, which is what
 * the CDN sends.
 */
export const CONSENT_REQUIRED_COUNTRIES: readonly string[] = Object.freeze([
  // EU
  'AT', 'BE', 'BG', 'CY', 'CZ', 'DE', 'DK', 'EE', 'ES', 'FI', 'FR', 'GR',
  'HR', 'HU', 'IE', 'IT', 'LT', 'LU', 'LV', 'MT', 'NL', 'PL', 'PT', 'RO',
  'SE', 'SI', 'SK',
  // EEA, non-EU
  'IS', 'LI', 'NO',
  // UK, Switzerland, Canada
  'GB', 'CH', 'CA',
])

const CONSENT_REQUIRED = new Set(CONSENT_REQUIRED_COUNTRIES)

/**
 * The values the CDN sends when it could NOT place the visitor. They are
 * well-formed two-character codes, so a shape check alone lets them through
 * and reads "I don't know" as "not in Europe" — the one mistake this module
 * exists to avoid. `XX` is the documented unknown marker and `T1` is a Tor
 * exit node, which is by definition a request whose origin is hidden.
 */
const UNPLACED = new Set(['XX', 'T1'])

/** Exactly two upper-case letters that are an actual claim about a place, or
 *  null. A value that is not a country code, or is the CDN saying it does not
 *  know, is not evidence about where the visitor is. */
function normalizeCountry(raw: string | null | undefined): string | null {
  const value = raw?.trim().toUpperCase()
  if (!value || !/^[A-Z0-9]{2}$/.test(value) || UNPLACED.has(value)) return null
  if (!/^[A-Z]{2}$/.test(value)) return null
  return value
}

/**
 * Whether prior consent is required for a non-essential tag, given the
 * country the CDN reports.
 *
 * FAILS CLOSED: `null`, an unrecognised value and a country not on the list
 * are not the same thing, but the first two both return true. Only a country
 * we can read AND that is not on the list returns false.
 */
export function consentRequiredForCountry(country: string | null | undefined): boolean {
  const code = normalizeCountry(country)
  if (!code) return true
  return CONSENT_REQUIRED.has(code)
}

/** The same decision from a request's headers. */
export function consentRequiredForRequest(h: { get(name: string): string | null }): boolean {
  return consentRequiredForCountry(h.get(CONSENT_COUNTRY_HEADER))
}
