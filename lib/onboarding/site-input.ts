/**
 * The one field of a new project: the site's address, as the merchant types it.
 *
 * The browser checks the address before anything is created, with the same
 * syntax rules the scan admits a URL by (lib/free-check/url-guard.ts
 * normalizeCheckUrl): http or https, no credentials, no port, a public host
 * name with a real top-level domain. That module also resolves DNS, so it cannot
 * load in a browser; this is its syntax half, and lib/onboarding/__qa__ holds
 * the two to the same verdicts. The server still admits the address itself
 * before it fetches anything.
 *
 * The project keeps the host name only (`www.example.co.il`), the form the
 * existing projects use ("domain only, without https://"), and is named after
 * the site without its `www.`.
 */

export type SiteInput =
  | { ok: true; domain: string; name: string }
  | { ok: false; reason: 'empty' | 'invalid' }

const MAX_INPUT_LENGTH = 300

const BLOCKED_HOSTS = new Set(['localhost', 'localhost.localdomain', 'metadata', 'metadata.google.internal', 'instance-data'])
const BLOCKED_SUFFIXES = ['.localhost', '.local', '.internal', '.home.arpa', '.onion', '.test', '.invalid', '.example']

/** An IP literal in any spelling the URL parser accepts (dotted, integer, hex, octal, IPv6). */
function isIpLiteral(host: string): boolean {
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host)) return true
  if (host.startsWith('[') || host.includes(':')) return true
  if (/^\d+$/.test(host) || /^0x[0-9a-f]+$/i.test(host)) return true
  return /^[0-9a-fx.]+$/i.test(host) && host.split('.').every((l) => l !== '' && /^(0x[0-9a-f]+|\d+)$/i.test(l))
}

export function readSiteInput(raw: string): SiteInput {
  const input = (raw ?? '').trim()
  if (!input) return { ok: false, reason: 'empty' }
  const invalid: SiteInput = { ok: false, reason: 'invalid' }
  if (input.length > MAX_INPUT_LENGTH) return invalid

  const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(input) ? input : `https://${input}`
  let url: URL
  try {
    url = new URL(withScheme)
  } catch {
    return invalid
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return invalid
  if (url.username || url.password || url.port) return invalid

  const host = url.hostname.toLowerCase().replace(/\.$/, '')
  if (!host || isIpLiteral(host) || BLOCKED_HOSTS.has(host)) return invalid
  if (BLOCKED_SUFFIXES.some((s) => host.endsWith(s))) return invalid
  if (!/^[a-z0-9-]+(\.[a-z0-9-]+)*\.[a-z]{2,}$/.test(host)) return invalid
  return { ok: true, domain: host, name: host.replace(/^www\./, '') }
}
