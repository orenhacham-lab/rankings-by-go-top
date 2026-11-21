/**
 * Postal codes, per country, for the location modes that take one.
 *
 * THE DEFECT this closes. "ZIP code" mode was written for the United States and
 * only for it: the form let a five-digit number be typed and nothing else, the
 * geocoder was asked with `countrycodes=us`, and the server refused the mode
 * outright for any other country. The geocoding half is fixed (see
 * lib/scanner/google-maps.ts), so what remains is the typing: an Italian CAP is
 * five digits and would have passed by luck, but a Brazilian CEP is 01310-100,
 * a Dutch postcode is 1012 AB, and a British one is SW1A 1AA. Each of those is
 * unreachable through an input that strips everything but digits and stops at
 * five.
 *
 * So the shape of a postal code is data, not code: one row per country we sell
 * in, and a permissive row for everywhere else. The UNITED STATES ROW IS
 * DELIBERATELY UNCHANGED from the old hard-coded behaviour — five digits, digits
 * only, `\d{5}` — because American projects already have targets saved under it
 * and a looser rule there would be a change nobody asked for.
 *
 * A country we have no row for is ACCEPTED, not refused. Refusing it would
 * re-create the defect in a smaller form: a Portuguese or Swedish customer would
 * meet "not supported" on a mode that works perfectly well once the geocoder is
 * asked in their country. The permissive row still blocks what cannot be a
 * postal code anywhere — an empty field, one character, a sentence.
 */

export type PostalRules = {
  /** Longest a postal code can be in this country, as typed (spaces and dashes included). */
  maxLength: number
  /** True when only digits can occur, so the input can strip the rest as it is typed. */
  digitsOnly: boolean
  /** The full-match shape, or null where we accept any plausible postal code. */
  pattern: RegExp | null
  /** A real postal code from that country, shown as the field's placeholder. */
  placeholder: string
}

const GENERIC: PostalRules = { maxLength: 12, digitsOnly: false, pattern: null, placeholder: '' }

const RULES: Record<string, PostalRules> = {
  // Five digits, digits only: exactly the rule this mode shipped with.
  us: { maxLength: 5, digitsOnly: true, pattern: /^\d{5}$/, placeholder: '12345' },
  it: { maxLength: 5, digitsOnly: true, pattern: /^\d{5}$/, placeholder: '00184' },
  es: { maxLength: 5, digitsOnly: true, pattern: /^\d{5}$/, placeholder: '28013' },
  de: { maxLength: 5, digitsOnly: true, pattern: /^\d{5}$/, placeholder: '10115' },
  fr: { maxLength: 5, digitsOnly: true, pattern: /^\d{5}$/, placeholder: '75001' },
  kr: { maxLength: 5, digitsOnly: true, pattern: /^\d{5}$/, placeholder: '04524' },
  // Israel moved from five digits to seven; both are still in use on paper.
  il: { maxLength: 7, digitsOnly: true, pattern: /^\d{5}(?:\d{2})?$/, placeholder: '7546302' },
  br: { maxLength: 9, digitsOnly: false, pattern: /^\d{5}-?\d{3}$/, placeholder: '01310-100' },
  pl: { maxLength: 6, digitsOnly: false, pattern: /^\d{2}-?\d{3}$/, placeholder: '00-001' },
  jp: { maxLength: 8, digitsOnly: false, pattern: /^\d{3}-?\d{4}$/, placeholder: '100-0001' },
  nl: { maxLength: 7, digitsOnly: false, pattern: /^\d{4} ?[A-Za-z]{2}$/, placeholder: '1012 AB' },
  gb: { maxLength: 8, digitsOnly: false, pattern: /^[A-Za-z]{1,2}\d[A-Za-z\d]? ?\d[A-Za-z]{2}$/, placeholder: 'SW1A 1AA' },
  ca: { maxLength: 7, digitsOnly: false, pattern: /^[A-Za-z]\d[A-Za-z] ?\d[A-Za-z]\d$/, placeholder: 'K1A 0B1' },
}

export function postalRules(country: string | null | undefined): PostalRules {
  const code = (country || '').trim().toLowerCase()
  return RULES[code] || GENERIC
}

/**
 * What the field keeps as the customer types. Digit-only countries drop
 * everything else exactly as before; the rest keep letters, digits, one kind of
 * space and the dash, which is every separator a postal code uses.
 */
export function sanitizePostalInput(raw: string, country: string | null | undefined): string {
  const rules = postalRules(country)
  const kept = rules.digitsOnly ? raw.replace(/\D/g, '') : raw.replace(/[^A-Za-z0-9 -]/g, '')
  return kept.slice(0, rules.maxLength)
}

/**
 * Whether a postal code can be saved for this country. Called on the server as
 * well as in the form, because a server action must never trust a form.
 */
export function isValidPostalCode(value: string | null | undefined, country: string | null | undefined): boolean {
  const trimmed = (value || '').trim()
  if (!trimmed) return false
  const rules = postalRules(country)
  if (trimmed.length > rules.maxLength) return false
  if (rules.pattern) return rules.pattern.test(trimmed)
  return /^[A-Za-z0-9][A-Za-z0-9 -]{1,}$/.test(trimmed)
}
