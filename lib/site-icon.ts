/**
 * A project's site icon (its favicon), for the places that name the project:
 * the top bar's switcher and its list, the dashboard's hero and the research
 * summary's hero.
 *
 * WHERE THE ICON COMES FROM. The owner's browser loads it straight from the
 * site, with a plain <img> (components/ui/SiteIcon.tsx):
 *   1. the icon the site declares in its HTML (<link rel="icon"> and friends),
 *      when the seeding scan read the home page and found one (the run's
 *      summary, `siteIcon`; lib/seed-scan/site-icon.ts);
 *   2. otherwise https://<the site>/favicon.ico;
 *   3. otherwise, or when neither loads, the project's initial, as before.
 *
 * WHAT IS NEVER DONE. No third-party favicon service (it would tell that
 * service every domain the owner works on). No server-side fetch of an icon:
 * nothing here, in the scan or in any route, requests an icon URL, so a URL a
 * site or a request controls can never make our servers call anywhere. The
 * browser's request goes to the owner's own site, with no referrer.
 *
 * WHAT IS ACCEPTED. Only https, only on the project's own site (the same host,
 * its www twin, or a subdomain of it), only a public-looking host name (no IP
 * literal, no single label like `localhost`), and only a bounded length. A
 * stored icon is checked again on every read, never trusted because it was
 * stored.
 */

/** Longest icon URL kept or shown. */
export const MAX_ICON_URL = 512

const LABEL = /^(?!-)[a-z0-9-]{1,63}(?<!-)$/

/**
 * The site's host name from a project's target_domain ("gotopseo.com",
 * "https://www.shop.co.il/path", an IDN), lowercased and in ASCII; null when it
 * is not a public-looking name.
 */
export function siteHost(domain: string | null | undefined): string | null {
  const raw = (domain ?? '').trim()
  if (!raw || raw.length > 253 + 12) return null
  let host: string
  try {
    host = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(raw) ? raw : `https://${raw}`).hostname.toLowerCase()
  } catch {
    return null
  }
  return publicHost(host) ? host : null
}

function publicHost(host: string): boolean {
  if (!host || host.length > 253 || host.includes(':') || host.endsWith('.')) return false
  const labels = host.split('.')
  if (labels.length < 2 || !labels.every((l) => LABEL.test(l))) return false
  // An IPv4 literal (every label numeric) is not a site's name.
  if (labels.every((l) => /^\d+$/.test(l))) return false
  // The last label is a real TLD shape: letters, or an IDN's xn-- form.
  const tld = labels[labels.length - 1]
  return /^[a-z]{2,63}$/.test(tld) || /^xn--[a-z0-9-]{2,59}$/.test(tld)
}

const bare = (host: string) => host.replace(/^www\./, '')

/** Whether `iconHost` is the site itself: the same host, its www twin, or a subdomain of it. */
export function sameSite(iconHost: string, host: string): boolean {
  const a = bare(iconHost.toLowerCase())
  const b = bare(host.toLowerCase())
  return a === b || a.endsWith(`.${b}`)
}

/**
 * An icon URL as the owner's browser may load it: https, on the project's own
 * site, bounded. Anything else is null (and the caller falls back).
 */
export function safeSiteIcon(url: unknown, domain: string | null | undefined): string | null {
  if (typeof url !== 'string' || url.length === 0 || url.length > MAX_ICON_URL) return null
  const host = siteHost(domain)
  if (!host) return null
  let u: URL
  try {
    u = new URL(url)
  } catch {
    return null
  }
  if (u.protocol !== 'https:' || u.username || u.password || u.port) return null
  if (!publicHost(u.hostname) || !sameSite(u.hostname, host)) return null
  return u.toString()
}

/** The URLs to try, in order: the site's declared icon (when safe), then its /favicon.ico. */
export function siteIconCandidates(domain: string | null | undefined, declared?: string | null): string[] {
  const host = siteHost(domain)
  if (!host) return []
  const out: string[] = []
  const safe = safeSiteIcon(declared, domain)
  if (safe) out.push(safe)
  const fallback = `https://${host}/favicon.ico`
  if (!out.includes(fallback)) out.push(fallback)
  return out
}
