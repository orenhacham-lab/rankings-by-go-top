/**
 * Content automation — POST …/internal-links/plan/insert/approve-planned
 *
 * Phase 3B.3. Approves the PLANNED (saved-but-unapproved) internal links of the
 * article's topic's latest active plan batch — a review-status flip only
 * (planned → approved). It inserts NOTHING into the article; the user then runs
 * the normal preview/apply flow. Owner + flag gated; never touches article
 * content, generation, WordPress, cron, or the planner.
 *
 * Body: { projectId, generatedArticleId }.
 */

import { authContentProject, isInternalLinkPlanningEnabled } from '@/lib/content/api-auth'
import { getLatestBatchForTopic, approveBatchLinks } from '@/lib/content/internal-link-plan-store'

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
    .select('id, topic_id')
    .eq('id', generatedArticleId)
    .eq('project_id', project.id)
    .maybeSingle()
  const article = artData as { topic_id: string | null } | null
  if (!article) return Response.json({ error: 'article_not_found' }, { status: 404 })
  if (!article.topic_id) return Response.json({ ok: true, approved: 0, reason: 'no_topic' })

  const batch = await getLatestBatchForTopic(admin, project.id, article.topic_id)
  if (!batch) return Response.json({ ok: true, approved: 0, reason: 'no_plan_batch' })

  // Review-status flip only (planned → approved). No content mutation.
  const approved = await approveBatchLinks(admin, project.id, batch.id)
  return Response.json({ ok: true, approved, batchId: batch.id })
}
