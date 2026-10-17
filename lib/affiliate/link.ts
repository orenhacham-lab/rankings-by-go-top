/**
 * A partner's link, and the one thing it does on the way through.
 *
 * THE LINK IS `/r/<code>`, not `?ref=` on a page a partner has to assemble. Two
 * reasons, both practical:
 *   - a click can be COUNTED without storing anything about the visitor. The
 *     redirect route increments a per-day counter for the partner
 *     (affiliate_click_days) and that is the entire record: no IP, no user
 *     agent, no referrer, no identifier, which is what the privacy policy says.
 *   - a partner who writes a link by hand gets it wrong. `/r/danaseo` is short
 *     enough to say out loud, and the route puts `?ref=` on the destination
 *     itself, so the landing page carries the code into the signup form.
 *
 * A hand-written `?ref=` on any page still works — readReferralParam does not
 * care how the code arrived — it just is not counted as a click.
 *
 * PURE: no network, no database. __qa__/link.qa.ts covers it.
 */
import { REFERRAL_PARAM, normalizeReferralCode } from './referral'

/** The prefix of a partner link. */
export const AFFILIATE_LINK_PREFIX = '/r'

/** The query parameter that lets a partner choose where their link lands. */
export const AFFILIATE_DESTINATION_PARAM = 'to'

/**
 * Where a partner link may land, as a closed list.
 *
 * An open `?to=` would be an open redirect on our own domain — the one thing a
 * marketing link must never be, because the link is published and anyone can
 * change its query. So `to` selects a KEY here; it is never a path, never a
 * URL, and an unknown key lands on the home page.
 */
export const AFFILIATE_DESTINATIONS = {
  home: '/',
  pricing: '/pricing',
  signup: '/signup',
  'free-check': '/free-check',
} as const

export type AffiliateDestination = keyof typeof AFFILIATE_DESTINATIONS

/** The destination for a `to` value, falling back to the home page. */
export function affiliateDestination(raw: string | null | undefined): string {
  if (typeof raw !== 'string') return AFFILIATE_DESTINATIONS.home
  const key = raw.trim().toLowerCase()
  return (AFFILIATE_DESTINATIONS as Record<string, string>)[key] ?? AFFILIATE_DESTINATIONS.home
}

/** The path of a partner's link, optionally aimed at one of the destinations above. */
export function affiliateLinkPath(code: string, destination?: AffiliateDestination): string {
  const normalized = normalizeReferralCode(code)
  if (!normalized) return AFFILIATE_LINK_PREFIX
  const suffix = destination && destination !== 'home' ? `?${AFFILIATE_DESTINATION_PARAM}=${destination}` : ''
  return `${AFFILIATE_LINK_PREFIX}/${normalized}${suffix}`
}

/** The partner's link as they will paste it: absolute, on the public site. */
export function affiliateLinkUrl(origin: string, code: string, destination?: AffiliateDestination): string {
  const path = affiliateLinkPath(code, destination)
  return origin.replace(/\/+$/, '') + path
}

/**
 * Where the redirect sends the visitor: the chosen destination with the code on
 * it. Always a path on this site, built here rather than taken from the request.
 */
export function affiliateRedirectPath(code: string, rawDestination: string | null | undefined): string {
  const normalized = normalizeReferralCode(code)
  const destination = affiliateDestination(rawDestination)
  if (!normalized) return destination
  const joiner = destination.includes('?') ? '&' : '?'
  return `${destination}${joiner}${REFERRAL_PARAM}=${encodeURIComponent(normalized)}`
}
