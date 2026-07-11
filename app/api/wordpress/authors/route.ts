/**
 * Content module — GET /api/wordpress/authors?projectId=
 * Fetches authors (users) from the project's connected WordPress site.
 * Gated by ENABLE_CONTENT; auth + ownership; credentials never returned.
 */

import {
  isContentModuleEnabled,
  authContentProject,
  loadWordPressCredentials,
} from '@/lib/content/api-auth'
import { getAuthors, WordPressClientError } from '@/lib/wordpress/client'

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
    const authors = await getAuthors(loaded.creds)
    return Response.json({ authors })
  } catch (err) {
    const msg = err instanceof WordPressClientError ? err.message : 'Failed to fetch authors'
    return Response.json({ error: msg }, { status: 502 })
  }
}
