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
import { loadPublishPlugin } from '@/lib/content/wordpress-plugin-publish'
import { pluginTerms } from '@/lib/site-fix/plugin-client'

export async function GET(request: Request) {
  if (!isContentModuleEnabled()) {
    return Response.json({ error: 'Not found' }, { status: 404 })
  }

  const projectId = new URL(request.url).searchParams.get('projectId')
  const auth = await authContentProject(projectId)
  if ('error' in auth) return Response.json({ error: auth.error }, { status: auth.status })

  const loaded = await loadWordPressCredentials(auth.admin, auth.project.id)
  if ('error' in loaded) {
    // No application password: the GO TOP SEO Bridge plugin >= 3.0.0 lists the site's terms (/terms).
    // Read by this project and its owner. The same shape as below (count is not known there: 0).
    const plugin = loaded.status === 404 ? await loadPublishPlugin(auth.admin, auth.project.id, { ownerId: auth.user.id }) : null
    if (!plugin) return Response.json({ error: loaded.error }, { status: loaded.status })
    const r = await pluginTerms(plugin.link, 'post_tag')
    if (!r.ok) return Response.json({ error: 'Failed to fetch tags' }, { status: 502 })
    return Response.json({ tags: r.body.items.map((t) => ({ id: t.id, name: t.name, slug: t.slug, count: 0 })) })
  }

  try {
    const tags = await cached(`tags:${loaded.connection.id}`, 60_000, () => getTags(loaded.creds))
    return Response.json({ tags })
  } catch (err) {
    const msg = err instanceof WordPressClientError ? err.message : 'Failed to fetch tags'
    return Response.json({ error: msg }, { status: 502 })
  }
}
