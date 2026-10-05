/**
 * THE REFERRAL COOKIE IS OFF UNTIL ITS DISCLOSURE EXISTS.
 *
 * An affiliate attribution cookie is not "strictly necessary" under ePrivacy
 * art. 5(3): in the EU it needs the visitor's consent and has to sit in a named
 * banner category. The first version of this wrote `gt_ref` from the middleware
 * on arrival at any `?ref=` URL — before the banner was answered, and before the
 * cookie policy said the cookie existed. That is the one shape we cannot ship.
 *
 * It cannot simply be moved behind the consent check, either: the consent record
 * lives in the visitor's localStorage (lib/consent/client-store.ts), which the
 * middleware cannot read. Gating it properly means either mirroring the choice
 * into a cookie the server can see, or attributing with no storage at all by
 * carrying the ref on the sign-up URL. Both are real work, both touch the
 * consent store the legal thread owns, and neither is a thing to decide at the
 * end of a build.
 *
 * So the whole mechanism is behind this flag, which is OFF and has never been
 * set in any environment. Off means no cookie is ever written: the pure rules in
 * ./referral.ts still exist and are still tested, and nothing reaches a visitor.
 *
 * TURNING IT ON NEEDS THREE THINGS, in this order: the cookie named in the
 * cookie policy in every language, a banner category to sit in (marketing, not
 * necessary), and a write that happens only after a visitor has granted it.
 * Until all three are true this stays off, and
 * lib/affiliate/__qa__/referral.qa.ts fails if the middleware writes without it.
 */
export function affiliateTrackingEnabled(
  value: string | undefined = process.env.NEXT_PUBLIC_AFFILIATE_TRACKING_ENABLED,
): boolean {
  return value === 'true'
}
