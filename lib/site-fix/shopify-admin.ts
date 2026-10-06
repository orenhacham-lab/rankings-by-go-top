/**
 * The Shopify channel of the fix queue: the store's own articles and pages, written through the
 * Admin GraphQL API with the store's existing connection (scope write_content, already granted for
 * publishing articles). Server-side only.
 *
 * WHAT IT MAY WRITE, and nothing else:
 *   - the search engine listing of an article or a page (metafields global.title_tag and
 *     global.description_tag, the fields Shopify's own "Search engine listing" box edits);
 *   - the body HTML of an article or a page: image alt text, a broken link, an FAQ block at the end,
 *     an extra main heading turned into a subheading.
 * Never a product, a collection, the theme, the store's settings, a price or an order: an address
 * is resolved ONLY to an article or a page the store sync recorded for THIS project and owner
 * (shopify_entities), never by guessing from the URL.
 *
 * This module does not import lib/shopify (its own pinned guards cover that code, which stays
 * untouched): the route hands in the store's credentials, already resolved by the existing loader.
 * Failures are stable codes; nothing Shopify says reaches an answer or a log line.
 */
import type { createAdminClient } from '@/lib/supabase/admin'
import type { Scope } from './store'
import type { FaqItem, FixType, H1Ref } from './types'

type Admin = ReturnType<typeof createAdminClient>

export interface ShopCreds { shopDomain: string; accessToken: string; apiVersion: string }

/** The fix types the Shopify channel writes. Canonical, focus keyphrase and schema have no store field; llms.txt is not ours to place. */
export const SHOPIFY_FIX_TYPES: readonly FixType[] = ['seo_title', 'meta_description', 'image_alt', 'broken_link', 'faq_block', 'h1_demote']

/** Either scope lets the app edit articles and pages (shopify.dev: articleUpdate, pageUpdate). */
export function canWriteContent(scopes: unknown): boolean {
  const list = Array.isArray(scopes) ? scopes.map((s) => String(s).trim()) : []
  return list.includes('write_content') || list.includes('write_online_store_pages')
}

export type ShopItemKind = 'article' | 'page'
export interface ShopItemRef { kind: ShopItemKind; gid: string; url: string }
export interface ShopItem extends ShopItemRef { title: string; body: string; titleTag: string | null; descriptionTag: string | null }
export type SeoKey = 'title_tag' | 'description_tag'
export interface ShopPatch { body?: string; meta?: { key: SeoKey; value: string } }

export type ShopFailure = 'store_permission' | 'store_unreachable' | 'store_rejected'
export class ShopFixError extends Error {
  constructor(readonly code: ShopFailure) { super(`shopify_fix_${code}`); this.name = 'ShopFixError' }
}
export const shopFailure = (err: unknown): ShopFailure => (err instanceof ShopFixError ? err.code : 'store_unreachable')

/** Reads and writes one article or page. Injected, so the whole channel runs under test. */
export interface ShopifyFixClient {
  read(creds: ShopCreds, ref: ShopItemRef): Promise<ShopItem | null>
  write(creds: ShopCreds, ref: ShopItemRef, patch: ShopPatch): Promise<void>
  /** Remove one SEO field we set where the store had none (undo). */
  clearMeta(creds: ShopCreds, ref: ShopItemRef, key: SeoKey): Promise<void>
}

// ── Finding the item ────────────────────────────────────────────────────────

const GID = /^gid:\/\/shopify\/(Article|Page)\/[0-9]{1,20}$/

function spellings(url: string): string[] {
  const raw = String(url ?? '').trim()
  if (!raw) return []
  try {
    const u = new URL(raw)
    const base = `${u.origin}${u.pathname.replace(/\/+$/, '')}`
    return [...new Set([raw, base, `${base}/`])]
  } catch {
    return [raw]
  }
}

/**
 * The article or page at this address, from the store sync of THIS project and owner. A product,
 * a collection, an address the sync does not know or another owner's row: null.
 */
export async function findShopItem(admin: Admin, scope: Scope, url: string): Promise<ShopItemRef | null> {
  const urls = spellings(url)
  if (urls.length === 0) return null
  const { data, error } = await admin.from('shopify_entities').select('entity_type, canonical_url, shopify_gid')
    .eq('project_id', scope.projectId).eq('user_id', scope.userId).eq('is_active', true)
    .in('entity_type', ['article', 'page']).in('canonical_url', urls).limit(2)
  if (error) throw new ShopFixError('store_unreachable')
  const rows = (data ?? []) as { entity_type: string; canonical_url: string | null; shopify_gid: string | null }[]
  const row = rows.find((r) => (r.entity_type === 'article' || r.entity_type === 'page') && GID.test(String(r.shopify_gid ?? '')))
  if (!row) return null
  const kind = row.entity_type as ShopItemKind
  // The gid must name the same kind of item the row says it is.
  if (!String(row.shopify_gid).startsWith(kind === 'article' ? 'gid://shopify/Article/' : 'gid://shopify/Page/')) return null
  return { kind, gid: String(row.shopify_gid), url: String(row.canonical_url ?? url) }
}

// ── The Admin API ───────────────────────────────────────────────────────────

const SHOP_HOST = /^[a-z0-9][a-z0-9-]{0,62}\.myshopify\.com$/
const VERSION = /^[0-9]{4}-[0-9]{2}$|^unstable$/
const TIMEOUT_MS = 15_000

const READ = {
  article: 'query FixArticle($id: ID!) { node: article(id: $id) { id title body titleTag: metafield(namespace: "global", key: "title_tag") { value } descriptionTag: metafield(namespace: "global", key: "description_tag") { value } } }',
  page: 'query FixPage($id: ID!) { node: page(id: $id) { id title body titleTag: metafield(namespace: "global", key: "title_tag") { value } descriptionTag: metafield(namespace: "global", key: "description_tag") { value } } }',
}
const WRITE = {
  article: 'mutation FixArticleUpdate($id: ID!, $input: ArticleUpdateInput!) { result: articleUpdate(id: $id, article: $input) { userErrors { field message } } }',
  page: 'mutation FixPageUpdate($id: ID!, $input: PageUpdateInput!) { result: pageUpdate(id: $id, page: $input) { userErrors { field message } } }',
}
const CLEAR = 'mutation FixMetaDelete($metafields: [MetafieldIdentifierInput!]!) { result: metafieldsDelete(metafields: $metafields) { userErrors { field message } } }'

type GqlFetch = typeof fetch

async function call<T>(creds: ShopCreds, query: string, variables: Record<string, unknown>, base: GqlFetch): Promise<T> {
  const host = String(creds.shopDomain ?? '').trim().toLowerCase()
  if (!SHOP_HOST.test(host) || !VERSION.test(String(creds.apiVersion)) || !creds.accessToken) throw new ShopFixError('store_permission')
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)
  let res: Response
  try {
    res = await base(`https://${host}/admin/api/${creds.apiVersion}/graphql.json`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json', 'X-Shopify-Access-Token': creds.accessToken, 'User-Agent': 'RankingsByGoTop-SiteFix/1.0' },
      body: JSON.stringify({ query, variables }),
      signal: controller.signal,
      redirect: 'error',
    })
  } catch {
    throw new ShopFixError('store_unreachable')
  } finally {
    clearTimeout(timer)
  }
  if (res.status === 401 || res.status === 403) throw new ShopFixError('store_permission')
  if (res.status < 200 || res.status >= 300) throw new ShopFixError('store_unreachable')
  let json: { data?: T; errors?: { message?: string; extensions?: { code?: string } }[] }
  try { json = await res.json() } catch { throw new ShopFixError('store_unreachable') }
  if (json.errors?.length) {
    const denied = json.errors.some((e) => String(e.extensions?.code ?? '').toUpperCase() === 'ACCESS_DENIED' || /access denied|scope/i.test(String(e.message ?? '')))
    throw new ShopFixError(denied ? 'store_permission' : 'store_unreachable')
  }
  if (!json.data) throw new ShopFixError('store_unreachable')
  return json.data
}

function userErrorsOf(data: { result?: { userErrors?: unknown[] } | null }): void {
  if (!data.result) throw new ShopFixError('store_rejected')
  if (Array.isArray(data.result.userErrors) && data.result.userErrors.length > 0) throw new ShopFixError('store_rejected')
}

export function shopifyFixClient(base: GqlFetch = fetch): ShopifyFixClient {
  return {
    async read(creds, ref) {
      type Node = { id: string; title: string | null; body: string | null; titleTag: { value: string } | null; descriptionTag: { value: string } | null }
      const data = await call<{ node: Node | null }>(creds, READ[ref.kind], { id: ref.gid }, base)
      const n = data.node
      if (!n || n.id !== ref.gid) return null
      return { ...ref, title: String(n.title ?? ''), body: String(n.body ?? ''), titleTag: n.titleTag?.value ?? null, descriptionTag: n.descriptionTag?.value ?? null }
    },
    async write(creds, ref, patch) {
      const input: Record<string, unknown> = {}
      if (patch.body !== undefined) input.body = patch.body
      if (patch.meta) input.metafields = [{ namespace: 'global', key: patch.meta.key, type: 'single_line_text_field', value: patch.meta.value }]
      if (Object.keys(input).length === 0) return
      userErrorsOf(await call<{ result: { userErrors: unknown[] } | null }>(creds, WRITE[ref.kind], { id: ref.gid, input }, base))
    },
    async clearMeta(creds, ref, key) {
      userErrorsOf(await call<{ result: { userErrors: unknown[] } | null }>(creds, CLEAR, { metafields: [{ ownerId: ref.gid, namespace: 'global', key }] }, base))
    },
  }
}

// ── Body changes (Shopify's editor is plain HTML: no block-editor comments) ─

const esc = (s: string) => String(s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;')

/** The marker class of one job's block, the same one the WordPress block carries. */
export const fixMarker = (jobId: string) => `gotop-fix-${jobId.replace(/[^0-9a-f]/g, '').slice(0, 12)}`

/** The FAQ block for one job, as plain HTML a Shopify article or page keeps as written. */
export function shopifyFaqBlockHtml(jobId: string, heading: string, items: readonly FaqItem[]): string {
  let html = `<div class="gotop-faq ${fixMarker(jobId)}">\n<h2>${esc(heading)}</h2>`
  for (const item of items) html += `\n<h3>${esc(item.q)}</h3>\n<p>${esc(item.a)}</p>`
  return `${html}\n</div>`
}

const textOfHeading = (inner: string) => inner.replace(/<[^>]+>/g, ' ')
  .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#0?39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>')
  .replace(/\s+/g, ' ').trim()

const H1 = /<h1\b[^>]*>([\s\S]*?)<\/h1\s*>/gi

/** The body's own main headings, in order; null when the markup is not simple (an unclosed or nested one). */
export function bodyH1s(body: string): string[] | null {
  const opens = (body.match(/<h1\b/gi) ?? []).length
  const closes = (body.match(/<\/h1\s*>/gi) ?? []).length
  const found = [...body.matchAll(H1)]
  if (opens !== closes || found.length !== opens) return null
  if (found.some((m) => /<h1\b/i.test(m[1]))) return null
  return found.map((m) => textOfHeading(m[1]))
}

/**
 * Turn the chosen body headings (their place among the body's h1s, and their words) into h2, the
 * words and attributes unchanged. Every chosen heading must be found where it was previewed with the
 * same words, or nothing changes (count 0).
 */
export function demoteBodyH1s(body: string, headings: readonly H1Ref[]): { html: string; count: number } {
  const current = bodyH1s(body)
  if (!current) return { html: body, count: 0 }
  for (const h of headings) {
    if (current[h.n] === undefined || current[h.n] !== textOfHeading(h.text)) return { html: body, count: 0 }
  }
  const chosen = new Set(headings.map((h) => h.n))
  let n = -1
  let count = 0
  const html = body.replace(H1, (whole) => {
    n++
    if (!chosen.has(n)) return whole
    count++
    return whole.replace(/^<h1\b/i, '<h2').replace(/<\/h1(\s*)>$/i, '</h2$1>')
  })
  return { html, count }
}
