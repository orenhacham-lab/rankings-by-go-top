/**
 * Where a sign-up came from, derived with NOTHING stored on the visitor's device.
 *
 * The whole channel question — "did this account come from the groups, from
 * the plugin directory or from search" — is unanswerable today: no utm
 * parameter is read anywhere in the sign-up path and `profiles` holds no
 * source. This is the smallest thing that answers it.
 *
 * WHY NO COOKIE. A first-touch attribution cookie would be better data, and it
 * is not available to us: a cookie set before the banner is answered is not
 * "strictly necessary" under ePrivacy art. 5(3). The referral programme
 * dropped exactly that design for the same reason, and the live privacy policy
 * now says in four languages that nothing is written to the device for
 * attribution. So this reads what the browser volunteers at the moment of
 * sign-up — the address of the page being signed up from, and its referrer —
 * and the server keeps it next to the account. The cost is honest and is
 * written down in the plan: this is last click, not first touch.
 *
 * WHAT IS DELIBERATELY NOT KEPT. Only the referrer's HOST, never the full
 * referring address: a full referrer can carry someone else's query string,
 * which is their data and not ours to hold. Only the path of the landing page,
 * never its query, for the same reason once the utm keys are out of it.
 *
 * Everything here is pure, so lib/attribution/__qa__/signup-attribution.qa.ts
 * can hold it to its shape without a browser or a database.
 */

/** One row of public.signup_attribution, as the sign-up writes it. */
export type SignupSource = {
  source: string | null
  medium: string | null
  campaign: string | null
  referrerHost: string | null
  landingPath: string | null
}

/** Hosts that are us: a referrer from one of these is an internal hop, not a channel. */
export function isOwnHost(host: string): boolean {
  const h = host.toLowerCase()
  return h === 'gotopseo.com' || h.endsWith('.gotopseo.com') || h === 'localhost' || h.endsWith('.localhost')
}

/**
 * One stored value: trimmed, without the two characters the CHECK refuses, and
 * capped at the 200 the column allows. Anything else — a non-string, an empty
 * value, a value that is only markup — is nothing, which is stored as NULL.
 */
export function cleanValue(raw: unknown): string | null {
  if (typeof raw !== 'string') return null
  const cleaned = raw.replace(/[<>]/g, '').trim().slice(0, 200).trim()
  return cleaned.length > 0 ? cleaned : null
}

/** The host of a referring address, or null: not a URL, not http(s), or one of ours. */
export function externalReferrerHost(raw: unknown): string | null {
  if (typeof raw !== 'string' || raw.trim() === '') return null
  let url: URL
  try {
    url = new URL(raw)
  } catch {
    return null
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return null
  const host = url.hostname.toLowerCase()
  if (host === '' || isOwnHost(host)) return null
  return cleanValue(host)
}

/** The path of the page signed up from, without its query and without its fragment. */
export function landingPathOf(raw: unknown): string | null {
  if (typeof raw !== 'string' || raw.trim() === '') return null
  // Accept both a full address and a bare path; a bare path needs a base to parse.
  let path: string
  try {
    path = new URL(raw, 'https://www.gotopseo.com').pathname
  } catch {
    return null
  }
  return cleanValue(path)
}

/**
 * The row to write, or null when there is nothing worth a row (a visitor who
 * typed the address, with no campaign and no external referrer).
 *
 * `search` is the query string of the page being signed up from, in any of the
 * shapes a browser gives it ("?a=b", "a=b", or a URLSearchParams).
 */
export function readSignupSource(input: {
  search?: unknown
  referrer?: unknown
  path?: unknown
}): SignupSource | null {
  const params = toParams(input.search)
  const referrerHost = externalReferrerHost(input.referrer)
  const landingPath = landingPathOf(input.path)

  // `src` is the short form our own published links use; utm_source wins when both are there.
  let source = cleanValue(params.get('utm_source') ?? params.get('src'))
  let medium = cleanValue(params.get('utm_medium'))
  const campaign = cleanValue(params.get('utm_campaign'))

  // No campaign tag but a real referrer: the referring site IS the channel.
  if (source === null && referrerHost !== null) {
    source = referrerHost
    medium = medium ?? 'referral'
  }

  if (source === null && medium === null && campaign === null && referrerHost === null) return null
  return { source, medium, campaign, referrerHost, landingPath }
}

function toParams(search: unknown): URLSearchParams {
  if (search instanceof URLSearchParams) return search
  if (typeof search !== 'string') return new URLSearchParams()
  try {
    return new URLSearchParams(search.startsWith('?') ? search.slice(1) : search)
  } catch {
    return new URLSearchParams()
  }
}
