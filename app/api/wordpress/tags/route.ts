/**
 * Content module — GET /api/wordpress/tags?projectId=
 * Fetches tags from the project's connected WordPress site.
 * Gated by ENABLE_CONTENT; auth + ownership; credentials never returned.
 */

import {
  isContentModuleEnabled,
  authContentProject,
  loadWordPressCredentials,
} from '@/lib/content/api-auth'
import { getTags, WordPressClientError } from '@/lib/wordpress/client'
import { cached } from '@/lib/content/wordpress-cache'

export async function GET(request: Request) {
  if (!isContentModuleEnabled()) {
    return Response.json({ error: 'Not found' }, { status: 404 })
  }

  const projectId = new URL(request.url).searchParams.get('projectId')
  const auth = await authContentProject(projectId)
  if ('error' in auth) return Response.json({ error: auth.error }, { status: auth.status })

  const loaded = await loadWordPressCredentials(auth.admin, auth.project.id)
  if ('error' in loaded) {
    return Response.json({ error: loaded.error }, { status: loaded.status })
  }

  try {
    const tags = await cached(`tags:${loaded.connection.id}`, 60_000, () => getTags(loaded.creds))
    return Response.json({ tags })
  } catch (err) {
    const msg = err instanceof WordPressClientError ? err.message : 'Failed to fetch tags'
    return Response.json({ error: msg }, { status: 502 })
  }
}
