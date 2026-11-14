/**
 * WHERE THE PERSON WHO OPENED AN ACCOUNT ACTUALLY WAS, recorded once.
 *
 * WHY THIS EXISTS. Every territorial rule in this codebase reads the CDN's
 * country header off a LIVE REQUEST — lib/billing/server-market.ts,
 * lib/compliance/gdpr-territory.ts, lib/consent/eprivacy-territory.ts,
 * lib/sanctions/guard.ts. A customer email is sent from a cron, which has no
 * request, so lib/compliance/korea-promotional-email.ts had to place its
 * reader from stored facts: the account's language, the project's country, the
 * project's content language. The residual it documents is a reader in Korea
 * who registered in English and runs a site in another country's name. This
 * closes it, by writing the country down at the one moment we do have a
 * request — the sign-up.
 *
 * IT IS PROVENANCE, AND IT IS WRITTEN ONCE. `signup_country` answers where the
 * account BEGAN, exactly as billing_governance.signup_origin does, and
 * `recordSignupCountry` only ever fills a NULL. A customer who travels has not
 * changed where they signed up, and a column that followed them around would
 * quietly turn a recorded consent lawful or unlawful without anybody deciding
 * it.
 *
 * WHAT IT IS NOT. It is a network geolocation taken once. That is the right
 * strength of evidence for "may we send this person an advertisement", where
 * the alternative is nothing at all, and the WRONG strength for "whose VAT is
 * this" — lib/billing/korea-sale.ts reads the live request and the declared
 * payment country on purpose, and must go on doing so. Never read this column
 * for a tax, a price or a sale.
 *
 * IT NEVER FAILS A SIGN-UP. Every path returns void and swallows its own
 * errors, for the reason app/(auth)/signup/source-action.ts gives: an account
 * is worth more than a fact about it. A country that cannot be written is left
 * NULL, and NULL means "not known", never a country.
 *
 * THE RESIDUAL THAT REMAINS: the CDN sets no header for a local or preview
 * sign-up and cannot place every address, so rows will carry NULL. A reader we
 * could not place is not placed in Korea by the gate — the same residual
 * lib/compliance/gdpr-territory.ts accepts, and for the same reason: treating
 * every unplaceable sign-up as Korean would withhold setup emails from the
 * markets we actually sell to.
 */
import type { ServiceRoleClient } from '@/lib/supabase/admin'

/** The header the CDN sets, repeated for the reason the other territory modules give. */
export const SIGNUP_COUNTRY_HEADER = 'x-vercel-ip-country'

export const SIGNUP_ATTRIBUTION_TABLE = 'signup_attribution'

/** Only an account this new has its country written: the same window the signup alert uses. */
export const FRESH_SIGNUP_MS = 30 * 60 * 1000

/**
 * The header's value as the column accepts it — two letters, upper case — or
 * null. Anything else, including a CDN's "XX" for an address it could not
 * place, is not a country.
 */
export function normalizeSignupCountry(raw: unknown): string | null {
  if (typeof raw !== 'string') return null
  const code = raw.trim().toUpperCase()
  if (!/^[A-Z]{2}$/.test(code)) return null
  // Vercel sends XX when it cannot place the address; T1 is the Tor network.
  return code === 'XX' || code === 'T1' ? null : code
}

/** Is this account new enough that the request being served is its sign-up? */
export function isFreshForCountry(accountCreatedAt: unknown, now: Date): boolean {
  if (typeof accountCreatedAt !== 'string') return false
  const created = Date.parse(accountCreatedAt)
  return Number.isFinite(created) && now.getTime() - created <= FRESH_SIGNUP_MS && created - now.getTime() <= FRESH_SIGNUP_MS
}

export type RecordOutcome = 'written' | 'no_country' | 'not_fresh' | 'already_recorded' | 'failed'

/**
 * Write the country of this sign-up, once. Returns what happened, for the
 * caller's log only; the caller must ignore it rather than act on it.
 *
 * The row may not exist yet: app/(auth)/signup/source-action.ts writes it only
 * when there is attribution to write, so this upserts on the primary key and
 * never overwrites a country already there.
 */
export async function recordSignupCountry(input: {
  admin: ServiceRoleClient
  userId: string
  country: unknown
  accountCreatedAt: unknown
  now?: Date
}): Promise<RecordOutcome> {
  const now = input.now ?? new Date()
  const country = normalizeSignupCountry(input.country)
  if (!country) return 'no_country'
  if (!isFreshForCountry(input.accountCreatedAt, now)) return 'not_fresh'
  try {
    const existing = await input.admin.from(SIGNUP_ATTRIBUTION_TABLE)
      .select('user_id, signup_country').eq('user_id', input.userId).limit(1).maybeSingle()
    if (existing.error) return 'failed'
    const row = existing.data as { signup_country?: unknown } | null
    // Written once: a country already recorded is the account's provenance and stands.
    if (row && typeof row.signup_country === 'string' && row.signup_country.trim() !== '') return 'already_recorded'
    if (row) {
      const updated = await input.admin.from(SIGNUP_ATTRIBUTION_TABLE)
        .update({ signup_country: country }).eq('user_id', input.userId).is('signup_country', null)
      return updated.error ? 'failed' : 'written'
    }
    const inserted = await input.admin.from(SIGNUP_ATTRIBUTION_TABLE)
      .insert({ user_id: input.userId, signup_country: country })
    // A row written by the attribution action between our read and this insert
    // is not a failure: it is the same sign-up, and its country goes unwritten
    // rather than overwriting what that row holds.
    if (inserted.error) return String((inserted.error as { code?: unknown }).code ?? '') === '23505' ? 'already_recorded' : 'failed'
    return 'written'
  } catch {
    return 'failed'
  }
}

/**
 * The recorded country of an account, or null when there is none or it could
 * not be read. A sender treats null as "not known", which places nobody.
 */
export async function readSignupCountry(admin: ServiceRoleClient, userId: string): Promise<string | null> {
  try {
    const { data, error } = await admin.from(SIGNUP_ATTRIBUTION_TABLE)
      .select('signup_country').eq('user_id', userId).limit(1).maybeSingle()
    if (error) return null
    return normalizeSignupCountry((data as { signup_country?: unknown } | null)?.signup_country)
  } catch {
    return null
  }
}
