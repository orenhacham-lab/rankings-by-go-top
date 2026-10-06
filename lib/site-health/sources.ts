/**
 * What site health knows about a project before it reads the site: its address,
 * which platform it is on, which connections it has, and which of its pages to
 * read. READ-ONLY, and only from tables the existing syncs already fill.
 *
 * The caller has proved the user owns the project. The service-role client still
 * BYPASSES RLS, so EVERY read below carries both `.eq('project_id', …)` and
 * `.eq('user_id', …)` — the owner filter is the isolation, and a guard
 * (lib/site-health/__qa__/site-health-routes.qa.ts) fails when a read drops it.
 *
 * Which pages: the same order the "existing content" screen uses
 * (lib/content/existing-content/load.ts) — a store's synced entities, then a
 * connected WordPress site's index, then the seeding crawl — sampled across
 * kinds so one type does not fill the whole scan.
 */
import type { createAdminClient } from '@/lib/supabase/admin'
import type { ScannedTarget } from '@/lib/content/wordpress-content-scan'
import { MAX_PAGES, type CandidatePage } from './scan'
import type { ConnectionState, PageKind, SiteFacts, SitePlatform } from './types'

type Admin = ReturnType<typeof createAdminClient>

export interface ProjectSources {
  siteUrl: string
  siteName: string | null
  platform: SitePlatform
  connections: ConnectionState
  candidates: CandidatePage[]
  orphanPages: SiteFacts['orphanPages']
  shopDomain: string | null
}

const missingTable = (e: unknown) => ['42P01', 'PGRST205'].includes(String((e as { code?: unknown } | null)?.code ?? ''))

/**
 * The store's items, read per kind: the newest SHOPIFY_PER_KIND of each. One list of the newest items
 * overall let products crowd out the rest: on a store with 616 products, 2 of its 22 articles and 1 of
 * its 10 pages were among the newest 400, so the scan barely read the articles and pages a fix can edit.
 * Articles and pages come first, so whatever is left after the quotas goes to what can be fixed.
 */
const SHOPIFY_PER_KIND = 50
const SHOPIFY_READ_ORDER = ['article', 'page', 'product', 'collection'] as const
async function shopifyEntities(admin: Admin, projectId: string, userId: string): Promise<{ data: unknown[] | null; error: unknown }> {
  const parts = await Promise.all(SHOPIFY_READ_ORDER.map((type) =>
    admin.from('shopify_entities').select('entity_type, canonical_url, shopify_gid')
      .eq('project_id', projectId).eq('user_id', userId).eq('is_active', true).eq('entity_type', type)
      .order('shopify_updated_at', { ascending: false }).limit(SHOPIFY_PER_KIND)))
  const failed = parts.find((r) => r.error)
  if (failed) return { data: null, error: failed.error }
  return { data: parts.flatMap((r) => (r.data ?? []) as unknown[]), error: null }
}

/** Per-kind quotas for a store (the rest of MAX_PAGES - 1 filled in list order). */
const SHOPIFY_QUOTA: Record<string, number> = { product: 8, page: 5, article: 6, collection: 4 }
const SHOPIFY_KIND: Record<string, PageKind> = { product: 'product', page: 'page', article: 'article', collection: 'collection' }
const SHOPIFY_ADMIN_PATH: Record<string, string> = { product: 'products', page: 'pages', article: 'articles', collection: 'collections' }

/**
 * The store admin's own page for one item: https://{shop}.myshopify.com/admin/{type}/{id}.
 * Built only from a myshopify.com domain and a numeric id taken from the gid, so it can
 * never point anywhere but the merchant's own admin.
 */
export function shopifyAdminUrl(shopDomain: string | null, entityType: string, gid: string | null): string | null {
  const shop = String(shopDomain ?? '').trim().toLowerCase()
  if (!/^[a-z0-9][a-z0-9-]*\.myshopify\.com$/.test(shop)) return null
  const path = SHOPIFY_ADMIN_PATH[entityType]
  const id = String(gid ?? '').match(/^gid:\/\/shopify\/[A-Za-z]+\/(\d+)$/)?.[1]
  if (!path || !id) return null
  return `https://${shop}/admin/${path}/${id}`
}

const WP_KIND: Record<string, PageKind> = { post: 'article', page: 'page', product: 'product', category: 'collection' }

function platformFrom(detected: string | null | undefined): SitePlatform | null {
  const d = String(detected ?? '').toLowerCase()
  if (d.includes('wordpress') || d.includes('woocommerce')) return 'wordpress'
  if (d.includes('shopify')) return 'shopify'
  if (d.includes('wix')) return 'wix'
  return null
}

export class SourcesReadError extends Error {
  constructor() { super('site_health_sources_failed'); this.name = 'SourcesReadError' }
}

export async function loadProjectSources(admin: Admin, scope: { projectId: string; userId: string }): Promise<ProjectSources | null> {
  const { projectId, userId } = scope

  const { data: project, error: projectError } = await admin
    .from('projects')
    .select('id, user_id, target_domain, business_name, name')
    .eq('id', projectId)
    .eq('user_id', userId)
    .maybeSingle()
  if (projectError) throw new SourcesReadError()
  if (!project) return null
  const p = project as { target_domain?: string | null; business_name?: string | null; name?: string | null }
  const domain = String(p.target_domain ?? '').trim()
  if (!domain) return null
  const siteUrl = /^https?:\/\//i.test(domain) ? domain : `https://${domain}`

  const [shopify, wordpress, sitePlatform, profile, entities, wpIndex, crawl] = await Promise.all([
    admin.from('shopify_connections').select('connection_status, archived_at, shop_domain')
      .eq('project_id', projectId).eq('user_id', userId).is('archived_at', null).maybeSingle(),
    admin.from('wordpress_connections').select('connection_status')
      .eq('project_id', projectId).eq('user_id', userId).maybeSingle(),
    admin.from('site_platform_connections').select('platform, connection_status')
      .eq('project_id', projectId).eq('user_id', userId).maybeSingle(),
    admin.from('project_profiles').select('detected_platform')
      .eq('project_id', projectId).eq('user_id', userId).maybeSingle(),
    shopifyEntities(admin, projectId, userId),
    admin.from('wordpress_content_index').select('targets, scan_status')
      .eq('project_id', projectId).eq('user_id', userId).maybeSingle(),
    admin.from('site_crawl_index').select('targets, scan_status')
      .eq('project_id', projectId).eq('user_id', userId).maybeSingle(),
  ])
  for (const r of [shopify, wordpress, profile, entities, wpIndex, crawl]) {
    if (r.error && !missingTable(r.error)) throw new SourcesReadError()
  }

  const shop = shopify.data as { connection_status?: string | null; shop_domain?: string | null } | null
  const wp = wordpress.data as { connection_status?: string | null } | null
  const other = (sitePlatform.error ? null : sitePlatform.data) as { platform?: string | null; connection_status?: string | null } | null
  const connections: ConnectionState = {
    shopify: !!shop && shop.connection_status === 'connected',
    wordpress: !!wp && wp.connection_status !== 'failed',
    wix: !!other && other.platform === 'wix' && other.connection_status === 'connected',
  }
  const detected = platformFrom((profile.data as { detected_platform?: string | null } | null)?.detected_platform)
  const platform: SitePlatform = connections.shopify ? 'shopify'
    : connections.wordpress ? 'wordpress'
      : connections.wix ? 'wix'
        : detected ?? 'other'

  const candidates: CandidatePage[] = []
  let orphanPages: SiteFacts['orphanPages'] = []
  const rows = (entities.data ?? []) as { entity_type: string; canonical_url: string | null; shopify_gid: string | null }[]
  if (rows.length > 0) {
    const used: Record<string, number> = {}
    const rest: CandidatePage[] = []
    for (const r of rows) {
      const kind = SHOPIFY_KIND[r.entity_type]
      if (!kind || !r.canonical_url) continue
      const c = { url: r.canonical_url, kind, adminUrl: shopifyAdminUrl(shop?.shop_domain ?? null, r.entity_type, r.shopify_gid) }
      if ((used[r.entity_type] ?? 0) < (SHOPIFY_QUOTA[r.entity_type] ?? 0)) { used[r.entity_type] = (used[r.entity_type] ?? 0) + 1; candidates.push(c) }
      else rest.push(c)
    }
    candidates.push(...rest.slice(0, Math.max(0, MAX_PAGES - 1 - candidates.length)))
  } else {
    const index = (connections.wordpress ? wpIndex.data : null) ?? crawl.data
    const targets = (Array.isArray((index as { targets?: unknown } | null)?.targets) ? (index as { targets: Partial<ScannedTarget>[] }).targets : [])
    const pages = targets
      .filter((t) => t.targetUrl && t.eligibility !== 'no')
      .sort((a, b) => (b.inboundLinkCount ?? 0) - (a.inboundLinkCount ?? 0))
    for (const t of pages) candidates.push({ url: String(t.targetUrl), kind: WP_KIND[String(t.targetType)] ?? 'page', adminUrl: null })
    // A page nothing links to is only knowable from a WHOLE index of a connected
    // WordPress site; the crawl reads 25 pages and cannot tell.
    const whole = connections.wordpress && index === wpIndex.data && (wpIndex.data as { scan_status?: string } | null)?.scan_status === 'completed'
    if (whole) {
      orphanPages = targets
        .filter((t) => t.targetUrl && t.inboundLinkCount === 0 && t.eligibility === 'yes' && (t.targetType === 'post' || t.targetType === 'page'))
        .slice(0, 10)
        .map((t) => ({ url: String(t.targetUrl), title: String(t.targetTitle ?? ''), keyword: String(t.primaryKeywordCandidate || t.targetTitle || '') }))
    }
  }

  return {
    siteUrl,
    siteName: (p.business_name || p.name || '').trim() || null,
    platform,
    connections,
    candidates: candidates.slice(0, 60),
    orphanPages,
    shopDomain: shop?.shop_domain ?? null,
  }
}
