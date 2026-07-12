/**
 * Phase 4F.1 — Shopify Admin API client (server-side only).
 *
 * GraphQL Admin API, pinned version, minimum read scopes (read_products,
 * read_content). The shop host is always a validated *.myshopify.com domain, so
 * requests target Shopify directly (no user-controlled host → no SSRF surface).
 * Rate-limit aware (GraphQL cost throttle + HTTP 429), retries ONLY transient
 * failures with backoff, and classifies errors for a clear UI.
 *
 * The access token is used only as the X-Shopify-Access-Token header and never
 * logged or returned.
 */

import { buildCanonicalUrl, numericIdFromGid } from './domain'
import type {
  ShopifyCredentials,
  ShopifyEntity,
  ShopifyEntityType,
  ShopifyTestResult,
  ShopifyErrorKind,
  EntitySyncTypeResult,
} from './types'

const REQUEST_TIMEOUT_MS = 20_000
const MAX_TRANSIENT_RETRIES = 4
const PAGE_SIZE = 100
const MAX_PAGES_PER_TYPE = 20 // bounded pagination: ≤ 2000 entities/type

export class ShopifyClientError extends Error {
  kind: ShopifyErrorKind
  constructor(kind: ShopifyErrorKind, message: string) {
    super(message)
    this.name = 'ShopifyClientError'
    this.kind = kind
  }
}

/** Exponential backoff with a cap (pure — unit-tested). attempt is 0-based. */
export function backoffMs(attempt: number, baseMs = 500, capMs = 8000): number {
  const v = baseMs * Math.pow(2, Math.max(0, attempt))
  return Math.min(v, capMs)
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

function endpoint(creds: ShopifyCredentials): string {
  return `https://${creds.shopDomain}/admin/api/${creds.apiVersion}/graphql.json`
}

interface GraphQLResponse<T> {
  data?: T
  errors?: Array<{ message?: string; extensions?: { code?: string } }>
  extensions?: { cost?: { throttleStatus?: { currentlyAvailable?: number; maximumAvailable?: number; restoreRate?: number } } }
}

/** Classify a GraphQL errors[] payload into a ShopifyClientError kind. */
function classifyGraphqlErrors(errors: NonNullable<GraphQLResponse<unknown>['errors']>): ShopifyClientError {
  const codes = errors.map((e) => String(e.extensions?.code || '').toUpperCase())
  const messages = errors.map((e) => String(e.message || '')).join('; ')
  if (codes.includes('THROTTLED')) return new ShopifyClientError('rate_limited', 'Shopify API rate limit reached.')
  if (codes.includes('ACCESS_DENIED') || /access denied|scope|not approved/i.test(messages)) {
    return new ShopifyClientError('missing_scope', 'The token is missing a required read scope.')
  }
  return new ShopifyClientError('api_error', messages || 'Shopify API error.')
}

/**
 * One GraphQL call with transient-only retry (429 / 5xx / network / THROTTLED).
 * Returns { data, throttle }. Throws ShopifyClientError (classified) otherwise.
 */
async function graphql<T>(creds: ShopifyCredentials, query: string, variables: Record<string, unknown> = {}): Promise<{ data: T; available: number | null }> {
  let lastErr: ShopifyClientError | null = null
  for (let attempt = 0; attempt <= MAX_TRANSIENT_RETRIES; attempt++) {
    if (attempt > 0) await sleep(backoffMs(attempt - 1))
    let res: Response
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
    try {
      res = await fetch(endpoint(creds), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Shopify-Access-Token': creds.accessToken,
          Accept: 'application/json',
          'User-Agent': 'RankingsByGoTop-Content/1.0',
        },
        body: JSON.stringify({ query, variables }),
        signal: controller.signal,
        redirect: 'error',
      })
    } catch {
      lastErr = new ShopifyClientError('network', 'Could not reach the Shopify store.')
      continue // transient — retry
    } finally {
      clearTimeout(timer)
    }

    if (res.status === 401 || res.status === 403) {
      throw new ShopifyClientError('invalid_token', 'Authentication failed. Check the Admin API access token.')
    }
    if (res.status === 429) { lastErr = new ShopifyClientError('rate_limited', 'Shopify API rate limit reached.'); continue }
    if (res.status >= 500) { lastErr = new ShopifyClientError('api_error', `Shopify server error (HTTP ${res.status}).`); continue }
    if (res.status < 200 || res.status >= 300) {
      throw new ShopifyClientError('api_error', `Shopify returned HTTP ${res.status}.`)
    }

    let json: GraphQLResponse<T>
    try { json = (await res.json()) as GraphQLResponse<T> } catch {
      throw new ShopifyClientError('api_error', 'Shopify returned an invalid response.')
    }
    if (json.errors && json.errors.length) {
      const err = classifyGraphqlErrors(json.errors)
      if (err.kind === 'rate_limited') { lastErr = err; continue } // transient
      throw err
    }
    if (!json.data) throw new ShopifyClientError('api_error', 'Shopify returned no data.')
    const available = json.extensions?.cost?.throttleStatus?.currentlyAvailable ?? null
    return { data: json.data, available }
  }
  throw lastErr ?? new ShopifyClientError('network', 'Shopify request failed after retries.')
}

/**
 * Verify credentials + resolve the storefront host. Never throws — returns a
 * normalized result (with a classified `kind`) for the API route to relay.
 */
export async function testShopifyConnection(creds: ShopifyCredentials): Promise<ShopifyTestResult> {
  const query = `{ shop { name myshopifyDomain primaryDomain { host } } }`
  try {
    const { data } = await graphql<{ shop?: { name?: string; myshopifyDomain?: string; primaryDomain?: { host?: string } } }>(creds, query)
    const shop = data.shop
    if (!shop || !shop.name) return { ok: false, error: 'Unexpected response from Shopify.', kind: 'api_error' }
    const host = shop.primaryDomain?.host || null
    return { ok: true, shopName: shop.name, storefrontDomain: host && !host.endsWith('.myshopify.com') ? host : null }
  } catch (err) {
    if (err instanceof ShopifyClientError) return { ok: false, error: err.message, kind: err.kind }
    return { ok: false, error: 'Connection failed.', kind: 'api_error' }
  }
}

/** Resolve the host used to build canonical storefront URLs. */
function resolveHost(creds: ShopifyCredentials, storefrontDomain: string | null): string {
  return storefrontDomain || creds.shopDomain
}

/** Rate-limit courtesy: if the cost bucket is low, pause before the next page. */
async function throttleGuard(available: number | null): Promise<void> {
  if (available !== null && available < 100) await sleep(600)
}

const toText = (v: unknown, max = 400): string =>
  String(v ?? '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max)

type PagedNodes<N> = { pageInfo: { hasNextPage: boolean; endCursor: string | null }; nodes: N[] }

/** Generic bounded, throttle-aware pager over a GraphQL connection. */
async function paginate<N>(
  creds: ShopifyCredentials,
  query: string,
  pick: (data: unknown) => PagedNodes<N>,
  onNodes: (nodes: N[]) => void,
): Promise<void> {
  let cursor: string | null = null
  for (let page = 0; page < MAX_PAGES_PER_TYPE; page++) {
    const { data, available }: { data: unknown; available: number | null } =
      await graphql(creds, query, { cursor })
    const conn = pick(data)
    onNodes(conn.nodes || [])
    if (!conn.pageInfo?.hasNextPage || !conn.pageInfo.endCursor) return
    cursor = conn.pageInfo.endCursor
    await throttleGuard(available)
  }
}

const Q_PRODUCTS = `query($cursor:String){ products(first:${PAGE_SIZE}, after:$cursor, sortKey:UPDATED_AT){ pageInfo{hasNextPage endCursor} nodes{ id title handle status updatedAt productType vendor tags description } } }`
const Q_COLLECTIONS = `query($cursor:String){ collections(first:${PAGE_SIZE}, after:$cursor, sortKey:UPDATED_AT){ pageInfo{hasNextPage endCursor} nodes{ id title handle updatedAt description } } }`
const Q_PAGES = `query($cursor:String){ pages(first:${PAGE_SIZE}, after:$cursor){ pageInfo{hasNextPage endCursor} nodes{ id title handle updatedAt isPublished body } } }`
const Q_BLOGS = `query($cursor:String){ blogs(first:${PAGE_SIZE}, after:$cursor){ pageInfo{hasNextPage endCursor} nodes{ id title handle updatedAt } } }`
const Q_ARTICLES = `query($cursor:String){ articles(first:${PAGE_SIZE}, after:$cursor, sortKey:UPDATED_AT){ pageInfo{hasNextPage endCursor} nodes{ id title handle updatedAt isPublished summary blog{ handle } } } }`

/**
 * Discover all five entity types. Each type is fetched INDEPENDENTLY: a failure
 * in one is captured in perType (partial sync) and never aborts the others or
 * erases previously-synced data. Returns the flat entity list + per-type report.
 */
export async function discoverEntities(
  creds: ShopifyCredentials,
  storefrontDomain: string | null,
): Promise<{ entities: ShopifyEntity[]; perType: EntitySyncTypeResult[] }> {
  const host = resolveHost(creds, storefrontDomain)
  const entities: ShopifyEntity[] = []
  const perType: EntitySyncTypeResult[] = []

  const run = async (type: ShopifyEntityType, fn: () => Promise<number>) => {
    try {
      const fetched = await fn()
      perType.push({ type, ok: true, fetched })
    } catch (err) {
      const e = err instanceof ShopifyClientError ? err : new ShopifyClientError('api_error', 'Sync failed.')
      perType.push({ type, ok: false, fetched: 0, error: e.message, kind: e.kind })
    }
  }

  await run('product', async () => {
    let n = 0
    await paginate<{ id: string; title?: string; handle?: string; status?: string; updatedAt?: string; productType?: string; vendor?: string; tags?: string[]; description?: string }>(
      creds, Q_PRODUCTS,
      (d) => (d as { products: PagedNodes<never> }).products,
      (nodes) => { for (const p of nodes) { entities.push(mapProduct(p, host)); n++ } },
    )
    return n
  })

  await run('collection', async () => {
    let n = 0
    await paginate<{ id: string; title?: string; handle?: string; updatedAt?: string; description?: string }>(
      creds, Q_COLLECTIONS,
      (d) => (d as { collections: PagedNodes<never> }).collections,
      (nodes) => { for (const c of nodes) { entities.push(mapCollection(c, host)); n++ } },
    )
    return n
  })

  await run('page', async () => {
    let n = 0
    await paginate<{ id: string; title?: string; handle?: string; updatedAt?: string; isPublished?: boolean; body?: string }>(
      creds, Q_PAGES,
      (d) => (d as { pages: PagedNodes<never> }).pages,
      (nodes) => { for (const p of nodes) { entities.push(mapPage(p, host)); n++ } },
    )
    return n
  })

  await run('blog', async () => {
    let n = 0
    await paginate<{ id: string; title?: string; handle?: string; updatedAt?: string }>(
      creds, Q_BLOGS,
      (d) => (d as { blogs: PagedNodes<never> }).blogs,
      (nodes) => { for (const b of nodes) { entities.push(mapBlog(b, host)); n++ } },
    )
    return n
  })

  await run('article', async () => {
    let n = 0
    await paginate<{ id: string; title?: string; handle?: string; updatedAt?: string; isPublished?: boolean; summary?: string; blog?: { handle?: string } }>(
      creds, Q_ARTICLES,
      (d) => (d as { articles: PagedNodes<never> }).articles,
      (nodes) => { for (const a of nodes) { entities.push(mapArticle(a, host)); n++ } },
    )
    return n
  })

  return { entities, perType }
}

// --- pure node → ShopifyEntity mappers (host-aware) --------------------------
function base(gid: string, type: ShopifyEntityType, title: unknown, handle: unknown, updatedAt: unknown) {
  return {
    gid, numericId: numericIdFromGid(gid), type,
    title: String(title ?? '').trim(), handle: String(handle ?? '').trim(),
    updatedAt: updatedAt ? String(updatedAt) : null,
  }
}
function mapProduct(p: { id: string; title?: string; handle?: string; status?: string; updatedAt?: string; productType?: string; vendor?: string; tags?: string[]; description?: string }, host: string): ShopifyEntity {
  const b = base(p.id, 'product', p.title, p.handle, p.updatedAt)
  return { ...b, canonicalUrl: buildCanonicalUrl(host, 'product', b.handle), status: p.status ?? null, isActive: (p.status ?? '').toUpperCase() === 'ACTIVE', bodyExcerpt: toText(p.description), metadata: { product_type: p.productType || '', vendor: p.vendor || '', tags: Array.isArray(p.tags) ? p.tags : [] } }
}
function mapCollection(c: { id: string; title?: string; handle?: string; updatedAt?: string; description?: string }, host: string): ShopifyEntity {
  const b = base(c.id, 'collection', c.title, c.handle, c.updatedAt)
  return { ...b, canonicalUrl: buildCanonicalUrl(host, 'collection', b.handle), status: null, isActive: true, bodyExcerpt: toText(c.description), metadata: {} }
}
function mapPage(p: { id: string; title?: string; handle?: string; updatedAt?: string; isPublished?: boolean; body?: string }, host: string): ShopifyEntity {
  const b = base(p.id, 'page', p.title, p.handle, p.updatedAt)
  return { ...b, canonicalUrl: buildCanonicalUrl(host, 'page', b.handle), status: p.isPublished === false ? 'unpublished' : 'published', isActive: p.isPublished !== false, bodyExcerpt: toText(p.body), metadata: {} }
}
function mapBlog(bl: { id: string; title?: string; handle?: string; updatedAt?: string }, host: string): ShopifyEntity {
  const b = base(bl.id, 'blog', bl.title, bl.handle, bl.updatedAt)
  return { ...b, canonicalUrl: buildCanonicalUrl(host, 'blog', b.handle), status: null, isActive: true, bodyExcerpt: '', metadata: {} }
}
function mapArticle(a: { id: string; title?: string; handle?: string; updatedAt?: string; isPublished?: boolean; summary?: string; blog?: { handle?: string } }, host: string): ShopifyEntity {
  const b = base(a.id, 'article', a.title, a.handle, a.updatedAt)
  const blogHandle = a.blog?.handle || null
  return { ...b, canonicalUrl: buildCanonicalUrl(host, 'article', b.handle, blogHandle), status: a.isPublished === false ? 'unpublished' : 'published', isActive: a.isPublished !== false, bodyExcerpt: toText(a.summary), metadata: { blog_handle: blogHandle || '' } }
}
