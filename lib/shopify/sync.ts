/**
 * Phase 4F.1 — Shopify entity sync orchestration.
 *
 * Discovers all five entity types and UPSERTS them into shopify_entities keyed
 * by (project_id, shopify_gid) so repeated syncs never duplicate. Removed/
 * unpublished entities are marked is_active=false (never deleted) — but ONLY for
 * entity types that synced successfully, so a partial failure never erases prior
 * valid data. Never touches WordPress or any other table.
 */

import type { createAdminClient } from '@/lib/supabase/admin'
import { discoverEntities } from './client'
import type { ShopifyConnectionRow } from './api-auth'
import type { ShopifyCredentials, ShopifyEntityType, ShopifySyncResult, EntitySyncTypeResult } from './types'

type Admin = ReturnType<typeof createAdminClient>
const ALL_TYPES: ShopifyEntityType[] = ['product', 'collection', 'page', 'blog', 'article']

const nowIso = () => new Date().toISOString()

export async function runShopifySync(
  admin: Admin,
  connection: ShopifyConnectionRow,
  creds: ShopifyCredentials,
): Promise<ShopifySyncResult> {
  const runStart = nowIso()
  const { entities, perType } = await discoverEntities(creds, connection.storefront_domain)

  // Upsert every discovered entity (idempotent on project_id+shopify_gid).
  let upserted = 0
  if (entities.length) {
    const rows = entities.map((e) => ({
      user_id: connection.user_id,
      project_id: connection.project_id,
      connection_id: connection.id,
      shopify_gid: e.gid,
      entity_type: e.type,
      shopify_numeric_id: e.numericId || null,
      title: e.title || null,
      handle: e.handle || null,
      canonical_url: e.canonicalUrl || null,
      status: e.status,
      is_active: e.isActive,
      body_excerpt: e.bodyExcerpt || null,
      metadata: e.metadata || {},
      shopify_updated_at: e.updatedAt,
      synced_at: runStart,
      updated_at: runStart,
    }))
    // Chunked upsert to stay within payload limits.
    for (let i = 0; i < rows.length; i += 500) {
      const chunk = rows.slice(i, i + 500)
      const { error } = await admin.from('shopify_entities').upsert(chunk, { onConflict: 'project_id,shopify_gid' })
      if (error) {
        console.error('[Shopify] entity upsert failed:', error.message)
        return {
          ok: false, perType, upserted, deactivated: 0,
          counts: emptyCounts(), warnings: perTypeWarnings(perType),
          error: 'entity_upsert_failed',
        }
      }
      upserted += chunk.length
    }
  }

  // Removed/unpublished detection: for each SUCCESSFUL type, deactivate rows not
  // touched by this run (older synced_at). Failed types are skipped so their
  // previously-valid rows are preserved unchanged (partial-sync safety).
  let deactivated = 0
  const succeededTypes = new Set(perType.filter((t) => t.ok).map((t) => t.type))
  for (const type of ALL_TYPES) {
    if (!succeededTypes.has(type)) continue
    const { data, error } = await admin
      .from('shopify_entities')
      .update({ is_active: false, updated_at: nowIso() })
      .eq('project_id', connection.project_id)
      .eq('entity_type', type)
      .eq('is_active', true)
      .lt('synced_at', runStart)
      .select('id')
    if (!error && Array.isArray(data)) deactivated += data.length
  }

  const counts = await countActiveByType(admin, connection.project_id)
  const warnings = perTypeWarnings(perType)
  const allOk = perType.every((t) => t.ok)

  // Persist sync status on the connection (never the token).
  await admin
    .from('shopify_connections')
    .update({
      last_synced_at: runStart,
      // The sync ran successfully at the transport level; per-type failures are
      // surfaced as warnings/last_error, not a failed connection.
      connection_status: 'connected',
      last_error: allOk ? null : warnings.join(' | ').slice(0, 500),
      updated_at: nowIso(),
    })
    .eq('id', connection.id)

  return { ok: true, perType, upserted, deactivated, counts, warnings, error: allOk ? undefined : 'partial_sync' }
}

function emptyCounts(): Record<ShopifyEntityType, number> {
  return { product: 0, collection: 0, page: 0, blog: 0, article: 0 }
}

function perTypeWarnings(perType: EntitySyncTypeResult[]): string[] {
  return perType.filter((t) => !t.ok).map((t) => `${t.type}: ${t.error || 'failed'}`)
}

async function countActiveByType(admin: Admin, projectId: string): Promise<Record<ShopifyEntityType, number>> {
  const counts = emptyCounts()
  for (const type of ALL_TYPES) {
    const { count } = await admin
      .from('shopify_entities')
      .select('id', { count: 'exact', head: true })
      .eq('project_id', projectId)
      .eq('entity_type', type)
      .eq('is_active', true)
    counts[type] = count ?? 0
  }
  return counts
}
