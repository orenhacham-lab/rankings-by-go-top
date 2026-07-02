/**
 * WordPress REST API client (server-side only).
 *
 * Phase 1 scope: testConnection, getCategories, getTags, getAuthors.
 * Publishing is intentionally NOT implemented yet.
 *
 * Security:
 *   - https URLs only, standard port only.
 *   - SSRF guard: rejects localhost / IP literals / hostnames that resolve to
 *     private, loopback, or link-local addresses.
 *   - Every request has an AbortController timeout.
 *   - Credentials are used transiently for the Basic auth header and never
 *     logged or included in error messages.
 */

import { promises as dns } from 'dns'
import type {
  WordPressCredentials,
  WordPressUser,
  WordPressCategory,
  WordPressTag,
  WordPressTestResult,
} from './types'

const REQUEST_TIMEOUT_MS = 15_000

export class WordPressClientError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'WordPressClientError'
  }
}

/** True for IPv4/IPv6 addresses that must never be fetched (SSRF guard). */
function isPrivateAddress(address: string): boolean {
  const ip = address.toLowerCase()

  // IPv6 (including IPv4-mapped ::ffff:a.b.c.d)
  if (ip.includes(':')) {
    if (ip === '::' || ip === '::1') return true
    if (ip.startsWith('fe80:') || ip.startsWith('fc') || ip.startsWith('fd')) return true
    const mapped = ip.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/)
    if (mapped) return isPrivateAddress(mapped[1])
    return false
  }

  // IPv4
  const octets = ip.split('.').map(Number)
  if (octets.length !== 4 || octets.some((o) => Number.isNaN(o))) return true
  const [a, b] = octets
  if (a === 0 || a === 10 || a === 127) return true
  if (a === 169 && b === 254) return true
  if (a === 172 && b >= 16 && b <= 31) return true
  if (a === 192 && b === 168) return true
  if (a >= 224) return true // multicast + reserved
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

  const hostname = url.hostname.toLowerCase().replace(/^\[|\]$/g, '')
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
  try {
    const records = await dns.lookup(hostname, { all: true })
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

function buildAuthHeader(creds: WordPressCredentials): string {
  const token = Buffer.from(`${creds.username}:${creds.applicationPassword}`).toString('base64')
  return `Basic ${token}`
}

/**
 * Perform an authenticated GET against the WP REST API.
 * Returns parsed JSON; throws WordPressClientError with a clean message.
 */
async function wpGet<T>(creds: WordPressCredentials, path: string): Promise<T> {
  const origin = await assertSafeSiteUrl(creds.siteUrl)
  const url = `${origin}/wp-json/wp/v2${path}`

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
  let response: Response
  try {
    response = await fetch(url, {
      method: 'GET',
      headers: {
        Authorization: buildAuthHeader(creds),
        Accept: 'application/json',
      },
      signal: controller.signal,
      redirect: 'error', // a redirect could bounce the request to another host
    })
  } catch (err) {
    const aborted = err instanceof Error && err.name === 'AbortError'
    throw new WordPressClientError(
      aborted
        ? 'WordPress site did not respond in time.'
        : 'Could not reach the WordPress site. Check the URL.'
    )
  } finally {
    clearTimeout(timer)
  }

  if (response.status === 401 || response.status === 403) {
    throw new WordPressClientError(
      'Authentication failed. Check the username and Application Password.'
    )
  }
  if (response.status === 404) {
    throw new WordPressClientError(
      'WordPress REST API not found at this URL. Is this a WordPress site?'
    )
  }
  if (!response.ok) {
    throw new WordPressClientError(`WordPress returned an error (HTTP ${response.status}).`)
  }

  try {
    return (await response.json()) as T
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
