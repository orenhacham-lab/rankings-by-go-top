/** The real collaborators for lib/meta-posts/http.ts. Server-only. */
import { authContentProject } from '@/lib/content/api-auth'
import type { MetaRouteDeps } from './http'

export const realMetaDeps: MetaRouteDeps = {
  auth: (projectId) => authContentProject(projectId),
}
