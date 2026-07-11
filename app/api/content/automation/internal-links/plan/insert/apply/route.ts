/**
 * Content automation — POST /api/content/automation/internal-links/plan/insert/apply
 *
 * MANUAL, DRAFT-ONLY apply of approved internal-link plans (Phase 2D.2). Requires
 * a fresh `previewToken`; recomputes it server-side and refuses on any change
 * (stale_preview). Inserts ONLY natural existing-phrase occurrences (no synthetic
 * sentences, never in headings/tables/buttons/nav/existing links), snapshots the
 * draft first for verbatim rollback, and records ONLY actually-inserted links in
 * internal_links_json. Idempotent (already-linked → skip). No-op writes nothing.
 *
 * NOT wired to cron/queue/publish/generation. Only draft articles may be mutated.
 * Never touches brief_notes or anchors_json.
 *
 * Gated by ENABLE_INTERNAL_LINK_PLANNING + project ownership.
 * Body: { projectId, generatedArticleId, previewToken }.
 */

import { authContentProject, isInternalLinkPlanningEnabled } from '@/lib/content/api-auth'
import { evaluateApprovedLinks } from '@/lib/content/internal-link-insertion-eval'
import { computePreviewToken } from '@/lib/content/internal-link-insertion'
import { applyEvaluatedLinks } from '@/lib/content/internal-link-apply'

export const dynamic = 'force-dynamic'

interface ArticleRow {
  id: string
  topic_id: string | null
  status: string
  content_html: string | null
  content_markdown: string | null
  internal_links_json: Record<string, unknown>[] | null
}

export async function POST(request: Request) {
  if (!isInternalLinkPlanningEnabled()) return Response.json({ error: 'Not found' }, { status: 404 })

  let body: { projectId?: unknown; generatedArticleId?: unknown; previewToken?: unknown }
  try { body = await request.json() } catch { return Response.json({ error: 'Invalid JSON body' }, { status: 400 }) }
  const projectId = typeof body.projectId === 'string' ? body.projectId : null
  const generatedArticleId = typeof body.generatedArticleId === 'string' ? body.generatedArticleId : null
  const previewToken = typeof body.previewToken === 'string' ? body.previewToken : null

  const auth = await authContentProject(projectId)
  if ('error' in auth) return Response.json({ error: auth.error }, { status: auth.status })
  const { admin, project, user } = auth
  if (!generatedArticleId) return Response.json({ error: 'generatedArticleId_required' }, { status: 400 })
  if (!previewToken) return Response.json({ error: 'preview_required' }, { status: 409 })

  const { data: artData } = await admin
    .from('generated_articles')
    .select('id, topic_id, status, content_html, content_markdown, internal_links_json')
    .eq('id', generatedArticleId)
    .eq('project_id', project.id)
    .maybeSingle()
  const article = artData as ArticleRow | null
  if (!article) return Response.json({ error: 'article_not_found' }, { status: 404 })
  if (article.status !== 'draft') return Response.json({ error: 'article_not_draft', status: article.status }, { status: 409 })

  const originalHtml = article.content_html || ''
  const evalRes = await evaluateApprovedLinks(admin, project.id, {
    topicId: article.topic_id,
    contentHtml: originalHtml,
    internalLinksJson: article.internal_links_json,
  })
  const base = { projectId: project.id, generatedArticleId, contentChanged: false }
  if (evalRes.reason) return Response.json({ ...base, applied: 0, skipped: 0, reason: evalRes.reason })

  // Fresh-preview integrity: recompute the token from CURRENT state and compare.
  const recomputed = computePreviewToken({
    generatedArticleId,
    batchId: evalRes.batch!.id,
    contentChecksum: evalRes.contentChecksum,
    linksChecksum: evalRes.linksChecksum,
    cacheScanCompletedAt: evalRes.cacheRow?.scan_completed_at ?? null,
    cacheScannerVersion: evalRes.cacheRow?.scanner_version ?? null,
    wouldInsert: evalRes.wouldInsert,
  })
  if (recomputed !== previewToken) {
    return Response.json({ ...base, applied: 0, skipped: 0, error: 'stale_preview', hint: 're-run preview and use the fresh previewToken' }, { status: 409 })
  }

  // Apply via the SHARED engine (same logic the auto-apply-after-generation path
  // uses). Draft-only, natural-only, snapshot + audit + internal_links_json.
  const outcome = await applyEvaluatedLinks(admin, { projectId: project.id, userId: user.id, generatedArticleId, article, evalRes })
  if (!outcome.contentChanged) {
    return Response.json({ ...base, applied: 0, skipped: outcome.skipped, reason: outcome.reason ?? 'nothing_inserted', results: outcome.results })
  }
  return Response.json({ ...base, contentChanged: true, applied: outcome.applied, skipped: outcome.skipped, snapshotId: outcome.snapshotId, checksumBefore: outcome.checksumBefore, checksumAfter: outcome.checksumAfter, results: outcome.results })
}
