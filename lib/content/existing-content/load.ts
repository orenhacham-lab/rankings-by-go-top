/**
 * Server loader for the "existing content" screen. READ-ONLY: it writes nothing
 * and calls no provider (no Shopify, WordPress or Google API). Everything it reads
 * is already stored: by the existing syncs, the seeding crawl, and the full-site
 * mapping (site-map-run.ts, which runs in the background, never in this read).
 *
 * The caller has authenticated the user and verified they own the project
 * (authContentProject). The admin client still BYPASSES RLS, so every read below
 * is filtered explicitly:
 *   - tables with an owner column (shopify_connections, shopify_entities,
 *     wordpress_connections, wordpress_content_index, site_crawl_index,
 *     site_page_map, generated_articles, article_topics) by the project AND its owner;
 *   - the Search Console tables, which have no owner column, by the project, and
 *     the metric rows additionally by the one sync run of that project.
 *
 * Every source is MERGED into one index, one item per page (model.ts). What
 * makes the list partial is said in words: a crawl-only site, a WordPress scan
 * cut short, a mapping that stopped at its cap, or Search Console alone.
 */
import type { createAdminClient } from '@/lib/supabase/admin'
import { latestSucceededRun } from '@/lib/gsc/service'
import {
  annotate, countTabs, mergeSources, siteInsights, ownershipEvidence, plannedSupportKeys,
  sourceFromGsc, sourceFromIndex, sourceFromMap, sourceFromShopify,
  type ExistingContentIndex, type ExistingContentSource, type GscRowLite, type GscState, type OwnershipEvidence,
  type PartialReason, type ShopifyEntityLite,
} from './model'
import { mapStatus, readSiteMap, SiteMapReadError } from './site-map-store'
import type { ScannedTarget } from '@/lib/content/wordpress-content-scan'

type Admin = ReturnType<typeof createAdminClient>

const CHUNK = 1000
/** A store with more entities than this shows the first ones and says so. */
export const MAX_ENTITIES = 5000
/** A 28-day sync stores at most 50,000 query x page rows. */
const MAX_GSC_ROWS = 50_000

interface IndexRowLite { targets: unknown; scan_status: string | null; scan_completed_at: string | null }

/** A source that could not be read. The route answers with a stable code and the
 *  screen with a retry, never with "nothing here", which would be a different fact. */
export class ExistingContentLoadError extends Error {
  constructor() { super('existing_content_read_failed'); this.name = 'ExistingContentLoadError' }
}

/** A table this database does not have yet (its migration not applied): no data,
 *  not a failure. Every other error is a failure. */
const missingTable = (e: unknown) => ['42P01', 'PGRST205'].includes(String((e as { code?: unknown } | null)?.code ?? ''))
const failed = (e: unknown) => !!e && !missingTable(e)

const hasTargets = (r: IndexRowLite | null): r is IndexRowLite => !!r && Array.isArray(r.targets) && r.targets.length > 0

async function readShopify(admin: Admin, projectId: string, userId: string) {
  const { data: conn, error: connErr } = await admin
    .from('shopify_connections')
    .select('id, connection_status, archived_at')
    .eq('project_id', projectId)
    .eq('user_id', userId)
    .maybeSingle()
  if (failed(connErr)) throw new ExistingContentLoadError()
  const c = conn as { connection_status?: string | null; archived_at?: string | null } | null
  const connected = !!c && c.connection_status === 'connected' && !c.archived_at

  const rows: ShopifyEntityLite[] = []
  let truncated = false
  for (let offset = 0; offset < MAX_ENTITIES; offset += CHUNK) {
    const { data, error } = await admin
      .from('shopify_entities')
      .select('id, shopify_gid, entity_type, title, handle, canonical_url, is_active, shopify_updated_at')
      .eq('project_id', projectId)
      .eq('user_id', userId)
      .eq('is_active', true)
      .order('id', { ascending: true })
      .range(offset, offset + CHUNK - 1)
    if (failed(error)) throw new ExistingContentLoadError()
    const batch = (data ?? []) as ShopifyEntityLite[]
    rows.push(...batch)
    if (batch.length < CHUNK) break
    if (offset + CHUNK >= MAX_ENTITIES) truncated = true
  }
  return { connected, rows, truncated }
}

async function readWordPress(admin: Admin, projectId: string, userId: string) {
  const { data: conn, error: connErr } = await admin
    .from('wordpress_connections')
    .select('connection_status')
    .eq('project_id', projectId)
    .eq('user_id', userId)
    .maybeSingle()
  if (failed(connErr)) throw new ExistingContentLoadError()
  const status = (conn as { connection_status?: string | null } | null)?.connection_status ?? null
  const connected = !!conn && status !== 'failed'
  const { data: idx, error: idxErr } = await admin
    .from('wordpress_content_index')
    .select('targets, scan_status, scan_completed_at')
    .eq('project_id', projectId)
    .eq('user_id', userId)
    .maybeSingle()
  if (failed(idxErr)) throw new ExistingContentLoadError()
  return { connected, index: (idx as IndexRowLite | null) ?? null }
}

async function readCrawl(admin: Admin, projectId: string, userId: string): Promise<IndexRowLite | null> {
  const { data, error } = await admin
    .from('site_crawl_index')
    .select('targets, scan_status, scan_completed_at')
    .eq('project_id', projectId)
    .eq('user_id', userId)
    .maybeSingle()
  if (failed(error)) throw new ExistingContentLoadError()
  return (data as IndexRowLite | null) ?? null
}

async function readMap(admin: Admin, projectId: string, userId: string) {
  try {
    return await readSiteMap(admin, { projectId, userId }, { entries: true })
  } catch (e) {
    if (e instanceof SiteMapReadError) throw new ExistingContentLoadError()
    throw e
  }
}

/** Whether the project names a site the mapping could read. */
async function readHasSite(admin: Admin, projectId: string, userId: string): Promise<boolean> {
  const { data, error } = await admin
    .from('projects')
    .select('target_domain')
    .eq('id', projectId)
    .eq('user_id', userId)
    .maybeSingle()
  if (error) return false
  return !!String((data as { target_domain?: string | null } | null)?.target_domain ?? '').trim()
}

/** Our own articles, for "ours". Null when they cannot be read: then no page is
 *  called pre-existing, because that would be a claim we cannot back. */
async function readOwnership(admin: Admin, projectId: string, userId: string): Promise<OwnershipEvidence | null> {
  const { data, error } = await admin
    .from('generated_articles')
    .select('id, wp_post_url, shopify_article_url, shopify_article_id, site_post_url')
    .eq('project_id', projectId)
    .eq('user_id', userId)
  if (error) return null
  return ownershipEvidence((data ?? []) as Parameters<typeof ownershipEvidence>[0])
}

async function readPlannedKeys(admin: Admin, projectId: string, userId: string): Promise<Set<string>> {
  const { data, error } = await admin
    .from('article_topics')
    .select('status, anchors_json')
    .eq('project_id', projectId)
    .eq('user_id', userId)
  if (error) return new Set()
  return plannedSupportKeys((data ?? []) as { status?: string | null; anchors_json?: unknown }[])
}

async function readGsc(admin: Admin, projectId: string, enabled: boolean): Promise<{ state: GscState; rows: GscRowLite[] | null; startDate: string | null; endDate: string | null }> {
  const none = (state: GscState) => ({ state, rows: null, startDate: null, endDate: null })
  if (!enabled) return none('off')
  const { data: prop, error: propErr } = await admin
    .from('project_gsc_properties')
    .select('project_id')
    .eq('project_id', projectId)
    .maybeSingle()
  if (propErr) return none('unavailable')
  if (!prop) return none('not_connected')
  let run: { id: string; start_date: string | null; end_date: string | null } | null
  try {
    run = await latestSucceededRun(admin, projectId, 28)
  } catch {
    return none('unavailable')
  }
  if (!run) return none('not_synced')
  const rows: GscRowLite[] = []
  for (let offset = 0; offset < MAX_GSC_ROWS; offset += CHUNK) {
    const { data, error } = await admin
      .from('gsc_query_page_metrics')
      .select('query, page, clicks, impressions, position')
      .eq('sync_run_id', run.id)
      .eq('project_id', projectId)
      .order('query', { ascending: true }).order('page', { ascending: true })
      .range(offset, offset + CHUNK - 1)
    if (error) return none('unavailable')
    const batch = (data ?? []) as GscRowLite[]
    rows.push(...batch)
    if (batch.length < CHUNK) break
  }
  return { state: 'ok', rows, startDate: run.start_date, endDate: run.end_date }
}

export async function loadExistingContent(
  admin: Admin,
  scope: { projectId: string; userId: string },
  flags: { gscEnabled: boolean; wordpressRefreshEnabled: boolean },
  now: number = Date.now(),
): Promise<ExistingContentIndex> {
  const { projectId, userId } = scope
  const [shopify, wordpress, crawl, mapRead, hasSite, ownership, plannedKeys, gsc] = await Promise.all([
    readShopify(admin, projectId, userId),
    readWordPress(admin, projectId, userId),
    readCrawl(admin, projectId, userId),
    readMap(admin, projectId, userId),
    readHasSite(admin, projectId, userId),
    readOwnership(admin, projectId, userId),
    readPlannedKeys(admin, projectId, userId),
    readGsc(admin, projectId, flags.gscEnabled),
  ])

  const map = mapStatus(mapRead, hasSite, now)
  const mapEntries = mapRead.available && mapRead.row && Array.isArray(mapRead.row.entries) ? mapRead.row.entries : []
  const lists = {
    shopify: sourceFromShopify(shopify.rows),
    wordpress: hasTargets(wordpress.index) ? sourceFromIndex(wordpress.index.targets as Partial<ScannedTarget>[], 'wordpress') : [],
    map: sourceFromMap(mapEntries),
    crawl: hasTargets(crawl) ? sourceFromIndex(crawl.targets as Partial<ScannedTarget>[], 'crawl') : [],
    gsc: sourceFromGsc(gsc.rows),
  }
  const sources: Record<ExistingContentSource, number> = {
    shopify: lists.shopify.length, wordpress: lists.wordpress.length, map: lists.map.length, crawl: lists.crawl.length, gsc: lists.gsc.length,
  }
  const items = annotate(
    mergeSources([lists.shopify, lists.wordpress, lists.map, lists.crawl, lists.gsc]),
    { gscRows: gsc.rows, ownership, plannedKeys },
  )
  const source = (['shopify', 'wordpress', 'map', 'crawl', 'gsc'] as const).find((s) => sources[s] > 0) ?? 'none'

  // What keeps the list from being the whole site, in words the screen can say.
  // A finished mapping of the sitemaps is the whole site as the site lists it.
  const mapWhole = (map.state === 'completed') && sources.map > 0
  let partialReason: PartialReason | null = null
  if (map.capped && sources.map > 0) partialReason = 'map_capped'
  else if (!mapWhole && sources.shopify === 0) {
    if (sources.wordpress > 0 && wordpress.index?.scan_status === 'partial') partialReason = 'index_partial'
    else if (sources.wordpress === 0 && sources.crawl > 0) partialReason = 'crawl'
    else if (sources.wordpress === 0 && sources.crawl === 0 && sources.map === 0 && sources.gsc > 0) partialReason = 'gsc_only'
  }
  const indexedAt = map.finishedAt && sources.map > 0 ? map.finishedAt
    : sources.wordpress > 0 ? wordpress.index?.scan_completed_at ?? null
    : sources.crawl > 0 ? crawl?.scan_completed_at ?? null : null

  const resync: ExistingContentIndex['resync'] = shopify.connected
    ? 'shopify'
    : wordpress.connected && flags.wordpressRefreshEnabled ? 'wordpress' : null

  return {
    source,
    sources,
    partial: partialReason !== null,
    partialReason,
    connections: { shopify: shopify.connected, wordpress: wordpress.connected },
    resync,
    indexedAt,
    map,
    gsc: { state: gsc.state, startDate: gsc.startDate, endDate: gsc.endDate },
    counts: countTabs(items),
    riskCount: items.filter((it) => !!it.cannibalization).length,
    insights: siteInsights(items),
    items,
    truncated: shopify.truncated,
  }
}
