/**
 * Phase 4F.1 — POST /api/shopify/sync { projectId }
 * Runs entity discovery for the project's saved Shopify connection and upserts
 * products/collections/pages/blogs/articles into shopify_entities (idempotent,
 * inactive-marking, partial-safe). Returns counts + warnings. Never returns the
 * token. Gated by ENABLE_CONTENT + project ownership.
 */

import { isContentModuleEnabled, authContentProject } from '@/lib/content/api-auth'
import { loadShopifyConnection } from '@/lib/shopify/api-auth'
import { runShopifySync } from '@/lib/shopify/sync'

// Entity discovery paginates several types — allow a longer budget.
export const maxDuration = 300

export async function POST(request: Request) {
  if (!isContentModuleEnabled()) return Response.json({ error: 'Not found' }, { status: 404 })

  let body: { projectId?: string }
  try { body = await request.json() } catch { body = {} }
  const auth = await authContentProject(body.projectId)
  if ('error' in auth) return Response.json({ error: auth.error }, { status: auth.status })

  const loaded = await loadShopifyConnection(auth.admin, auth.project.id)
  if ('error' in loaded) {
    const reason = loaded.status === 404 ? 'no_shopify_connection' : 'shopify_connection_error'
    return Response.json({ error: reason, reason }, { status: loaded.status === 404 ? 400 : loaded.status })
  }

  try {
    const result = await runShopifySync(auth.admin, loaded.connection, loaded.creds)
    if (!result.ok) {
      return Response.json({ error: result.error ?? 'sync_failed', reason: result.error ?? 'sync_failed', warnings: result.warnings }, { status: 502 })
    }
    return Response.json({
      ok: true,
      counts: result.counts,
      upserted: result.upserted,
      deactivated: result.deactivated,
      warnings: result.warnings,
      partial: result.error === 'partial_sync',
      perType: result.perType.map((t) => ({ type: t.type, ok: t.ok, fetched: t.fetched, ...(t.error ? { error: t.error, kind: t.kind } : {}) })),
    })
  } catch (err) {
    console.error('[Shopify] sync unexpected:', err instanceof Error ? err.message : 'error')
    return Response.json({ error: 'sync_failed', reason: 'sync_failed' }, { status: 502 })
  }
}
