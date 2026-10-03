/**
 * The real collaborators for lib/gbp/http.ts. Server-only.
 */
import { authContentProject } from '@/lib/content/api-auth'
import { loadSwitchLock } from '@/lib/site-platforms/store'
import type { GbpRouteDeps } from './http'

/**
 * A Shopify project never sees this feature: it has a Shopify store row, or the
 * owner came from the Shopify App Store / is billed by Shopify. Read-only; the
 * Shopify app itself is not touched.
 */
export const realGbpDeps: GbpRouteDeps = {
  auth: (projectId) => authContentProject(projectId),
  isShopifyProject: async (admin, userId, projectId) => {
    try {
      const lock = await loadSwitchLock(admin, userId, projectId)
      return lock.locked || lock.rows.shopify
    } catch {
      return true // unknown → treat as Shopify (hidden), never the other way round
    }
  },
}
