/**
 * Content automation — POST /api/content/automation/internal-links/plan/insert/preview
 *
 * READ-ONLY natural-only insertion PREVIEW (Phase 2D.1). For a generated draft
 * article, shows which APPROVED internal-link plans could be inserted (natural
 * existing-phrase placement) and which would be skipped, with revalidation — and
 * writes NOTHING. Also emits a `previewToken` that the apply endpoint requires.
 *
 * Gated by ENABLE_INTERNAL_LINK_PLANNING + project ownership.
 * Body: { projectId, generatedArticleId, topicId? }.
 */

import { authContentProject, isInternalLinkPlanningEnabled } from '@/lib/content/api-auth'
import { SCAN_INDEX_VERSION } from '@/lib/content/wordpress-content-index'
import { evaluateApprovedLinks } from '@/lib/content/internal-link-insertion-eval'
import { computePreviewToken } from '@/lib/content/internal-link-insertion'

export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
  if (!isInternalLinkPlanningEnabled()) return Response.json({ error: 'Not found' }, { status: 404 })

  let body: { projectId?: unknown; generatedArticleId?: unknown; topicId?: unknown }
  try { body = await request.json() } catch { return Response.json({ error: 'Invalid JSON body' }, { status: 400 }) }
  const projectId = typeof body.projectId === 'string' ? body.projectId : null
  const generatedArticleId = typeof body.generatedArticleId === 'string' ? body.generatedArticleId : null
  const topicOverride = typeof body.topicId === 'string' ? body.topicId : null

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

  const evalRes = await evaluateApprovedLinks(admin, project.id, {
    topicId: topicOverride || article.topic_id,
    contentHtml: article.content_html || '',
    internalLinksJson: article.internal_links_json,
  })

  const base = { dryRun: true, projectId: project.id, generatedArticleId, contentChanged: false }
  if (evalRes.reason) {
    return Response.json({ ...base, batchId: evalRes.batch?.id ?? null, approvedLinks: 0, wouldInsert: 0, wouldSkip: 0, plannedLinks: evalRes.plannedLinks ?? 0, reason: evalRes.reason, previewToken: null, items: [] })
  }

  const wouldInsert = evalRes.items.filter((i) => i.status === 'would_insert').length
  const previewToken = computePreviewToken({
    generatedArticleId,
    batchId: evalRes.batch!.id,
    contentChecksum: evalRes.contentChecksum,
    linksChecksum: evalRes.linksChecksum,
    cacheScanCompletedAt: evalRes.cacheRow?.scan_completed_at ?? null,
    cacheScannerVersion: evalRes.cacheRow?.scanner_version ?? null,
    wouldInsert: evalRes.wouldInsert,
  })

  return Response.json({
    ...base,
    batchId: evalRes.batch!.id,
    currentScannerVersion: SCAN_INDEX_VERSION,
    planStale: evalRes.planStale,
    planStaleReasons: evalRes.planStaleReasons,
    cacheStale: evalRes.cacheStale,
    cacheVersionStale: evalRes.cacheVersionStale,
    approvedLinks: evalRes.approvedLinks.length,
    wouldInsert,
    wouldSkip: evalRes.items.length - wouldInsert,
    previewToken,
    items: evalRes.items,
  })
}
