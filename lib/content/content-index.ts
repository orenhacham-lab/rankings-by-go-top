/**
 * The site index the recommendation engine reads.
 *
 * Two tables hold a project's site index, in exactly the same shape:
 *   wordpress_content_index  built from the WordPress REST API of a connected
 *                            site (lib/content/wordpress-index-refresh.ts);
 *   site_crawl_index         built by the seeding scan's step b1 from the
 *                            site's own pages (lib/seed-scan/steps-b.ts), for a
 *                            site with no WordPress connection.
 *
 * getContentIndex answers with the WordPress index when WordPress is connected
 * and that index is usable (it has targets): a WordPress project reads exactly
 * the row it read before this module existed, so its recommendations do not
 * change (lib/seed-scan/__qa__/seed-content-index.qa.ts runs the engine both
 * ways and compares). Otherwise it answers with the crawl index when that one
 * has targets, and otherwise with whatever the WordPress table holds (usually
 * nothing), which is again what the engine read before.
 *
 * A project with synced Shopify entities (any row in shopify_entities) never
 * gets the crawl: every caller already adds the store's own entities to the
 * index it reads (loadShopifyScannedTargets, generate-from-briefs), so a crawl
 * of the same storefront would count its pages twice. Such a project reads
 * exactly what it read before the crawl existed. When that table cannot be
 * read, the crawl is withheld too.
 *
 * "Connected" is a wordpress_connections row that is not `failed`: 'connected',
 * or 'untested', the state a WordPress-only project is saved in and which the
 * publishing resolver (lib/content/platform/active-platform.ts) already treats
 * as WordPress. When that row cannot be read, the WordPress index is used, as
 * it was before: only a connection known to be missing or failed hands the
 * engine the crawl instead.
 *
 * The crawl index is read with the service role, so it is filtered by the
 * project AND its owner. Like getCachedIndex, nothing here ever throws: a
 * missing table or a failed read of an index is "no index".
 */
import type { createAdminClient } from '@/lib/supabase/admin'
import type { WordPressContentIndexRow } from '@/lib/supabase/types'
import { getCachedIndex } from '@/lib/content/wordpress-content-index'

type Admin = ReturnType<typeof createAdminClient>

/** Both tables have this row shape (lib/supabase/types.ts: SiteCrawlIndexRow). */
export type ContentIndexRow = WordPressContentIndexRow

function hasTargets(row: ContentIndexRow | null): row is ContentIndexRow {
  return !!row && Array.isArray(row.targets) && row.targets.length > 0
}

/** Known to be missing or failed. A read that fails is not knowledge: false. */
async function wordpressDisconnected(admin: Admin, projectId: string): Promise<boolean> {
  try {
    const { data, error } = await admin.from('wordpress_connections').select('connection_status').eq('project_id', projectId).maybeSingle()
    if (error) return false
    if (!data) return true
    return (data as { connection_status?: string | null }).connection_status === 'failed'
  } catch {
    return false
  }
}

/** Any Shopify entity of the project, active or not. A read that fails counts as yes: it only withholds the crawl. */
async function hasShopifyEntities(admin: Admin, projectId: string): Promise<boolean> {
  try {
    const { data, error } = await admin.from('shopify_entities').select('id').eq('project_id', projectId).limit(1)
    if (error) return true
    return Array.isArray(data) && data.length > 0
  } catch {
    return true
  }
}

async function projectOwner(admin: Admin, projectId: string): Promise<string | null> {
  try {
    const { data, error } = await admin.from('projects').select('user_id').eq('id', projectId).maybeSingle()
    if (error || !data) return null
    const owner = (data as { user_id?: unknown }).user_id
    return typeof owner === 'string' && owner.length > 0 ? owner : null
  } catch {
    return null
  }
}

/** The crawl index of a project, read for its owner. Null when there is none. Never throws. */
export async function getCrawlIndex(admin: Admin, projectId: string, userId: string): Promise<ContentIndexRow | null> {
  try {
    const { data, error } = await admin
      .from('site_crawl_index')
      .select('*')
      .eq('project_id', projectId)
      .eq('user_id', userId)
      .maybeSingle()
    if (error || !data) return null
    return data as ContentIndexRow
  } catch {
    return null
  }
}

/**
 * The project's site index: WordPress when connected and usable, else the
 * crawl (never for a Shopify-synced project). `userId` is the owner when the
 * caller knows it; otherwise it is read from the project. Never throws.
 */
export async function getContentIndex(projectId: string, userId: string | null | undefined, admin: Admin): Promise<ContentIndexRow | null> {
  const wordpress = await getCachedIndex(admin, projectId)
  if (hasTargets(wordpress) && !(await wordpressDisconnected(admin, projectId))) return wordpress
  if (await hasShopifyEntities(admin, projectId)) return wordpress
  const owner = userId || (await projectOwner(admin, projectId))
  const crawl = owner ? await getCrawlIndex(admin, projectId, owner) : null
  return hasTargets(crawl) ? crawl : wordpress
}
