/**
 * The affiliate program's attribution: who sent a visitor.
 *
 * PURE (no network, no database, no `process.env`), so every rule the program
 * states in its terms is unit-testable — see __qa__/referral.qa.ts.
 *
 * NOTHING IS STORED ON THE VISITOR'S DEVICE, and that is a deliberate,
 * documented decision rather than an omission. An affiliate attribution cookie
 * is not "strictly necessary" under ePrivacy art. 5(3) — the site works without
 * it and only the credit is lost — so in the EU it would need consent and a
 * named banner category, and the consent record lives in the visitor's
 * localStorage where the middleware cannot read it. An earlier version wrote a
 * `gt_ref` cookie from the middleware before the banner was answered; it was
 * never enabled in any environment and is now gone, cookie, flag and all.
 *
 * So the code travels in the LINK and is read on the way to signing up, which
 * is exactly what the live agreement promises in four languages: attribution is
 * by the last click on the referral link on the way to creating an account, and
 * a visitor who comes back later without the link may not be credited. There is
 * no attribution window, because a window is a memory and there is none to keep.
 *
 * What this file deliberately does NOT do:
 *   - it never decides that a commission is owed. Attribution is a claim; the
 *     commission is approved by a person (lib/affiliate/commissions.ts), which
 *     is how the program defends itself against a visitor referring themselves.
 *   - it never attaches a code to an account that already exists. A long-standing
 *     customer who clicks their own link must not earn on themselves, so the code
 *     is read only where a NEW account is created (see attachableAtSignup, and
 *     lib/affiliate/attribution.ts which holds the server-side gate).
 */

/** The query parameter an affiliate link carries. */
export const REFERRAL_PARAM = 'ref'

/** An affiliate code is short, lowercase and URL-safe, so it survives being typed out. */
export const REFERRAL_CODE_MAX = 32
const CODE_SHAPE = /^[a-z0-9][a-z0-9_-]*$/

/**
 * The code as we store it, or null when the value cannot be one.
 *
 * Case and surrounding spaces are not meaningful (an affiliate writes their code
 * into a post by hand), so they are normalized away. Anything else is refused
 * rather than repaired: a code is matched against a stored affiliate, and a
 * half-cleaned value would attribute a signup to nobody while looking as if it
 * had worked. The shape is also a CHECK constraint on affiliates.code, so a code
 * this function accepts is a code the database can hold.
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

/**
 * The same URL with an affiliate code on it, used to carry the code from the
 * page a visitor landed on to the signup form.
 *
 * This is the whole of "the code travels in the link": a landing page that was
 * reached with `?ref=` passes it to its own signup button, and nothing is
 * written anywhere. A visitor who wanders off to another page loses it, which is
 * what the agreement says and why the partner's link points where we want them.
 */
export function withReferral(href: string, code: string | null | undefined): string {
  const normalized = normalizeReferralCode(code)
  if (!normalized) return href
  const [path, hash] = href.split('#', 2)
  const [base, query] = path.split('?', 2)
  const params = new URLSearchParams(query)
  params.set(REFERRAL_PARAM, normalized)
  return `${base}?${params.toString()}${hash ? `#${hash}` : ''}`
}

/**
 * How long after an account was created its referral may still be attached.
 *
 * The attach happens in the same breath as the signup, so this is a safety
 * bound, not a window: it is what stops a signed-in customer of two years from
 * calling the attach route with a friend's code and earning on the subscription
 * they were already paying for. Thirty minutes matches
 * SIGNUP_NOTIFICATION_WINDOW_MS in lib/notifications/signup-email.ts, which is
 * the same question ("is this account brand new?") asked by the same callback.
 */
export const NEW_ACCOUNT_WINDOW_MS = 30 * 60 * 1000

/** True while this account is new enough for a referral to be attached to it. */
export function withinNewAccountWindow(createdAt: string | null | undefined, now: number): boolean {
  const created = Date.parse(createdAt ?? '')
  return Number.isFinite(created) && now - created >= 0 && now - created < NEW_ACCOUNT_WINDOW_MS
}

/**
 * May this code be attached to the account being created?
 *
 * `isNewAccount` is the whole gate. An affiliate link clicked by someone who
 * already has an account attributes nothing: otherwise a customer of two years
 * could click their own link, sign in, and earn commission on the subscription
 * they were already paying for. The affiliate's own account is excluded
 * separately, in lib/affiliate/attribution.ts, because that needs the affiliate
 * record.
 */
export function attachableAtSignup(code: string | null | undefined, isNewAccount: boolean): string | null {
  if (!isNewAccount) return null
  return normalizeReferralCode(code)
}

/**
 * A `next` path with its affiliate code taken off: the path to land on, and the
 * code to credit.
 *
 * The Google and email-confirmation doors both come back through
 * app/api/auth/callback, and the only thing that survives those hops is the
 * sanitized `next` path — so that is where the code rides. It is taken off again
 * before the redirect, because the code belongs to the signup, not to the
 * dashboard URL the new customer is about to bookmark.
 */
export function splitReferralFromPath(path: string): { path: string; code: string | null } {
  const code = readReferralParam(path)
  if (!code) return { path, code: null }
  const [withoutHash, hash] = path.split('#', 2)
  const [base, query] = withoutHash.split('?', 2)
  const params = new URLSearchParams(query)
  params.delete(REFERRAL_PARAM)
  const rest = params.toString()
  return { path: `${base}${rest ? `?${rest}` : ''}${hash ? `#${hash}` : ''}`, code }
}
