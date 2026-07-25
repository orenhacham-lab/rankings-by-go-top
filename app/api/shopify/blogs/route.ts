/**
 * Phase 4F.2 — GET /api/shopify/blogs?projectId=
 * Loads the connected store's Blogs (GID + title + handle) for the target-blog
 * selector. Gated by ENABLE_CONTENT + ownership. Never returns the token.
 */

import { isContentModuleEnabled, authContentProject } from '@/lib/content/api-auth'
import { loadShopifyConnection } from '@/lib/shopify/api-auth'
import { getShopifyBlogs, ShopifyClientError } from '@/lib/shopify/client'

export async function GET(request: Request) {
  if (!isContentModuleEnabled()) return Response.json({ error: 'Not found' }, { status: 404 })

  const projectId = new URL(request.url).searchParams.get('projectId')
  const auth = await authContentProject(projectId)
  if ('error' in auth) return Response.json({ error: auth.error }, { status: auth.status })

  const loaded = await loadShopifyConnection(auth.admin, auth.project.id)
  if ('error' in loaded) {
    const reason = loaded.status === 404 ? 'no_shopify_connection' : loaded.status === 409 ? 'shopify_connection_inactive' : 'shopify_connection_error'
    return Response.json({ error: reason, reason }, { status: loaded.status === 404 ? 400 : loaded.status })
  }

  try {
    const blogs = await getShopifyBlogs(loaded.creds)
    return Response.json({ blogs })
  } catch (err) {
    const kind = err instanceof ShopifyClientError ? err.kind : 'api_error'
    return Response.json({ error: kind, reason: kind }, { status: 502 })
  }
}
