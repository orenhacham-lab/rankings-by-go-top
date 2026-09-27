'use server'

/**
 * Keeps the free check's claim token for the merchant's first project.
 *
 * The free check sends its visitor to /signup?claim=<token>. The sign-up page
 * passes that value here and removes it from the address; this action keeps it
 * in a first-party, httpOnly, SameSite=Lax cookie for 24 hours (see
 * lib/onboarding/claim-cookie.ts), where only the server can read it back.
 *
 * Nothing is trusted and nothing is echoed: only a value shaped exactly like a
 * token the free check issues is kept, the action answers nothing whatever it
 * was given, and nothing about the value is logged. With the seeding scan off
 * (production today) no cookie is set at all, so sign-up is exactly as before.
 */
import { cookies, headers } from 'next/headers'
import { seedScanFlagOn } from '@/lib/onboarding/availability'
import { claimCookieOptions, readClaimToken, requestIsHttps, SEED_CLAIM_COOKIE } from '@/lib/onboarding/claim-cookie'

export async function keepSeedClaim(value: unknown): Promise<void> {
  if (!seedScanFlagOn(process.env)) return
  const token = readClaimToken(value)
  if (!token) return
  const secure = requestIsHttps(await headers())
  const store = await cookies()
  store.set(SEED_CLAIM_COOKIE, token, claimCookieOptions(secure))
}
