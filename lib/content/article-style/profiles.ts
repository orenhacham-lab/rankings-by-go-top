/**
 * The business's official profiles (Google Business Profile, Facebook,
 * Instagram, LinkedIn, X, YouTube, TikTok, Wikidata, Wikipedia): stored per
 * project with the article settings (project_article_styles.official_profiles)
 * and written into every article's structured data as the publisher's
 * `sameAs` (lib/content/structured-data.ts), so search engines and AI
 * assistants can tie the site, the article and those profiles to one business.
 *
 * Every URL is checked per network: https only, no user name or port, the
 * network's own host, and a path that names a profile (a bare home page is
 * not a profile). Anything else is rejected, never repaired into a different
 * address. Pure: no I/O.
 */

export const PROFILE_NETWORKS = [
  'google_business', 'facebook', 'instagram', 'linkedin', 'x', 'youtube', 'tiktok', 'wikidata', 'wikipedia',
] as const
export type ProfileNetwork = (typeof PROFILE_NETWORKS)[number]
export type OfficialProfiles = Partial<Record<ProfileNetwork, string>>

export const PROFILE_URL_MAX = 300

type Rule = {
  /** The host, lower case, without a leading "www."/"m."/"mobile." (those are allowed). */
  hosts: RegExp
  /** The path (and, for Google, the query) that makes it a profile. */
  path: RegExp
  /** Keep the query string (Google Maps links carry the place in it). */
  keepQuery?: boolean
}

const RULES: Record<ProfileNetwork, Rule> = {
  google_business: {
    hosts: /^(?:google\.[a-z.]{2,6}|maps\.google\.[a-z.]{2,6}|g\.page|maps\.app\.goo\.gl|goo\.gl|business\.google\.com|share\.google)$/,
    path: /^\/(?!$).+|^\/?\?.+/,
    keepQuery: true,
  },
  facebook: { hosts: /^(?:facebook\.com|fb\.com)$/, path: /^\/(?!sharer|share|dialog|plugins|tr\b|login)[^/?#]{2,}/i },
  instagram: { hosts: /^instagram\.com$/, path: /^\/(?!p\/|explore|accounts)[A-Za-z0-9._]{1,30}\/?$/ },
  linkedin: { hosts: /^(?:[a-z]{2}\.)?linkedin\.com$/, path: /^\/(?:company|in|school|showcase)\/[^/?#]{2,}/ },
  x: { hosts: /^(?:x\.com|twitter\.com)$/, path: /^\/(?!intent|share|home|i\/)[A-Za-z0-9_]{1,15}\/?$/ },
  youtube: { hosts: /^youtube\.com$/, path: /^\/(?:@[^/?#]{2,}|channel\/[^/?#]{2,}|c\/[^/?#]{2,}|user\/[^/?#]{2,})/ },
  tiktok: { hosts: /^tiktok\.com$/, path: /^\/@[^/?#]{2,}\/?$/ },
  wikidata: { hosts: /^wikidata\.org$/, path: /^\/wiki\/Q\d{1,12}$/ },
  wikipedia: { hosts: /^[a-z]{2,3}(?:-[a-z]{2,4})?\.(?:m\.)?wikipedia\.org$/, path: /^\/wiki\/[^?#]{1,200}$/ },
}

/** The network a URL belongs to, or null. */
export function profileNetworkOf(input: string): ProfileNetwork | null {
  for (const n of PROFILE_NETWORKS) if (normalizeProfileUrl(n, input)) return n
  return null
}

/**
 * A profile URL for `network`, normalised (https, lower-case host, no hash, no
 * tracking query except Google's), or null when it is not one. A missing
 * scheme is read as https; http is refused.
 */
export function normalizeProfileUrl(network: ProfileNetwork, input: unknown): string | null {
  if (typeof input !== 'string') return null
  const raw = input.trim()
  if (!raw || raw.length > PROFILE_URL_MAX || /\s/.test(raw)) return null
  if (/^[a-z][a-z0-9+.-]*:/i.test(raw) && !/^https:\/\//i.test(raw)) return null
  let url: URL
  try {
    url = new URL(/^https:\/\//i.test(raw) ? raw : `https://${raw.replace(/^\/+/, '')}`)
  } catch {
    return null
  }
  if (url.protocol !== 'https:' || url.username || url.password || url.port) return null
  const rule = RULES[network]
  const host = url.hostname.toLowerCase().replace(/^(?:www|m|mobile)\./, '')
  if (!rule.hosts.test(host)) return null
  if (network === 'google_business' && /^google\./.test(host) && !url.pathname.startsWith('/maps')) return null
  if (network === 'google_business' && host === 'goo.gl' && !url.pathname.startsWith('/maps')) return null
  const pathAndQuery = rule.keepQuery ? url.pathname + url.search : url.pathname
  if (!rule.path.test(pathAndQuery)) return null
  const path = url.pathname.length > 1 ? url.pathname.replace(/\/+$/, '') : url.pathname
  const out = `https://${url.hostname.toLowerCase()}${path}${rule.keepQuery ? url.search : ''}`
  return out.length <= PROFILE_URL_MAX ? out : null
}

/** A stored value → only valid entries survive. */
export function cleanProfiles(input: unknown): OfficialProfiles {
  const out: OfficialProfiles = {}
  if (!input || typeof input !== 'object' || Array.isArray(input)) return out
  for (const n of PROFILE_NETWORKS) {
    const url = normalizeProfileUrl(n, (input as Record<string, unknown>)[n])
    if (url) out[n] = url
  }
  return out
}

/**
 * A save from the screen, strictly: an unknown network or an invalid URL
 * rejects the request (the screen shows which field), an empty string clears.
 */
export function parseProfilesInput(input: unknown): { ok: true; profiles: OfficialProfiles } | { ok: false; invalid: ProfileNetwork[] } {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return { ok: false, invalid: [] }
  const v = input as Record<string, unknown>
  if (Object.keys(v).some((k) => !(PROFILE_NETWORKS as readonly string[]).includes(k))) return { ok: false, invalid: [] }
  const out: OfficialProfiles = {}
  const invalid: ProfileNetwork[] = []
  for (const n of PROFILE_NETWORKS) {
    const value = v[n]
    if (value === undefined || value === null || value === '') continue
    const url = normalizeProfileUrl(n, value)
    if (url) out[n] = url
    else invalid.push(n)
  }
  return invalid.length ? { ok: false, invalid } : { ok: true, profiles: out }
}

/** The profiles in a fixed order, for sameAs. */
export function sameAsList(profiles: OfficialProfiles | null | undefined): string[] {
  const clean = cleanProfiles(profiles)
  return PROFILE_NETWORKS.map((n) => clean[n]).filter((u): u is string => !!u)
}

export const sameProfiles = (a: OfficialProfiles, b: OfficialProfiles) =>
  PROFILE_NETWORKS.every((n) => (a[n] ?? '') === (b[n] ?? ''))

const SCAN_LIMIT = 1_500_000

/**
 * The profiles a site links to from its home page (usually the header or the
 * footer): every <a href> read, the first valid URL per network kept. Linear
 * in the page's size; nothing past SCAN_LIMIT is read.
 */
export function detectProfilesFromHtml(rawHtml: string): OfficialProfiles {
  const html = String(rawHtml ?? '').slice(0, SCAN_LIMIT)
  const out: OfficialProfiles = {}
  const re = /<a\b[^>]{0,600}?\bhref\s*=\s*["']([^"'\s>]{8,400})["']/gi
  let m: RegExpExecArray | null
  while ((m = re.exec(html)) !== null) {
    const href = (m[1] ?? '').replace(/&amp;/gi, '&')
    if (!/^https?:\/\//i.test(href)) continue
    // A site's own http:// link to its profile is read as the https address it redirects to.
    const candidate = href.replace(/^http:\/\//i, 'https://')
    for (const n of PROFILE_NETWORKS) {
      if (out[n]) continue
      const url = normalizeProfileUrl(n, candidate)
      if (url) { out[n] = url; break }
    }
  }
  return out
}
