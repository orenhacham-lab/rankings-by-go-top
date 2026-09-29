/**
 * GET /api/ai-visibility/question-context?projectId=…
 *
 * What the suggested AI questions are scored and labelled against
 * (lib/ai-visibility/question-worth.ts, question-article.ts):
 *   pages     the pages already on the site (titles and addresses, at most 400),
 *             so a question a page answers says "improve that page";
 *   topics    content topics and their article, so a question written about
 *             shows where it is (topic created → written → published).
 *
 * READ-ONLY: writes nothing, calls no provider. proxy.ts does not cover /api/*,
 * so the route authenticates itself (authContentProject: session + owner). The
 * service role bypasses RLS, so every read is filtered by the project AND its
 * owner. With the content module off it answers { contentEnabled: false } and
 * the tab hides the article action. Any read that fails is left empty: the
 * questions are then scored without it, never blocked.
 */
import { authContentProject, isContentModuleEnabled } from '@/lib/content/api-auth'
import { loadExistingContent } from '@/lib/content/existing-content/load'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const MAX_CONTEXT_PAGES = 400

export async function GET(request: Request) {
  if (process.env.ENABLE_AI_VISIBILITY !== 'true') return Response.json({ error: 'Not found' }, { status: 404 })
  const projectId = new URL(request.url).searchParams.get('projectId')
  const auth = await authContentProject(projectId)
  if ('error' in auth) return Response.json({ error: auth.error }, { status: auth.status })
  if (!isContentModuleEnabled()) return Response.json({ contentEnabled: false, pages: [], topics: [] })

  const scope = { projectId: auth.project.id, userId: auth.user.id }
  const [pages, topics] = await Promise.all([
    loadExistingContent(auth.admin, scope, { gscEnabled: false, wordpressRefreshEnabled: false })
      .then((p) => p.items.filter((i) => i.title && i.url).slice(0, MAX_CONTEXT_PAGES).map((i) => ({ title: i.title, url: i.url })))
      .catch(() => []),
    readTopics(auth.admin, scope),
  ])
  return Response.json({ contentEnabled: true, pages, topics })
}

type Admin = Parameters<typeof loadExistingContent>[0]

async function readTopics(admin: Admin, { projectId, userId }: { projectId: string; userId: string }) {
  try {
    const { data: topicRows, error } = await admin
      .from('article_topics')
      .select('id, topic, status, created_at')
      .eq('project_id', projectId)
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(500)
    if (error || !topicRows) return []
    const rows = topicRows as Array<{ id: string; topic: string | null; status: string | null }>
    const ids = rows.map((r) => r.id)
    const articles = new Map<string, { id: string; status: string }>()
    if (ids.length > 0) {
      const { data: arts } = await admin
        .from('generated_articles')
        .select('id, topic_id, status, updated_at')
        .eq('project_id', projectId)
        .eq('user_id', userId)
        .in('topic_id', ids)
        .order('updated_at', { ascending: false })
      for (const a of (arts ?? []) as Array<{ id: string; topic_id: string | null; status: string | null }>) {
        if (a.topic_id && !articles.has(a.topic_id)) articles.set(a.topic_id, { id: a.id, status: a.status ?? 'draft' })
      }
    }
    return rows
      .filter((r) => typeof r.topic === 'string' && r.topic.trim())
      .map((r) => ({ id: r.id, topic: r.topic as string, status: r.status ?? 'suggested', article: articles.get(r.id) ?? null }))
  } catch {
    return []
  }
}
