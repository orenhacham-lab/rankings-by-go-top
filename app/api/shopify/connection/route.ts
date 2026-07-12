/**
 * Phase 4F.1 — /api/shopify/connection
 *
 * GET    ?projectId=  → sanitized connection (never the token) + entity counts.
 * POST                → DISABLED. Manual Admin API token connection has been
 *                       replaced by merchant OAuth (/api/shopify/oauth/start).
 *                       Returns 410 Gone so no manual-token path exists.
 * DELETE ?projectId=  → disconnect (delete the row; entities cascade).
 *
 * Gated by ENABLE_CONTENT. Auth + project ownership on every method.
 */

import { isContentModuleEnabled, authContentProject } from '@/lib/content/api-auth'
import { sanitizeShopifyConnection, type ShopifyConnectionRow } from '@/lib/shopify/api-auth'
import type { ShopifyEntityType } from '@/lib/shopify/types'

const TYPES: ShopifyEntityType[] = ['product', 'collection', 'page', 'blog', 'article']

export async function GET(request: Request) {
  if (!isContentModuleEnabled()) return Response.json({ error: 'Not found' }, { status: 404 })
  const projectId = new URL(request.url).searchParams.get('projectId')
  const auth = await authContentProject(projectId)
  if ('error' in auth) return Response.json({ error: auth.error }, { status: auth.status })

  const { data, error } = await auth.admin
    .from('shopify_connections')
    .select('*')
    .eq('project_id', auth.project.id)
    .maybeSingle()
  if (error) {
    console.error('[Shopify] Connection load failed:', error.message)
    return Response.json({ error: 'Failed to load connection' }, { status: 500 })
  }

  const counts: Record<string, number> = { product: 0, collection: 0, page: 0, blog: 0, article: 0 }
  if (data) {
    for (const type of TYPES) {
      const { count } = await auth.admin
        .from('shopify_entities')
        .select('id', { count: 'exact', head: true })
        .eq('project_id', auth.project.id)
        .eq('entity_type', type)
        .eq('is_active', true)
      counts[type] = count ?? 0
    }
  }

  return Response.json({
    connection: data ? sanitizeShopifyConnection(data as ShopifyConnectionRow) : null,
    counts,
  })
}

// Manual Admin API token connection is removed. Merchants connect via OAuth
// (GET /api/shopify/oauth/start). This path is intentionally inaccessible.
export async function POST() {
  return Response.json(
    { error: 'manual_connection_disabled', reason: 'use_oauth' },
    { status: 410 },
  )
}

export async function DELETE(request: Request) {
  if (!isContentModuleEnabled()) return Response.json({ error: 'Not found' }, { status: 404 })
  const projectId = new URL(request.url).searchParams.get('projectId')
  const auth = await authContentProject(projectId)
  if ('error' in auth) return Response.json({ error: auth.error }, { status: auth.status })

  const { error } = await auth.admin.from('shopify_connections').delete().eq('project_id', auth.project.id)
  if (error) {
    console.error('[Shopify] Disconnect failed:', error.message)
    return Response.json({ error: 'Failed to disconnect' }, { status: 500 })
  }
  return Response.json({ success: true })
}
