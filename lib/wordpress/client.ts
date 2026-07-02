/**
 * WordPress REST API client (server-side only).
 *
 * Phase 1 scope: testConnection, getCategories, getTags, getAuthors.
 * Publishing is intentionally NOT implemented yet.
 *
 * Security:
 *   - https URLs only, standard port only, no embedded credentials.
 *   - SSRF guard: rejects localhost / IP literals / internal hostnames and any
 *     hostname resolving to a private, loopback, link-local, CGNAT or other
 *     special-use address — enforced BOTH before the request and again at
 *     socket connect time (secureLookup) to close the DNS-rebinding TOCTOU gap.
 *   - Redirects are rejected (a 3xx could bounce to an internal host).
 *   - Every request has a hard timeout and a response-size cap.
 *   - Credentials are used transiently for the Basic auth header and never
 *     logged or included in error messages.
 */

import dns from 'dns'
import https from 'https'
import type { LookupAddress } from 'dns'
import type { IncomingMessage } from 'http'
import type {
  WordPressCredentials,
  WordPressUser,
  WordPressCategory,
  WordPressTag,
  WordPressTestResult,
} from './types'

const REQUEST_TIMEOUT_MS = 15_000
const MAX_RESPONSE_BYTES = 2_000_000

export class WordPressClientError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'WordPressClientError'
  }
}

/**
 * True for IPv4/IPv6 addresses that must never be fetched (SSRF guard).
 * Covers all IANA special-use / non-public ranges relevant to SSRF.
 */
function isPrivateAddress(address: string): boolean {
  const ip = address.toLowerCase().trim()

  // IPv6 (including IPv4-mapped ::ffff:a.b.c.d)
  if (ip.includes(':')) {
    if (ip === '::' || ip === '::1') return true // unspecified + loopback
    if (ip.startsWith('fe80') || ip.startsWith('fc') || ip.startsWith('fd')) return true // link-local + ULA
    if (ip.startsWith('ff')) return true // multicast
    if (ip.startsWith('2001:db8')) return true // documentation
    if (ip.startsWith('64:ff9b')) return true // NAT64 — can embed IPv4 targets
    const mapped = ip.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/)
    if (mapped) return isPrivateAddress(mapped[1])
    if (ip.startsWith('::ffff:')) return true // any other IPv4-mapped form — reject to be safe
    return false
  }

  // IPv4
  const octets = ip.split('.').map(Number)
  if (octets.length !== 4 || octets.some((o) => Number.isNaN(o) || o < 0 || o > 255)) return true
  const [a, b, c] = octets
  if (a === 0 || a === 10 || a === 127) return true // "this" network, private, loopback
  if (a === 169 && b === 254) return true // link-local
  if (a === 172 && b >= 16 && b <= 31) return true // private
  if (a === 192 && b === 168) return true // private
  if (a === 100 && b >= 64 && b <= 127) return true // CGNAT (100.64.0.0/10)
  if (a === 192 && b === 0 && (c === 0 || c === 2)) return true // IETF protocol assignments + TEST-NET-1
  if (a === 192 && b === 88 && c === 99) return true // deprecated 6to4 relay anycast
  if (a === 198 && (b === 18 || b === 19)) return true // benchmarking (198.18.0.0/15)
  if (a === 198 && b === 51 && c === 100) return true // TEST-NET-2
  if (a === 203 && b === 0 && c === 113) return true // TEST-NET-3
  if (a >= 224) return true // multicast + reserved + broadcast
  return false
}

function isIpLiteral(hostname: string): boolean {
  return /^\d+\.\d+\.\d+\.\d+$/.test(hostname) || hostname.includes(':')
}

/**
 * Validate a WordPress site URL and return its normalized origin.
 * Throws WordPressClientError with a clear, credential-free message.
 */
export async function assertSafeSiteUrl(siteUrl: string): Promise<string> {
  let url: URL
  try {
    url = new URL(siteUrl.trim())
  } catch {
    throw new WordPressClientError('Invalid site URL.')
  }

  if (url.protocol !== 'https:') {
    throw new WordPressClientError('Site URL must use https://')
  }
  if (url.port && url.port !== '443') {
    throw new WordPressClientError('Custom ports are not allowed.')
  }
  if (url.username || url.password) {
    throw new WordPressClientError('Site URL must not contain credentials.')
  }

  // Strip enclosing brackets (IPv6) and a single trailing dot (FQDN root) so
  // "foo.internal." cannot evade the string checks below.
  const hostname = url.hostname.toLowerCase().replace(/^\[|\]$/g, '').replace(/\.$/, '')
  if (
    hostname === 'localhost' ||
    hostname.endsWith('.localhost') ||
    hostname.endsWith('.local') ||
    hostname.endsWith('.internal') ||
    !hostname.includes('.')
  ) {
    throw new WordPressClientError('Local or internal hostnames are not allowed.')
  }
  if (isIpLiteral(hostname)) {
    throw new WordPressClientError('IP addresses are not allowed — use the site domain.')
  }

  // Resolve and verify no private/loopback address hides behind the DNS name.
  // NOTE: this is defense-in-depth for fast rejection; the authoritative guard
  // runs again at socket connect time (see secureLookup) to close the
  // DNS-rebinding TOCTOU window between this check and the actual connection.
  try {
    const records = await dns.promises.lookup(hostname, { all: true })
    if (records.length === 0) {
      throw new WordPressClientError('Site hostname could not be resolved.')
    }
    for (const record of records) {
      if (isPrivateAddress(record.address)) {
        throw new WordPressClientError('Site hostname resolves to a private network address.')
      }
    }
  } catch (err) {
    if (err instanceof WordPressClientError) throw err
    throw new WordPressClientError('Site hostname could not be resolved.')
  }

  return url.origin
}

/**
 * DNS lookup wrapper for the connect phase: re-validates the resolved address
 * at the moment the socket connects, so a rebinding attack that flips DNS to a
 * private IP after assertSafeSiteUrl passed still cannot connect. This is the
 * authoritative SSRF check — it runs on the exact IP the socket will use.
 */
function secureLookup(
  hostname: string,
  options: dns.LookupOneOptions | dns.LookupAllOptions,
  callback: (err: NodeJS.ErrnoException | null, address: string | LookupAddress[], family?: number) => void
): void {
  dns.lookup(hostname, { ...(options as object), all: true }, (err, addresses) => {
    if (err) return callback(err, '', 0)
    const list = (Array.isArray(addresses) ? addresses : [addresses]) as LookupAddress[]
    for (const a of list) {
      if (isPrivateAddress(a.address)) {
        return callback(
          new WordPressClientError('Site hostname resolves to a private network address.') as NodeJS.ErrnoException,
          '',
          0
        )
      }
    }
    if ((options as dns.LookupAllOptions).all) {
      callback(null, list)
    } else {
      callback(null, list[0].address, list[0].family)
    }
  })
}

function buildAuthHeader(creds: WordPressCredentials): string {
  const token = Buffer.from(`${creds.username}:${creds.applicationPassword}`).toString('base64')
  return `Basic ${token}`
}

/**
 * Low-level HTTPS GET with the SSRF connect-time guard, redirect rejection,
 * a hard timeout, and a response-size cap. Returns { status, body }.
 */
function httpsGet(target: URL, authHeader: string): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    const req = https.request(
      {
        protocol: 'https:',
        hostname: target.hostname,
        port: 443,
        path: `${target.pathname}${target.search}`,
        method: 'GET',
        headers: {
          Authorization: authHeader,
          Accept: 'application/json',
          'User-Agent': 'RankingsByGoTop-Content/1.0',
        },
        timeout: REQUEST_TIMEOUT_MS,
        // Authoritative SSRF guard: validate the IP at connect time.
        lookup: secureLookup as unknown as undefined,
        // Keep TLS SNI/cert validation bound to the real hostname.
        servername: target.hostname,
      },
      (res: IncomingMessage) => {
        const status = res.statusCode ?? 0

        // Reject redirects outright — a 3xx could bounce us to an internal host.
        if (status >= 300 && status < 400) {
          res.destroy()
          reject(new WordPressClientError('Unexpected redirect from the site.'))
          return
        }

        const chunks: Buffer[] = []
        let size = 0
        res.on('data', (chunk: Buffer) => {
          size += chunk.length
          if (size > MAX_RESPONSE_BYTES) {
            req.destroy()
            reject(new WordPressClientError('WordPress response was too large.'))
            return
          }
          chunks.push(chunk)
        })
        res.on('end', () => resolve({ status, body: Buffer.concat(chunks).toString('utf8') }))
      }
    )

    req.on('timeout', () => {
      req.destroy(new WordPressClientError('WordPress site did not respond in time.'))
    })
    req.on('error', (err: Error) => {
      if (err instanceof WordPressClientError) return reject(err)
      reject(new WordPressClientError('Could not reach the WordPress site. Check the URL.'))
    })
    req.end()
  })
}

/**
 * Perform an authenticated GET against the WP REST API.
 * Returns parsed JSON; throws WordPressClientError with a clean message.
 */
async function wpGet<T>(creds: WordPressCredentials, path: string): Promise<T> {
  const origin = await assertSafeSiteUrl(creds.siteUrl)
  const target = new URL(`${origin}/wp-json/wp/v2${path}`)

  const { status, body } = await httpsGet(target, buildAuthHeader(creds))

  if (status === 401 || status === 403) {
    throw new WordPressClientError(
      'Authentication failed. Check the username and Application Password.'
    )
  }
  if (status === 404) {
    throw new WordPressClientError(
      'WordPress REST API not found at this URL. Is this a WordPress site?'
    )
  }
  if (status < 200 || status >= 300) {
    throw new WordPressClientError(`WordPress returned an error (HTTP ${status}).`)
  }

  try {
    return JSON.parse(body) as T
  } catch {
    throw new WordPressClientError('WordPress returned an invalid response.')
  }
}

/**
 * Verify the credentials by fetching the authenticated user.
 * Never throws — returns a normalized result for the API route to relay.
 */
export async function testConnection(creds: WordPressCredentials): Promise<WordPressTestResult> {
  try {
    const me = await wpGet<{ id: number; name: string; slug: string }>(creds, '/users/me')
    if (!me || typeof me.id !== 'number') {
      return { ok: false, error: 'Unexpected response from WordPress.' }
    }
    return { ok: true, user: { id: me.id, name: me.name, slug: me.slug } }
  } catch (err) {
    const message = err instanceof WordPressClientError ? err.message : 'Connection failed.'
    return { ok: false, error: message }
  }
}

export async function getCategories(creds: WordPressCredentials): Promise<WordPressCategory[]> {
  const rows = await wpGet<any[]>(creds, '/categories?per_page=100&orderby=name&order=asc')
  return (Array.isArray(rows) ? rows : []).map((c) => ({
    id: c.id,
    name: c.name,
    slug: c.slug,
    parent: c.parent ?? 0,
    count: c.count ?? 0,
  }))
}

export async function getTags(creds: WordPressCredentials): Promise<WordPressTag[]> {
  const rows = await wpGet<any[]>(creds, '/tags?per_page=100&orderby=name&order=asc')
  return (Array.isArray(rows) ? rows : []).map((t) => ({
    id: t.id,
    name: t.name,
    slug: t.slug,
    count: t.count ?? 0,
  }))
}

export async function getAuthors(creds: WordPressCredentials): Promise<WordPressUser[]> {
  // Users the site exposes as content authors.
  const rows = await wpGet<any[]>(creds, '/users?per_page=100&orderby=name&order=asc')
  return (Array.isArray(rows) ? rows : []).map((u) => ({
    id: u.id,
    name: u.name,
    slug: u.slug,
  }))
}
