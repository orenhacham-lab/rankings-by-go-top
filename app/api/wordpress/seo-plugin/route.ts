/**
 * Content module — GET /api/wordpress/seo-plugin?projectId=
 * Phase 4E. Detects the SEO plugin exposed by the project's connected WordPress
 * site (yoast | rankmath | none | unknown | permission_error). Short-cached.
 * Gated by ENABLE_CONTENT; auth + ownership; credentials never returned.
 */

import { isContentModuleEnabled, authContentProject, loadWordPressCredentials } from '@/lib/content/api-auth'
import { detectSeoPlugin } from '@/lib/wordpress/client'
import { cached } from '@/lib/content/wordpress-cache'

export async function GET(request: Request) {
  if (!isContentModuleEnabled()) return Response.json({ error: 'Not found' }, { status: 404 })

  const projectId = new URL(request.url).searchParams.get('projectId')
  const auth = await authContentProject(projectId)
  if ('error' in auth) return Response.json({ error: auth.error }, { status: auth.status })

  const loaded = await loadWordPressCredentials(auth.admin, auth.project.id)
  if ('error' in loaded) return Response.json({ error: loaded.error }, { status: loaded.status })

  // Cache detection briefly per connection — plugin activation rarely changes.
  const plugin = await cached(`seo-plugin:${loaded.connection.id}`, 5 * 60_000, () => detectSeoPlugin(loaded.creds))
  return Response.json({ plugin })
}
