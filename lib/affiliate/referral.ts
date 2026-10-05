/**
 * The affiliate program's attribution: who sent a visitor, and for how long it counts.
 *
 * PURE (no network, no database, no `process.env`), so every rule the program states
 * in its terms is unit-testable — see __qa__/referral.qa.ts.
 *
 * ONE decision lives here: a `?ref=` on any public URL names an affiliate, and the
 * answer is kept in a first-party cookie for REFERRAL_WINDOW_DAYS. Last click wins,
 * which is what the published terms say, so a later `?ref=` replaces an earlier one.
 *
 * What this file deliberately does NOT do:
 *   - it never decides that a commission is owed. Attribution is a claim; the
 *     commission is approved by a person (manual approval, then a pending commission),
 *     which is how the program defends itself against a visitor referring themselves.
 *   - it never attaches a code to an account that already exists. A long-standing
 *     customer who clicks their own link must not earn on themselves, so the code is
 *     read only where a NEW account is created (see attachableAtSignup).
 */

/** The query parameter an affiliate link carries. */
export const REFERRAL_PARAM = 'ref'

/**
 * The cookie's name. First-party, readable only by our own server; nothing about the
 * visitor is in it beyond the code the affiliate chose for themselves.
 */
export const REFERRAL_COOKIE = 'gt_ref'

/**
 * Last-click window. 90 days: Surfer runs 60 and Semrush 120, so this sits where an
 * affiliate comparing programs expects it, and it is stated on the public page.
 */
export const REFERRAL_WINDOW_DAYS = 90
export const REFERRAL_WINDOW_SECONDS = REFERRAL_WINDOW_DAYS * 24 * 60 * 60

/** An affiliate code is short, lowercase and URL-safe, so it survives being typed out. */
export const REFERRAL_CODE_MAX = 32
const CODE_SHAPE = /^[a-z0-9][a-z0-9_-]*$/

/**
 * The code as we store it, or null when the value cannot be one.
 *
 * Case and surrounding spaces are not meaningful (an affiliate writes their code into
 * a post by hand), so they are normalized away. Anything else is refused rather than
 * repaired: a code is matched against a stored affiliate, and a half-cleaned value
 * would attribute a signup to nobody while looking as if it had worked.
 */
export function normalizeReferralCode(raw: unknown): string | null {
  if (typeof raw !== 'string') return null
  const code = raw.trim().toLowerCase()
  if (!code || code.length > REFERRAL_CODE_MAX) return null
  return CODE_SHAPE.test(code) ? code : null
}

/** The `?ref=` of a URL, normalized. A repeated parameter uses the first value. */
export function readReferralParam(url: string | URL): string | null {
  let params: URLSearchParams
  try {
    params = (typeof url === 'string' ? new URL(url, 'https://placeholder.invalid') : url).searchParams
  } catch {
    return null
  }
  return normalizeReferralCode(params.get(REFERRAL_PARAM))
}

/** The Set-Cookie value that remembers an affiliate. `secure` only over HTTPS. */
export function referralCookieString(code: string, secure: boolean): string {
  const parts = [
    `${REFERRAL_COOKIE}=${encodeURIComponent(code)}`,
    'Path=/',
    `Max-Age=${REFERRAL_WINDOW_SECONDS}`,
    // Lax, not None: the cookie is read on our own pages only, and it must survive the
    // ordinary case of a visitor arriving from someone else's blog post.
    'SameSite=Lax',
    // The browser never needs it; only the signup handler does.
    'HttpOnly',
  ]
  if (secure) parts.push('Secure')
  return parts.join('; ')
}

/** The Set-Cookie value that forgets one (used once a signup has consumed it). */
export function clearReferralCookieString(secure: boolean): string {
  const parts = [`${REFERRAL_COOKIE}=`, 'Path=/', 'Max-Age=0', 'SameSite=Lax', 'HttpOnly']
  if (secure) parts.push('Secure')
  return parts.join('; ')
}

/**
 * Should this request set the cookie, and to what?
 *
 * Last click wins, so a new code replaces whatever was there. Returning null means
 * "leave the cookie alone", which is the answer for every request that carries no
 * `?ref=` at all — the overwhelming majority, so this stays a cheap check in the
 * middleware.
 */
export function referralToPersist(currentCookie: string | null | undefined, url: string | URL): string | null {
  const incoming = readReferralParam(url)
  if (!incoming) return null
  return incoming === normalizeReferralCode(currentCookie) ? null : incoming
}

/**
 * May this code be attached to the account being created?
 *
 * `isNewAccount` is the whole gate. An affiliate link clicked by someone who already
 * has an account attributes nothing: otherwise a customer of two years could click
 * their own link, sign in, and earn commission on the subscription they were already
 * paying for. The affiliate's own account and projects are excluded separately, at
 * the point the commission is approved, because that needs the affiliate record.
 */
export function attachableAtSignup(code: string | null | undefined, isNewAccount: boolean): string | null {
  if (!isNewAccount) return null
  return normalizeReferralCode(code)
}
