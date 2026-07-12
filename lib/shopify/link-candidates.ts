/**
 * Phase 4F.1 — expose synced Shopify entities to the shared internal-link
 * candidate layer. Best-effort + additive: a missing table or an empty store
 * yields [] (WordPress-only projects are completely unaffected).
 */

import type { createAdminClient } from '@/lib/supabase/admin'
import type { InternalLinkCandidate } from '@/lib/content/internal-link-candidates'
import { toInternalLinkCandidates, type ShopifyEntityRow } from '@/lib/shopify/entity-map'

type Admin = ReturnType<typeof createAdminClient>

/** Active Shopify entities for a project as source-neutral InternalLinkCandidates. */
export async function loadShopifyLinkCandidates(admin: Admin, projectId: string): Promise<InternalLinkCandidate[]> {
  try {
    const { data, error } = await admin
      .from('shopify_entities')
      .select('shopify_gid, entity_type, title, handle, canonical_url, status, is_active, body_excerpt, metadata')
      .eq('project_id', projectId)
      .eq('is_active', true)
    if (error || !Array.isArray(data)) return []
    return toInternalLinkCandidates(data as unknown as ShopifyEntityRow[])
  } catch {
    return []
  }
}
