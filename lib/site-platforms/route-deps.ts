/**
 * The production dependencies of the site-platform handlers (lib/site-platforms/http.ts):
 * the content module flag, the shared ownership check, the service-role client.
 */
import { authContentProject, isContentModuleEnabled } from '@/lib/content/api-auth'
import { createAdminClient } from '@/lib/supabase/admin'
import type { SiteRouteDeps } from './http'

export const siteRouteDeps: SiteRouteDeps = {
  enabled: isContentModuleEnabled,
  auth: authContentProject,
  admin: createAdminClient,
}
