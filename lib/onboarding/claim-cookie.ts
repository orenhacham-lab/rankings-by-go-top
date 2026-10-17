/**
 * The free check's claim token, kept for the merchant's first project.
 *
 * The free check links its visitor to /signup?claim=<token>. The signup page
 * hands the token to a server action (app/(auth)/signup/claim-action.ts), which
 * keeps it in the cookie below:
 *
 *   - first-party and httpOnly, so no script on any page can read it;
 *   - SameSite=Lax, so the email-verification link (a top-level navigation from
 *     the mail client) still carries it back to this site;
 *   - 24 hours, the same window the token itself is valid for.
 *
 * Only the server reads it back: the new-project screen looks up which site the
 * token scanned (without redeeming it) to fill in the address, and the start
 * route redeems it when the new project IS that site. The token is a bearer
 * capability, so it is never logged, rendered or returned in a response body,
 * and only a value shaped exactly like one the free check issues is ever kept.
 *
 * This module has no imports on purpose: the signup page loads the server
 * action that uses it, and a public auth page should pull in nothing else.
 */

export const SEED_CLAIM_COOKIE = 'gotop-seed-claim'

/** 24 hours, in seconds: the claim token's own lifetime (lib/free-check CACHE_TTL_MS). */
export const SEED_CLAIM_MAX_AGE_SECONDS = 24 * 60 * 60

export type ClaimCookieOptions = {
  httpOnly: true
  sameSite: 'lax'
  secure: boolean
  path: '/'
  maxAge: number
}

export function claimCookieOptions(secure: boolean): ClaimCookieOptions {
  return { httpOnly: true, sameSite: 'lax', secure, path: '/', maxAge: SEED_CLAIM_MAX_AGE_SECONDS }
}

/** The free check issues 32 random bytes as lowercase hex (lib/free-check/claim.ts). */
const TOKEN_SHAPE = /^[a-f0-9]{64}$/

/** The token when `value` is shaped exactly like one the free check issues; null for anything else. */
export function readClaimToken(value: unknown): string | null {
  return typeof value === 'string' && TOKEN_SHAPE.test(value) ? value : null
}

/**
 * The claim cookie of a request's Cookie header. `present` says whether the
 * cookie was sent at all, so a malformed one can be cleared; `token` is set only
 * when its value is well formed.
 */
export function claimCookieFromHeader(header: string | null | undefined): { present: boolean; token: string | null } {
  if (!header) return { present: false, token: null }
  for (const part of header.split(';')) {
    const eq = part.indexOf('=')
    if (eq < 0) continue
    if (part.slice(0, eq).trim() !== SEED_CLAIM_COOKIE) continue
    let value = part.slice(eq + 1).trim()
    try {
      value = decodeURIComponent(value)
    } catch {
      return { present: true, token: null }
    }
    return { present: true, token: readClaimToken(value) }
  }
  return { present: false, token: null }
}

/** The Set-Cookie value that removes the claim cookie, with the attributes it was set with. */
export function clearedClaimCookie(secure: boolean): string {
  const parts = [`${SEED_CLAIM_COOKIE}=`, 'Path=/', 'Max-Age=0', 'HttpOnly', 'SameSite=Lax']
  if (secure) parts.push('Secure')
  return parts.join('; ')
}

/**
 * Whether the browser reached us over HTTPS. Behind the platform's proxy the
 * scheme the browser used is the forwarded one; a server action's POST also
 * carries its Origin. Plain HTTP (a local `next start`) keeps the cookie usable
 * without the Secure attribute, which a browser would refuse over HTTP.
 */
export function requestIsHttps(headers: { get(name: string): string | null }, requestUrl?: string): boolean {
  const forwarded = (headers.get('x-forwarded-proto') ?? '').split(',')[0].trim().toLowerCase()
  if (forwarded) return forwarded === 'https'
  const origin = headers.get('origin') ?? ''
  if (origin) return origin.toLowerCase().startsWith('https:')
  return (requestUrl ?? '').toLowerCase().startsWith('https:')
}
