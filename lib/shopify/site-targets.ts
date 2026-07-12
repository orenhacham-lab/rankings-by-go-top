/**
 * Phase 4F.1 — bridge synced Shopify entities into the SHARED site-index layer
 * (ScannedTarget[]) used by Site Scan topic discovery, the Hybrid engine, and
 * index-status. Read-time + best-effort: a missing table or an empty store
 * yields []/zero, so WordPress-only projects are completely unaffected.
 *
 * Reuses the existing provider-neutral mapper (toScannedTargets) — no scraping,
 * no separate ranking, no change to Hybrid ranking/dedup/provenance.
 */

import type { createAdminClient } from '@/lib/supabase/admin'
import type { ScannedTarget } from '@/lib/content/wordpress-content-scan'
import { toScannedTargets, type ShopifyEntityRow } from '@/lib/shopify/entity-map'
import type { ShopifyEntityType } from '@/lib/shopify/types'

type Admin = ReturnType<typeof createAdminClient>

const ENTITY_SELECT = 'shopify_gid, entity_type, title, handle, canonical_url, status, is_active, body_excerpt, metadata'

/** Active Shopify entities for a project as shared-index ScannedTargets. */
export async function loadShopifyScannedTargets(admin: Admin, projectId: string): Promise<ScannedTarget[]> {
  try {
    const { data, error } = await admin
      .from('shopify_entities')
      .select(ENTITY_SELECT)
      .eq('project_id', projectId)
      .eq('is_active', true)
    if (error || !Array.isArray(data)) return []
    return toScannedTargets(data as unknown as ShopifyEntityRow[])
  } catch {
    return []
  }
}

export interface ShopifyIndexSummary {
  /** True when the project has a Shopify connection row. */
  connected: boolean
  /** Active entity counts by type. */
  counts: Record<ShopifyEntityType, number>
  /** Total active, indexable targets (products + collections + pages + articles). */
  activeTargets: number
  lastSyncedAt: string | null
  lastError: string | null
  connectionStatus: 'untested' | 'connected' | 'failed' | null
}

const ALL_TYPES: ShopifyEntityType[] = ['product', 'collection', 'page', 'blog', 'article']

/**
 * Compact Shopify index summary for the index-status UI: connection presence,
 * per-type active counts, last sync, and last error. Best-effort (returns a
 * not-connected summary on any error). Never touches WordPress data.
 */
export async function getShopifyIndexSummary(admin: Admin, projectId: string): Promise<ShopifyIndexSummary> {
  const empty: ShopifyIndexSummary = {
    connected: false,
    counts: { product: 0, collection: 0, page: 0, blog: 0, article: 0 },
    activeTargets: 0,
    lastSyncedAt: null,
    lastError: null,
    connectionStatus: null,
  }
  try {
    const { data: conn } = await admin
      .from('shopify_connections')
      .select('last_synced_at, last_error, connection_status')
      .eq('project_id', projectId)
      .maybeSingle()
    if (!conn) return empty
    const c = conn as { last_synced_at: string | null; last_error: string | null; connection_status: ShopifyIndexSummary['connectionStatus'] }

    const counts = { ...empty.counts }
    for (const type of ALL_TYPES) {
      const { count } = await admin
        .from('shopify_entities')
        .select('id', { count: 'exact', head: true })
        .eq('project_id', projectId)
        .eq('entity_type', type)
        .eq('is_active', true)
      counts[type] = count ?? 0
    }
    // Blogs are metadata containers, not link targets — exclude from the count.
    const activeTargets = counts.product + counts.collection + counts.page + counts.article
    return { connected: true, counts, activeTargets, lastSyncedAt: c.last_synced_at, lastError: c.last_error, connectionStatus: c.connection_status }
  } catch {
    return empty
  }
}
