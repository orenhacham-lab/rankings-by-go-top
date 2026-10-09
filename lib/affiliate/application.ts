/**
 * An application to join the program: what we ask, and what we accept.
 *
 * PURE validation, so the form and the route agree without either trusting the
 * other — the browser's checks are a courtesy and this is the decision.
 *
 * WHAT WE ASK AND WHY. Manual approval is the program's real defence against
 * someone joining to refer themselves, so the application has to carry enough
 * for a person to make that judgement: who they are, how to reach them, and
 * where their audience is. `audience` is the field the decision is actually made
 * on ("I build Shopify stores for Israeli brands, here is my client list"), so
 * it is required and has a floor — a one-word answer is not an application.
 *
 * WHAT WE DO NOT ASK: payout details. A partner supplies those once they are
 * approved and have something to be paid, and asking for bank details from
 * someone we may refuse is both rude and a liability.
 */
import { AFFILIATE_TERMS } from './terms'

export interface ApplicationInput {
  name?: unknown
  email?: unknown
  phone?: unknown
  website?: unknown
  audience?: unknown
  country?: unknown
}

export interface ApplicationFields {
  name: string
  email: string
  phone: string | null
  website: string | null
  audience: string
  country: string | null
}

/** The field keys a form error can be attached to. */
export type ApplicationField = keyof ApplicationFields

export const APPLICATION_LIMITS = {
  name: { min: 2, max: 160 },
  email: { max: 320 },
  phone: { max: 40 },
  website: { max: 300 },
  audience: { min: 20, max: 2000 },
  country: { max: 80 },
} as const

const EMAIL_SHAPE = /^[^\s@]+@[^\s@.]+(\.[^\s@.]+)+$/

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

/**
 * The application as we would store it, or the fields that are wrong.
 *
 * Every limit matches a CHECK constraint on `affiliates`, so an application this
 * function accepts is one the database accepts — a rejection at the database
 * would reach the applicant as an unexplained failure.
 */
export function readApplication(input: ApplicationInput): { ok: true; fields: ApplicationFields } | { ok: false; errors: ApplicationField[] } {
  const name = text(input.name)
  const email = text(input.email).toLowerCase()
  const audience = text(input.audience)
  const phone = text(input.phone)
  const website = text(input.website)
  const country = text(input.country)

  const errors: ApplicationField[] = []
  if (name.length < APPLICATION_LIMITS.name.min || name.length > APPLICATION_LIMITS.name.max) errors.push('name')
  if (!EMAIL_SHAPE.test(email) || email.length > APPLICATION_LIMITS.email.max) errors.push('email')
  if (audience.length < APPLICATION_LIMITS.audience.min || audience.length > APPLICATION_LIMITS.audience.max) errors.push('audience')
  if (phone.length > APPLICATION_LIMITS.phone.max) errors.push('phone')
  if (website.length > APPLICATION_LIMITS.website.max) errors.push('website')
  if (country.length > APPLICATION_LIMITS.country.max) errors.push('country')
  if (errors.length) return { ok: false, errors }

  return {
    ok: true,
    fields: { name, email, phone: phone || null, website: website || null, audience, country: country || null },
  }
}

/**
 * How many applications one address may send in an hour.
 *
 * The form is public and unauthenticated, so it is a spam target. Three is
 * generous for a person correcting a typo and useless for a script.
 */
export const APPLICATION_RATE_LIMIT = { perIpPerHour: 3 } as const

/** A code suggested from a partner's name or site, for the operator to accept or edit. */
export function suggestCode({ name, website }: { name?: string | null; website?: string | null }): string {
  const fromSite = (website ?? '')
    .replace(/^[a-z]+:\/\//i, '')
    .replace(/^www\./i, '')
    .split(/[/?#]/)[0]
    .split('.')[0]
  const base = (fromSite || name || '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '')
    .slice(0, 24)
  return base || 'partner'
}

/** The program's own figures, for the form's small print. */
export const APPLICATION_TERMS = AFFILIATE_TERMS
