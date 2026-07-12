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
  WordPressContentItem,
  WordPressListOptions,
  SeoKeywordSource,
} from './types'
import { seoPluginFromNamespaces, seoMetaKeys, verifySeoMeta, type SeoPlugin, type SeoMetaStatus } from '@/lib/content/wordpress-taxonomy'

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
function httpsGet(target: URL, authHeader?: string): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    const req = https.request(
      {
        protocol: 'https:',
        hostname: target.hostname,
        port: 443,
        path: `${target.pathname}${target.search}`,
        method: 'GET',
        headers: {
          // Phase 3I.1 — the Authorization header is OPTIONAL: public endpoints
          // (WooCommerce Store API) are fetched WITHOUT auth first, because some
          // security setups reject Basic auth on public namespaces.
          ...(authHeader ? { Authorization: authHeader } : {}),
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
 * Low-level authenticated HTTPS POST with the same SSRF connect-time guard,
 * redirect rejection, timeout and response-size cap as httpsGet. Body is a
 * Buffer (JSON or raw binary); extra headers set Content-Type / Content-
 * Disposition. Returns { status, body }.
 */
function httpsSend(
  target: URL,
  authHeader: string,
  body: Buffer,
  extraHeaders: Record<string, string>
): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    const req = https.request(
      {
        protocol: 'https:',
        hostname: target.hostname,
        port: 443,
        path: `${target.pathname}${target.search}`,
        method: 'POST',
        headers: {
          Authorization: authHeader,
          Accept: 'application/json',
          'User-Agent': 'RankingsByGoTop-Content/1.0',
          'Content-Length': String(body.length),
          ...extraHeaders,
        },
        timeout: REQUEST_TIMEOUT_MS,
        lookup: secureLookup as unknown as undefined,
        servername: target.hostname,
      },
      (res: IncomingMessage) => {
        const status = res.statusCode ?? 0
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
    req.on('timeout', () => { req.destroy(new WordPressClientError('WordPress site did not respond in time.')) })
    req.on('error', (err: Error) => {
      if (err instanceof WordPressClientError) return reject(err)
      reject(new WordPressClientError('Could not reach the WordPress site. Check the URL.'))
    })
    req.write(body)
    req.end()
  })
}

function assertOkStatus(status: number): void {
  if (status === 401 || status === 403) throw new WordPressClientError('Authentication failed. Check the username and Application Password.')
  if (status === 404) throw new WordPressClientError('WordPress REST API not found at this URL. Is this a WordPress site?')
  if (status < 200 || status >= 300) throw new WordPressClientError(`WordPress returned an error (HTTP ${status}).`)
}

/** Authenticated JSON POST to the WP REST API. */
async function wpPostJson<T>(creds: WordPressCredentials, path: string, payload: Record<string, unknown>): Promise<T> {
  const origin = await assertSafeSiteUrl(creds.siteUrl)
  const target = new URL(`${origin}/wp-json/wp/v2${path}`)
  const body = Buffer.from(JSON.stringify(payload), 'utf8')
  const { status, body: text } = await httpsSend(target, buildAuthHeader(creds), body, { 'Content-Type': 'application/json' })
  assertOkStatus(status)
  try {
    return JSON.parse(text) as T
  } catch {
    throw new WordPressClientError('WordPress returned an invalid response.')
  }
}

/**
 * Upload an image to the WordPress Media Library and set its alt text/title.
 * Returns the media id + public source URL. Credentials are never logged.
 */
export async function uploadMedia(
  creds: WordPressCredentials,
  file: { data: Buffer; filename: string; mimeType: string; altText: string; title: string }
): Promise<{ id: number; sourceUrl: string }> {
  const origin = await assertSafeSiteUrl(creds.siteUrl)
  if (!/^image\//.test(file.mimeType)) throw new WordPressClientError('Only image uploads are allowed.')
  const safeName = file.filename.replace(/[^a-zA-Z0-9._-]/g, '-').replace(/-+/g, '-').slice(0, 100) || 'featured.png'

  const target = new URL(`${origin}/wp-json/wp/v2/media`)
  const { status, body } = await httpsSend(target, buildAuthHeader(creds), file.data, {
    'Content-Type': file.mimeType,
    'Content-Disposition': `attachment; filename="${safeName}"`,
  })
  assertOkStatus(status)
  let media: { id?: number; source_url?: string }
  try {
    media = JSON.parse(body)
  } catch {
    throw new WordPressClientError('WordPress returned an invalid media response.')
  }
  if (!media || typeof media.id !== 'number') throw new WordPressClientError('WordPress did not return a media id.')

  // Best-effort: set alt text + title (never fatal).
  try {
    await wpPostJson(creds, `/media/${media.id}`, { alt_text: file.altText, title: file.title })
  } catch {
    /* alt text is a nice-to-have; ignore failures */
  }
  return { id: media.id, sourceUrl: media.source_url || '' }
}

export type WordPressPostStatus = 'draft' | 'publish'

/**
 * Create a post with an EXPLICIT status ('draft' or 'publish'). The caller
 * decides the status — this function never defaults to publish. Returns the new
 * post id + link + the status WordPress reports.
 */
export interface WordPressPostFields {
  title: string
  content: string
  status: WordPressPostStatus
  slug?: string
  excerpt?: string
  featuredMedia?: number
  /** Phase 4E — WP category term IDs (WordPress SETS, never appends). */
  categories?: number[]
  /** Phase 4E — WP tag term IDs. */
  tags?: number[]
}

function buildPostPayload(post: WordPressPostFields): Record<string, unknown> {
  const status: WordPressPostStatus = post.status === 'publish' ? 'publish' : 'draft'
  const payload: Record<string, unknown> = { title: post.title, content: post.content, status }
  if (post.slug) payload.slug = post.slug
  if (post.excerpt) payload.excerpt = post.excerpt
  if (typeof post.featuredMedia === 'number') payload.featured_media = post.featuredMedia
  // Send taxonomy ONLY when provided. WordPress replaces (sets) the post's terms
  // with these IDs, so repeated export/update never duplicates categories/tags.
  if (Array.isArray(post.categories)) payload.categories = post.categories
  if (Array.isArray(post.tags)) payload.tags = post.tags
  return payload
}

export async function createPost(
  creds: WordPressCredentials,
  post: WordPressPostFields,
): Promise<{ id: number; link: string; status: string }> {
  const created = await wpPostJson<{ id?: number; link?: string; status?: string }>(creds, '/posts', buildPostPayload(post))
  if (!created || typeof created.id !== 'number') throw new WordPressClientError('WordPress did not return a post id.')
  return { id: created.id, link: created.link || '', status: created.status || (post.status === 'publish' ? 'publish' : 'draft') }
}

/**
 * Phase 4E — UPDATE an existing post in place (idempotent re-export). Same
 * payload shape as createPost; targets /posts/{id}. Used when the article already
 * has a wp_post_id so a re-export never creates a duplicate post, and taxonomy
 * (a SET operation) never duplicates terms.
 */
export async function updatePost(
  creds: WordPressCredentials,
  postId: number,
  post: WordPressPostFields,
): Promise<{ id: number; link: string; status: string }> {
  const updated = await wpPostJson<{ id?: number; link?: string; status?: string }>(creds, `/posts/${postId}`, buildPostPayload(post))
  if (!updated || typeof updated.id !== 'number') throw new WordPressClientError('WordPress did not return a post id.')
  return { id: updated.id, link: updated.link || '', status: updated.status || (post.status === 'publish' ? 'publish' : 'draft') }
}

/**
 * Phase 4E — detect the SEO plugin exposed by the site's REST API. Uses the
 * smallest reliable probe: the REST root's `namespaces` list (Yoast → yoast/v1,
 * Rank Math → rankmath/v1). Never throws — returns a clear state.
 */
export async function detectSeoPlugin(creds: WordPressCredentials): Promise<SeoPlugin> {
  try {
    const origin = await assertSafeSiteUrl(creds.siteUrl)
    const target = new URL(`${origin}/wp-json/?_fields=namespaces`)
    const { status, body } = await httpsGet(target, buildAuthHeader(creds))
    if (status === 401 || status === 403) return 'permission_error'
    if (status < 200 || status >= 300) return 'unknown'
    let parsed: { namespaces?: unknown }
    try { parsed = JSON.parse(body) } catch { return 'unknown' }
    return seoPluginFromNamespaces(parsed?.namespaces)
  } catch {
    return 'unknown'
  }
}

/**
 * Phase 4E — write the article's SEO meta to the DETECTED plugin ONLY (never
 * both key sets), then verify by reading the post meta back where the REST API
 * permits. Returns { plugin, status } — status is one of verified /
 * written_not_verifiable / plugin_unavailable / permission_error / exact_failure.
 * Never throws; SEO-meta failure is a warning, never a silent success and never
 * fatal to the post itself (the caller decides how to surface it).
 */
export async function writeVerifiedSeoMeta(
  creds: WordPressCredentials,
  postId: number,
  seo: { metaTitle?: string | null; metaDescription?: string | null; focusKeyword?: string | null },
  knownPlugin?: SeoPlugin,
): Promise<{ plugin: SeoPlugin; status: SeoMetaStatus; detail?: string }> {
  const plugin = knownPlugin && knownPlugin !== 'unknown' ? knownPlugin : await detectSeoPlugin(creds)
  if (plugin === 'permission_error') return { plugin, status: 'permission_error' }
  if (plugin === 'none' || plugin === 'unknown') return { plugin, status: 'plugin_unavailable' }

  const meta = seoMetaKeys(plugin, seo)
  if (Object.keys(meta).length === 0) return { plugin, status: 'plugin_unavailable' }

  try {
    await wpPostJson(creds, `/posts/${postId}`, { meta })
  } catch (err) {
    const msg = err instanceof WordPressClientError ? err.message : 'SEO meta write failed.'
    if (/authentication failed/i.test(msg)) return { plugin, status: 'permission_error', detail: msg }
    return { plugin, status: 'exact_failure', detail: msg }
  }

  // Verify by reading the meta back (protected meta is often not exposed → then
  // we honestly report written_not_verifiable rather than claiming success).
  let readback: Record<string, unknown> | null = null
  try {
    const obj = await wpGet<{ meta?: Record<string, unknown> }>(creds, `/posts/${postId}?_fields=meta`)
    readback = obj && typeof obj.meta === 'object' ? (obj.meta as Record<string, unknown>) : null
  } catch {
    readback = null
  }
  return { plugin, status: verifySeoMeta(meta, readback) }
}

/**
 * Back-compat best-effort SEO meta update (used by the headless automation
 * publisher). Now plugin-aware: writes ONLY the detected plugin's keys instead
 * of both sets. Still non-fatal — the caller wraps it and never fails on it.
 */
export async function updatePostSeoMeta(
  creds: WordPressCredentials,
  postId: number,
  seo: { metaTitle?: string | null; metaDescription?: string | null; focusKeyword?: string | null }
): Promise<void> {
  await writeVerifiedSeoMeta(creds, postId, seo)
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

/**
 * Read-only: fetch taxonomy TERMS (name + public URL + product count) for a REST
 * base — e.g. 'product_cat' (WooCommerce product categories) or 'categories'.
 * Ordered by product count desc so the most important hubs come first. Returns
 * [] gracefully when the taxonomy isn't exposed via REST (404) or on any error.
 */
export async function getTaxonomyTerms(creds: WordPressCredentials, base: string): Promise<{ name: string; link: string; count: number }[]> {
  try {
    const rows = await wpGet<any[]>(creds, `/${base}?per_page=100&orderby=count&order=desc`)
    return (Array.isArray(rows) ? rows : [])
      .map((r) => ({ name: String(r?.name ?? '').trim(), link: String(r?.link ?? '').trim(), count: typeof r?.count === 'number' ? r.count : 0 }))
      .filter((r) => r.name && r.link)
  } catch {
    return []
  }
}

/**
 * Phase 3I / 3I.1 — direct product/category ENTITY discovery, read-only,
 * metadata-only (name + permalink; never bodies). Tries, in order:
 *   1. WooCommerce Store API `/wc/store/v1` (public storefront JSON) WITHOUT
 *      auth, then WITH auth (some security setups reject Basic auth on public
 *      namespaces — and some lock ALL of wp-json behind auth).
 *   2. The legacy Store API namespace `/wc/store` (WooCommerce Blocks < 2021).
 *   3. Core REST `/wp/v2/product` (sites exposing the product CPT).
 * Captures the last HTTP status for diagnostics so a blocked/absent API is
 * VISIBLE in the scan notes instead of silently contributing zero targets.
 */
export interface StoreEntity { name: string; link: string }
export interface StoreDiscoveryResult {
  products: StoreEntity[]
  categories: StoreEntity[]
  source: 'store_api' | 'store_api_legacy' | 'rest_product' | 'none'
  lastHttpStatus: number | null
}

const toStoreEntity = (r: unknown): StoreEntity | null => {
  const o = r as { name?: unknown; permalink?: unknown } | null
  const name = String(o?.name ?? '').replace(/<[^>]+>/g, '').trim()
  const link = String(o?.permalink ?? '').trim()
  return name && link ? { name, link } : null
}

async function rawJsonArray(origin: string, path: string, authHeader?: string): Promise<{ rows: unknown[] | null; status: number }> {
  try {
    const { status, body } = await httpsGet(new URL(`${origin}${path}`), authHeader)
    if (status < 200 || status >= 300) return { rows: null, status }
    const rows = JSON.parse(body)
    return { rows: Array.isArray(rows) ? rows : null, status }
  } catch {
    return { rows: null, status: 0 }
  }
}

export async function discoverStoreEntities(creds: WordPressCredentials): Promise<StoreDiscoveryResult> {
  const origin = await assertSafeSiteUrl(creds.siteUrl).catch(() => null)
  if (!origin) return { products: [], categories: [], source: 'none', lastHttpStatus: null }
  const auth = buildAuthHeader(creds)
  let lastStatus: number | null = null

  // 1+2) Store API — resolve a WORKING (namespace, auth) variant on products
  // page 1, then reuse it for pagination + categories.
  const variants: { ns: string; source: 'store_api' | 'store_api_legacy'; authHeader?: string }[] = [
    { ns: '/wp-json/wc/store/v1', source: 'store_api' },
    { ns: '/wp-json/wc/store/v1', source: 'store_api', authHeader: auth },
    { ns: '/wp-json/wc/store', source: 'store_api_legacy' },
    { ns: '/wp-json/wc/store', source: 'store_api_legacy', authHeader: auth },
  ]
  for (const v of variants) {
    const first = await rawJsonArray(origin, `${v.ns}/products?per_page=100&page=1&orderby=popularity`, v.authHeader)
    if (first.status) lastStatus = first.status
    if (first.rows === null) continue
    const products = first.rows.map(toStoreEntity).filter((e): e is StoreEntity => !!e)
    if (products.length === 100) {
      const second = await rawJsonArray(origin, `${v.ns}/products?per_page=100&page=2&orderby=popularity`, v.authHeader)
      for (const r of second.rows ?? []) { const e = toStoreEntity(r); if (e) products.push(e) }
    }
    const cats = await rawJsonArray(origin, `${v.ns}/products/categories?per_page=100&orderby=count&order=desc`, v.authHeader)
    const categories = (cats.rows ?? []).map(toStoreEntity).filter((e): e is StoreEntity => !!e)
    return { products, categories, source: v.source, lastHttpStatus: first.status }
  }

  // 3) Core REST product CPT fallback (title.rendered + link).
  for (const authHeader of [undefined, auth]) {
    const res = await rawJsonArray(origin, `/wp-json/wp/v2/product?per_page=50&_fields=title,link`, authHeader)
    if (res.status) lastStatus = res.status
    if (res.rows === null) continue
    const products = res.rows
      .map((r) => {
        const o = r as { title?: { rendered?: unknown } | string; link?: unknown }
        const name = String(typeof o?.title === 'object' ? (o.title as { rendered?: unknown })?.rendered ?? '' : o?.title ?? '').replace(/<[^>]+>/g, '').trim()
        const link = String(o?.link ?? '').trim()
        return name && link ? { name, link } : null
      })
      .filter((e): e is StoreEntity => !!e)
    return { products, categories: [], source: 'rest_product', lastHttpStatus: res.status }
  }

  return { products: [], categories: [], source: 'none', lastHttpStatus: lastStatus }
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

/** Strip tags + collapse whitespace from a rendered field (title/excerpt). */
function stripRendered(v: unknown): string {
  const s = typeof v === 'string' ? v : (v && typeof v === 'object' && 'rendered' in (v as Record<string, unknown>) ? String((v as { rendered?: unknown }).rendered ?? '') : '')
  return s.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim()
}

/**
 * Probe the post `meta` object for an SEO-plugin focus keyword IF the site
 * happens to expose it via REST. Standard installs do NOT expose these
 * (protected meta), so this returns null far more often than not — by design.
 * Never assumes the fields exist; never requires a plugin.
 */
function extractFocusKeyword(meta: unknown): { keyword: string; source: SeoKeywordSource } | null {
  if (!meta || typeof meta !== 'object' || Array.isArray(meta)) return null
  const m = meta as Record<string, unknown>
  const pick = (v: unknown): string => {
    if (typeof v === 'string' && v.trim()) return v.trim()
    if (Array.isArray(v) && typeof v[0] === 'string' && v[0].trim()) return v[0].trim()
    return ''
  }
  const yoast = pick(m._yoast_wpseo_focuskw)
  if (yoast) return { keyword: yoast, source: 'yoast_focus_keyword' }
  const rankmath = pick(m.rank_math_focus_keyword)
  if (rankmath) return { keyword: rankmath.split(',')[0]!.trim(), source: 'rankmath_focus_keyword' }
  const aioseo = pick(m._aioseo_keywords ?? m.aioseo_keywords)
  if (aioseo) return { keyword: aioseo.split(',')[0]!.trim(), source: 'aioseo_focus_keyword' }
  return null
}

function mapContentItem(r: any): WordPressContentItem {
  const focus = extractFocusKeyword(r?.meta)
  return {
    id: Number(r?.id) || 0,
    type: String(r?.type ?? 'post'),
    link: String(r?.link ?? ''),
    slug: String(r?.slug ?? ''),
    title: stripRendered(r?.title),
    excerpt: stripRendered(r?.excerpt),
    contentHtml: typeof r?.content === 'string' ? r.content : String(r?.content?.rendered ?? ''),
    status: String(r?.status ?? ''),
    date: r?.date ?? null,
    modified: r?.modified ?? null,
    categories: Array.isArray(r?.categories) ? r.categories.map(Number).filter((n: number) => !Number.isNaN(n)) : [],
    tags: Array.isArray(r?.tags) ? r.tags.map(Number).filter((n: number) => !Number.isNaN(n)) : [],
    seoFocusKeyword: focus?.keyword ?? null,
    seoKeywordSource: focus?.source ?? null,
  }
}

/** Build a read-only, published-only content list path with safe bounds. */
function buildContentPath(base: '/posts' | '/pages', opts: WordPressListOptions): string {
  const perPage = Math.min(Math.max(opts.perPage ?? 20, 1), 50)
  const page = Math.max(opts.page ?? 1, 1)
  const params = new URLSearchParams({
    per_page: String(perPage),
    page: String(page),
    status: 'publish',
    orderby: 'modified',
    order: 'desc',
    // METADATA-FIRST: content.rendered is intentionally EXCLUDED here — on large
    // Elementor/WooCommerce sites a single list page with content can exceed the
    // response-size cap and return nothing. Content is fetched per-item later.
    // `meta` is requested so we can OPPORTUNISTICALLY read an SEO focus keyword.
    _fields: 'id,type,link,slug,status,date,modified,categories,tags,title,excerpt,meta',
  })
  if (opts.modifiedAfter) params.set('modified_after', opts.modifiedAfter)
  return `${base}?${params.toString()}`
}

/**
 * Read-only: fetch ONE page of published posts. Never writes. Reuses the same
 * SSRF-guarded, timeout- and size-capped GET path as every other read call.
 */
export async function getPosts(creds: WordPressCredentials, opts: WordPressListOptions = {}): Promise<WordPressContentItem[]> {
  const rows = await wpGet<any[]>(creds, buildContentPath('/posts', opts))
  return (Array.isArray(rows) ? rows : []).map(mapContentItem)
}

/** Read-only: fetch ONE page of published pages. */
export async function getPages(creds: WordPressCredentials, opts: WordPressListOptions = {}): Promise<WordPressContentItem[]> {
  const rows = await wpGet<any[]>(creds, buildContentPath('/pages', opts))
  return (Array.isArray(rows) ? rows : []).map(mapContentItem)
}

export type WpContentEndpoint = '/posts' | '/pages'

/**
 * Read-only: fetch the rendered content HTML of ONE item by id. Kept as a
 * minimal per-item request (`_fields=id,content`) so a huge single item throws
 * a size-cap error the caller can skip — without failing the whole scan.
 * Throws WordPressClientError (incl. "response was too large") like every read.
 */
export async function getItemContentHtml(creds: WordPressCredentials, endpoint: WpContentEndpoint, id: number): Promise<string> {
  const obj = await wpGet<any>(creds, `${endpoint}/${id}?_fields=id,content`)
  return typeof obj?.content === 'string' ? obj.content : String(obj?.content?.rendered ?? '')
}
