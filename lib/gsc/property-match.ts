/**
 * Stage E1 — pure, dependency-free Search Console property ↔ project-URL matching.
 *
 * Two property kinds:
 *   - Domain:      'sc-domain:example.com'      → covers example.com + all subdomains,
 *                  any protocol/path (compare normalized hostnames only).
 *   - URL-prefix:  'https://www.example.com/p/' → the project URL must be INSIDE the
 *                  exact prefix (protocol + host[:port] + path); HTTP≠HTTPS; unrelated
 *                  subdomains are not equivalent.
 */

export type GscPropertyKind = 'domain' | 'url_prefix'

export function propertyKind(siteUrl: string): GscPropertyKind {
  return siteUrl.trim().toLowerCase().startsWith('sc-domain:') ? 'domain' : 'url_prefix'
}

/** The bare domain of a Domain property, normalized (lowercased, trailing dot stripped). */
export function domainOfProperty(siteUrl: string): string | null {
  const s = siteUrl.trim()
  if (!s.toLowerCase().startsWith('sc-domain:')) return null
  const d = s.slice('sc-domain:'.length).trim().toLowerCase().replace(/\.$/, '')
  return d || null
}

/** Hostname of a URL or bare domain (protocol-agnostic). Null if unparseable. */
export function hostnameOf(input: string): string | null {
  const raw = (input || '').trim().toLowerCase()
  if (!raw) return null
  const withScheme = /:\/\//.test(raw) ? raw : `https://${raw}`
  try { return new URL(withScheme).hostname.replace(/\.$/, '') || null } catch { return null }
}

/** Parse a FULL url (scheme required) into normalized comparison parts. Null otherwise. */
function parseFullUrl(input: string): { protocol: string; host: string; pathname: string } | null {
  const raw = (input || '').trim().toLowerCase()
  if (!/^[a-z][a-z0-9+.-]*:\/\//.test(raw)) return null // scheme required for url-prefix comparison
  try {
    const u = new URL(raw)
    // u.host already strips default ports (443/80) and keeps non-default ones.
    return { protocol: u.protocol, host: u.host.replace(/\.(?=:|$)/, ''), pathname: u.pathname || '/' }
  } catch { return null }
}

/** A Domain property covers a project URL iff the hostname equals or is a subdomain of it. */
function domainCovers(domain: string, projectUrl: string): boolean {
  const h = hostnameOf(projectUrl)
  const d = domain.toLowerCase().replace(/\.$/, '')
  if (!h || !d) return false
  return h === d || h.endsWith(`.${d}`)
}

/**
 * A stored project target_domain is often scheme-less (e.g. 'www.gotop.co.il'). For
 * URL-prefix comparison we assume https:// — the default for a Search Console URL-prefix
 * property — but ONLY when the value has no explicit scheme. An explicit scheme is left
 * untouched, so 'http://…' stays http and will not match an https:// property.
 */
function assumeHttpsIfSchemeless(input: string): string {
  const raw = (input || '').trim()
  return /^[a-z][a-z0-9+.-]*:\/\//i.test(raw) ? raw : `https://${raw}`
}

/** A URL-prefix property covers a project URL iff same protocol+host and the project
 *  path is inside the (trailing-slash-normalized) prefix path. A scheme-less project value
 *  is normalized to https:// first (see assumeHttpsIfSchemeless). */
function urlPrefixCovers(prefix: string, projectUrl: string): boolean {
  const pp = parseFullUrl(prefix)
  const pj = parseFullUrl(assumeHttpsIfSchemeless(projectUrl))
  if (!pp || !pj) return false
  if (pp.protocol !== pj.protocol) return false // HTTP and HTTPS are NOT interchangeable
  if (pp.host !== pj.host) return false // exact host[:port]; unrelated subdomains differ
  const prefixPath = pp.pathname.endsWith('/') ? pp.pathname : `${pp.pathname}/`
  const projPath = pj.pathname.endsWith('/') ? pj.pathname : `${pj.pathname}/`
  return projPath.startsWith(prefixPath)
}

/** Does this Search Console property cover the given project URL? (pure) */
export function propertyCoversProjectUrl(siteUrl: string, projectUrl: string | null | undefined): boolean {
  if (!siteUrl || !projectUrl) return false
  return propertyKind(siteUrl) === 'domain'
    ? domainCovers(domainOfProperty(siteUrl) ?? '', projectUrl)
    : urlPrefixCovers(siteUrl, projectUrl)
}

/** A property is UNVERIFIED (cannot be assigned) when permissionLevel is siteUnverifiedUser. */
export function isUnverifiedPermission(permissionLevel: string | null | undefined): boolean {
  return (permissionLevel || '').trim() === 'siteUnverifiedUser'
}

export interface GscPropertyView { siteUrl: string; permissionLevel: string; kind: GscPropertyKind; covers: boolean; assignable: boolean }

/** Build the selection view: annotate kind/covers/assignable and sort covering-first. */
export function buildPropertyViews(
  properties: { siteUrl: string; permissionLevel: string }[],
  projectUrl: string | null | undefined,
): GscPropertyView[] {
  const views = properties.map((p): GscPropertyView => {
    const covers = propertyCoversProjectUrl(p.siteUrl, projectUrl)
    return { siteUrl: p.siteUrl, permissionLevel: p.permissionLevel, kind: propertyKind(p.siteUrl), covers, assignable: covers && !isUnverifiedPermission(p.permissionLevel) }
  })
  // Covering properties first; then verified before unverified; then stable by siteUrl.
  return views.sort((a, b) =>
    (a.covers === b.covers ? 0 : a.covers ? -1 : 1)
    || (isUnverifiedPermission(a.permissionLevel) === isUnverifiedPermission(b.permissionLevel) ? 0 : isUnverifiedPermission(a.permissionLevel) ? 1 : -1)
    || (a.siteUrl < b.siteUrl ? -1 : a.siteUrl > b.siteUrl ? 1 : 0))
}
