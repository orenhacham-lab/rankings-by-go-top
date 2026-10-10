/**
 * Content module — GET /api/wordpress/authors?projectId=
 * Fetches authors (users) from the project's connected WordPress site.
 * Gated by ENABLE_CONTENT; auth + ownership; credentials never returned.
 *
 * The GO TOP SEO Bridge plugin >= 3.1.0 first when it is connected (its signed /authors: the users
 * who may publish posts, id and display name only; read by this project and its owner), otherwise,
 * or when it does not answer, the application password exactly as before.
 */

import {
  isContentModuleEnabled,
  authContentProject,
  loadWordPressCredentials,
} from '@/lib/content/api-auth'
import { getAuthors, WordPressClientError } from '@/lib/wordpress/client'
import { loadPluginFor } from '@/lib/site-fix/plugin-capabilities'
import { pluginAuthors } from '@/lib/site-fix/plugin-client'

export async function GET(request: Request) {
  if (!isContentModuleEnabled()) {
    return Response.json({ error: 'Not found' }, { status: 404 })
  }

  const projectId = new URL(request.url).searchParams.get('projectId')
  const auth = await authContentProject(projectId)
  if ('error' in auth) return Response.json({ error: auth.error }, { status: auth.status })

  const plugin = await loadPluginFor(auth.admin, auth.project.id, 'authors', { ownerId: auth.user.id })
  const viaPlugin = plugin ? await pluginAuthors(plugin.link) : null
  if (viaPlugin?.ok) {
    return Response.json({ authors: viaPlugin.body.items.map((u) => ({ id: u.id, name: u.name, slug: '' })), defaultAuthorId: viaPlugin.body.default || null })
  }

  const loaded = await loadWordPressCredentials(auth.admin, auth.project.id)
  if ('error' in loaded) {
    if (plugin) return Response.json({ error: 'Failed to fetch authors' }, { status: 502 })
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
