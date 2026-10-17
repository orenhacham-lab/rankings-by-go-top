/**
 * COUNTRIES THE SERVICE IS NOT SOLD TO, AND WHY — one list, no second copy.
 *
 * WHY THIS IS CODE AND NOT A CLAUSE IN THE TERMS.
 *
 * The terms already say the service is unavailable where sanctions apply
 * (§20.2), but a clause only gives us something to point at AFTER the fact.
 * Two of the regimes below are not civil matters:
 *
 *   ENEMY STATES (Israeli law, the sharpest exposure for an Israeli company).
 *   The Trading with the Enemy Ordinance 1939, retained as Israeli law in
 *   1948, makes it a CRIMINAL offence for an Israeli person or company to have
 *   commercial, financial or other dealings with an enemy state, a resident of
 *   one, or an entity it controls. The enemy states are designated by the
 *   Ministry of Finance; as understood at the time of writing they are Iran,
 *   Iraq, Syria and Lebanon. Selling a subscription to a resident of one of
 *   them is the offence itself, so the signup and payment flows have to REFUSE,
 *   not disclaim.
 *
 *   COMPREHENSIVELY SANCTIONED (US/EU, reaching us through our own suppliers).
 *   OFAC's comprehensive programmes cover the export of SERVICES, and SaaS is a
 *   service. We have a US nexus in several directions at once — Vercel,
 *   Supabase, the AI providers, USD card processing — so the exposure is real
 *   even though we are not a US company. Our payment processors also forbid
 *   these jurisdictions contractually, which means a payment from one is a
 *   breach of our own merchant agreement before it is anything else.
 *
 * WHAT THIS LIST IS NOT. It is not a complete sanctions screen. Two things it
 * deliberately does not attempt:
 *
 *   - Restricted PARTIES. The SDN list and the EU consolidated list name people
 *     and entities, not places, and screening a name is a different job from
 *     screening a country. Nothing here does it.
 *   - Sub-national regions. Crimea, Donetsk and Luhansk are comprehensively
 *     sanctioned but have no ISO country code of their own; a request from them
 *     arrives as UA or RU. The terms cover them, this list cannot see them.
 *
 * So this is the floor, not the ceiling, and it is written to be read by a
 * person deciding whether it is still current — the regimes change, the
 * designations change, and a stale list is a false sense of safety. Reviewed
 * 2026-10-03; it names the law behind each entry so the next reader can check
 * that law rather than trusting this comment.
 */

/** Why a country is refused. Kept distinct because the two carry different risk and different wording. */
export const RESTRICTION_REASONS = ['enemy_state', 'comprehensive_sanctions'] as const

export type RestrictionReason = (typeof RESTRICTION_REASONS)[number]

export type CountryRestriction = {
  /** ISO 3166-1 alpha-2, upper case. */
  code: string
  reason: RestrictionReason
  /** The country in English, for logs and for the operator — never shown to a visitor. */
  name: string
}

/**
 * ISO 3166-1 alpha-2 → why it is refused.
 *
 * Alpha-2 and upper case throughout, because that is what the CDN's geo header
 * and the ISO country lists in payment forms both use.
 */
export const RESTRICTED_COUNTRIES: Readonly<Record<string, CountryRestriction>> = Object.freeze({
  // Israeli enemy states — Trading with the Enemy Ordinance 1939. Criminal.
  IR: { code: 'IR', reason: 'enemy_state', name: 'Iran' },
  IQ: { code: 'IQ', reason: 'enemy_state', name: 'Iraq' },
  SY: { code: 'SY', reason: 'enemy_state', name: 'Syria' },
  LB: { code: 'LB', reason: 'enemy_state', name: 'Lebanon' },

  // Comprehensively sanctioned (OFAC/EU country programmes), reaching us
  // through our US suppliers and our payment processors' own prohibitions.
  // Syria and Iran are on both lists; the Israeli reason is the stricter one
  // and is the one recorded, so they are not repeated here.
  CU: { code: 'CU', reason: 'comprehensive_sanctions', name: 'Cuba' },
  KP: { code: 'KP', reason: 'comprehensive_sanctions', name: 'North Korea' },
})

/** Normalise anything (a header, a form field, a webhook payload) to an alpha-2 code, or null. */
export function normalizeCountryCode(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const code = value.trim().toUpperCase()
  return /^[A-Z]{2}$/.test(code) ? code : null
}

/**
 * The restriction on a country, or null when there is none.
 *
 * An unrecognisable or absent value returns null — NOT a block. Refusing
 * everyone we cannot identify would turn a missing CDN header into a site-wide
 * outage, and the declared-country check (which does fail closed) is the one
 * that has to be strict. See `lib/sanctions/decide.ts` for which is which.
 */
export function countryRestriction(value: unknown): CountryRestriction | null {
  const code = normalizeCountryCode(value)
  return code ? (RESTRICTED_COUNTRIES[code] ?? null) : null
}

export function isRestrictedCountry(value: unknown): boolean {
  return countryRestriction(value) !== null
}
