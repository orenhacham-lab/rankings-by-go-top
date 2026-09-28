/**
 * A project's site icon (its favicon), for the places that name the project:
 * the top bar's switcher and its list, the dashboard's hero and the research
 * summary's hero.
 *
 * WHERE THE ICON COMES FROM. The owner's browser loads it straight from the
 * site, with a plain <img> (components/ui/SiteIcon.tsx), trying in order:
 *   1. the icon the site declares in its HTML (<link rel="icon"> and friends),
 *      when the seeding scan read the home page and found one (the run's
 *      summary, `siteIcon`; lib/seed-scan/site-icon.ts). A finished scan that
 *      found none is read again, at most once a week, when the owner's project
 *      list loads (lib/seed-scan/site-icon-refresh.ts);
 *   2. https://<the site>/favicon.ico, then the same on its www twin (a site
 *      that only answers on www, or only without it), then its
 *      /apple-touch-icon.png (iOS asks every site for it, so many have one
 *      even without a /favicon.ico);
 *   3. otherwise, or when none loads, the project's initial, as before.
 *
 * WHY SITES MISSED THEIR ICON (the cases this file now accepts):
 *   - the icon lives on the site's own PLATFORM CDN, not on the site: Shopify
 *     (cdn.shopify.com), Wix (static.wixstatic.com), Squarespace, Webflow,
 *     Duda, GoDaddy, WordPress with Jetpack (i0.wp.com). Those platforms often
 *     have no /favicon.ico of their own, so the fallback failed too;
 *   - the home page is served over http, so a relative href resolved to an
 *     http:// URL and was dropped (a browser upgrades it anyway: it is now
 *     upgraded to https here);
 *   - the domain was typed with spaces or capitals ("Agibor. Co. Il");
 *   - the site answers only on www (or only without it), so /favicon.ico on the
 *     typed host never loaded.
 *
 * WHAT IS NEVER DONE. No third-party favicon service (it would tell that
 * service every domain the owner works on). No server-side fetch of an icon:
 * nothing here, in the scan or in any route, requests an icon URL, so a URL a
 * site or a request controls can never make our servers call anywhere. The
 * browser's request goes to the owner's own site or its platform's CDN, with no
 * referrer.
 *
 * WHAT IS ACCEPTED. Only https (an http URL on the site is upgraded), only on
 * the project's own site (the same host, its www twin, or a subdomain of it) or
 * on one of the named platform CDN hosts (exact names, never a pattern), only a
 * public-looking host name (no IP literal, no single label like `localhost`),
 * no credentials or port, and only a bounded length. A stored icon is checked
 * again on every read, never trusted because it was stored.
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
  // Typed domains carry stray spaces ("Agibor. Co. Il"); no host name has one.
  const raw = (domain ?? '').replace(/\s+/g, '')
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
 * The website platforms' own CDN hosts, where a site built on them keeps its
 * icon. Exact host names only: a site may point its icon here, and the owner's
 * browser then loads an image the site's own pages already load.
 */
export const PLATFORM_ICON_HOSTS: ReadonlySet<string> = new Set([
  'cdn.shopify.com',
  'static.wixstatic.com',
  'images.squarespace-cdn.com',
  'static1.squarespace.com',
  'cdn.prod.website-files.com',
  'uploads-ssl.webflow.com',
  'assets.website-files.com',
  'irp.cdn-website.com',
  'lirp.cdn-website.com',
  'img1.wsimg.com',
  'i0.wp.com',
  'i1.wp.com',
  'i2.wp.com',
  'i3.wp.com',
])

/**
 * An icon URL as the owner's browser may load it: https (an http URL is
 * upgraded, as the browser would), on the project's own site or its platform's
 * CDN, bounded. Anything else is null (and the caller falls back).
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
  if (u.protocol === 'http:' && !u.port) u.protocol = 'https:'
  if (u.protocol !== 'https:' || u.username || u.password || u.port) return null
  if (!publicHost(u.hostname)) return null
  if (!sameSite(u.hostname, host) && !PLATFORM_ICON_HOSTS.has(u.hostname)) return null
  const out = u.toString()
  return out.length > MAX_ICON_URL ? null : out
}

/** The same site on its other name: www.x.com for x.com, x.com for www.x.com. */
export function wwwTwin(host: string): string | null {
  if (host.startsWith('www.')) {
    const bareHost = host.slice(4)
    return publicHost(bareHost) ? bareHost : null
  }
  // Only a registrable-looking name gets a www twin (never www.shop.example.com).
  return host.split('.').length <= 3 ? `www.${host}` : null
}

/**
 * The URLs to try, in order: the site's declared icon (when safe), its
 * /favicon.ico, the same on its www twin, then its /apple-touch-icon.png.
 */
export function siteIconCandidates(domain: string | null | undefined, declared?: string | null): string[] {
  const host = siteHost(domain)
  if (!host) return []
  const out: string[] = []
  const add = (u: string | null) => { if (u && !out.includes(u)) out.push(u) }
  add(safeSiteIcon(declared, domain))
  add(`https://${host}/favicon.ico`)
  const twin = wwwTwin(host)
  if (twin) add(`https://${twin}/favicon.ico`)
  add(`https://${host}/apple-touch-icon.png`)
  return out
}
