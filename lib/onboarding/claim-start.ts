/**
 * Where a merchant who signed up WITH a free-check claim goes next.
 *
 * The free check links to /signup?claim=<token>; the sign-up page keeps the
 * token in the claim cookie (./claim-cookie.ts). Sign-up used to end on the
 * dashboard whatever it carried, and a new account's dashboard is "no project
 * yet — create one", so the scan the visitor had just watched reached their
 * account only if they found the new-project screen themselves and submitted
 * it. Now sign-up ends on CLAIM_START_PATH instead, and that screen creates the
 * project from the claimed scan and opens it on its own
 * (components/onboarding/NewProjectFlow.tsx), with no step in between.
 *
 * Both ways sign-up can end call afterSignupPath:
 *   - with a session at once (email confirmation off): the sign-up page, through
 *     its server action, because only the server can read the httpOnly cookie;
 *   - through the confirmation email: the auth callback, which receives the
 *     cookie with the link's top-level navigation (SameSite=Lax), so it works
 *     in whichever tab of that browser the link is opened.
 *
 * It only ever chooses between the path it was given and one fixed internal
 * path of ours; it never builds a path from input and never reads the token
 * beyond "is one kept". No imports beyond the two import-free modules below,
 * because the public sign-up page loads it through its server action.
 */
import { seedScanFlagOn } from './availability'
import { readClaimToken } from './claim-cookie'

/** The query parameter, and its only value, that asks the new-project screen to start from the claim. */
export const CLAIM_START_PARAM = 'start'
export const CLAIM_START_VALUE = 'claim'
export const CLAIM_START_PATH = `/projects/new?${CLAIM_START_PARAM}=${CLAIM_START_VALUE}`

/** Where sign-up has always ended: the default landing, which a claim replaces. */
export const SIGNUP_LANDING_PATH = '/dashboard'

/** The path without its query or fragment, for "is this the default landing". */
function pathOnly(path: string): string {
  const cut = path.search(/[?#]/)
  return cut < 0 ? path : path.slice(0, cut)
}

/**
 * CLAIM_START_PATH when sign-up is ending on the default landing, the browser
 * holds a well-formed claim, and the seeding scan is on; `next` as it is
 * otherwise. A `next` that asks for somewhere specific (a Shopify install, an
 * invitation) is always kept: only the default landing is replaced.
 */
export function afterSignupPath(args: {
  /** Where sign-up would end without a claim: an already sanitised internal path. */
  next: string
  /** The claim cookie's raw value, if the request carried one. */
  claimCookie: string | null | undefined
  env: Record<string, string | undefined>
}): string {
  if (pathOnly(args.next) !== SIGNUP_LANDING_PATH) return args.next
  if (!seedScanFlagOn(args.env)) return args.next
  if (!readClaimToken(args.claimCookie)) return args.next
  return CLAIM_START_PATH
}

/** Whether the new-project screen was opened to start from the claim. */
export function isClaimStart(params: { get(name: string): string | null } | null | undefined): boolean {
  return params?.get(CLAIM_START_PARAM) === CLAIM_START_VALUE
}
