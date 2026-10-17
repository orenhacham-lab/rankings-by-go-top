/**
 * Content module — GET /api/wordpress/categories?projectId=
 * Fetches categories from the project's connected WordPress site.
 * Gated by ENABLE_CONTENT; auth + ownership; credentials never returned.
 *
 * The GO TOP SEO Bridge plugin >= 3.0.0 first when it is connected (its signed /terms; read by this
 * project and its owner; 3.1.0 also answers each term's count), otherwise, or when it does not
 * answer, the application password exactly as before.
 */

import {
  isContentModuleEnabled,
  authContentProject,
  loadWordPressCredentials,
} from '@/lib/content/api-auth'
import { getCategories, WordPressClientError } from '@/lib/wordpress/client'
import { cached } from '@/lib/content/wordpress-cache'
import { loadPublishPlugin } from '@/lib/content/wordpress-plugin-publish'
import { pluginTerms } from '@/lib/site-fix/plugin-client'

export async function GET(request: Request) {
  if (!isContentModuleEnabled()) {
    return Response.json({ error: 'Not found' }, { status: 404 })
  }

  const projectId = new URL(request.url).searchParams.get('projectId')
  const auth = await authContentProject(projectId)
  if ('error' in auth) return Response.json({ error: auth.error }, { status: auth.status })

  const plugin = await loadPublishPlugin(auth.admin, auth.project.id, { ownerId: auth.user.id })
  const viaPlugin = plugin ? await pluginTerms(plugin.link, 'category') : null
  if (viaPlugin?.ok) return Response.json({ categories: viaPlugin.body.items.map((t) => ({ id: t.id, name: t.name, slug: t.slug, parent: t.parent, count: typeof t.count === 'number' ? t.count : 0 })) })

  const loaded = await loadWordPressCredentials(auth.admin, auth.project.id)
  if ('error' in loaded) {
    if (plugin) return Response.json({ error: 'Failed to fetch categories' }, { status: 502 })
    return Response.json({ error: loaded.error }, { status: loaded.status })
  }

  try {
    const categories = await cached(`categories:${loaded.connection.id}`, 60_000, () => getCategories(loaded.creds))
    return Response.json({ categories })
  } catch (err) {
    const msg = err instanceof WordPressClientError ? err.message : 'Failed to fetch categories'
    return Response.json({ error: msg }, { status: 502 })
  }
}
