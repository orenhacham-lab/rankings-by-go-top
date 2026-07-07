/**
 * Content automation — POST …/internal-links/plan/insert/reanchor/suggest
 *
 * Phase 3B.4. READ-ONLY. For a generated draft, returns SAFE alternative anchor
 * phrases that ALREADY exist in the article body for approved links whose
 * original anchor is missing from the draft. Writes NOTHING; invents no anchors;
 * never touches article content, generation, WordPress, cron, or the planner.
 *
 * Body: { projectId, generatedArticleId }.
 */

import { authContentProject, isInternalLinkPlanningEnabled } from '@/lib/content/api-auth'
import { suggestReanchors } from '@/lib/content/internal-link-reanchor'

export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
  if (!isInternalLinkPlanningEnabled()) return Response.json({ error: 'Not found' }, { status: 404 })

  let body: { projectId?: unknown; generatedArticleId?: unknown }
  try { body = await request.json() } catch { return Response.json({ error: 'Invalid JSON body' }, { status: 400 }) }
  const projectId = typeof body.projectId === 'string' ? body.projectId : null
  const generatedArticleId = typeof body.generatedArticleId === 'string' ? body.generatedArticleId : null

  const auth = await authContentProject(projectId)
  if ('error' in auth) return Response.json({ error: auth.error }, { status: auth.status })
  const { admin, project } = auth
  if (!generatedArticleId) return Response.json({ error: 'generatedArticleId_required' }, { status: 400 })

  const { data: artData } = await admin
    .from('generated_articles')
    .select('id, topic_id, content_html, internal_links_json')
    .eq('id', generatedArticleId)
    .eq('project_id', project.id)
    .maybeSingle()
  const article = artData as { topic_id: string | null; content_html: string | null; internal_links_json: unknown } | null
  if (!article) return Response.json({ error: 'article_not_found' }, { status: 404 })

  const res = await suggestReanchors(admin, project.id, {
    topicId: article.topic_id,
    contentHtml: article.content_html || '',
    internalLinksJson: article.internal_links_json,
  })

  return Response.json({
    ok: true,
    projectId: project.id,
    generatedArticleId,
    reason: res.reason ?? null,
    batchId: res.batch?.id ?? null,
    insertableCount: res.insertableCount,
    otherSkippedCount: res.otherSkippedCount,
    links: res.links,
  })
}
