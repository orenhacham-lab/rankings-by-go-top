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
 *
 * seedClaimDestination answers where a sign-up that got its session at once
 * goes next: the new-project screen that starts from the claim when the cookie
 * holds one (lib/onboarding/claim-start.ts), else the dashboard. It answers
 * one of those two fixed paths and nothing about the token itself.
 */
import { cookies, headers } from 'next/headers'
import { seedScanFlagOn } from '@/lib/onboarding/availability'
import { claimCookieOptions, readClaimToken, requestIsHttps, SEED_CLAIM_COOKIE } from '@/lib/onboarding/claim-cookie'
import { afterSignupPath, SIGNUP_LANDING_PATH } from '@/lib/onboarding/claim-start'

export async function keepSeedClaim(value: unknown): Promise<void> {
  if (!seedScanFlagOn(process.env)) return
  const token = readClaimToken(value)
  if (!token) return
  const secure = requestIsHttps(await headers())
  const store = await cookies()
  store.set(SEED_CLAIM_COOKIE, token, claimCookieOptions(secure))
}

export async function seedClaimDestination(): Promise<string> {
  const store = await cookies()
  return afterSignupPath({ next: SIGNUP_LANDING_PATH, claimCookie: store.get(SEED_CLAIM_COOKIE)?.value, env: process.env })
}
