/**
 * Content module — GET /api/wordpress/tags?projectId=
 * Fetches tags from the project's connected WordPress site.
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
import { getTags, WordPressClientError } from '@/lib/wordpress/client'
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
  const viaPlugin = plugin ? await pluginTerms(plugin.link, 'post_tag') : null
  if (viaPlugin?.ok) return Response.json({ tags: viaPlugin.body.items.map((t) => ({ id: t.id, name: t.name, slug: t.slug, count: typeof t.count === 'number' ? t.count : 0 })) })

  const loaded = await loadWordPressCredentials(auth.admin, auth.project.id)
  if ('error' in loaded) {
    if (plugin) return Response.json({ error: 'Failed to fetch tags' }, { status: 502 })
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
