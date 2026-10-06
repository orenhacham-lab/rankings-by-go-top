/**
 * Stage A for a store that was just installed (trigger 'shopify_install'): the
 * same four steps as for any project, read from the store the merchant
 * connected instead of from an address they typed.
 *
 *   a1  Read the store. Its catalog as the store's own sync left it in
 *       shopify_entities — active products and collections, at most
 *       MAX_PRODUCTS and MAX_COLLECTIONS, of THIS connection and this owner —
 *       and its storefront, through a1Live unchanged: the same host pin,
 *       deadlines and SSRF admission, told that this IS a Shopify store so its
 *       password page is recognised even without Shopify's own headers or
 *       markup. A storefront behind its password page (every development
 *       store, the app reviewer's included) is `locked`: nothing on it is read
 *       as the merchant's. A storefront that cannot be read at all is
 *       `unavailable`; with a catalog, the run goes on without it.
 *   a2  Understand the business with the run's ONE model call — a2Live's own,
 *       behind its `attempted` mark — from the shop's name, its collections and
 *       its products, plus the storefront's own text when it is public. The
 *       settings are written under the same field-ownership rules
 *       (settings.ts). A store with no product, no collection and no public
 *       storefront has nothing to read: the step ends as `store_empty` and the
 *       model is never asked.
 *   a3  The findings and the four AI-readiness checks of a PUBLIC storefront
 *       (a3Live). A locked one is "not checked, the store is password
 *       protected" — geo state 'unavailable', reason 'storefront_locked', no
 *       finding — which is not the same as failing all four; an unreadable one
 *       is not checked either.
 *   a4  At most three searches for the seed keywords a2 found — a4 itself, in
 *       the STORE's market: its country and primary locale as Shopify states
 *       them (noted on a1 by the install), else US / en. Never the project's
 *       country and language, which for a project made with the form's
 *       defaults say IL / he; the project row is not written for this.
 *
 * a1 keeps the live step's fields where later steps read them — `signals` (the
 * storefront's, or null) and `storefrontLocked` — so a2Live, a3Live and stage B's
 * b1 read a store's a1 exactly as they read any site's.
 *
 * Every query names its owner, and no provider text is stored: a step ends with
 * a stable code (types.ts).
 */
import { normalizeCheckUrl, type SiteSignals } from '@/lib/free-check'
import type { ServiceRoleClient } from '@/lib/supabase/admin'
import {
  a1Live,
  a2Live,
  a3Live,
  ABORT,
  finished,
  readStoredSignals,
  STAGE_A_EXECUTORS,
  type StepContext,
  type StepOutcome,
} from './steps'
import { withCounters } from './summary'
import { SEED_STEP_ERROR_CODES, type SeedErrorCode, type SeedGeo, type SeedScope } from './types'

/** How much of the catalog a1 reads and keeps for a2. */
export const MAX_PRODUCTS = 30
export const MAX_COLLECTIONS = 20
/** The storefront's own text and the catalog's share of the model's 6,000 characters of page text. */
const STOREFRONT_TEXT_CHARS = 2_000
const CATALOG_TEXT_CHARS = 3_800

// ── The shop, as the install saved it on a1 ─────────────────────────────────

/** Which store the run reads. Saved on a1 when the run is created (shopify-install.ts). */
export type ShopInfo = {
  connectionId: string | null
  /** The shop's own name, when Shopify gave it. */
  name: string | null
  /** The shop's *.myshopify.com address. */
  shopDomain: string | null
  /** Its primary storefront host, when it has its own domain. */
  storefrontDomain: string | null
  /** The market it sells in, as Shopify states it; null until asked. */
  market: StoreMarket | null
}

/** A store's market: an ISO country code and a two-letter language, as the searches take them. */
export type StoreMarket = { country: string; language: string }

/** When Shopify states no market for the store. */
export const STORE_MARKET_FALLBACK: StoreMarket = { country: 'US', language: 'en' }

const countryCode = (v: unknown): string | null => {
  const s = typeof v === 'string' ? v.trim().toUpperCase() : ''
  return /^[A-Z]{2}$/.test(s) ? s : null
}
const languageCode = (v: unknown): string | null => {
  const m = typeof v === 'string' ? /^([a-z]{2})(?:[-_][a-z0-9]+)*$/i.exec(v.trim()) : null
  return m ? m[1].toLowerCase() : null
}

/** The market from what Shopify said (a country code, a locale like "fr-CA"), each part falling back on its own. */
export function storeMarket(said: { country?: unknown; locale?: unknown } | null | undefined): StoreMarket {
  return {
    country: countryCode(said?.country) ?? STORE_MARKET_FALLBACK.country,
    language: languageCode(said?.locale) ?? STORE_MARKET_FALLBACK.language,
  }
}

const text = (v: unknown, max: number): string | null => {
  if (typeof v !== 'string') return null
  const s = v.replace(/\s+/g, ' ').trim().slice(0, max)
  return s || null
}

const host = (v: unknown): string | null => {
  const s = text(v, 253)?.toLowerCase() ?? null
  return s && /^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(s) ? s : null
}

/** The shop as stored on a1, read back field by field; null when there is none. */
export function readShopInfo(detail: Record<string, unknown> | undefined): ShopInfo | null {
  const shop = detail?.shop
  if (!shop || typeof shop !== 'object') return null
  const r = shop as Record<string, unknown>
  const m = r.market && typeof r.market === 'object' ? (r.market as Record<string, unknown>) : null
  const country = countryCode(m?.country)
  const language = typeof m?.language === 'string' && /^[a-z]{2}$/.test(m.language) ? m.language : null
  return {
    connectionId: text(r.connectionId, 64),
    name: text(r.name, 120),
    shopDomain: host(r.shopDomain),
    storefrontDomain: host(r.storefrontDomain),
    market: country && language ? { country, language } : null,
  }
}

/**
 * The address a1 reads: the project's own site, like any run — the project is
 * what the rest of the product measures. Only a project with no usable address
 * falls back to the store's own storefront host.
 */
export function storefrontTarget(projectTarget: string | null | undefined, shop: ShopInfo | null): string {
  const own = projectTarget ?? ''
  if (normalizeCheckUrl(own).ok) return own
  return shop?.storefrontDomain ?? shop?.shopDomain ?? own
}

// ── The catalog ─────────────────────────────────────────────────────────────

export type CatalogProduct = { title: string; type: string | null; vendor: string | null; tags: string[]; excerpt: string | null }
export type CatalogCollection = { title: string; excerpt: string | null }
export type StoreCatalog = { shopName: string | null; products: CatalogProduct[]; collections: CatalogCollection[] }

type EntityRow = { title?: unknown; body_excerpt?: unknown; metadata?: unknown }

function toProduct(row: EntityRow): CatalogProduct | null {
  const title = text(row.title, 120)
  if (!title) return null
  const meta = row.metadata && typeof row.metadata === 'object' ? (row.metadata as Record<string, unknown>) : {}
  const tags = Array.isArray(meta.tags) ? meta.tags.map((t) => text(t, 30)).filter((t): t is string => !!t).slice(0, 5) : []
  return { title, type: text(meta.product_type, 60), vendor: text(meta.vendor, 60), tags, excerpt: text(row.body_excerpt, 160) }
}

function toCollection(row: EntityRow): CatalogCollection | null {
  const title = text(row.title, 120)
  return title ? { title, excerpt: text(row.body_excerpt, 160) } : null
}

/**
 * The store's active products and collections, newest first, of this owner's
 * project and — when the run knows it — of the connection it was created for,
 * so rows another store once synced into the same project are never read.
 */
export async function readCatalog(
  admin: ServiceRoleClient,
  scope: SeedScope,
  shop: ShopInfo | null,
): Promise<StoreCatalog | 'error'> {
  const read = async (type: 'product' | 'collection', limit: number): Promise<EntityRow[] | 'error'> => {
    let query = admin
      .from('shopify_entities')
      .select('title, body_excerpt, metadata')
      .eq('project_id', scope.projectId)
      .eq('user_id', scope.userId)
      .eq('entity_type', type)
      .eq('is_active', true)
    if (shop?.connectionId) query = query.eq('connection_id', shop.connectionId)
    const { data, error } = await query.order('shopify_updated_at', { ascending: false }).limit(limit)
    if (error) return 'error'
    return (data as EntityRow[] | null) ?? []
  }
  const [products, collections] = await Promise.all([read('product', MAX_PRODUCTS), read('collection', MAX_COLLECTIONS)])
  if (products === 'error' || collections === 'error') return 'error'
  return {
    shopName: shop?.name ?? null,
    products: products.map(toProduct).filter((p): p is CatalogProduct => !!p),
    collections: collections.map(toCollection).filter((c): c is CatalogCollection => !!c),
  }
}

const fields = (v: unknown): Record<string, unknown> => (v && typeof v === 'object' ? (v as Record<string, unknown>) : {})

/** The catalog as a1 stored it, re-read field by field (a resumed a2 reads it back). */
export function readStoredCatalog(v: unknown): StoreCatalog | null {
  if (!v || typeof v !== 'object') return null
  const r = v as Record<string, unknown>
  if (!Array.isArray(r.products) || !Array.isArray(r.collections)) return null
  const products = r.products
    .slice(0, MAX_PRODUCTS)
    .map(fields)
    .map((p) => toProduct({ title: p.title, body_excerpt: p.excerpt, metadata: { product_type: p.type, vendor: p.vendor, tags: p.tags } }))
    .filter((p): p is CatalogProduct => !!p)
  const collections = r.collections
    .slice(0, MAX_COLLECTIONS)
    .map(fields)
    .map((c) => toCollection({ title: c.title, body_excerpt: c.excerpt }))
    .filter((c): c is CatalogCollection => !!c)
  return { shopName: text(r.shopName, 120), products, collections }
}

const catalogSize = (c: StoreCatalog | null): number => (c ? c.products.length + c.collections.length : 0)

/** The catalog as page text for the model: the shop, its collections, then one line per product. */
export function catalogText(catalog: StoreCatalog, budget: number = CATALOG_TEXT_CHARS): string {
  const lines: string[] = []
  if (catalog.shopName) lines.push(`STORE: ${catalog.shopName}`)
  if (catalog.collections.length > 0) lines.push(`COLLECTIONS: ${catalog.collections.map((c) => c.title).join(' | ')}`.slice(0, 600))
  if (catalog.products.length > 0) lines.push('PRODUCTS:')
  for (const p of catalog.products) {
    const facts = [p.type, p.vendor, p.tags.length > 0 ? `tags: ${p.tags.join(', ')}` : null].filter(Boolean).join('; ')
    lines.push(`- ${p.title}${facts ? ` (${facts})` : ''}${p.excerpt ? `. ${p.excerpt}` : ''}`.slice(0, 240))
  }
  let out = ''
  for (const line of lines) {
    if (out.length + line.length + 1 > budget) break
    out += (out ? '\n' : '') + line
  }
  return out
}

const NO_SIGNALS: Omit<SiteSignals, 'finalUrl'> = {
  htmlLang: null,
  title: null,
  metaDescription: null,
  canonical: null,
  h1: [],
  h2: [],
  images: { total: 0, missingAlt: 0, missing: [] },
  schemaTypes: [],
  hasOrganizationSchema: false,
  hasFaqSchema: false,
  hasFaqSection: false,
  wordCount: 0,
  text: '',
  internalLinks: 0,
  internalLinkUrls: [],
  externalDomains: [],
  contact: { address: null, phone: null },
  platform: null,
  viewportMeta: false,
  openGraph: false,
  robotsTxt: null,
  llmsTxt: false,
}

/**
 * What a2 hands the model for a store: the storefront's own page when it is
 * public (its title, headings and some of its text), and the catalog either
 * way. The page language stays the storefront's own `lang` and nothing else —
 * a locked store states none, so none is guessed. The platform is known.
 */
export function storeSignals(catalog: StoreCatalog, storefront: SiteSignals | null, url: string): SiteSignals {
  const base: SiteSignals = storefront ?? { ...NO_SIGNALS, finalUrl: url, title: catalog.shopName }
  const pageText = [storefront ? storefront.text.slice(0, STOREFRONT_TEXT_CHARS) : '', catalogText(catalog)].filter(Boolean).join('\n\n')
  return {
    ...base,
    h1: storefront ? base.h1 : catalog.shopName ? [catalog.shopName] : [],
    h2: [...base.h2, ...catalog.collections.map((c) => c.title)].slice(0, 25),
    text: pageText,
    wordCount: pageText.split(/\s+/).filter(Boolean).length,
    platform: 'Shopify',
  }
}

// ── The steps ───────────────────────────────────────────────────────────────

type Storefront = 'public' | 'locked' | 'unavailable'

/** The root of the store's address: a locked store answers on /password, which is not its address. */
function siteRoot(url: string): string {
  try {
    return `${new URL(url).origin}/`
  } catch {
    return url
  }
}

async function a1Store(ctx: StepContext): Promise<StepOutcome> {
  const shop = readShopInfo(ctx.details.a1)
  const catalog = await readCatalog(ctx.admin, ctx.scope, shop)
  if (catalog === 'error') return finished('failed', 'internal_error', ctx.summary, { detail: { mode: 'shopify', shop } })
  const size = catalogSize(catalog)

  // The storefront: a1Live itself, on the project's own address.
  const view: StepContext = { ...ctx, project: { ...ctx.project, target_domain: storefrontTarget(ctx.project.target_domain, shop) } }
  const live = await a1Live(view)
  if (live.kind === 'abort') return ABORT
  const locked = live.status === 'done' && live.detail.storefrontLocked === true
  const signals = live.status === 'done' && !locked ? readStoredSignals(live.detail.signals) : null
  const storefront: Storefront = locked ? 'locked' : signals ? 'public' : 'unavailable'

  // Nothing was read at all: the run fails the way a site that cannot be read does.
  if (storefront === 'unavailable' && size === 0) {
    return finished('failed', live.errorCode ?? 'site_unreachable', ctx.summary, { detail: { mode: 'shopify', storefront, shop, catalog } })
  }

  const summary =
    storefront === 'unavailable'
      ? withCounters({ ...ctx.summary, scannedAt: ctx.deps.now().toISOString(), storefrontLocked: false, sitemapUrlCount: null, sitemapTruncated: false })
      : locked
        ? { ...live.summary, url: siteRoot(live.summary.url) }
        : live.summary
  return finished('done', null, summary, {
    itemCount: size,
    detail: {
      ...(live.status === 'done' ? live.detail : {}),
      mode: 'shopify',
      storefront,
      storefrontCode: live.status === 'failed' ? live.errorCode : null,
      storefrontLocked: locked,
      signals: signals ? live.detail.signals : null,
      shop,
      catalog,
    },
  })
}

async function a2Store(ctx: StepContext): Promise<StepOutcome> {
  const a1 = ctx.details.a1 ?? {}
  const catalog = readStoredCatalog(a1.catalog)
  const storefront = a1.storefrontLocked === true ? null : readStoredSignals(a1.signals)
  // No product, no collection and no public storefront: nothing to understand,
  // and the model is not asked.
  if (catalogSize(catalog) === 0 && !storefront) return finished('skipped', 'store_empty', ctx.summary, { detail: { mode: 'shopify' } })
  const signals = catalog && catalogSize(catalog) > 0 ? storeSignals(catalog, storefront, ctx.summary.url) : storefront
  // a2Live: the one model call, its attempted mark, and the settings write.
  return a2Live({ ...ctx, details: { ...ctx.details, a1: { ...a1, storefrontLocked: false, signals } } })
}

const storefrontCode = (v: unknown): SeedErrorCode =>
  (SEED_STEP_ERROR_CODES as readonly unknown[]).includes(v) ? (v as SeedErrorCode) : 'site_unreadable'

async function a3Store(ctx: StepContext): Promise<StepOutcome> {
  const a1 = ctx.details.a1 ?? {}
  // Locked ("not checked") or public (measured): exactly as for any site.
  if (a1.storefrontLocked === true || readStoredSignals(a1.signals)) return a3Live(ctx)
  // The storefront could not be read (the catalog was): not measured either,
  // which is not the same as failing.
  const geo: SeedGeo = { state: 'unavailable', unavailableReason: null, passed: 0, total: 0, signals: [] }
  return finished('skipped', storefrontCode(a1.storefrontCode), withCounters({ ...ctx.summary, findings: [], findingsOmitted: 0, geo }), {
    detail: { mode: 'shopify' },
  })
}

/** The market a store's searches run in: the one the install noted, else US / en — never the project's. */
export function storeSearchMarket(details: StepContext['details']): StoreMarket {
  return readShopInfo(details.a1)?.market ?? STORE_MARKET_FALLBACK
}

async function a4Store(ctx: StepContext): Promise<StepOutcome> {
  // a4 itself, reading the store's market where it reads the project's. A view
  // only: nothing here writes the project's country or language.
  const market = storeSearchMarket(ctx.details)
  return STAGE_A_EXECUTORS.a4({ ...ctx, project: { ...ctx.project, country: market.country, language: market.language } })
}

/** The executors of a 'shopify_install' run. The runner picks them by the run's trigger. */
export const SHOPIFY_STAGE_A_EXECUTORS: typeof STAGE_A_EXECUTORS = {
  a1: a1Store,
  a2: a2Store,
  a3: a3Store,
  a4: a4Store,
}
