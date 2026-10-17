/**
 * GET /api/content/citations?projectId=…
 *
 * For the Articles screen: which PUBLISHED articles of the project a stored AI
 * citation (ai_citations.url) points at, and by which engines. Matching is by
 * the article's live URL only (lib/content/citation-match.ts).
 *
 * Read-only and free: it reads what the project's own AI checks already stored.
 * Auth: the user must own the project; every read is filtered by it.
 */
import { authContentProject, isContentModuleEnabled } from '@/lib/content/api-auth'
import { loadProjectCitedArticles } from '@/lib/content/article-visibility'

export async function GET(request: Request) {
  if (!isContentModuleEnabled()) return Response.json({ error: 'Not found' }, { status: 404 })
  const projectId = new URL(request.url).searchParams.get('projectId')
  const auth = await authContentProject(projectId)
  if ('error' in auth) return Response.json({ error: auth.error }, { status: auth.status })
  const cited = await loadProjectCitedArticles(auth.admin, auth.project.id)
  return Response.json({ cited })
}
