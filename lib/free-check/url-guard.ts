/**
 * URL admission control for the PUBLIC free site check.
 *
 * This is the app's first route that fetches an arbitrary, attacker-chosen URL
 * with NO authentication in front of it (proxy.ts's matcher excludes `/api/*`,
 * so nothing else is guarding it either). That makes it an SSRF primitive
 * unless every request is admitted by this module first, so the rules here are
 * deliberately allow-list shaped: a URL is rejected unless it is plainly a
 * public web page.
 *
 * Two layers, both required:
 *   1. `normalizeCheckUrl` — syntax. Scheme, credentials, port, host shape.
 *      Runs before any network call, so a hostile input costs us nothing.
 *   2. `assertPublicHost` — resolution. Every A/AAAA record the hostname
 *      resolves to must be a public unicast address, so `evil.com` pointing at
 *      169.254.169.254 or 10.0.0.5 is refused even though its syntax is clean.
 *
 * Residual risk, stated honestly: between our resolution check and the fetch's
 * own resolution there is a DNS-rebinding window we cannot close without
 * pinning the socket to a validated address. What closes the blast radius
 * instead is that the fetcher (site-fetch.ts) never forwards credentials,
 * never follows a redirect without re-admitting it through BOTH layers, and
 * caps body size and time — so a won race yields one unauthenticated GET whose
 * body is parsed as HTML and never echoed verbatim to the caller.
 */
import { lookup } from 'dns/promises'

export type UrlRejection =
  | 'empty'
  | 'unparseable'
  | 'scheme'
  | 'credentials'
  | 'port'
  | 'host_shape'
  | 'host_reserved'
  | 'too_long'

export type UrlAdmission =
  | { ok: true; url: URL }
  | { ok: false; reason: UrlRejection }

const MAX_INPUT_LENGTH = 300

/** Hostnames that never denote a customer's public website. */
const BLOCKED_HOSTS = new Set([
  'localhost',
  'localhost.localdomain',
  'metadata',
  'metadata.google.internal',
  'instance-data',
])

/** Suffixes reserved for private/loopback/mDNS name spaces (RFC 6761, RFC 8375). */
const BLOCKED_SUFFIXES = ['.localhost', '.local', '.internal', '.home.arpa', '.onion', '.test', '.invalid', '.example']

/** True for a bare IPv4 literal such as `10.0.0.1`. */
function isIpv4Literal(host: string): boolean {
  return /^\d{1,3}(\.\d{1,3}){3}$/.test(host)
}

/**
 * True for anything that is an IP literal rather than a name — including the
 * decimal (`2130706433`), octal (`0177.0.0.1`) and hex (`0x7f000001`) spellings
 * of 127.0.0.1, which `new URL()` happily accepts and which a naive dotted-quad
 * regex misses.
 */
function isIpLiteral(host: string): boolean {
  if (isIpv4Literal(host)) return true
  if (host.startsWith('[')) return true // bracketed IPv6
  if (host.includes(':')) return true
  if (/^\d+$/.test(host)) return true // decimal integer form
  if (/^0x[0-9a-f]+$/i.test(host)) return true // hex form
  // Dotted forms whose every label is numeric in any base (octal/hex/short).
  if (/^[0-9a-fx.]+$/i.test(host) && host.split('.').every((l) => l !== '' && /^(0x[0-9a-f]+|\d+)$/i.test(l))) return true
  return false
}

/**
 * Parse and admit a user-supplied site address. `example.com` and
 * `example.com/path` are accepted (scheme assumed https) because that is how
 * merchants type a domain; everything else must be explicit.
 */
export function normalizeCheckUrl(raw: string): UrlAdmission {
  const input = (raw ?? '').trim()
  if (!input) return { ok: false, reason: 'empty' }
  if (input.length > MAX_INPUT_LENGTH) return { ok: false, reason: 'too_long' }

  const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(input) ? input : `https://${input}`

  let url: URL
  try {
    url = new URL(withScheme)
  } catch {
    return { ok: false, reason: 'unparseable' }
  }

  if (url.protocol !== 'https:' && url.protocol !== 'http:') return { ok: false, reason: 'scheme' }
  if (url.username || url.password) return { ok: false, reason: 'credentials' }
  // Any explicit port is refused rather than allow-listed at 80/443: a public
  // website is served on the default port, and a port is how internal services
  // are usually reached.
  if (url.port) return { ok: false, reason: 'port' }

  const host = url.hostname.toLowerCase().replace(/\.$/, '')
  if (!host) return { ok: false, reason: 'host_shape' }
  if (isIpLiteral(host)) return { ok: false, reason: 'host_reserved' }
  if (BLOCKED_HOSTS.has(host)) return { ok: false, reason: 'host_reserved' }
  if (BLOCKED_SUFFIXES.some((s) => host.endsWith(s))) return { ok: false, reason: 'host_reserved' }
  // A registrable domain: at least one dot, and a TLD of letters only.
  if (!/^[a-z0-9-]+(\.[a-z0-9-]+)*\.[a-z]{2,}$/.test(host)) return { ok: false, reason: 'host_shape' }

  url.hostname = host
  url.hash = ''
  return { ok: true, url }
}

/** True when an IPv4 address is outside the public unicast space. */
function isReservedIpv4(addr: string): boolean {
  const parts = addr.split('.').map((n) => Number(n))
  if (parts.length !== 4 || parts.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return true
  const [a, b] = parts
  if (a === 0) return true // "this network"
  if (a === 10) return true // private
  if (a === 127) return true // loopback
  if (a === 100 && b >= 64 && b <= 127) return true // CGNAT
  if (a === 169 && b === 254) return true // link-local, incl. cloud metadata
  if (a === 172 && b >= 16 && b <= 31) return true // private
  if (a === 192 && b === 0) return true // IETF protocol assignments
  if (a === 192 && b === 168) return true // private
  if (a === 198 && (b === 18 || b === 19)) return true // benchmarking
  if (a >= 224) return true // multicast + reserved + broadcast
  return false
}

/** True when an IPv6 address is outside the public unicast space. */
function isReservedIpv6(addr: string): boolean {
  const a = addr.toLowerCase().split('%')[0]
  if (a === '::' || a === '::1') return true // unspecified, loopback
  if (a.startsWith('fe8') || a.startsWith('fe9') || a.startsWith('fea') || a.startsWith('feb')) return true // link-local
  if (/^f[cd]/.test(a)) return true // unique-local
  if (a.startsWith('ff')) return true // multicast
  // IPv4-mapped / NAT64: judge the embedded IPv4.
  const mapped = a.match(/:((?:\d{1,3}\.){3}\d{1,3})$/)
  if (mapped) return isReservedIpv4(mapped[1])
  if (a.startsWith('2002:')) return true // 6to4
  if (a.startsWith('2001:0:') || a.startsWith('2001::')) return true // Teredo
  return false
}

export type HostAdmission = { ok: true; addresses: string[] } | { ok: false; reason: 'dns' | 'host_reserved' }

/**
 * Resolve a hostname and admit it only when EVERY answer is a public unicast
 * address. All-or-nothing on purpose: a name that resolves to one public and
 * one private address is an SSRF attempt, not a misconfiguration we should be
 * generous about.
 */
export async function assertPublicHost(
  hostname: string,
  resolver: (h: string) => Promise<{ address: string; family: number }[]> = (h) => lookup(h, { all: true }),
): Promise<HostAdmission> {
  let answers: { address: string; family: number }[]
  try {
    answers = await resolver(hostname)
  } catch {
    return { ok: false, reason: 'dns' }
  }
  if (!answers.length) return { ok: false, reason: 'dns' }
  for (const { address, family } of answers) {
    const reserved = family === 6 || address.includes(':') ? isReservedIpv6(address) : isReservedIpv4(address)
    if (reserved) return { ok: false, reason: 'host_reserved' }
  }
  return { ok: true, addresses: answers.map((a) => a.address) }
}

/** The registrable-ish domain used as the cache and rate-limit key. */
export function domainKey(url: URL): string {
  return url.hostname.replace(/^www\./, '')
}
