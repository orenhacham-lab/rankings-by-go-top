/**
 * Content module — GET /api/content/articles/:id/internal-links
 *
 * Returns candidate articles in the SAME project to link to: only articles that
 * are already PUBLISHED and have a public wp_post_url (a real, usable URL),
 * excluding the current article. Safe fields only (id, title, url, keyword).
 *
 * Read-only — never mutates content and never calls WordPress. Gated by
 * ENABLE_CONTENT + project ownership. Suggestion + insertion happen client-side
 * in the editor (deterministic, manual). No migration.
 */

import { authContentProject, isContentModuleEnabled } from '@/lib/content/api-auth'
import { createAdminClient } from '@/lib/supabase/admin'

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!isContentModuleEnabled()) return Response.json({ error: 'Not found' }, { status: 404 })
  const { id } = await params

  const admin = createAdminClient()
  const { data: article, error } = await admin
    .from('generated_articles')
    .select('id, project_id')
    .eq('id', id)
    .maybeSingle()
  if (error) {
    if ((error as { code?: string }).code === '42P01') return Response.json({ error: 'Content module not initialized' }, { status: 404 })
    return Response.json({ error: 'Failed to load article' }, { status: 500 })
  }
  if (!article) return Response.json({ error: 'Article not found' }, { status: 404 })

  const auth = await authContentProject((article as { project_id: string }).project_id)
  if ('error' in auth) return Response.json({ error: auth.error }, { status: auth.status })

  // Only PUBLISHED articles with a public URL are safe link targets.
  const { data: rows } = await auth.admin
    .from('generated_articles')
    .select('id, title, wp_post_url, topic_id')
    .eq('project_id', auth.project.id)
    .eq('status', 'published')
    .neq('id', id)
    .not('wp_post_url', 'is', null)
    .order('published_at', { ascending: false })
    .limit(50)

  const list = (rows ?? []) as { id: string; title: string; wp_post_url: string | null; topic_id: string | null }[]

  // Primary keyword comes from the linked topic (no such column on the article).
  const topicIds = Array.from(new Set(list.map((r) => r.topic_id).filter((x): x is string => !!x)))
  const kwByTopic: Record<string, string | null> = {}
  if (topicIds.length) {
    const { data: topics } = await auth.admin.from('article_topics').select('id, primary_keyword').in('id', topicIds)
    for (const t of (topics ?? []) as { id: string; primary_keyword: string | null }[]) kwByTopic[t.id] = t.primary_keyword
  }

  const candidates = list
    .filter((r) => r.wp_post_url)
    .map((r) => ({ id: r.id, title: r.title, url: r.wp_post_url as string, keyword: (r.topic_id && kwByTopic[r.topic_id]) || null }))

  return Response.json({ candidates })
}
