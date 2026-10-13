/**
 * The real collaborators for lib/gbp/http.ts. Server-only.
 */
import { authContentProject } from '@/lib/content/api-auth'
import type { GbpRouteDeps } from './http'

export const realGbpDeps: GbpRouteDeps = {
  auth: (projectId) => authContentProject(projectId),
}
